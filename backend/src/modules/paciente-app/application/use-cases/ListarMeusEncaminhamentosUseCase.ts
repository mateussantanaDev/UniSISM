import { prisma } from '../../../../infrastructure/database/prisma';
import {
  INCLUDE_ENCAMINHAMENTO_FULL,
  rowParaEncaminhamento,
} from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento, EventoTimeline } from '../../../../domain/entities/Encaminhamento';

/**
 * DTO do paciente — `Encaminhamento` do domínio **+** campos derivados.
 *
 *   - `pendenciasAbertas`: número de eventos `PENDENCIA_REGISTRADA` que
 *      ainda não foram resolvidos. Resolução = chegou um `DOCUMENTO_ANEXADO`
 *      ou `ENVIADO_REGULACAO` depois do PENDENCIA_REGISTRADA. Cap = 1 quando
 *      `status === PENDENCIA_DOCUMENTO` (estado canônico).
 *
 *   - `podeSolicitarTfd`: paciente pode pedir transporte ao TFD. Regra:
 *      status=APROVADO + agendamentoPrevisto futuro + a cidade da consulta é
 *      diferente da cidade da UBS de origem (parse heurístico do
 *      `localAgendamento`, ou comparação `municipio` do destino vs UBS).
 *
 *   - `recomendacoes`: vem da tabela `EspecialidadeRecomendacao` (case-insensitive
 *      por `especialidade`). Se o admin não cadastrou ainda → array vazio.
 */
export interface EncaminhamentoPacienteDto extends Encaminhamento {
  pendenciasAbertas: number;
  podeSolicitarTfd: boolean;
}

export class ListarMeusEncaminhamentosUseCase {
  async exec(cpfDigits: string, cpfFormatado: string): Promise<EncaminhamentoPacienteDto[]> {
    const rows = await prisma.encaminhamento.findMany({
      where: {
        OR: [{ pacienteCpf: cpfFormatado }, { pacienteCpf: cpfDigits }],
        deletadoEm: null,
      },
      include: {
        ...INCLUDE_ENCAMINHAMENTO_FULL,
        ubs: { select: { municipio: true, uf: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });

    if (rows.length === 0) return [];

    // Junta todas as especialidades distintas pra fazer 1 query em vez de N.
    const especialidades = Array.from(
      new Set(rows.map((r) => r.especialidadeSolicitada).filter(Boolean)),
    );
    const recomendacoesPorEspecialidade =
      await _buscarRecomendacoes(especialidades);

    return rows.map((r) => {
      const enc = rowParaEncaminhamento(r);
      // Lookup canônico: lowercase + sem acento (resiliente a "Cardiología", "OFTALMOLOGÍA" etc.)
      const recsArr =
        recomendacoesPorEspecialidade.get(_normalizar(r.especialidadeSolicitada)) ?? [];
      const enriched: EncaminhamentoPacienteDto = {
        ...enc,
        recomendacoes: recsArr,
        pendenciasAbertas: _calcularPendenciasAbertas(enc),
        podeSolicitarTfd: _calcularPodeSolicitarTfd(enc, r.ubs.municipio),
      };
      return enriched;
    });
  }
}

/**
 * Busca recomendações por especialidade em batch (case-insensitive).
 * Devolve Map<especialidade-lowercase, string[]>.
 */
async function _buscarRecomendacoes(
  especialidades: string[],
): Promise<Map<string, string[]>> {
  if (especialidades.length === 0) return new Map();

  // Estratégia: buscar TODAS ativas (universo pequeno — dezenas no máximo)
  // e fazer matching no app por chave canônica (lowercase + sem acento).
  // Trade-off: 1 query simples vs. dezenas de OR com `mode:'insensitive'` que
  // ainda não cobririam acentos (Postgres ILIKE não normaliza diacríticos).
  //
  // Universo `EspecialidadeRecomendacao` é admin-side curated (≤ 50 itens em
  // produção realista); puxar todas é O(N) com N pequeno e constante.
  const all = await prisma.especialidadeRecomendacao.findMany({
    where: { ativo: true },
    select: { especialidade: true, recomendacoes: true },
  });

  // Indexa o universo por chave canônica.
  const universoMap = new Map<string, string[]>();
  for (const row of all) {
    const arr = Array.isArray(row.recomendacoes) ? (row.recomendacoes as string[]) : [];
    universoMap.set(_normalizar(row.especialidade), arr);
  }

  // Filtra só as que o caller pediu (mantém o contrato O(K) de retorno).
  const map = new Map<string, string[]>();
  for (const esp of especialidades) {
    const key = _normalizar(esp);
    const arr = universoMap.get(key);
    if (arr) map.set(key, arr);
  }
  return map;
}

/**
 * pendenciasAbertas — contagem de `PENDENCIA_REGISTRADA` na timeline que ainda
 * não foram resolvidas. Resolução: chega um `DOCUMENTO_ANEXADO` ou
 * `ENVIADO_REGULACAO` em data posterior.
 *
 * Como o status final é `PENDENCIA_DOCUMENTO` enquanto não resolvido, basta
 * usar o status como sinal canônico quando ele bate. Pra encaminhamentos
 * APROVADO/REJEITADO que tiveram pendência no histórico, contagem volta a 0.
 */
function _calcularPendenciasAbertas(e: Encaminhamento): number {
  // Status canônico mata qualquer ambiguidade da timeline.
  if (e.status !== 'PENDENCIA_DOCUMENTO') return 0;

  const timeline = e.timeline ?? [];
  if (timeline.length === 0) return 1; // status diz que tem; sem timeline, conta 1.

  // Conta pendências abertas: itera cronologicamente, abre em PENDENCIA_REGISTRADA,
  // fecha em DOCUMENTO_ANEXADO ou ENVIADO_REGULACAO.
  let abertas = 0;
  for (const evt of timeline) {
    if (evt.tipo === 'PENDENCIA_REGISTRADA') abertas++;
    else if (
      (evt.tipo === 'DOCUMENTO_ANEXADO' || evt.tipo === 'ENVIADO_REGULACAO') &&
      abertas > 0
    ) {
      abertas--;
    }
  }
  // Garante consistência com o status — se status diz PENDENCIA_DOCUMENTO,
  // tem que ter ≥ 1.
  return Math.max(abertas, 1);
}

/**
 * podeSolicitarTfd — paciente pode pedir transporte TFD?
 *
 *   1. Encaminhamento APROVADO + agendamento futuro
 *   2. Cidade da consulta DIFERENTE da cidade da UBS de origem
 *      Usa `cidadeAgendamento` **EXPLÍCITA** (preenchida pelo regulador na
 *      aprovação). Comparação case- e accent-insensitive.
 *      Sem cidadeAgendamento: fallback `true` — UI mostra CTA, UBS decide.
 */
function _calcularPodeSolicitarTfd(e: Encaminhamento, ubsMunicipio: string): boolean {
  if (e.status !== 'APROVADO') return false;
  if (!e.agendamentoPrevisto) return false;

  // Agendamento no passado → não tem porquê pedir transporte.
  const dt = new Date(e.agendamentoPrevisto);
  if (dt.getTime() < Date.now()) return false;

  // Sem cidadeAgendamento explícita — fallback: true (mostra CTA, UBS decide).
  const cidade = e.cidadeAgendamento;
  if (!cidade) return true;

  // Comparação canônica (lowercase + remove acento). Igual = mesma cidade = sem TFD.
  if (_normalizar(cidade) === _normalizar(ubsMunicipio)) return false;
  return true;
}

/**
 * Normaliza string para comparação canônica:
 *   - trim
 *   - lowercase
 *   - remove acentos (Unicode NFD → strip combining marks)
 *
 * "Cardiología" → "cardiologia", "São Paulo" → "sao paulo".
 */
function _normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export { _normalizar };

// Suprime aviso de import não usado (EventoTimeline aparece via Encaminhamento).
void ({} as EventoTimeline | undefined);
