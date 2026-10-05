import { DocumentoClinicoCentroUseCase } from '../../application/use-cases/DocumentoClinicoCentroUseCase';
import { RegistrarPresencaPacienteUseCase } from '../../application/use-cases/RegistrarPresencaPacienteUseCase';
import { sinaisVitaisCentroSchema } from '../../shared/dadosClinicosCentro';
import { hojeRecife } from '../../shared/dataCentro';
import { prisma } from '../../../../infrastructure/database/prisma';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import { ListarRegistrosCentroUseCase } from '../../application/use-cases/ListarRegistrosCentroUseCase';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { ListarAgendaMedicoCentroUseCase } from '../../application/use-cases/ListarAgendaMedicoCentroUseCase';
import type { ChamarPacienteMedicoUseCase } from '../../application/use-cases/ChamarPacienteMedicoUseCase';
import type { ObterProntuarioPacienteMedicoUseCase } from '../../application/use-cases/ObterProntuarioPacienteMedicoUseCase';
import type { RegistrarConsultaSOAPMedicoUseCase } from '../../application/use-cases/RegistrarConsultaSOAPMedicoUseCase';
import type { SolicitarEncaminhamentoMedicoUseCase } from '../../application/use-cases/SolicitarEncaminhamentoMedicoUseCase';
import type { EncaminhamentoIntermunicipalMedicoUseCase } from '../../application/use-cases/EncaminhamentoIntermunicipalMedicoUseCase';
import type { AgendarRetornoMedicoUseCase } from '../../application/use-cases/AgendarRetornoMedicoUseCase';
import { BadRequest, NotFound } from '../../../../shared/errors';

const soapSchema = z.object({
  sinaisVitais: sinaisVitaisCentroSchema.optional(),
  queixaPrincipal: z.string().optional(),
  exameFisico: z.string().optional(),
  subjetivo: z.string().optional(),
  objetivo: z.string().optional(),
  avaliacao: z.string().optional(),
  plano: z.string().optional(),
  cid10: z.string().trim().min(1),
  diagnostico: z.string().trim().min(1),
  conduta: z.string().trim().min(1),
  prescricao: z.string().optional(),
  prescricaoResumo: z.string().optional(),
  pressaoArterial: z.string().optional(),
  frequenciaCardiaca: z.string().optional(),
  peso: z.string().optional(),
  unidade: z.string().optional(),
});

const intermunicipalSchema = z.object({
  encaminhamentoId: z.string().optional(),
  pacienteId: z.string().optional(),
  municipioDestino: z.string().optional(),
  especialidade: z.string().optional(),
  cid10: z.string().optional(),
  diagnostico: z.string().optional(),
  justificativa: z.string().optional(),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  transporteRequerido: z.string().optional(),
  requerAcompanhante: z.boolean().optional(),
  solicitacao: z.object({
    especialidadeSolicitada: z.string().optional(),
    cid10: z.string().optional(),
    cidDescricao: z.string().optional(),
    justificativaClinica: z.string().optional(),
    prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  }).optional(),
});

const solicitarEncaminhamentoSchema = z.object({
  encaminhamentoId: z.string().optional(),
  pacienteId: z.string().optional(),
  especialidadeSolicitada: z.string().min(2),
  cid10: z.string().trim().min(1),
  cidDescricao: z.string().optional(),
  justificativaClinica: z.string().min(3),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  observacao: z.string().optional(),
});

const retornoSchema = z.object({
  consultaId: z.string().trim().min(1),
  pacienteId: z.string().optional(),
  medicoNome: z.string().min(2),
  dataRetorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horaRetorno: z.string().min(2),
  observacoes: z.string().optional(),
});

export class CentroMedicoController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly agendaUC: ListarAgendaMedicoCentroUseCase,
    private readonly chamarUC: ChamarPacienteMedicoUseCase,
    private readonly prontuarioUC: ObterProntuarioPacienteMedicoUseCase,
    private readonly registrarSoapUC: RegistrarConsultaSOAPMedicoUseCase,
    private readonly intermunicipalUC: EncaminhamentoIntermunicipalMedicoUseCase,
    private readonly solicitarEncaminhamentoUC: SolicitarEncaminhamentoMedicoUseCase,
    private readonly agendarRetornoUC: AgendarRetornoMedicoUseCase,
  ) {}

  private async verificarProfissional(req: Request, id: string) {
    if (!['MEDICO', 'MEDICO_ESPECIALISTA'].includes(req.auth!.role)) return;
    const registro = await prisma.encaminhamento.findFirst({ where: { id, profissionalAgendadoId: req.auth!.sub, ...whereByScopeViaUbs(scopeFromRequest(req)) }, select: { id: true } });
    if (!registro) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado na agenda deste profissional');
  }

  getRegistros = async (req: Request, res: Response): Promise<void> => {
    const query = z.object({
      centro: z.enum(['CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO']).default('CENTRO_ESPECIALIDADES'),
      status: z.enum(['RASCUNHO','AGUARDANDO_REGULACAO','PENDENCIA_DOCUMENTO','APROVADO','REJEITADO']).optional(),
      statusAtendimento: z.enum(['AGENDADO','AGUARDANDO_ATENDIMENTO','EM_ATENDIMENTO','CONCLUIDO','FALTOU']).optional(),
      profissionalId: z.string().optional(),
    }).parse(req.query);
    const medico = ['MEDICO', 'MEDICO_ESPECIALISTA'].includes(req.auth!.role);
    const registros = await new ListarRegistrosCentroUseCase().exec({ ...query,
      profissionalId: medico ? req.auth!.sub : query.profissionalId,
    }, scopeFromRequest(req));
    const documentos = await prisma.auditoriaLog.findMany({where:{acao:'CENTRO_DOCUMENTO_CLINICO_EMITIDO',recursoId:{in:registros.map(r=>r.id)}},select:{id:true,recursoId:true,payload:true,criadoEm:true}});
    res.json(registros.map(r=>({...r,documentosClinicos:documentos.filter(d=>d.recursoId===r.id).map(d=>({id:d.id,tipo:(d.payload as any)?.tipo,emitidoEm:d.criadoEm}))})));
  };

  getAgenda = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const data = (req.query.data as string | undefined) || hojeRecife();
    const especialidade = req.query.especialidade as string | undefined;
    const centro = req.query.centro as 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | undefined;
    const statusAtendimento = req.query.statusAtendimento as string | undefined;

    const agendaRaw = await this.agendaUC.exec(
      {
        doctorId: req.auth!.sub,
        doctorNome: doctor?.nome,
        doctorMatricula: doctor?.matricula,
        data,
        especialidade,
        statusAtendimento,
        centro,
      },
      scope,
    );

    const agendaFormatted = agendaRaw.map((enc) => ({
      id: enc.id,
      protocolo: enc.protocolo,
      agendamentoPrevisto: enc.agendamentoPrevisto,
      profissionalAgendadoId: enc.profissionalAgendadoId,
      presencaRegistradaEm: enc.presencaRegistradaEm,
      necessitaTriagem: enc.necessitaTriagem,
      triagemRealizada: enc.triagemRealizada,
      triagemEm: enc.triagemEm,
      triagemDados: enc.triagemDados,
      triagemPorNome: enc.triagemPorNome,
      triagemCoren: enc.triagemCoren,
      rascunhoSOAP: enc.rascunhoSOAP,
      atendimentoSOAP: enc.atendimentoSOAP,
      statusAtendimentoCentro: enc.statusAtendimentoCentro || 'AGUARDANDO',
      paciente: {
        id: enc.paciente.id,
        nome: enc.paciente?.nome || 'Paciente Sem Nome',
        cpf: enc.paciente?.cpf || '',
        cartaoSus: enc.paciente?.cartaoSus || '',
        dataNascimento: enc.paciente?.dataNascimento || '',
        sexo: enc.paciente?.sexo || 'OUTRO',
        telefone: enc.paciente?.telefone || '',
        endereco: enc.paciente?.endereco || '',
      },
      solicitacao: {
        medicoSolicitante: enc.solicitacao?.medicoSolicitante || '',
        crm: enc.solicitacao?.crm || '',
        especialidadeSolicitada: enc.solicitacao?.especialidadeSolicitada || '',
        cid10: enc.solicitacao?.cid10 || '',
        cidDescricao: enc.solicitacao?.cidDescricao || '',
        justificativaClinica: enc.solicitacao?.justificativaClinica || '',
        prioridade: enc.solicitacao?.prioridade || 'ELETIVA',
        dataSolicitacao: enc.solicitacao?.dataSolicitacao || '',
      },
      unidadeOrigem: enc.unidadeOrigem || 'UBS Central',
      observacoesRegulacao: enc.observacoesRegulacao || null,
    }));

    res.json({
      data,
      agenda: agendaFormatted,
      total: agendaFormatted.length,
    });
  };

  postChamar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    await this.verificarProfissional(req, id);
    const scope = scopeFromRequest(req);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const result = await this.chamarUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
        },
      },
      scope,
    );

    res.json({
      sucesso: true,
      status: result.statusAtendimentoCentro || 'EM_ATENDIMENTO',
      encaminhamento: result,
    });
  };

  getProntuario = async (req: Request, res: Response): Promise<void> => {
    const pacienteId = paramString(req, 'pacienteId');
    const scope = scopeFromRequest(req);

    const prontuario = await this.prontuarioUC.exec(pacienteId, scope);

    res.json({
      pacienteId: prontuario.paciente.id,
      paciente: prontuario.paciente,
      alergias: prontuario.alergias,
      alergiasResumo: prontuario.alergias.map((a) => a.substancia),
      alergiasDetalhadas: prontuario.alergias,
      condicoesCronicas: prontuario.condicoesCronicas,
      condicoesCronicasResumo: prontuario.condicoesCronicas.map((c) => c.descricao || c.cid10),
      condicoesCronicasDetalhadas: prontuario.condicoesCronicas,
      medicamentosEmUso: prontuario.medicamentosEmUso,
      atendimentosAnteriores: prontuario.atendimentosAnteriores,
      historicoAtendimentos: prontuario.atendimentosAnteriores.map((at) => ({
        id: at.id,
        data: at.data.substring(0, 10),
        especialidade: at.especialidade,
        medicoNome: at.profissional,
        cid10: at.cid10,
        conduta: at.conduta,
      })),
      examesRealizados: prontuario.examesRealizados,
      vacinasAplicadas: prontuario.vacinasAplicadas,
    });
  };

  postDocumento = async (req:Request,res:Response):Promise<void> => {
    const id=paramString(req,'id'); await this.verificarProfissional(req,id);
    res.status(201).json(await new DocumentoClinicoCentroUseCase().emitir(id,req.body,req.auth!.sub,scopeFromRequest(req)));
  };
  getDocumento = async (req:Request,res:Response):Promise<void> => {
    const uc=new DocumentoClinicoCentroUseCase(); const documento=await uc.obter(paramString(req,'documentoId'),req.auth!.sub,scopeFromRequest(req));
    if(req.query.formato === 'json') {res.json(documento);return;}
    const pdf=await uc.pdf(documento); res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${documento.tipo}-${documento.id}.pdf"`);res.send(pdf);
  };

  postFalta = async (req: Request,res: Response): Promise<void> => {
    const id=paramString(req,'id'); await this.verificarProfissional(req,id);
    const doctor=await this.atendentes.buscarPorId(req.auth!.sub);
    const encaminhamento=await new RegistrarPresencaPacienteUseCase().exec({encaminhamentoId:id,status:'FALTOU',atendente:{id:req.auth!.sub,nome:doctor?.nome || 'Médico'}},scopeFromRequest(req));
    res.json({encaminhamento});
  };

  putRascunhoSOAP = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    await this.verificarProfissional(req, id);
    const draft = soapSchema.partial().extend({ cid10:z.string().optional(), diagnostico:z.string().optional(), conduta:z.string().optional(), procedimentos: z.array(z.object({ id:z.string(), nome:z.string(), codigoSigtap:z.string().optional(), quantidade:z.number().positive(), valorUnitario:z.number().nonnegative().optional(), observacao:z.string().optional() })).optional() }).parse(req.body);
    const registro = await prisma.encaminhamento.findFirst({ where: { id, ...whereByScopeViaUbs(scopeFromRequest(req)) } });
    if (!registro) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO','Atendimento não encontrado');
    if (registro.atendimentoId) throw BadRequest('ATENDIMENTO_ENCERRADO','O atendimento já foi concluído');
    const atualizado = await prisma.encaminhamento.updateMany({ where: { id, atendimentoId: null }, data: { rascunhoSOAP: JSON.parse(JSON.stringify(draft)), rascunhoSOAPEm: new Date() } });
    if (!atualizado.count) throw BadRequest('ATENDIMENTO_ENCERRADO','O atendimento já foi concluído');
    res.json({ salvo:true });
  };

  postRegistrarSOAP = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    await this.verificarProfissional(req, id);
    const scope = scopeFromRequest(req);
    const body = soapSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const queixa = body.queixaPrincipal || body.subjetivo || 'Atendimento em consultório médico especializado';
    const condutaStr = body.conduta || body.plano || 'Consulta concluída';

    const result = await this.registrarSoapUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
        soap: {
          exameFisico: body.exameFisico,
          sinaisVitais: body.sinaisVitais,
          subjetivo: body.subjetivo || body.queixaPrincipal,
          objetivo: body.objetivo || body.exameFisico,
          avaliacao: body.avaliacao || body.diagnostico,
          plano: body.plano || body.conduta,
          queixaPrincipal: queixa,
          diagnostico: body.diagnostico,
          cid10: body.cid10,
          conduta: condutaStr,
          prescricaoResumo: body.prescricao || body.prescricaoResumo,
          unidade: body.unidade,
        },
      },
      scope,
    );

    res.json({
      sucesso: true,
      id: result.id,
      statusAtendimentoCentro: result.statusAtendimentoCentro || 'CONCLUIDO',
      concluidoEm: result.atendimentoConcluidoEm || new Date().toISOString(),
      encaminhamento: result,
    });
  };

  postEncaminhamentoIntermunicipal = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = intermunicipalSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    let pacienteIdStr = body.pacienteId;
    if (body.encaminhamentoId) {
      await this.verificarProfissional(req, body.encaminhamentoId);
      const origem = await prisma.encaminhamento.findFirst({ where: { id: body.encaminhamentoId, ...whereByScopeViaUbs(scope) }, select: { pacienteId: true } });
      if (!origem?.pacienteId) throw NotFound('PACIENTE_NAO_VINCULADO', 'Atendimento sem paciente vinculado');
      if (pacienteIdStr && pacienteIdStr !== origem.pacienteId) throw BadRequest('PACIENTE_DIVERGENTE', 'Paciente não corresponde ao atendimento');
      pacienteIdStr = origem.pacienteId;
    }
    if (!pacienteIdStr) throw BadRequest('PACIENTE_OBRIGATORIO', 'Informe o paciente ou encaminhamento de origem');
    const espSolicitada = body.especialidade || body.solicitacao?.especialidadeSolicitada || 'Oncologia';
    const cidStr = body.cid10 || body.solicitacao?.cid10 || 'Z00.0';
    const cidDesc = body.diagnostico || body.solicitacao?.cidDescricao || 'Encaminhamento TFD';
    const just = body.justificativa || body.solicitacao?.justificativaClinica || 'Necessidade de referência estadual';
    const prio = body.prioridade || body.solicitacao?.prioridade || 'URGENTE';

    const result = await this.intermunicipalUC.exec(
      {
        pacienteId: pacienteIdStr,
        solicitacao: {
          especialidadeSolicitada: espSolicitada,
          cid10: cidStr,
          cidDescricao: cidDesc,
          justificativaClinica: just,
          prioridade: prio,
        },
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
      },
      scope,
    );

    const nowIso = new Date().toISOString();
    const proto = result.protocolo || `TFD${hojeRecife().replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    res.status(201).json({
      protocolo: proto,
      criadoEm: nowIso,
      municipioDestino: body.municipioDestino || 'Porto Alegre',
      status: 'AGUARDANDO_VAGA_ESTADUAL',
      encaminhamento: result,
    });
  };

  postSolicitarEncaminhamento = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = solicitarEncaminhamentoSchema.parse(req.body);
    const idFromParam = req.params.id as string | undefined;
    const targetId = idFromParam || body.encaminhamentoId || body.pacienteId;

    if (!targetId) {
      throw BadRequest('ID_AUSENTE', 'ID do encaminhamento ou paciente não fornecido.');
    }

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const result = await this.solicitarEncaminhamentoUC.exec(
      {
        encaminhamentoIdOrPacienteId: targetId,
        solicitacao: {
          especialidadeSolicitada: body.especialidadeSolicitada,
          cid10: body.cid10,
          cidDescricao: body.cidDescricao,
          justificativaClinica: body.justificativaClinica,
          prioridade: body.prioridade,
          observacao: body.observacao,
        },
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
      },
      scope,
    );

    res.status(201).json({
      sucesso: true,
      protocolo: result.protocolo,
      status: result.status,
      mensagem: 'Encaminhamento gerado com sucesso e enviado à Regulação da Secretaria de Saúde.',
      encaminhamento: result,
    });
  };

  postAgendarRetorno = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = retornoSchema.parse(req.body);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const result = await this.agendarRetornoUC.exec(
      {
        consultaId: body.consultaId,
        pacienteId: body.pacienteId,
        medicoNome: body.medicoNome,
        dataRetorno: body.dataRetorno,
        horaRetorno: body.horaRetorno,
        observacoes: body.observacoes,
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
      },
      scope,
    );

    res.status(201).json(result);
  };
}
