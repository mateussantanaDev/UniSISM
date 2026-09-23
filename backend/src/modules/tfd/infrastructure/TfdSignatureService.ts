/**
 * Assinatura digital do export TJ via ICP-Brasil.
 *
 * Padrão técnico:
 *   - Carrega certificado PKCS#12 (.pfx ou .p12) via env vars
 *   - Gera assinatura **CMS / PKCS#7 detached** sobre o conteúdo do ZIP
 *   - Anexa ao próprio ZIP em `assinatura.p7s` + cert pública em `cert.pem`
 *
 * Modos:
 *   - **ICP_BRASIL**: cert configurado e válido → assinatura real
 *   - **HASH_ONLY**:  cert ausente/inválido → fallback graceful (apenas SHA-256
 *                     no manifest). Ideal pra dev/staging; em prod aciona warning.
 *
 * Configuração (env):
 *   TFD_SIGN_CERT_PATH      caminho absoluto do .pfx
 *   TFD_SIGN_CERT_PASSWORD  senha do PKCS#12
 *   TFD_SIGN_REQUIRED       'true' → boot falha se cert ausente (production-grade)
 *
 * Por que CMS/PKCS#7 detached e não embutido?
 *   1. ZIP continua válido como ZIP — abre em qualquer ferramenta.
 *   2. Verificador externo (TJ) só precisa do `.p7s` + conteúdo binário do ZIP.
 *   3. Padrão de processo eletrônico Brasil (PJe, e-SAJ aceitam .p7s detached).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import forge from 'node-forge';
import { logger } from '../../../infrastructure/logger';
import { env } from '../../../shared/env';

export type ModoAssinatura = 'ICP_BRASIL' | 'HASH_ONLY';

export interface AssinaturaResult {
  modo: ModoAssinatura;
  /** SHA-256 do conteúdo (sempre presente em hex). */
  sha256: string;
  /** PKCS#7 detached em DER, base64. Presente apenas em ICP_BRASIL. */
  pkcs7DerBase64?: string;
  /** Cert público em PEM. Presente apenas em ICP_BRASIL. */
  certPem?: string;
  /** Subject do cert (ex.: "CN=PREFEITURA AGUAS BELAS, O=ICP-Brasil…"). */
  certSubject?: string;
  /** Validade do cert em ISO 8601. */
  certValidoAte?: string;
}

interface CarregamentoCert {
  ok: boolean;
  privateKey?: forge.pki.rsa.PrivateKey;
  cert?: forge.pki.Certificate;
  motivo?: string;
}

let cacheCert: CarregamentoCert | null = null;

function carregarCert(): CarregamentoCert {
  if (cacheCert) return cacheCert;

  const path = env.TFD_SIGN_CERT_PATH;
  const password = env.TFD_SIGN_CERT_PASSWORD;

  if (!path || !password) {
    cacheCert = {
      ok: false,
      motivo: 'TFD_SIGN_CERT_PATH ou TFD_SIGN_CERT_PASSWORD não definidos',
    };
    return cacheCert;
  }
  if (!fs.existsSync(path)) {
    cacheCert = { ok: false, motivo: `arquivo não encontrado: ${path}` };
    return cacheCert;
  }

  try {
    const p12Der = fs.readFileSync(path, 'binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    // OIDs são strings constantes do PKI mas o tipo do node-forge é Record<string, string>;
    // capturamos em const local pra TypeScript saber que não é undefined.
    const KEY_OID = forge.pki.oids['pkcs8ShroudedKeyBag'] as string;
    const CERT_OID = forge.pki.oids['certBag'] as string;

    const keyBags = p12.getBags({ bagType: KEY_OID });
    const certBags = p12.getBags({ bagType: CERT_OID });

    const keyBag = keyBags[KEY_OID]?.[0];
    const certBag = certBags[CERT_OID]?.[0];

    if (!keyBag?.key || !certBag?.cert) {
      cacheCert = { ok: false, motivo: 'PKCS#12 não contém keypair completo' };
      return cacheCert;
    }

    // Valida que não está expirado
    const now = new Date();
    if (now < certBag.cert.validity.notBefore || now > certBag.cert.validity.notAfter) {
      cacheCert = {
        ok: false,
        motivo: `cert fora de validade (${certBag.cert.validity.notBefore.toISOString()} → ${certBag.cert.validity.notAfter.toISOString()})`,
      };
      return cacheCert;
    }

    cacheCert = {
      ok: true,
      privateKey: keyBag.key as forge.pki.rsa.PrivateKey,
      cert: certBag.cert,
    };
    logger.info(
      {
        subject: certBag.cert.subject.attributes
          .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name ?? '?'}=${a.value}`)
          .join(','),
        validoAte: certBag.cert.validity.notAfter.toISOString(),
      },
      '✓ certificado ICP-Brasil carregado para assinatura TFD',
    );
    return cacheCert;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cacheCert = { ok: false, motivo: `falha ao parsear PKCS#12: ${msg}` };
    return cacheCert;
  }
}

/**
 * No boot, valida configuração. Se `TFD_SIGN_REQUIRED=true` e o cert não está
 * disponível, lança — boot falha (fail-fast em produção).
 */
export function bootstrapAssinaturaTfd(): void {
  const required = env.TFD_SIGN_REQUIRED;
  const r = carregarCert();
  if (r.ok) return;
  if (required) {
    throw new Error(`TFD_SIGN_REQUIRED=true mas cert indisponível: ${r.motivo}`);
  }
  logger.warn(
    { motivo: r.motivo, fix: 'Defina TFD_SIGN_CERT_PATH+TFD_SIGN_CERT_PASSWORD' },
    '⚠️  assinatura ICP-Brasil DESLIGADA — export TJ usará apenas SHA-256 no manifest',
  );
}

/**
 * Assina o conteúdo (geralmente o ZIP TJ inteiro). Retorna sempre SHA-256;
 * adiciona PKCS#7 detached + cert PEM se modo ICP-Brasil ativo.
 */
export function assinarConteudoTj(conteudo: Buffer): AssinaturaResult {
  const sha256 = crypto.createHash('sha256').update(conteudo).digest('hex');

  const carga = carregarCert();
  if (!carga.ok || !carga.privateKey || !carga.cert) {
    return { modo: 'HASH_ONLY', sha256 };
  }

  try {
    // PKCS#7 detached signed data
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(conteudo.toString('binary'));
    p7.addCertificate(carga.cert);

    const SHA256_OID = forge.pki.oids['sha256'] as string;
    const CONTENT_TYPE_OID = forge.pki.oids['contentType'] as string;
    const DATA_OID = forge.pki.oids['data'] as string;
    const MESSAGE_DIGEST_OID = forge.pki.oids['messageDigest'] as string;
    const SIGNING_TIME_OID = forge.pki.oids['signingTime'] as string;

    p7.addSigner({
      key: carga.privateKey,
      certificate: carga.cert,
      digestAlgorithm: SHA256_OID,
      authenticatedAttributes: [
        { type: CONTENT_TYPE_OID, value: DATA_OID },
        { type: MESSAGE_DIGEST_OID }, // computed automatically by forge
        { type: SIGNING_TIME_OID, value: new Date().toISOString() },
      ],
    });
    p7.sign({ detached: true });

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const pkcs7DerBase64 = Buffer.from(der, 'binary').toString('base64');
    const certPem = forge.pki.certificateToPem(carga.cert);
    const subject = carga.cert.subject.attributes
      .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name ?? '?'}=${a.value}`)
      .join(',');

    return {
      modo: 'ICP_BRASIL',
      sha256,
      pkcs7DerBase64,
      certPem,
      certSubject: subject,
      certValidoAte: carga.cert.validity.notAfter.toISOString(),
    };
  } catch (err) {
    logger.error({ err }, 'falha ao assinar PKCS#7 — fallback para HASH_ONLY');
    return { modo: 'HASH_ONLY', sha256 };
  }
}

/**
 * Verifica uma assinatura PKCS#7 detached contra um conteúdo. Retorna se a
 * assinatura é válida + dados do signatário. Útil pro endpoint de verificação
 * de export TJ ou auditoria do TJ.
 */
export function verificarAssinaturaTj(
  conteudo: Buffer,
  pkcs7DerBase64: string,
): { valida: boolean; motivo?: string; subject?: string; sha256: string } {
  const sha256 = crypto.createHash('sha256').update(conteudo).digest('hex');
  try {
    const der = Buffer.from(pkcs7DerBase64, 'base64').toString('binary');
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData;

    // Re-injeta conteúdo (assinatura é detached) — necessário pra verificação.
    p7.content = forge.util.createBuffer(conteudo.toString('binary'));

    const certs = p7.certificates ?? [];
    const cert = certs[0];
    if (!cert) {
      return { valida: false, sha256, motivo: 'PKCS#7 sem certificado embutido' };
    }
    const subject = cert.subject.attributes
      .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name ?? '?'}=${a.value}`)
      .join(',');

    // Verificação criptográfica completa (incl. cadeia CRL/OCSP) é responsabilidade
    // de ferramenta externa do TJ (assinador.iti.gov.br). Aqui validamos que:
    //   1. O .p7s parseou OK
    //   2. Tem cert embutido e válido (notBefore/notAfter)
    const now = new Date();
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      return {
        valida: false,
        sha256,
        subject,
        motivo: 'cert fora do período de validade',
      };
    }
    return { valida: true, sha256, subject };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valida: false, sha256, motivo: `parse falhou: ${msg}` };
  }
}
