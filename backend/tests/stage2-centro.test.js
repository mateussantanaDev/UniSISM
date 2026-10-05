const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://qa:qa_local_only@127.0.0.1:55432/unisism_qa_cem';
process.env.JWT_SECRET ||= 'test-jwt-secret-test-jwt-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh';
const { prisma } = require('../dist/infrastructure/database/prisma');
const { resolverProfissionalCentro } = require('../dist/modules/centro/shared/profissionalCentro');
const { rowParaEncaminhamento } = require('../dist/infrastructure/database/encaminhamentoMapper');
const { ListarAgendaMedicoCentroUseCase } = require('../dist/modules/centro/application/use-cases/ListarAgendaMedicoCentroUseCase');
const patch = (obj, key, fn) => { const original = obj[key]; obj[key] = fn; return () => { obj[key] = original; }; };

test('mapper distingue os três IDs e não inventa paciente ausente', () => {
  const row = { id: 'enc-1', pacienteId: 'pac-1', atendimentoId: 'at-1', profissionalAgendadoId: 'med-1',
    pacienteDataNascimento: new Date('1980-01-01'), dataSolicitacao: new Date(),
    atendimentoCentro: { id: 'at-1', cid10: 'Z00', diagnostico: 'diagnostico', conduta: 'conduta',
      queixaPrincipal: 'queixa', prescricaoResumo: null, data: new Date('2026-10-05T15:00:00Z') } };
  const result = rowParaEncaminhamento(row);
  assert.equal(result.id, 'enc-1');
  assert.equal(result.paciente.id, 'pac-1');
  assert.equal(result.atendimentoId, 'at-1');
  assert.equal(result.atendimentoSOAP.diagnostico, 'diagnostico');
  assert.equal(rowParaEncaminhamento({ ...row, pacienteId: null }).paciente.id, undefined);
});

test('homônimos exigem seleção por ID; ID de outra prefeitura é rejeitado', async () => {
  let candidates = [{ id: 'm1', nome: 'Ana' }, { id: 'm2', nome: 'Ana' }];
  const undo = [patch(prisma.ubs, 'findUnique', async () => ({ prefeituraId: 'pref' })),
    patch(prisma.atendente, 'findMany', async () => candidates)];
  try {
    await assert.rejects(resolverProfissionalCentro('ubs', 'Ana'), e => e.code === 'PROFISSIONAL_AMBIGUO');
    candidates = [];
    await assert.rejects(resolverProfissionalCentro('ubs', 'Ana', 'foreign'), e => e.code === 'PROFISSIONAL_INVALIDO');
  } finally { undo.reverse().forEach(fn => fn()); }
});

test('agenda mantém filtro por ID quando nome do médico muda', async () => {
  let query;
  const undo = patch(prisma.encaminhamento, 'findMany', async value => { query = value; return []; });
  try {
    await new ListarAgendaMedicoCentroUseCase().exec({ doctorId: 'm1', doctorNome: 'Nome novo', data: '2026-10-05' }, { kind: 'PREFEITURA', prefeituraId: 'pref' });
    assert(query.where.AND.some(item => item.profissionalAgendadoId === 'm1'));
    assert(!JSON.stringify(query.where).includes('Nome novo'));
    assert.equal(query.where.ubs.prefeituraId, 'pref');
  } finally { undo(); }
});
