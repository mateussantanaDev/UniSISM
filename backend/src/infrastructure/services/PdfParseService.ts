/**
 * Extração estruturada de PDFs via pdf-parse v2 (classe PDFParse).
 *
 * O texto extraído de PDFs nativos vem desestruturado (labels e valores
 * em linhas/posições visuais, nem sempre adjacentes). Usamos uma
 * combinação de:
 *   1. Regexes globais para tokens identificáveis (CPF, CNS, datas, telefones)
 *   2. Match por label conhecido → próxima linha não-vazia
 *   3. Fallbacks: se label não bate, captura por padrão.
 *
 * Suporta tanto modelos de **solicitação de UBS** quanto **retorno de
 * agendamento SUS** (campos comuns: paciente). Campos clínicos (CID,
 * prioridade, justificativa) só estarão na solicitação UBS.
 */
import { PDFParse } from 'pdf-parse';
import type { IPdfExtractor } from '../../domain/services/IPdfExtractor';
import type {
  ExtracaoPdfResultado,
  Paciente,
  PrioridadeClinica,
  SexoPaciente,
  SolicitacaoMedica,
} from '../../domain/entities/Encaminhamento';
import { logger } from '../logger';

// ============================================================
// Regexes de tokens
// ============================================================

const RE_CPF_FORMATADO = /(\d{3}\.\d{3}\.\d{3}-\d{2})/g;
const RE_CPF_PURO = /(?<![\d.])\d{11}(?![\d.])/g;
const RE_CNS = /(?<!\d)(\d{15}|\d{3}\s?\d{4}\s?\d{4}\s?\d{4})(?!\d)/g;
const RE_DATA_BR = /(\d{2}\/\d{2}\/\d{4})/g;
const RE_CRM = /CRM[\s/]*([A-Z]{2})\s*([\d.]+)/i;
const RE_CID10 = /\b([A-Z]\d{2}(?:\.\d)?)\b/;

// ============================================================
// Helpers
// ============================================================

function brDateParaIso(br: string): string {
  const partes = br.split('/');
  if (partes.length !== 3) return '';
  const [d, m, y] = partes;
  return `${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
}

function formatarCpf(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarCns(s: string): string {
  const d = s.replace(/\D+/g, '');
  if (d.length !== 15) return s.trim();
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
}

function detectarPrioridade(texto: string): PrioridadeClinica {
  const t = texto.toUpperCase();
  if (/\bEMERG[ÊE]NCIA\b/.test(t)) return 'EMERGENCIA';
  if (/\bURG[ÊE]NCIA\b/.test(t)) return 'URGENTE';
  if (/\bPRIORIT[ÁA]RI[OA]\b/.test(t)) return 'PRIORITARIA';
  return 'ELETIVA';
}

function detectarSexo(texto: string): SexoPaciente {
  const m = /sexo\s*[:\-]?\s*(masc|fem|m|f)\b/i.exec(texto);
  if (!m) return 'OUTRO';
  const v = (m[1] ?? '').toLowerCase();
  if (v.startsWith('m')) return 'M';
  if (v.startsWith('f')) return 'F';
  return 'OUTRO';
}

/**
 * Procura, no array de linhas, a linha imediatamente após uma que case com `labelRegex`.
 * Útil para layouts em que label e valor ocupam linhas separadas (caso comum em PDFs do SUS).
 */
function valorAposLabel(linhas: string[], labelRegex: RegExp): string {
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? '';
    if (!labelRegex.test(linha)) continue;

    // Mesma linha, depois do `:`
    const inline = linha.replace(labelRegex, '').replace(/^[:\s\-—]+/, '').trim();
    if (inline && !inline.endsWith(':')) return inline;

    // Próximas até 5 linhas: pega a primeira que não é label
    for (let j = i + 1; j < Math.min(i + 6, linhas.length); j++) {
      const proxima = (linhas[j] ?? '').trim();
      if (!proxima) continue;
      if (proxima.endsWith(':')) continue;
      if (
        /^(NOME|CPF|CNS|TELEFONE|ENDERE[ÇC]O|DATA|EMITIDO|PROFISSIONAL|SENHA|M[ÃA]E|PAI|SEXO|CID|ESPECIALIDADE|JUSTIFICATIVA|MOTIVO|TIPO\s*DE\s*CONSULTA|PROCEDIMENTO)\s*:/i.test(
          proxima,
        )
      )
        continue;
      return proxima;
    }
  }
  return '';
}

// ============================================================
// Extrator
// ============================================================

export class PdfParseService implements IPdfExtractor {
  async extrair(buffer: Buffer): Promise<ExtracaoPdfResultado> {
    let texto = '';
    try {
      const parser = new PDFParse({ data: buffer });
      const r = await parser.getText();
      texto = r.text ?? '';
    } catch (err) {
      logger.warn({ err }, 'falha ao extrair PDF; retornando shape vazio');
      return this.shapeVazio();
    }

    if (!texto.trim()) return this.shapeVazio();

    const linhas = texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // ---- Tokens globais ----
    const cpfsFormatados = [...texto.matchAll(RE_CPF_FORMATADO)].map((m) => m[1]!);
    const cpfsPuros = [...texto.matchAll(RE_CPF_PURO)].map((m) => m[0]);
    const cpfRaw = cpfsFormatados[0] ?? (cpfsPuros[0] ? formatarCpf(cpfsPuros[0]) : '');

    const cnsMatches = [...texto.matchAll(RE_CNS)].map((m) => m[1]!);
    const cartaoSus = cnsMatches[0] ? formatarCns(cnsMatches[0]) : '';

    const datasBr = [...texto.matchAll(RE_DATA_BR)].map((m) => m[1]!);

    // Telefone: primeiro que aparece no texto (geralmente do paciente)
    const telefonesGlobais = [...texto.matchAll(/\((\d{2})\)\s?(\d{4,5})-?(\d{4})/g)];
    const telefone = telefonesGlobais[0]
      ? `(${telefonesGlobais[0][1]}) ${telefonesGlobais[0][2]}-${telefonesGlobais[0][3]}`
      : '';

    const crmMatch = RE_CRM.exec(texto);
    const crm = crmMatch ? `CRM/${(crmMatch[1] ?? '').toUpperCase()} ${crmMatch[2] ?? ''}` : '';

    const cid10 = RE_CID10.exec(texto)?.[1] ?? '';

    // ---- Campos nominais (label-driven) ----
    const nome = valorAposLabel(linhas, /^NOME\s*:/i);
    const endereco = valorAposLabel(linhas, /^ENDERE[ÇC]O\s*:/i);

    // Data de nascimento: heurística — entre as datas extraídas, a mais antiga
    // (≤ 2010 ou >18 anos atrás) é tipicamente a de nascimento. Se label achar, prefere.
    const dataNascBr = (() => {
      const labelV = valorAposLabel(linhas, /^DATA\s*DE\s*NASCIMENTO\s*:/i);
      const labelMatch = labelV ? /(\d{2}\/\d{2}\/\d{4})/.exec(labelV) : null;
      if (labelMatch?.[1]) return labelMatch[1];
      // Fallback: data mais antiga do texto (pessoas vivas: ano <= ano_atual - 5)
      const limiteAno = new Date().getUTCFullYear() - 5;
      const candidatas = datasBr
        .map((d) => ({ raw: d, ano: Number(d.split('/')[2]) }))
        .filter((d) => d.ano > 1900 && d.ano <= limiteAno)
        .sort((a, b) => a.ano - b.ano);
      return candidatas[0]?.raw ?? '';
    })();

    // Profissional solicitante: pega o nome de pessoa após o label, pulando hospitais/clínicas
    const medicoSolicitante = (() => {
      const labels = [
        /^M[ÉE]DICO\s*SOLICITANTE\s*:/i,
        /^PROFISSIONAL\s*SOLICITANTE\s*:/i,
        /^SOLICITANTE\s*:/i,
      ];
      for (const lab of labels) {
        for (let i = 0; i < linhas.length; i++) {
          if (!lab.test(linhas[i] ?? '')) continue;
          // pega as próximas até 6 linhas, pula instituições
          for (let j = i + 1; j < Math.min(i + 7, linhas.length); j++) {
            const v = (linhas[j] ?? '').trim();
            if (!v) continue;
            if (v.endsWith(':')) continue;
            if (
              /^(HOSPITAL|UPA|UBS|CL[ÍI]NICA|UNIDADE|SECRETARIA|POSTO|CASA|MATERNIDADE|AMBULAT[ÓO]RIO)/i.test(
                v,
              )
            )
              continue;
            return v;
          }
        }
      }
      return '';
    })();

    const especialidade =
      valorAposLabel(linhas, /^ESPECIALIDADE\s*:/i) ||
      valorAposLabel(linhas, /^TIPO\s*DE\s*CONSULTA\s*:/i) ||
      valorAposLabel(linhas, /^PROCEDIMENTO\s*:/i);

    const cidDescricao =
      valorAposLabel(linhas, /^CID\s*DESCRI/i) ||
      valorAposLabel(linhas, /^DESCRI[ÇC][ÃA]O\s*CID/i) ||
      valorAposLabel(linhas, /^DESCRI[ÇC][ÃA]O\s*:/i);

    const justificativa =
      valorAposLabel(linhas, /^JUSTIFICATIVA\s*:/i) ||
      valorAposLabel(linhas, /^HIST[ÓO]RICO\s*CL[ÍI]NICO\s*:/i) ||
      valorAposLabel(linhas, /^MOTIVO\s*:/i);

    // Data de solicitação: tenta label específico, fallback pra MAIS RECENTE ≠ nascimento
    const dataSolicBr = (() => {
      const explicit =
        valorAposLabel(linhas, /^DATA\s*DA?\s*SOLICITA[ÇC][ÃA]O\s*:/i) ||
        valorAposLabel(linhas, /^DATA\s*DO\s*PEDIDO\s*:/i) ||
        valorAposLabel(linhas, /^EMITIDO\s*EM\s*:/i);
      if (explicit) {
        const m = /(\d{2}\/\d{2}\/\d{4})/.exec(explicit);
        if (m) return m[1]!;
      }
      // Fallback: a data mais recente (excluindo a de nascimento)
      const candidatas = datasBr
        .filter((d) => d !== dataNascBr)
        .map((d) => ({ raw: d, ano: Number(d.split('/')[2]) }))
        .sort((a, b) => b.ano - a.ano);
      return candidatas[0]?.raw ?? '';
    })();

    const paciente: Paciente = {
      nome: nome.toUpperCase(),
      cpf: cpfRaw,
      cartaoSus,
      dataNascimento: dataNascBr ? brDateParaIso(dataNascBr) : '',
      sexo: detectarSexo(texto),
      telefone,
      endereco: endereco.toUpperCase(),
    };

    const solicitacao: SolicitacaoMedica = {
      medicoSolicitante: medicoSolicitante.toUpperCase(),
      crm,
      especialidadeSolicitada: especialidade,
      cid10,
      cidDescricao,
      justificativaClinica: justificativa,
      prioridade: detectarPrioridade(texto),
      dataSolicitacao: dataSolicBr ? brDateParaIso(dataSolicBr) : '',
    };

    const criticos = [
      paciente.nome,
      paciente.cpf,
      paciente.dataNascimento,
      solicitacao.especialidadeSolicitada,
      solicitacao.medicoSolicitante,
    ];
    const preenchidos = criticos.filter((c) => c && c.length > 0).length;
    const confianca = Number((preenchidos / criticos.length).toFixed(2));

    return { paciente, solicitacao, confiancaExtracao: confianca };
  }

  private shapeVazio(): ExtracaoPdfResultado {
    return {
      paciente: {
        nome: '',
        cpf: '',
        cartaoSus: '',
        dataNascimento: '',
        sexo: 'OUTRO',
        telefone: '',
        endereco: '',
      },
      solicitacao: {
        medicoSolicitante: '',
        crm: '',
        especialidadeSolicitada: '',
        cid10: '',
        cidDescricao: '',
        justificativaClinica: '',
        prioridade: 'ELETIVA',
        dataSolicitacao: '',
      },
      confiancaExtracao: 0,
    };
  }
}
