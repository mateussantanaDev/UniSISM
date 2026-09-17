import 'dotenv/config';
import assert from 'assert';
import { TriagemEnfermagemUseCase } from '../src/modules/centro/application/use-cases/TriagemEnfermagemUseCase';

async function runTriagemTests() {
  console.log('🧪 Running TriagemEnfermagemUseCase regression tests...');

  const uc = new TriagemEnfermagemUseCase();

  // Test 1: Listar fila de triagem no CEM sem erro de validação ou SQL
  const filaCem = await uc.listarFilaTriagem({ centro: 'CEM' }, { kind: 'GLOBAL' });
  assert.ok(filaCem && typeof filaCem.total === 'number');
  assert.ok(Array.isArray(filaCem.fila));
  console.log('✅ listarFilaTriagem (CEM) executou com sucesso:', filaCem.total, 'pacientes');

  // Test 2: Listar fila de triagem no CEO
  const filaCeo = await uc.listarFilaTriagem({ centro: 'CEO' }, { kind: 'GLOBAL' });
  assert.ok(filaCeo && typeof filaCeo.total === 'number');
  assert.ok(Array.isArray(filaCeo.fila));
  console.log('✅ listarFilaTriagem (CEO) executou com sucesso:', filaCeo.total, 'pacientes');

  // Test 3: Listar com filtro de data e status
  const filaData = await uc.listarFilaTriagem(
    { centro: 'CEM', data: '2026-09-17', status: 'PENDENTE' },
    { kind: 'GLOBAL' },
  );
  assert.ok(filaData && typeof filaData.total === 'number');
  console.log('✅ listarFilaTriagem com data e status executou com sucesso');

  console.log('🎉 Todos os testes de triagem passaram!');
}

runTriagemTests().catch((err) => {
  console.error('❌ Teste de triagem falhou:', err);
  process.exit(1);
});
