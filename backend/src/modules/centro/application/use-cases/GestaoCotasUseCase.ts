import { prisma } from '../../../../infrastructure/database/prisma';
import { BadRequest, NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';
import { dataLocalCentro, dataHoraCentro } from '../../shared/escalaCentro';
export interface CotaUbsDTO { ubsId: string; ubsNome: string; competencia: string; totalCotasMes: number; alocadas: number; disponiveis: number; status: 'NORMAL' | 'CRITICO' | 'ESGOTADO'; especialidades: Record<string, number> }
function mesValido(valor?: string) {
  const mes = valor ?? dataLocalCentro().slice(0,7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw BadRequest('COMPETENCIA_INVALIDA','Informe a competência no formato AAAA-MM.');
  return mes;
}
export class GestaoCotasUseCase {
  async listarCotas(scope: AccessScope, centro?: string, competencia?: string): Promise<CotaUbsDTO[]> {
    const mes = mesValido(competencia), inicio = dataHoraCentro(`${mes}-01`);
    const proximo = new Date(`${mes}-01T12:00:00Z`); proximo.setUTCMonth(proximo.getUTCMonth()+1);
    const fim = dataHoraCentro(proximo.toISOString().slice(0,10));
    const ubs = await prisma.ubs.findMany({ where: { ativa: true, ...(scope.kind === 'UBS' ? { id: scope.ubsId } : scope.kind === 'PREFEITURA' ? { prefeituraId: scope.prefeituraId } : {}) }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } });
    const catalogo = await prisma.especialidadeCatalogo.findMany({ where: { ativa: true, ...(scope.kind === 'GLOBAL' ? {} : { prefeituraId: scope.prefeituraId ?? '__SEM_PREFEITURA__' }) }, select: { nome: true, documentosObrigatorios: true } });
    const nomes = filterEspecialidadesByCentro(catalogo, centro).map(e=>e.nome);
    const ids = ubs.map(u=>u.id), canal = centro === 'CEO' || centro === 'CENTRO_ODONTOLOGICO' ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES';
    const [registros, alocadas] = await Promise.all([
      prisma.cotaUbs.findMany({ where: { ubsId: { in: ids }, competencia: mes } }),
      prisma.encaminhamento.groupBy({ by: ['ubsId'], _count: { _all: true }, where: { ubsId: { in: ids }, status: 'APROVADO', deletadoEm: null, agendamentoPrevisto: { gte: inicio, lt: fim }, OR: [{ canalRoteamento: canal },{ destinoRegulacao: canal }] } })
    ]);
    return ubs.map(u=>{
      const registro = registros.find(r=>r.ubsId===u.id); const saved = (registro?.especialidades ?? {}) as Record<string,number>;
      const especialidades = Object.fromEntries(nomes.map(n=>[n,saved[n]??0]));
      const totalCotasMes = Object.values(especialidades).reduce((a,b)=>a+b,0), count=alocadas.find(a=>a.ubsId===u.id)?._count._all??0;
      const disponiveis=Math.max(0,totalCotasMes-count);
      return { ubsId:u.id,ubsNome:u.nome,competencia:mes,totalCotasMes,alocadas:count,disponiveis,status:disponiveis===0?'ESGOTADO':disponiveis<20?'CRITICO':'NORMAL',especialidades };
    });
  }
  async atualizarCota(ubsId:string, data:{totalCotasMes:number;especialidades:Record<string,number>;competencia?:string;centro?:string},scope:AccessScope,atendenteId:string):Promise<CotaUbsDTO> {
    const competencia=mesValido(data.competencia);
    if(Object.values(data.especialidades).some(n=>!Number.isInteger(n)||n<0)||data.totalCotasMes!==Object.values(data.especialidades).reduce((a,b)=>a+b,0)) throw BadRequest('COTAS_INVALIDAS','As cotas devem ser inteiras, não negativas e corresponder ao total.');
    const ubs=await prisma.ubs.findUnique({where:{id:ubsId},select:{id:true,nome:true,prefeituraId:true}});
    if(!ubs||(scope.kind==='PREFEITURA'&&ubs.prefeituraId!==scope.prefeituraId)||(scope.kind==='UBS'&&ubs.id!==scope.ubsId))throw NotFound('UBS_NAO_ENCONTRADA','UBS não encontrada');
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-cotas:${ubsId}:${competencia}`}))`;
      const anterior=await tx.cotaUbs.findUnique({where:{ubsId_competencia:{ubsId,competencia}}});
      const especialidades={...((anterior?.especialidades??{}) as Record<string,number>),...data.especialidades};
      const totalCotasMes=Object.values(especialidades).reduce((a,b)=>a+b,0);
      await tx.cotaUbs.upsert({where:{ubsId_competencia:{ubsId,competencia}},create:{ubsId,competencia,totalCotasMes,especialidades},update:{totalCotasMes,especialidades}});
      await tx.auditoriaLog.create({data:{acao:'CENTRO_GESTAO_ATUALIZAR_COTAS',recurso:'CENTRO_ESPECIALIDADES',recursoId:ubsId,atendenteId,payload:{...data,competencia}}});
    });
    return (await this.listarCotas(scope,data.centro,competencia)).find(r=>r.ubsId===ubsId)!;
  }
}
