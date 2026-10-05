import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { prisma } from '../../../../infrastructure/database/prisma';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';
const schema = z.object({ tipo:z.enum(['RECEITA','ATESTADO','PEDIDO_EXAMES','CONTRARREFERENCIA']), conteudo:z.string().trim().min(3).max(20000), dias:z.number().int().positive().max(365).optional() });
const titulos = {RECEITA:'Receita médica',ATESTADO:'Atestado médico',PEDIDO_EXAMES:'Pedido de exames',CONTRARREFERENCIA:'Contrarreferência'};
export class DocumentoClinicoCentroUseCase {
  async emitir(encaminhamentoId:string, raw:unknown, actorId:string, scope:AccessScope) {
    const input = schema.parse(raw);
    const enc = await prisma.encaminhamento.findFirst({where:{id:encaminhamentoId,deletadoEm:null,...whereByScopeViaUbs(scope)},include:{ubs:true}});
    const autor = await prisma.atendente.findUnique({where:{id:actorId}});
    if (!enc || !autor || (['MEDICO','MEDICO_ESPECIALISTA'].includes(autor.role) && enc.profissionalAgendadoId !== actorId)) throw NotFound('ATENDIMENTO_NAO_ENCONTRADO','Atendimento não encontrado');
    if (!enc.presencaRegistradaEm || !['EM_ATENDIMENTO','CONCLUIDO'].includes(enc.statusAtendimentoCentro || '')) throw Unprocessable('ATENDIMENTO_NAO_INICIADO','Inicie o atendimento antes de emitir documento');
    if (!['MEDICO','MEDICO_ESPECIALISTA'].includes(autor.role)) throw Unprocessable('EMISSOR_NAO_MEDICO','Documentos clínicos devem ser emitidos pelo médico responsável');
    const escala = await prisma.escalaEspecialista.findFirst({where:{medicoId:actorId,prefeituraId:enc.ubs.prefeituraId,especialidade:enc.especialidadeSolicitada}});
    if (!escala?.crm?.trim()) throw Unprocessable('REGISTRO_PROFISSIONAL_AUSENTE','Cadastre o registro profissional na escala antes de emitir o documento');
    const id = randomUUID();
    const documento = {id,encaminhamentoId,protocolo:enc.protocolo,pacienteId:enc.pacienteId,paciente:enc.pacienteNome,cpf:enc.pacienteCpf,tipo:input.tipo,titulo:titulos[input.tipo],conteudo:input.conteudo,dias:input.dias,profissional:autor.nome,registro:escala.crm,unidade:enc.localAgendamento || enc.ubs.nome,emitidoEm:new Date().toISOString()};
    const hash = createHash('sha256').update(JSON.stringify(documento)).digest('hex');
    await prisma.auditoriaLog.create({data:{id,acao:'CENTRO_DOCUMENTO_CLINICO_EMITIDO',recurso:'CENTRO_ESPECIALIDADES',recursoId:enc.id,atendenteId:actorId,payload:JSON.parse(JSON.stringify({...documento,hash}))}});
    return {id,tipo:input.tipo,hash};
  }
  async obter(id:string, actorId:string, scope:AccessScope) {
    const log = await prisma.auditoriaLog.findFirst({where:{id,acao:'CENTRO_DOCUMENTO_CLINICO_EMITIDO'}});
    if (!log?.recursoId) throw NotFound('DOCUMENTO_NAO_ENCONTRADO','Documento não encontrado');
    const autor = await prisma.atendente.findUnique({where:{id:actorId}});
    const enc = await prisma.encaminhamento.findFirst({where:{id:log.recursoId,...whereByScopeViaUbs(scope)}});
    if (!enc || !autor || (['MEDICO','MEDICO_ESPECIALISTA'].includes(autor.role) && enc.profissionalAgendadoId !== actorId)) throw NotFound('DOCUMENTO_NAO_ENCONTRADO','Documento não encontrado');
    return log.payload as Record<string,any>;
  }
  async pdf(documento:Record<string,any>):Promise<Buffer> {
    return new Promise((resolve,reject)=>{
      const doc = new PDFDocument({size:'A4',margin:48,info:{Title:documento.titulo,Author:documento.profissional}}), chunks:Buffer[]=[];
      doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
      doc.fontSize(18).text(documento.titulo,{align:'center'}).moveDown();
      doc.fontSize(10).text(`Unidade: ${documento.unidade}`).text(`Paciente: ${documento.paciente}`).text(`CPF: ${documento.cpf}`).text(`Atendimento: ${documento.protocolo}`).text(`Emissão: ${new Date(documento.emitidoEm).toLocaleString('pt-BR',{timeZone:'America/Recife'})}`).moveDown();
      if(documento.tipo==='ATESTADO' && documento.dias) doc.text(`Período de afastamento informado pelo médico: ${documento.dias} dia(s).`).moveDown();
      doc.fontSize(12).text(documento.conteudo,{lineGap:4}).moveDown(3);
      doc.fontSize(10).text('________________________________________________',{align:'center'}).text(`${documento.profissional} · ${documento.registro}`,{align:'center'}).text('Assinatura do profissional responsável',{align:'center'}).moveDown();
      doc.fontSize(8).text(`Registro: ${documento.id}`).text(`Integridade SHA-256: ${documento.hash}`).text('Documento registrado no prontuário. A assinatura deve ser realizada pelo profissional responsável.');
      doc.end();
    });
  }
}
