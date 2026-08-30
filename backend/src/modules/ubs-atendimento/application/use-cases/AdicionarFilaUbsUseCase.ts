import type { AtendimentoUbsItem, PrioridadeUbs, TipoAtendimentoUbs } from '../../domain/entities/AtendimentoUbsFila';
import { filaUbsRepository, FilaUbsRepository } from '../../infrastructure/repositories/FilaUbsRepository';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest, NotFound } from '../../../../shared/errors';

export interface AdicionarFilaUbsInput {
  pacienteId?: string;
  paciente?: {
    nome: string;
    cpf: string;
    cartaoSus?: string;
    dataNascimento?: string;
    sexo?: 'M' | 'F' | 'OUTRO';
    telefone?: string;
    endereco?: string;
  };
  tipoAtendimento: TipoAtendimentoUbs;
  prioridade: PrioridadeUbs;
  medicoId?: string;
  medicoNome?: string;
  crm?: string;
  consultorio?: string;
  queixaBreve?: string;
  data?: string;
  ubsId?: string;
  operador: {
    id: string;
    nome: string;
    ubsId?: string | null;
    prefeituraId?: string | null;
  };
}

export class AdicionarFilaUbsUseCase {
  constructor(private readonly repo: FilaUbsRepository = filaUbsRepository) {}

  async exec(input: AdicionarFilaUbsInput, scope: AccessScope): Promise<AtendimentoUbsItem> {
    let ubsId = input.ubsId || input.operador.ubsId;
    let ubsNome = 'UBS Municipal';
    let prefeituraId = input.operador.prefeituraId || undefined;

    if (!ubsId) {
      if (scope.kind === 'UBS') {
        ubsId = scope.ubsId;
        prefeituraId = scope.prefeituraId;
      } else if (scope.kind === 'PREFEITURA') {
        prefeituraId = scope.prefeituraId;
        const ubs = await prisma.ubs.findFirst({
          where: { prefeituraId: scope.prefeituraId, ativa: true },
        });
        if (ubs) {
          ubsId = ubs.id;
          ubsNome = ubs.nome;
        }
      }
    }

    if (!ubsId) {
      const ubsDefault = await prisma.ubs.findFirst({ where: { ativa: true } });
      if (!ubsDefault) {
        throw NotFound('UBS_NAO_ENCONTRADA', 'Nenhuma UBS ativa encontrada no sistema');
      }
      ubsId = ubsDefault.id;
      ubsNome = ubsDefault.nome;
      prefeituraId = ubsDefault.prefeituraId;
    } else {
      const ubsDb = await prisma.ubs.findUnique({ where: { id: ubsId }, select: { nome: true, prefeituraId: true } });
      if (ubsDb) {
        ubsNome = ubsDb.nome;
        prefeituraId = ubsDb.prefeituraId;
      }
    }

    let pacienteId = input.pacienteId;
    let pacienteNome = '';
    let pacienteCpf = '';
    let pacienteCartaoSus = '';
    let pacienteDataNasc = '';
    let pacienteSexo = 'M';
    let pacienteTelefone = '';

    if (pacienteId) {
      const dbPac = await prisma.paciente.findUnique({ where: { id: pacienteId } });
      if (!dbPac) {
        throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente informado não foi encontrado');
      }
      pacienteNome = dbPac.nome;
      pacienteCpf = dbPac.cpf;
      pacienteCartaoSus = dbPac.cartaoSus || '';
      pacienteDataNasc = dbPac.dataNascimento.toISOString().slice(0, 10);
      pacienteSexo = dbPac.sexo;
      pacienteTelefone = dbPac.telefone || '';
    } else if (input.paciente) {
      const cleanCpf = input.paciente.cpf.replace(/\D/g, '');
      if (cleanCpf.length !== 11) {
        throw BadRequest('CPF_INVALIDO', 'CPF do paciente deve ter 11 dígitos');
      }

      let dbPac = await prisma.paciente.findUnique({ where: { cpf: cleanCpf } });
      if (!dbPac) {
        dbPac = await prisma.paciente.create({
          data: {
            nome: input.paciente.nome.trim(),
            cpf: cleanCpf,
            cartaoSus: input.paciente.cartaoSus || null,
            dataNascimento: input.paciente.dataNascimento ? new Date(input.paciente.dataNascimento) : new Date('1990-01-01'),
            sexo: (input.paciente.sexo as any) || 'M',
            telefone: input.paciente.telefone || '0000000000',
            endereco: input.paciente.endereco || 'Endereço não informado',
            ubsId: ubsId,
          },
        });
      }

      pacienteId = dbPac.id;
      pacienteNome = dbPac.nome;
      pacienteCpf = dbPac.cpf;
      pacienteCartaoSus = dbPac.cartaoSus || '';
      pacienteDataNasc = dbPac.dataNascimento.toISOString().slice(0, 10);
      pacienteSexo = dbPac.sexo;
      pacienteTelefone = dbPac.telefone || '';
    } else {
      throw BadRequest('DADOS_PACIENTE_OBRIGATORIOS', 'Informe pacienteId ou os dados do paciente');
    }

    return this.repo.adicionar({
      ubsId,
      ubsNome,
      prefeituraId,
      data: input.data,
      pacienteId,
      pacienteNome,
      pacienteCpf,
      pacienteCartaoSus,
      pacienteDataNasc,
      pacienteSexo,
      pacienteTelefone,
      tipoAtendimento: input.tipoAtendimento,
      prioridade: input.prioridade,
      medicoId: input.medicoId,
      medicoNome: input.medicoNome,
      crm: input.crm,
      consultorio: input.consultorio || 'Consultório 01',
      queixaBreve: input.queixaBreve,
      criadoPorId: input.operador.id,
      criadoPorNome: input.operador.nome,
    });
  }
}
