import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface CalcularAlocacaoVagaInput {
  centro?: 'CEM' | 'CEO' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
  especialidade?: string;
  medicoNome?: string;
  medicoId?: string;
  prioridade?: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
  procedimento?: string;
  dataBase?: string | Date;
}

export interface SlotAlocadoResult {
  data: string; // YYYY-MM-DD
  dataFormatada: string; // DD/MM/AAAA
  hora: string; // HH:MM
  medicoId?: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  consultorio: string;
  prazoLegalSus: string;
  justificativaEscala: string;
  duracaoMinutos: number;
  tipoServico: string;
}

export interface CalcularAlocacaoVagaOutput {
  sucesso: boolean;
  mensagem?: string;
  alocacao?: SlotAlocadoResult;
}

const DIAS_MAP: Record<string, number> = {
  dom: 0,
  domingo: 0,
  seg: 1,
  segunda: 1,
  'segunda-feira': 1,
  ter: 2,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  qua: 3,
  quarta: 3,
  'quarta-feira': 3,
  qui: 4,
  quinta: 4,
  'quinta-feira': 4,
  sex: 5,
  sexta: 5,
  'sexta-feira': 5,
  sab: 6,
  sabado: 6,
  sábado: 6,
};

function parseDiasSemana(dias: string[]): number[] {
  const result = new Set<number>();
  for (const d of dias) {
    const normalizado = d.trim().toLowerCase();
    if (normalizado in DIAS_MAP) {
      result.add(DIAS_MAP[normalizado]!);
    }
  }
  return result.size > 0 ? Array.from(result) : [1, 2, 3, 4, 5];
}

function gerarSlotsTurno(inicio: string, fim: string, duracaoMinutos = 20): string[] {
  const slots: string[] = [];
  const [hIni = 8, mIni = 0] = inicio.split(':').map(Number);
  const [hFim = 12, mFim = 0] = fim.split(':').map(Number);

  let atual = hIni * 60 + mIni;
  const limite = hFim * 60 + mFim;

  while (atual + duracaoMinutos <= limite) {
    const h = Math.floor(atual / 60);
    const m = atual % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    atual += duracaoMinutos;
  }

  return slots.length > 0 ? slots : [inicio];
}

function formatarDataIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function formatarDataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export class CalcularAlocacaoVagaCentroUseCase {
  async exec(input: CalcularAlocacaoVagaInput, scope: AccessScope): Promise<CalcularAlocacaoVagaOutput> {
    const prioridade = input.prioridade || 'ELETIVA';
    const centroNormalizado = (input.centro || 'CEM').toUpperCase();
    const ehCeo = centroNormalizado === 'CEO' || centroNormalizado === 'CENTRO_ODONTOLOGICO';

    // 1. Filtra escalas ativas do banco de dados
    const whereEscala: any = { ativo: true, status: 'ATIVA' };
    if (scope.kind === 'PREFEITURA' && scope.prefeituraId) {
      whereEscala.OR = [
        { prefeituraId: scope.prefeituraId },
        { prefeituraId: null },
      ];
    }

    const ESPECIALIDADES_ODONTO = [
      'endodontia',
      'periodontia',
      'cirurgia bucomaxilofacial',
      'bucomaxilo',
      'odontopediatria',
      'pacientes com necessidades especiais (pne)',
      'pne',
      'prótese dentária',
      'protese dentaria',
      'estomatologia',
      'ortodontia preventiva',
      'odontologia',
      'saúde bucal',
      'saude bucal',
    ];

    const todasEscalas = await prisma.escalaEspecialista.findMany({
      where: whereEscala,
      orderBy: { medicoNome: 'asc' },
    });

    const escalasDb = todasEscalas.filter((e) => {
      const esp = e.especialidade.toLowerCase();
      const eOdonto = ESPECIALIDADES_ODONTO.some((o) => esp.includes(o));
      return ehCeo ? eOdonto : !eOdonto;
    });

    if (!escalasDb || escalasDb.length === 0) {
      return {
        sucesso: false,
        mensagem: `Nenhum profissional com escala cadastrada no banco de dados para o ${ehCeo ? 'CEO' : 'CEM'}. Cadastre as escalas na Matriz de Vagas & Escalas.`,
      };
    }

    // 2. Localiza a escala correspondente
    let escalaSelecionada = escalasDb.find((e) => {
      if (input.medicoId && e.medicoId === input.medicoId) return true;
      if (input.medicoNome && e.medicoNome.toLowerCase() === input.medicoNome.toLowerCase()) return true;
      return false;
    });

    if (!escalaSelecionada && input.especialidade) {
      escalaSelecionada = escalasDb.find(
        (e) => e.especialidade.toLowerCase() === input.especialidade!.toLowerCase(),
      );
    }

    if (!escalaSelecionada) {
      if (input.medicoNome || input.especialidade) {
        return {
          sucesso: false,
          mensagem: `Nenhuma escala ativa encontrada no banco de dados para ${input.medicoNome ? `o profissional "${input.medicoNome}"` : `a especialidade "${input.especialidade}"`}.`,
        };
      }
      escalaSelecionada = escalasDb[0];
    }

    if (!escalaSelecionada) {
      return {
        sucesso: false,
        mensagem: 'Nenhuma escala profissional selecionada.',
      };
    }

    // 3. Busca salas/consultórios cadastrados no banco
    const salasDb = await prisma.salaConsultorio.findMany({
      where: scope.kind === 'PREFEITURA' && scope.prefeituraId ? { prefeituraId: scope.prefeituraId } : {},
      orderBy: { codigo: 'asc' },
    });

    let consultorioNome = '';
    const salaCompativel = salasDb.find(
      (s) => s.especialidadePrincipal.toLowerCase() === escalaSelecionada.especialidade.toLowerCase(),
    );

    if (salaCompativel) {
      consultorioNome = `${salaCompativel.nome} (${salaCompativel.codigo})`;
    } else {
      consultorioNome = ehCeo
        ? `CADEIRA ODONTOLÓGICA 01 — ${escalaSelecionada.especialidade.toUpperCase()}`
        : `CONSULTÓRIO 01 — ${escalaSelecionada.especialidade.toUpperCase()}`;
    }

    // 4. Busca agendamentos existentes no banco para detectar slots ocupados
    const agendamentosDb = await prisma.encaminhamento.findMany({
      where: {
        status: 'APROVADO',
        agendamentoPrevisto: { not: null },
        statusAtendimentoCentro: { notIn: ['FALTOU'] },
        ...(ehCeo
          ? {
              OR: [
                { canalRoteamento: 'CENTRO_ODONTOLOGICO' as any },
                { destinoRegulacao: 'CENTRO_ODONTOLOGICO' as any },
                { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
              ],
            }
          : {
              OR: [
                { canalRoteamento: 'CENTRO_ESPECIALIDADES' as any },
                { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
              ],
            }),
        AND: [
          {
            OR: [
              { profissionalAgendado: escalaSelecionada.medicoNome },
              { especialidadeSolicitada: escalaSelecionada.especialidade },
            ],
          },
        ],
      },
      select: { agendamentoPrevisto: true },
    });

    const slotsOcupados = new Set<string>();
    for (const ag of agendamentosDb) {
      if (ag.agendamentoPrevisto) {
        const iso = ag.agendamentoPrevisto.toISOString();
        const dt = iso.substring(0, 10);
        const hr = iso.substring(11, 16);
        slotsOcupados.add(`${dt}_${hr}`);
      }
    }

    // 5. Calcula a data inicial com base na Prioridade SUS
    const baseDate = input.dataBase ? new Date(input.dataBase) : new Date();
    const diasAtendimento = parseDiasSemana(escalaSelecionada.diasSemana);
    const slotsPadrao = gerarSlotsTurno(
      escalaSelecionada.horarioInicio,
      escalaSelecionada.horarioFim,
      escalaSelecionada.duracaoMinutos || 20,
    );

    let offsetDias = 15;
    let prazoTexto = 'Demanda Eletiva Regular (15 a 30 dias)';
    let justificativaTexto = `Portaria SUS: Atendimento ambulatorial programado. Escala regular de ${escalaSelecionada.medicoNome}.`;

    if (prioridade === 'EMERGENCIA') {
      offsetDias = 0;
      prazoTexto = 'Atendimento Imediato (Mesmo Dia / 24h)';
      justificativaTexto = `Portaria SUS: Demanda de emergência com risco iminente de agravo. Alocado no primeiro horário imediato da escala de ${escalaSelecionada.medicoNome}.`;
    } else if (prioridade === 'URGENTE') {
      offsetDias = 1;
      prazoTexto = 'Demanda Urgente (Até 72 horas)';
      justificativaTexto = `Portaria SUS: Condição clínica aguda com risco de evolução desfavorável. Priorizado nos primeiros dias da escala de ${escalaSelecionada.medicoNome}.`;
    } else if (prioridade === 'PRIORITARIA') {
      offsetDias = 7;
      prazoTexto = 'Prioridade Legal SUS (7 a 10 dias)';
      justificativaTexto = `Portaria SUS: Lei nº 10.048/2000 (Idosos 60+, PCD, Gestantes, TEA). Encaixe prioritário na escala de ${escalaSelecionada.medicoNome}.`;
    }

    let dataCalculada = new Date(baseDate);
    dataCalculada.setDate(dataCalculada.getDate() + offsetDias);

    let dataIsoFinal = '';
    let horaFinal = '';

    // Procura o próximo dia útil da escala com slot livre
    let tentativas = 0;
    while (tentativas < 60) {
      const diaSemana = dataCalculada.getDay(); // 0 a 6
      if (diasAtendimento.includes(diaSemana)) {
        const iso = formatarDataIso(dataCalculada);
        // Procura slot vago no turno
        for (const slot of slotsPadrao) {
          const chave = `${iso}_${slot}`;
          if (!slotsOcupados.has(chave)) {
            dataIsoFinal = iso;
            horaFinal = slot;
            break;
          }
        }

        // Se for emergência e todos os slots estiverem ocupados, faz encaixe no primeiro slot do dia
        if (!horaFinal && prioridade === 'EMERGENCIA') {
          dataIsoFinal = iso;
          horaFinal = slotsPadrao[0] || escalaSelecionada.horarioInicio;
          justificativaTexto += ' [Encaixe de Emergência Autorizado]';
          break;
        }

        if (dataIsoFinal && horaFinal) {
          break;
        }
      }

      dataCalculada.setDate(dataCalculada.getDate() + 1);
      tentativas++;
    }

    if (!dataIsoFinal || !horaFinal) {
      dataIsoFinal = formatarDataIso(dataCalculada);
      horaFinal = escalaSelecionada.horarioInicio || '08:00';
    }

    const justificativaCompleta = `${justificativaTexto} Profissional: ${escalaSelecionada.medicoNome} (${escalaSelecionada.crm}), escala em ${escalaSelecionada.diasSemana.join(', ')} das ${escalaSelecionada.horarioInicio} às ${escalaSelecionada.horarioFim}. Vaga alocada no ${consultorioNome}.`;

    return {
      sucesso: true,
      alocacao: {
        data: dataIsoFinal,
        dataFormatada: formatarDataBr(dataIsoFinal),
        hora: horaFinal,
        medicoId: escalaSelecionada.medicoId ?? undefined,
        medicoNome: escalaSelecionada.medicoNome,
        crm: escalaSelecionada.crm,
        especialidade: escalaSelecionada.especialidade,
        consultorio: consultorioNome,
        prazoLegalSus: prazoTexto,
        justificativaEscala: justificativaCompleta,
        duracaoMinutos: escalaSelecionada.duracaoMinutos || 20,
        tipoServico: escalaSelecionada.tipoServico || 'CONSULTA',
      },
    };
  }
}
