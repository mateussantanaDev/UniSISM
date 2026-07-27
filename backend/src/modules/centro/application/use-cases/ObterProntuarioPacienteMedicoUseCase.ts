import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface ProntuarioCompletoDTO {
  paciente: {
    id: string;
    nome: string;
    nomeSocial?: string | null;
    cpf: string;
    cartaoSus?: string | null;
    dataNascimento: string;
    sexo: string;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    grupoSanguineo: string;
    historicoFamiliar: string[];
    agenteComunitario?: string | null;
    microarea?: string | null;
    equipeSaudeFamilia?: string | null;
  };
  alergias: Array<{
    id: string;
    substancia: string;
    tipo: string;
    gravidade: string;
    observacao?: string | null;
  }>;
  condicoesCronicas: Array<{
    id: string;
    cid10: string;
    descricao: string;
    desde: string;
    ativo: boolean;
    observacao?: string | null;
  }>;
  medicamentosEmUso: Array<{
    id: string;
    nome: string;
    dosagem: string;
    frequencia: string;
    desde: string;
    prescritor: string;
    ativo: boolean;
  }>;
  atendimentosAnteriores: Array<{
    id: string;
    data: string;
    tipo: string;
    profissional: string;
    registroProfissional: string;
    especialidade: string;
    unidade: string;
    queixaPrincipal: string;
    diagnostico: string;
    cid10: string;
    conduta: string;
    prescricaoResumo?: string | null;
  }>;
  examesRealizados: Array<{
    id: string;
    data: string;
    tipo: string;
    categoria: string;
    solicitante: string;
    unidadeExecutora: string;
    resultado: string;
    observacao?: string | null;
  }>;
  vacinasAplicadas: Array<{
    id: string;
    data: string;
    vacina: string;
    dose: string;
    lote: string;
    aplicador: string;
    unidade: string;
    via: string;
  }>;
}

export class ObterProntuarioPacienteMedicoUseCase {
  async exec(pacienteId: string, scope: AccessScope): Promise<ProntuarioCompletoDTO> {
    const pac = await prisma.paciente.findUnique({
      where: { id: pacienteId },
      include: {
        alergias: true,
        condicoesCronicas: true,
        medicamentosEmUso: true,
        atendimentos: { orderBy: { data: 'desc' } },
        exames: { orderBy: { data: 'desc' } },
        vacinacoes: { orderBy: { data: 'desc' } },
      },
    });

    if (!pac) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado no Prontuário Eletrônico');
    }

    return {
      paciente: {
        id: pac.id,
        nome: pac.nome,
        nomeSocial: pac.nomeSocial,
        cpf: pac.cpf,
        cartaoSus: pac.cartaoSus,
        dataNascimento: pac.dataNascimento.toISOString().substring(0, 10),
        sexo: pac.sexo,
        telefone: pac.telefone,
        email: pac.email,
        endereco: pac.endereco,
        bairro: pac.bairro,
        municipio: pac.municipio,
        uf: pac.uf,
        grupoSanguineo: pac.grupoSanguineo,
        historicoFamiliar: pac.historicoFamiliar,
        agenteComunitario: pac.agenteComunitario,
        microarea: pac.microarea,
        equipeSaudeFamilia: pac.equipeSaudeFamilia,
      },
      alergias: pac.alergias.map((a) => ({
        id: a.id,
        substancia: a.substancia,
        tipo: a.tipo,
        gravidade: a.gravidade,
        observacao: a.observacao,
      })),
      condicoesCronicas: pac.condicoesCronicas.map((c) => ({
        id: c.id,
        cid10: c.cid10,
        descricao: c.descricao,
        desde: c.desde.toISOString().substring(0, 10),
        ativo: c.ativo,
        observacao: c.observacao,
      })),
      medicamentosEmUso: pac.medicamentosEmUso.map((m) => ({
        id: m.id,
        nome: m.nome,
        dosagem: m.dosagem,
        frequencia: m.frequencia,
        desde: m.desde.toISOString().substring(0, 10),
        prescritor: m.prescritor,
        ativo: m.ativo,
      })),
      atendimentosAnteriores: pac.atendimentos.map((at) => ({
        id: at.id,
        data: at.data.toISOString(),
        tipo: at.tipo,
        profissional: at.profissional,
        registroProfissional: at.registroProfissional,
        especialidade: at.especialidade,
        unidade: at.unidade,
        queixaPrincipal: at.queixaPrincipal,
        diagnostico: at.diagnostico,
        cid10: at.cid10,
        conduta: at.conduta,
        prescricaoResumo: at.prescricaoResumo,
      })),
      examesRealizados: pac.exames.map((ex) => ({
        id: ex.id,
        data: ex.data.toISOString(),
        tipo: ex.tipo,
        categoria: ex.categoria,
        solicitante: ex.solicitante,
        unidadeExecutora: ex.unidadeExecutora,
        resultado: ex.resultado,
        observacao: ex.observacao,
      })),
      vacinasAplicadas: pac.vacinacoes.map((v) => ({
        id: v.id,
        data: v.data.toISOString(),
        vacina: v.vacina,
        dose: v.dose,
        lote: v.lote,
        aplicador: v.aplicador,
        unidade: v.unidade,
        via: v.via,
      })),
    };
  }
}
