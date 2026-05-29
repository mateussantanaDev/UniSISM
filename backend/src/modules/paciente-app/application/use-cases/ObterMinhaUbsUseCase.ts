/**
 * `GET /paciente-app/ubs/minha` — UBS vinculada ao paciente autenticado.
 *
 * v0.13: schema da `Ubs` agora persiste todos os campos do contrato
 * (bairro, cep, telefone, whatsapp, email, latitude, longitude, horarios,
 * observacoes). O use case retorna o que está cadastrado; campos vazios
 * saem como `null`.
 *
 * Estratégia de resolução do vínculo (em ordem):
 *   1. `conta.ubsVinculadaId` (preferido — populado em onboarding/operações)
 *   2. Último encaminhamento do paciente (fallback — populando vínculo on-the-fly)
 *   3. 404 `PACIENTE_SEM_UBS`
 *
 * Quando o vínculo é resolvido via fallback, a conta é atualizada
 * (best-effort) para futuras consultas serem O(1).
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import { logger } from '../../../../infrastructure/logger';

export interface HorarioDiaDto {
  abre: string;
  fecha: string;
}

export interface UbsMinhaDto {
  id: string;
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  /**
   * Horários estruturados. Cada chave (segunda..domingo) é `null` (fechado)
   * ou `{ abre: "HH:MM", fecha: "HH:MM" }`.
   * Se UBS não cadastrou ainda: `null`.
   */
  horarios: Record<string, HorarioDiaDto | null> | null;
  /** Texto formatado pra UI quando UBS não tem `horarios` estruturado. */
  horarioFuncionamento: string;
  coordenadoresNomes: string[];
  latitude: number | null;
  longitude: number | null;
  observacoes: string | null;
}

export class ObterMinhaUbsUseCase {
  async exec(contaId: string): Promise<UbsMinhaDto> {
    const conta = await prisma.pacienteConta.findUnique({
      where: { id: contaId },
      select: { id: true, cpf: true, ubsVinculadaId: true },
    });
    if (!conta) {
      throw NotFound('PACIENTE_SEM_UBS', 'Conta não encontrada');
    }

    // 1. Vínculo direto (preferido)
    let ubsId = conta.ubsVinculadaId;
    let usouFallback = false;

    // 2. Fallback: último encaminhamento do paciente
    if (!ubsId) {
      const ultimoEnc = await prisma.encaminhamento.findFirst({
        where: {
          OR: [{ pacienteCpf: conta.cpf }, { pacienteCpf: _formatarCpf(conta.cpf) }],
          deletadoEm: null,
        },
        select: { ubsId: true },
        orderBy: { criadoEm: 'desc' },
      });
      ubsId = ultimoEnc?.ubsId ?? null;
      usouFallback = ubsId !== null;
    }

    if (!ubsId) {
      throw NotFound(
        'PACIENTE_SEM_UBS',
        'Você ainda não está vinculado a uma UBS. Procure a Secretaria de Saúde.',
      );
    }

    const ubs = await prisma.ubs.findUnique({ where: { id: ubsId } });
    if (!ubs || ubs.deletadoEm) {
      throw NotFound(
        'PACIENTE_SEM_UBS',
        'Sua UBS de vínculo não está mais disponível. Procure a Secretaria de Saúde.',
      );
    }

    // Persiste vínculo descoberto via fallback (best-effort — não bloqueia se falhar)
    if (usouFallback) {
      void prisma.pacienteConta
        .update({
          where: { id: conta.id },
          data: { ubsVinculadaId: ubs.id },
        })
        .catch((err) =>
          logger.warn(
            { err, contaId: conta.id, ubsId: ubs.id },
            '[ubs/minha] falha ao persistir vínculo descoberto via fallback',
          ),
        );
    }

    // Lista coordenadores (atendentes role=COORDENADOR_UBS, ativos, dessa UBS).
    const coords = await prisma.atendente.findMany({
      where: { ubsId: ubs.id, role: 'COORDENADOR_UBS', ativo: true, deletadoEm: null },
      select: { nome: true },
      take: 5,
    });

    // Horários estruturados → texto curto (compat com versões antigas do app)
    const horarios = ubs.horarios as Record<string, HorarioDiaDto | null> | null;
    const horarioTexto = horarios ? _resumirHorarios(horarios) : 'Consulte a UBS';

    return {
      id: ubs.id,
      nome: ubs.nome,
      endereco: ubs.endereco,
      bairro: ubs.bairro,
      cidade: ubs.municipio,
      uf: ubs.uf,
      cep: ubs.cep,
      telefone: ubs.telefone,
      whatsapp: ubs.whatsapp,
      email: ubs.email,
      horarios: horarios,
      horarioFuncionamento: horarioTexto,
      coordenadoresNomes: coords.map((c) => c.nome),
      latitude: ubs.latitude != null ? Number(ubs.latitude) : null,
      longitude: ubs.longitude != null ? Number(ubs.longitude) : null,
      observacoes: ubs.observacoes,
    };
  }
}

const DIAS_PT: Record<string, string> = {
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

const DIAS_ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

/**
 * Converte horários estruturados em texto curto para UI.
 *
 * Exemplos:
 *   { segunda..sexta: 07:00-17:00, sabado/domingo: null }
 *     → "Segunda a Sexta · 07:00 às 17:00"
 *
 *   { segunda: 08-12, terca: 14-18, resto: null }
 *     → "Segunda 08:00 às 12:00 · Terça 14:00 às 18:00"
 */
function _resumirHorarios(horarios: Record<string, HorarioDiaDto | null>): string {
  const abertosOrd = DIAS_ORDEM.filter((d) => horarios[d] != null).map((d) => ({
    dia: d,
    h: horarios[d]!,
  }));
  if (abertosOrd.length === 0) return 'Fechado todos os dias';

  // Detecta grupo segunda-sexta com horário igual (comum)
  const segSex = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
  const todosSegSexIguais =
    segSex.every((d) => horarios[d] != null) &&
    segSex.every(
      (d) =>
        horarios[d]!.abre === horarios['segunda']!.abre &&
        horarios[d]!.fecha === horarios['segunda']!.fecha,
    );
  const sabFechado = horarios['sabado'] == null;
  const domFechado = horarios['domingo'] == null;

  if (todosSegSexIguais && sabFechado && domFechado) {
    return `Segunda a Sexta · ${horarios['segunda']!.abre} às ${horarios['segunda']!.fecha}`;
  }

  // Caso geral — lista dia a dia
  return abertosOrd
    .map(({ dia, h }) => `${DIAS_PT[dia]} ${h.abre} às ${h.fecha}`)
    .join(' · ');
}

function _formatarCpf(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
