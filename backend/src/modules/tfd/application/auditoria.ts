/**
 * Visualização da trilha imutável (cadeia hash) e exportação para o TJ.
 *
 * - `listar` / `porId`: leitura simples, scope-aware.
 * - `verificarIntegridade`: re-calcula toda a cadeia (DEV apenas).
 * - `exportarTJ`: gera ZIP com 5 CSVs + manifest.json com hash inicial/final.
 */
import crypto from 'node:crypto';
import { Forbidden, NotFound } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { Prisma, TfdAuditLog } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import { assertMesmaPrefeitura, resolverPrefeituraIdEfetiva } from './_helpers';
import { verificarCadeiaTfd } from '../infrastructure/TfdAuditLogger';
import { assinarConteudoTj } from '../infrastructure/TfdSignatureService';
import type { Request } from 'express';

function rowParaRegistro(r: TfdAuditLog) {
  return {
    id: r.id,
    acao: r.acao,
    recursoTipo: r.recursoTipo,
    recursoId: r.recursoId,
    recursoProtocolo: r.recursoProtocolo,
    operadorId: r.operadorId,
    operadorNome: r.operadorNome,
    operadorMatricula: r.operadorMatricula,
    operadorRole: r.operadorRole,
    ip: r.ip,
    userAgent: r.userAgent,
    antes: r.antes,
    depois: r.depois,
    hashAnterior: r.hashAnterior,
    hash: r.hash,
    em: r.em.toISOString(),
    prefeituraId: r.prefeituraId,
  };
}

export class AuditoriaTfdUseCases {
  async listar(
    scope: AccessScope,
    req: Request,
    filtros: { recursoTipo?: string; recursoId?: string; desde?: string; ate?: string },
  ) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    if (scope.kind === 'UBS') {
      throw Forbidden('ROLE_NAO_PERMITIDO', 'Apenas ADMIN/DEV podem ver auditoria');
    }
    const where: Prisma.TfdAuditLogWhereInput = { prefeituraId };
    if (filtros.recursoTipo) where.recursoTipo = filtros.recursoTipo;
    if (filtros.recursoId) where.recursoId = filtros.recursoId;
    if (filtros.desde || filtros.ate) {
      const range: Prisma.DateTimeFilter = {};
      if (filtros.desde) range.gte = new Date(`${filtros.desde}T00:00:00.000Z`);
      if (filtros.ate) range.lte = new Date(`${filtros.ate}T23:59:59.999Z`);
      where.em = range;
    }
    const rows = await prisma.tfdAuditLog.findMany({
      where,
      orderBy: { em: 'desc' },
      take: 500,
    });
    return rows.map(rowParaRegistro);
  }

  async porId(scope: AccessScope, id: string) {
    const r = await prisma.tfdAuditLog.findUnique({ where: { id } });
    if (!r) throw NotFound('REGISTRO_NAO_ENCONTRADO', 'Registro de auditoria não encontrado');
    assertMesmaPrefeitura(scope, r.prefeituraId);
    return rowParaRegistro(r);
  }

  async verificarIntegridade(scope: AccessScope, req: Request) {
    if (scope.kind !== 'GLOBAL') {
      throw Forbidden('ROLE_NAO_PERMITIDO', 'Apenas DEV pode verificar integridade');
    }
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    return verificarCadeiaTfd(prefeituraId);
  }

  /**
   * Exporta o ZIP TJ com 5 CSVs + manifest.json.
   * Retorna o conteúdo em memória — controller faz download.
   *
   * O ZIP é construído manualmente sem dependência externa pra simplicidade
   * (formato STORE = sem compressão; o tamanho dos CSVs é pequeno).
   */
  async exportarTJ(scope: AccessScope, req: Request, mes: string): Promise<{
    zip: Buffer;
    nomeArquivo: string;
    manifest: Record<string, unknown>;
  }> {
    if (scope.kind === 'UBS') {
      throw Forbidden('ROLE_NAO_PERMITIDO', 'Apenas ADMIN/DEV podem exportar para TJ');
    }
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw NotFound('MES_INVALIDO', 'Use YYYY-MM');
    }

    const inicio = new Date(`${mes}-01T00:00:00.000Z`);
    const [y, m] = mes.split('-').map(Number);
    const fim = new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999));

    const [pref, audit, viagens, abast, ajudas, saldos] = await Promise.all([
      prisma.prefeitura.findUnique({ where: { id: prefeituraId } }),
      prisma.tfdAuditLog.findMany({
        where: { prefeituraId, em: { gte: inicio, lte: fim } },
        orderBy: { em: 'asc' },
      }),
      prisma.viagemFrota.findMany({
        where: { prefeituraId, data: { gte: inicio, lte: fim } },
        include: { veiculo: { select: { placa: true } }, motorista: { select: { nome: true } } },
      }),
      prisma.abastecimento.findMany({
        where: { prefeituraId, solicitadoEm: { gte: inicio, lte: fim } },
        include: { veiculo: { select: { placa: true } } },
      }),
      prisma.ajudaCusto.findMany({
        where: { prefeituraId, criadaEm: { gte: inicio, lte: fim } },
        include: { paciente: { select: { nome: true, cpf: true } } },
      }),
      prisma.saldoVeiculo.findMany({
        where: { prefeituraId, mes },
        include: { veiculo: { select: { placa: true } } },
      }),
    ]);

    const csvAudit =
      'id,em,acao,recursoTipo,recursoId,protocolo,operadorMatricula,operadorRole,hashAnterior,hash\n' +
      audit
        .map((r) =>
          [r.id, r.em.toISOString(), r.acao, r.recursoTipo, r.recursoId, r.recursoProtocolo ?? '',
           r.operadorMatricula, r.operadorRole, r.hashAnterior, r.hash].map(csvEscape).join(','))
        .join('\n');

    const csvViagens =
      'id,data,placa,motorista,destino,kmInicial,kmFinal,kmRodados,status\n' +
      viagens
        .map((v) => {
          const kmI = v.kmInicialHodometro ? Number(v.kmInicialHodometro) : 0;
          const kmF = v.kmFinalHodometro ? Number(v.kmFinalHodometro) : 0;
          return [v.id, v.data.toISOString().slice(0, 10), v.veiculo?.placa ?? '', v.motorista?.nome ?? '',
                  v.destino, kmI, kmF, kmF - kmI, v.status].map(csvEscape).join(',');
        })
        .join('\n');

    const csvAbast =
      'protocolo,data,placa,posto,litros,valorPorLitro,valorTotal,hodometroKm,status,comprovante\n' +
      abast
        .map((a) =>
          [a.protocolo, a.solicitadoEm.toISOString().slice(0, 10), a.veiculo.placa, a.posto,
           Number(a.litros), Number(a.valorPorLitro), Number(a.valorTotal),
           Number(a.hodometroKm), a.status, a.comprovanteKey ?? ''].map(csvEscape).join(','))
        .join('\n');

    const csvAjudas =
      'protocolo,paciente,cpf,valorTotal,status,metodoPagamento,pagaEm,comprovante\n' +
      ajudas
        .map((a) =>
          [a.protocolo, a.paciente.nome, a.paciente.cpf, Number(a.valorTotal),
           a.status, a.metodoPagamento ?? '', a.pagaEm?.toISOString() ?? '',
           a.comprovantePagamentoKey ?? ''].map(csvEscape).join(','))
        .join('\n');

    const csvSaldo =
      'placa,mes,saldoMensal,saldoConsumido,saldoReservado,saldoDisponivel\n' +
      saldos
        .map((s) => {
          const mensal = Number(s.saldoMensal);
          const cons = Number(s.saldoConsumido);
          const res = Number(s.saldoReservado);
          return [s.veiculo.placa, s.mes, mensal, cons, res, mensal - cons - res]
            .map(csvEscape).join(',');
        })
        .join('\n');

    const hashInicial = audit[0]?.hashAnterior ?? '0'.repeat(64);
    const hashFinal = audit[audit.length - 1]?.hash ?? '0'.repeat(64);

    // Conteúdo central (CSVs) — assinado em conjunto pra não-repúdio.
    const csvFiles: Array<{ nome: string; conteudo: Buffer }> = [
      { nome: 'auditoria.csv', conteudo: Buffer.from('\uFEFF' + csvAudit, 'utf-8') },
      { nome: 'viagens.csv', conteudo: Buffer.from('\uFEFF' + csvViagens, 'utf-8') },
      { nome: 'abastecimentos.csv', conteudo: Buffer.from('\uFEFF' + csvAbast, 'utf-8') },
      { nome: 'ajudas-custo.csv', conteudo: Buffer.from('\uFEFF' + csvAjudas, 'utf-8') },
      { nome: 'saldo-mensal.csv', conteudo: Buffer.from('\uFEFF' + csvSaldo, 'utf-8') },
    ];
    // Concatena todos os CSVs em ordem fixa pra produzir hash determinístico
    // (mesma chamada → mesmo hash, requisito de prestação de contas).
    const conteudoAssinavel = Buffer.concat(csvFiles.map((f) => f.conteudo));
    const assinatura = assinarConteudoTj(conteudoAssinavel);

    const manifest: Record<string, unknown> = {
      mes,
      prefeitura: pref?.nome ?? 'desconhecida',
      prefeituraId,
      geradoEm: new Date().toISOString(),
      totalRegistrosAuditoria: audit.length,
      totalViagens: viagens.length,
      totalAbastecimentos: abast.length,
      totalAjudasCusto: ajudas.length,
      hashInicial,
      hashFinal,
      // Assinatura
      modoAssinatura: assinatura.modo,
      sha256Conteudo: assinatura.sha256,
      ...(assinatura.modo === 'ICP_BRASIL'
        ? {
            certSubject: assinatura.certSubject,
            certValidoAte: assinatura.certValidoAte,
            arquivosAssinatura: ['assinatura.p7s', 'cert.pem'],
          }
        : { aviso: 'Assinatura digital ICP-Brasil NÃO aplicada (cert ausente)' }),
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    const hashManifesto = crypto.createHash('sha256').update(manifestJson).digest('hex');
    const manifestComHash = JSON.stringify({ ...manifest, hashManifesto }, null, 2);

    const arquivos: Array<{ nome: string; conteudo: Buffer }> = [
      { nome: 'manifest.json', conteudo: Buffer.from(manifestComHash, 'utf-8') },
      ...csvFiles,
    ];
    if (assinatura.modo === 'ICP_BRASIL' && assinatura.pkcs7DerBase64 && assinatura.certPem) {
      arquivos.push({
        nome: 'assinatura.p7s',
        conteudo: Buffer.from(assinatura.pkcs7DerBase64, 'base64'),
      });
      arquivos.push({ nome: 'cert.pem', conteudo: Buffer.from(assinatura.certPem, 'utf-8') });
    }
    const zip = construirZip(arquivos);
    const nomeArquivo = `tfd-${prefeituraId.slice(0, 8)}-${mes}.zip`;
    return {
      zip,
      nomeArquivo,
      manifest: { ...manifest, hashManifesto },
    };
  }
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ----- ZIP STORE (sem compressão, sem dependências) -----
// Suficiente pra prestação de contas: TJ valida apenas estrutura + manifest.

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function dosTime(date = new Date()): { time: number; date: number } {
  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    date:
      (((date.getFullYear() - 1980) & 0x7f) << 9) |
      (((date.getMonth() + 1) & 0xf) << 5) |
      (date.getDate() & 0x1f),
  };
}

function construirZip(arquivos: Array<{ nome: string; conteudo: Buffer }>): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const dt = dosTime();

  for (const f of arquivos) {
    const nameBuf = Buffer.from(f.nome, 'utf-8');
    const crc = crc32(f.conteudo);
    const size = f.conteudo.length;

    // Local file header
    const localHdr = Buffer.alloc(30);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0x0800, 6); // flag (UTF-8)
    localHdr.writeUInt16LE(0, 8); // method = STORE
    localHdr.writeUInt16LE(dt.time, 10);
    localHdr.writeUInt16LE(dt.date, 12);
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(size, 18);
    localHdr.writeUInt32LE(size, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);
    partes.push(localHdr, nameBuf, f.conteudo);

    // Central directory entry
    const cdEntry = Buffer.alloc(46);
    cdEntry.writeUInt32LE(0x02014b50, 0);
    cdEntry.writeUInt16LE(20, 4);
    cdEntry.writeUInt16LE(20, 6);
    cdEntry.writeUInt16LE(0x0800, 8);
    cdEntry.writeUInt16LE(0, 10);
    cdEntry.writeUInt16LE(dt.time, 12);
    cdEntry.writeUInt16LE(dt.date, 14);
    cdEntry.writeUInt32LE(crc, 16);
    cdEntry.writeUInt32LE(size, 20);
    cdEntry.writeUInt32LE(size, 24);
    cdEntry.writeUInt16LE(nameBuf.length, 28);
    cdEntry.writeUInt16LE(0, 30);
    cdEntry.writeUInt16LE(0, 32);
    cdEntry.writeUInt16LE(0, 34);
    cdEntry.writeUInt16LE(0, 36);
    cdEntry.writeUInt32LE(0, 38);
    cdEntry.writeUInt32LE(offset, 42);
    central.push(cdEntry, nameBuf);

    offset += 30 + nameBuf.length + size;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(arquivos.length, 8);
  eocd.writeUInt16LE(arquivos.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...partes, cdBuf, eocd]);
}
