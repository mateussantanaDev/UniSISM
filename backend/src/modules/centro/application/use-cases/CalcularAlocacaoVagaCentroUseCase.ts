import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';

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

export interface SlotHorarioItem {
  hora: string;
  disponivel: boolean;
  motivo?: string;
}

export interface DiaDisponibilidadeSlot {
  data: string; // YYYY-MM-DD
  dataFormatada: string; // DD/MM/AAAA
  diaSemana: string; // "Segunda-feira"
  diasAteData: number;
  totalSlots: number;
  slotsLivres: number;
  slotsOcupados: number;
  slots: SlotHorarioItem[];
}

export interface CalcularAlocacaoVagaOutput {
  sucesso: boolean;
  mensagem?: string;
  alocacao?: SlotAlocadoResult;
  gradeDisponibilidade?: DiaDisponibilidadeSlot[];
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

function escalaAtendeNaData(escala: any, data: Date): boolean {
  const iso = formatarDataIso(data);
  const diaSemana = data.getDay(); // 0 a 6

  // 1. Datas Específicas / Pontuais
  if (escala.datasEspecificas && Array.isArray(escala.datasEspecificas) && escala.datasEspecificas.length > 0) {
    if (escala.datasEspecificas.includes(iso)) return true;
    if (escala.tipoRecorrencia === 'DATAS_ESPECIFICAS') return false;
  }

  // 2. Mini Mutirão (inclui sábados e domingos ou datas pontuais)
  if (escala.isMutirao || escala.tipoRecorrencia === 'MUTIRAO') {
    if (escala.datasEspecificas && Array.isArray(escala.datasEspecificas) && escala.datasEspecificas.length > 0) {
      return escala.datasEspecificas.includes(iso);
    }
    const diasAtend = parseDiasSemana(escala.diasSemana || []);
    return diasAtend.includes(diaSemana);
  }

  // 3. Recorrência Quinzenal (a cada 15 dias)
  if (escala.tipoRecorrencia === 'QUINZENAL') {
    const diasAtend = parseDiasSemana(escala.diasSemana || []);
    if (!diasAtend.includes(diaSemana)) return false;

    if (escala.dataInicioRecorrencia) {
      const base = new Date(escala.dataInicioRecorrencia + 'T00:00:00Z');
      const cur = new Date(iso + 'T00:00:00Z');
      const diffMs = cur.getTime() - base.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      return diffWeeks >= 0 && diffWeeks % 2 === 0;
    } else {
      const primeiroJan = new Date(data.getFullYear(), 0, 1);
      const diasDoAno = Math.floor((data.getTime() - primeiroJan.getTime()) / (24 * 60 * 60 * 1000));
      const semanaDoAno = Math.ceil((diasDoAno + primeiroJan.getDay() + 1) / 7);
      return semanaDoAno % 2 === 0;
    }
  }

  // 4. Recorrência Semanal Padrão
  const diasAtend = parseDiasSemana(escala.diasSemana || []);
  return diasAtend.includes(diaSemana);
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
    if ((scope.kind === 'PREFEITURA' || scope.kind === 'UBS') && scope.prefeituraId) {
      whereEscala.OR = [
        { prefeituraId: scope.prefeituraId },
        { prefeituraId: null },
      ];
    }

    const todasEscalas = await prisma.escalaEspecialista.findMany({
      where: whereEscala,
      orderBy: { medicoNome: 'asc' },
    });

    const escalasDb = filterEspecialidadesByCentro(todasEscalas, ehCeo ? 'CEO' : 'CEM');

    if (!escalasDb || escalasDb.length === 0) {
      return {
        sucesso: false,
        mensagem: `Nenhum profissional com escala cadastrada no banco de dados para o ${ehCeo ? 'CEO' : 'CEM'}. Cadastre as escalas na Matriz de Vagas & Escalas.`,
      };
    }

    // 2. Localiza a escala correspondente
    let escalaSelecionada = escalasDb.find((e) => {
      if (input.medicoId && e.medicoId === input.medicoId) return true;
      if (input.medicoNome) {
        const m1 = e.medicoNome.toLowerCase();
        const m2 = input.medicoNome.toLowerCase();
        if (m1 === m2 || m1.includes(m2) || m2.includes(m1)) return true;
      }
      return false;
    });

    if (!escalaSelecionada && input.especialidade) {
      const espInput = input.especialidade.toLowerCase();
      escalaSelecionada = escalasDb.find((e) => {
        const eEsp = e.especialidade.toLowerCase();
        return eEsp === espInput || eEsp.includes(espInput) || espInput.includes(eEsp);
      });
    }

    if (!escalaSelecionada) {
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
    const condicoesProfissional: any[] = [
      { profissionalAgendado: { contains: escalaSelecionada.medicoNome, mode: 'insensitive' } },
      { especialidadeSolicitada: { contains: escalaSelecionada.especialidade, mode: 'insensitive' } },
    ];
    const primeiroNome = escalaSelecionada.medicoNome.split(' ')[0];
    if (primeiroNome && primeiroNome.length > 2) {
      condicoesProfissional.push({ profissionalAgendado: { contains: primeiroNome, mode: 'insensitive' } });
    }
    if (escalaSelecionada.crm) {
      condicoesProfissional.push({ crm: { contains: escalaSelecionada.crm, mode: 'insensitive' } });
      condicoesProfissional.push({ profissionalAgendado: { contains: escalaSelecionada.crm, mode: 'insensitive' } });
    }

    const agendamentosDb = await prisma.encaminhamento.findMany({
      where: {
        status: 'APROVADO',
        agendamentoPrevisto: { not: null },
        statusAtendimentoCentro: { notIn: ['FALTOU'] },
        OR: condicoesProfissional,
      },
      select: { agendamentoPrevisto: true, observacoesRegulacao: true, profissionalAgendado: true },
    });

    const slotsOcupados = new Set<string>();
    for (const ag of agendamentosDb) {
      if (ag.agendamentoPrevisto) {
        const d = ag.agendamentoPrevisto;
        const iso = d.toISOString();
        const dtUtc = iso.substring(0, 10);
        const hrUtc = iso.substring(11, 16);
        slotsOcupados.add(`${dtUtc}_${hrUtc}`);

        try {
          const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const parts = formatter.formatToParts(d);
          const y = parts.find((p) => p.type === 'year')?.value;
          const m = parts.find((p) => p.type === 'month')?.value;
          const dia = parts.find((p) => p.type === 'day')?.value;
          const h = parts.find((p) => p.type === 'hour')?.value;
          const min = parts.find((p) => p.type === 'minute')?.value;
          if (y && m && dia && h && min) {
            slotsOcupados.add(`${y}-${m}-${dia}_${h}:${min}`);
          }
        } catch {}

        if (ag.observacoesRegulacao) {
          const match = ag.observacoesRegulacao.match(/(\d{2}:\d{2})/);
          if (match) {
            slotsOcupados.add(`${dtUtc}_${match[1]}`);
          }
        }
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
      if (escalaAtendeNaData(escalaSelecionada, dataCalculada)) {
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

    const NOMES_DIAS = [
      'Domingo',
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
    ];

    // 6. Gera a Grade Completa de Disponibilidade (Dias e Horários Livres da Escala do Especialista)
    const gradeDisponibilidade: DiaDisponibilidadeSlot[] = [];
    const hojeZero = new Date();
    hojeZero.setHours(0, 0, 0, 0);

    const cursorGrade = new Date(hojeZero);
    for (let d = 0; d < 45; d++) {
      const diaSemanaIndex = cursorGrade.getDay();
      if (escalaAtendeNaData(escalaSelecionada, cursorGrade)) {
        const iso = formatarDataIso(cursorGrade);
        const dataBr = formatarDataBr(iso);
        const diaSemanaNome = NOMES_DIAS[diaSemanaIndex] || 'Dia Útil';

        const slotsDoDia: SlotHorarioItem[] = slotsPadrao.map((slot) => {
          const chave = `${iso}_${slot}`;
          const ocupado = slotsOcupados.has(chave);
          return {
            hora: slot,
            disponivel: !ocupado,
            motivo: ocupado ? 'Horário já reservado por outro paciente' : undefined,
          };
        });

        const livres = slotsDoDia.filter((s) => s.disponivel).length;
        const ocupados = slotsDoDia.length - livres;

        gradeDisponibilidade.push({
          data: iso,
          dataFormatada: dataBr,
          diaSemana: diaSemanaNome,
          diasAteData: d,
          totalSlots: slotsDoDia.length,
          slotsLivres: livres,
          slotsOcupados: ocupados,
          slots: slotsDoDia,
        });
      }
      cursorGrade.setDate(cursorGrade.getDate() + 1);
    }

    const rotuloDias = escalaSelecionada.tipoRecorrencia === 'DATAS_ESPECIFICAS'
      ? `Datas Específicas (${(escalaSelecionada.datasEspecificas || []).length} datas)`
      : escalaSelecionada.tipoRecorrencia === 'QUINZENAL'
      ? `Quinzenal (${(escalaSelecionada.diasSemana || []).join(', ')})`
      : (escalaSelecionada.isMutirao || escalaSelecionada.tipoRecorrencia === 'MUTIRAO')
      ? `Mini Mutirão (${(escalaSelecionada.diasSemana || []).join(', ') || (escalaSelecionada.datasEspecificas || []).join(', ')})`
      : `escala em ${(escalaSelecionada.diasSemana || []).join(', ')}`;

    const justificativaCompleta = `${justificativaTexto} Profissional: ${escalaSelecionada.medicoNome} (${escalaSelecionada.crm}), ${rotuloDias} das ${escalaSelecionada.horarioInicio} às ${escalaSelecionada.horarioFim}. Vaga alocada no ${consultorioNome}.`;

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
      gradeDisponibilidade,
    };
  }
}
