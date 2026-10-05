import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest } from '../../../../shared/errors';
import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';
import { dataLocalCentro, dataHoraCentro, dataValidaCentro, somarDiasCentro } from '../../shared/escalaCentro';
export interface RelatorioCentroInput { inicio?: string; fim?: string; periodo?: string; centro?: string; tipo?: string; formato?: string; }
export function periodoRelatorio(input: RelatorioCentroInput) {
  const periodo = input.periodo || dataLocalCentro().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw BadRequest('COMPETENCIA_INVALIDA', 'Informe a competência no formato AAAA-MM.');
  const inicio = input.inicio || `${periodo}-01`;
  const proximo = new Date(`${periodo}-01T12:00:00Z`); proximo.setUTCMonth(proximo.getUTCMonth() + 1);
  const fim = input.fim || somarDiasCentro(proximo.toISOString().slice(0, 10), -1);
  if (!dataValidaCentro(inicio) || !dataValidaCentro(fim) || inicio > fim || dataHoraCentro(fim).getTime() - dataHoraCentro(inicio).getTime() > 366 * 86400000) throw BadRequest('PERIODO_INVALIDO', 'Informe um período válido, em ordem e com até 367 dias.');
  return { inicio, fim, periodo, datas: { gte: dataHoraCentro(inicio), lt: dataHoraCentro(somarDiasCentro(fim, 1)) } };
}
export class RelatoriosCentroUseCase {
  async dados(input: RelatorioCentroInput, scope: AccessScope) {
    const periodo = periodoRelatorio(input);
    const escopo = scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { ubsId: scope.ubsId } : { ubs: { prefeituraId: scope.prefeituraId } };
    const bruto = await prisma.encaminhamento.findMany({ where: { deletadoEm: null, ...escopo, OR: [{ agendamentoPrevisto: periodo.datas }, { dataSolicitacao: periodo.datas }] }, include: { atendimentoCentro: { include: { procedimentosRealizados: true } }, ubs: { select: { nome: true } } }, orderBy: { agendamentoPrevisto: 'asc' } });
    const encs = filterEspecialidadesByCentro(bruto.filter(e => e.canalRoteamento === 'CENTRO_ESPECIALIDADES' || e.canalRoteamento === 'CENTRO_ODONTOLOGICO' || e.destinoRegulacao === 'CENTRO_ESPECIALIDADES' || e.destinoRegulacao === 'CENTRO_ODONTOLOGICO').map(e => ({ ...e, especialidade: e.especialidadeSolicitada })), input.centro || 'CEM');
    const legacy = filterEspecialidadesByCentro(await prisma.agendamentoCentro.findMany({ where: { dataAgendamento: periodo.datas, status: { not: 'CANCELADO' }, ...(scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { paciente: { ubsId: scope.ubsId } } : { prefeituraId: scope.prefeituraId }) }, include: { paciente: { include: { ubs: { select: { nome: true } } } }, procedimentos: true } }), input.centro || 'CEM');
    const agendados = encs.filter(e => e.status === 'APROVADO' && e.agendamentoPrevisto && e.agendamentoPrevisto >= periodo.datas.gte && e.agendamentoPrevisto < periodo.datas.lt);
    const atendimentos = [
      ...agendados.filter(e => e.statusAtendimentoCentro === 'CONCLUIDO').map(e => ({ id: e.id, atendimentoId: e.atendimentoId, historicoSemProntuario: !e.atendimentoId, protocolo: e.protocolo, dataAtendimento: (e.atendimentoCentro?.data ?? e.agendamentoPrevisto!).toISOString(), pacienteNome: e.pacienteNome, pacienteCpf: e.pacienteCpf, pacienteCartaoSus: e.pacienteCartaoSus, medicoId: e.profissionalAgendadoId, medicoNome: (e.atendimentoCentro?.profissional ?? e.profissionalAgendado ?? 'Não registrado'), medicoCrm: (e.atendimentoCentro?.registroProfissional ?? ''), especialidade: e.especialidadeSolicitada, tipoOrigem: e.tipoServico, ubsNome: e.ubs.nome, cid10: (e.atendimentoCentro?.cid10 ?? ''), prioridade: e.prioridade, procedimentosAdicionados: (e.atendimentoCentro?.procedimentosRealizados ?? []).map(p => ({ ...p, codigoSigtap: p.codigoSigtap || '', valorUnitarioBrl: p.valorUnitario, adicionadoPor: 'GESTOR' as const })), origem: 'ENCAMINHAMENTO' as const, tempoMinutos: e.atendimentoIniciadoEm && e.atendimentoConcluidoEm ? Math.max(0, (e.atendimentoConcluidoEm.getTime() - e.atendimentoIniciadoEm.getTime()) / 60000) : null })),
      ...legacy.filter(e => e.status === 'CONCLUIDO').map(e => ({ id: e.id, atendimentoId: e.id, protocolo: e.protocolo, dataAtendimento: e.dataAgendamento.toISOString(), pacienteNome: e.paciente.nome, pacienteCpf: e.paciente.cpf, pacienteCartaoSus: e.paciente.cartaoSus || '', medicoId: e.medicoId, medicoNome: e.medicoNome || 'Não registrado', medicoCrm: '', especialidade: e.especialidade, tipoOrigem: e.tipoServico, ubsNome: e.paciente.ubs?.nome || 'Não informada', cid10: '', prioridade: 'ELETIVA', procedimentosAdicionados: e.procedimentos.map(p => ({ ...p, codigoSigtap: p.codigoSigtap || '', valorUnitarioBrl: p.valorUnitario, adicionadoPor: 'GESTOR' as const })), origem: 'BALCAO_CENTRO' as const, tempoMinutos: null })),
    ];
    const faltas = [...agendados.filter(e => e.statusAtendimentoCentro === 'FALTOU').map(e => ({ medicoId: e.profissionalAgendadoId, medicoNome: e.profissionalAgendado || 'Não registrado', especialidade: e.especialidadeSolicitada, ubsNome: e.ubs.nome })), ...legacy.filter(e => e.status === 'FALTOU').map(e => ({ medicoId: e.medicoId, medicoNome: e.medicoNome || 'Não registrado', especialidade: e.especialidade, ubsNome: e.paciente.ubs?.nome || 'Não informada' }))];
    // Only intermunicipal referrals explicitly originated by the centre enter this report.
    const tfd = filterEspecialidadesByCentro(bruto.filter(e => e.protocolo.startsWith('TFD-') && e.unidadeOrigem.toLowerCase().includes('centro') && e.dataSolicitacao >= periodo.datas.gte && e.dataSolicitacao < periodo.datas.lt).map(e => ({ ...e, especialidade: e.especialidadeSolicitada })), input.centro || 'CEM');
    const profissionais = new Map<string, { id: string; medicoNome: string; crm: string; especialidade: string; atendimentosMes: number; faltasPaciente: number; taxaAbsenteismo: number; encaminhamentosTFD: number; valorBpaEstimadoBRL: number; tempoMedioMinutos: number | null; duracoes: number[] }>();
    for (const e of [...atendimentos.map(e => ({ ...e, realizado: true as const })), ...faltas.map(e => ({ ...e, realizado: false as const }))]) {
      const id = `${e.medicoId || e.medicoNome}:${e.especialidade}`;
      const m = profissionais.get(id) || { id, medicoNome: e.medicoNome, crm: '', especialidade: e.especialidade, atendimentosMes: 0, faltasPaciente: 0, taxaAbsenteismo: 0, encaminhamentosTFD: 0, valorBpaEstimadoBRL: 0, tempoMedioMinutos: null, duracoes: [] };
      if (e.realizado) { m.atendimentosMes++; m.crm = e.medicoCrm; m.valorBpaEstimadoBRL += e.procedimentosAdicionados.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0); if (e.tempoMinutos !== null) m.duracoes.push(e.tempoMinutos); }
      else m.faltasPaciente++;
      profissionais.set(id, m);
    }
    for (const e of tfd) { const id = `${e.atendenteId}:${e.especialidadeSolicitada}`; const m = [...profissionais.values()].find(p => p.id.startsWith(e.atendenteId + ':')) || profissionais.get(id) || { id, medicoNome: e.medicoSolicitante, crm: e.crm, especialidade: e.especialidadeSolicitada, atendimentosMes: 0, faltasPaciente: 0, taxaAbsenteismo: 0, encaminhamentosTFD: 0, valorBpaEstimadoBRL: 0, tempoMedioMinutos: null, duracoes: [] }; m.encaminhamentosTFD++; profissionais.set(m.id, m); }
    return { ...periodo, atendimentos, faltas, agendados, legacy, tfd, demanda: encs.filter(e => !e.agendamentoPrevisto && ['AGUARDANDO_REGULACAO', 'APROVADO'].includes(e.status) && e.dataSolicitacao >= periodo.datas.gte && e.dataSolicitacao < periodo.datas.lt), profissionais: [...profissionais.values()].map(({ duracoes, ...p }) => ({ ...p, taxaAbsenteismo: p.atendimentosMes + p.faltasPaciente ? +(100 * p.faltasPaciente / (p.atendimentosMes + p.faltasPaciente)).toFixed(1) : 0, tempoMedioMinutos: duracoes.length ? +(duracoes.reduce((a, b) => a + b, 0) / duracoes.length).toFixed(1) : null })) };
  }
  async exportar(input: RelatorioCentroInput, scope: AccessScope) {
    const tipo = input.tipo || 'BPA_SUS', formato = input.formato || 'PDF';
    if (!['BPA_SUS', 'ABSENTEISMO_UBS', 'DEMANDA_REPRIMIDA', 'TFD_INTERMUNICIPAL'].includes(tipo) || !['PDF', 'XLSX', 'CSV'].includes(formato)) throw BadRequest('RELATORIO_INVALIDO', 'Selecione modalidade e formato válidos.');
    const dados = await this.dados(input, scope);
    let headers: string[], rows: (string | number)[][];
    if (tipo === 'BPA_SUS') { headers = ['Protocolo', 'Data', 'Paciente', 'CPF', 'CNS', 'Profissional', 'Registro', 'Especialidade', 'SIGTAP', 'Procedimento', 'Quantidade', 'Valor registrado (R$)']; rows = dados.atendimentos.flatMap(a => a.procedimentosAdicionados.map(p => [a.protocolo, dataLocalCentro(new Date(a.dataAtendimento)), a.pacienteNome, a.pacienteCpf, a.pacienteCartaoSus, a.medicoNome, a.medicoCrm, a.especialidade, p.codigoSigtap, p.nome, p.quantidade, p.quantidade * p.valorUnitario])); }
    else if (tipo === 'ABSENTEISMO_UBS') { headers = ['UBS', 'Concluídos', 'Faltas', 'Absenteísmo (%)']; const ubs = new Set([...dados.atendimentos.map(e => e.ubsNome), ...dados.faltas.map(e => e.ubsNome)]); rows = [...ubs].map(u => { const c = dados.atendimentos.filter(e => e.ubsNome === u).length, f = dados.faltas.filter(e => e.ubsNome === u).length; return [u, c, f, +(f / (f + c) * 100).toFixed(1)]; }); }
    else if (tipo === 'DEMANDA_REPRIMIDA') { headers = ['Protocolo', 'Solicitação', 'Paciente', 'UBS', 'Especialidade', 'Prioridade', 'Situação', 'Dias em espera']; rows = dados.demanda.map(e => [e.protocolo, dataLocalCentro(e.dataSolicitacao), e.pacienteNome, e.ubs.nome, e.especialidadeSolicitada, e.prioridade, e.status, Math.max(0, Math.floor((Date.now() - e.dataSolicitacao.getTime()) / 86400000))]); }
    else { headers = ['Protocolo', 'Solicitação', 'Paciente', 'Profissional solicitante', 'Especialidade', 'Destino', 'Situação']; rows = dados.tfd.map(e => [e.protocolo, dataLocalCentro(e.dataSolicitacao), e.pacienteNome, e.medicoSolicitante, e.especialidadeSolicitada, e.cidadeAgendamento || 'A definir', e.status]); }
    const titulo = `${tipo} | ${input.centro || 'CEM'} | ${dados.inicio} a ${dados.fim}`;
    const nome = `${tipo.toLowerCase()}_${dados.inicio}_${dados.fim}.${formato.toLowerCase()}`;
    if (formato === 'CSV') { const escape = (v: string | number) => `"${String(v).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`; return { nome, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from('\uFEFF' + [headers, ...rows].map(r => r.map(escape).join(';')).join('\r\n')) }; }
    if (formato === 'XLSX') { const wb = new ExcelJS.Workbook(); wb.creator = 'UniSISM'; const ws = wb.addWorksheet(tipo); ws.addRow([titulo]); ws.addRow(['Dados de apoio à conferência. Não substitui arquivo validado no importador SIA/SUS.']); ws.addRow(headers); rows.forEach(r => ws.addRow(r)); ws.getRow(3).font = { bold: true }; ws.columns.forEach(c => c.width = 24); ws.views = [{ state: 'frozen', ySplit: 3 }]; return { nome, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) }; }
    const buffer = await new Promise<Buffer>((resolve, reject) => { const doc = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = []; doc.on('data', b => chunks.push(b)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); doc.fontSize(14).text('UniSISM — Relatório do Centro'); doc.fontSize(10).text(titulo).moveDown().text('Dados de apoio à conferência. Não substitui arquivo validado no importador SIA/SUS.').moveDown(); if (!rows.length) doc.text('Nenhum registro no período.'); rows.forEach((r, i) => { if (doc.y > 650) doc.addPage(); doc.fontSize(10).text(`Registro ${i + 1}`, { underline: true }); r.forEach((v, j) => doc.text(`${headers[j]}: ${v}`)); doc.moveDown(); }); doc.end(); });
    return { nome, contentType: 'application/pdf', buffer };
  }
}
