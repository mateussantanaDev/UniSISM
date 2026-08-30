import 'dotenv/config';
import assert from 'assert';
import { FilaUbsRepository } from '../src/modules/ubs-atendimento/infrastructure/repositories/FilaUbsRepository';
import { AdicionarFilaUbsUseCase } from '../src/modules/ubs-atendimento/application/use-cases/AdicionarFilaUbsUseCase';
import { ListarFilaDiaUbsUseCase } from '../src/modules/ubs-atendimento/application/use-cases/ListarFilaDiaUbsUseCase';
import { ChamarPacienteUbsUseCase } from '../src/modules/ubs-atendimento/application/use-cases/ChamarPacienteUbsUseCase';
import { AtualizarStatusAtendimentoUbsUseCase } from '../src/modules/ubs-atendimento/application/use-cases/AtualizarStatusAtendimentoUbsUseCase';
import { ObterUltimasChamadasPainelUbsUseCase } from '../src/modules/ubs-atendimento/application/use-cases/ObterUltimasChamadasPainelUbsUseCase';

async function runUbsAtendimentoTests() {
  console.log('🧪 Iniciando testes unitários do Módulo de Atendimento Diário & Fila da UBS...');

  const repo = new FilaUbsRepository();

  // Test 1: Inserção com geração correta de senhas
  const dataHoje = new Date().toISOString().slice(0, 10);
  const ubsId = 'ubs-central-01';

  const at1 = await repo.adicionar({
    ubsId,
    ubsNome: 'UBS Central de Saúde da Família',
    data: dataHoje,
    pacienteId: 'pac-01',
    pacienteNome: 'João Silva',
    pacienteCpf: '11122233344',
    tipoAtendimento: 'CONSULTA_MEDICA',
    prioridade: 'NORMAL',
    consultorio: 'Consultório 01',
    criadoPorId: 'user-recepcao',
    criadoPorNome: 'Atendente Maria',
  });
  assert.ok(at1.senha.startsWith('GER-'), `Senha normal deve iniciar com GER-: ${at1.senha}`);
  console.log(`✅ Senha Normal gerada corretamente: ${at1.senha}`);

  const at2 = await repo.adicionar({
    ubsId,
    ubsNome: 'UBS Central de Saúde da Família',
    data: dataHoje,
    pacienteId: 'pac-02',
    pacienteNome: 'Dona Maria Idosa (82 anos)',
    pacienteCpf: '22233344455',
    tipoAtendimento: 'CONSULTA_MEDICA',
    prioridade: 'SUPER_PRIORIDADE_80',
    consultorio: 'Consultório 01',
    criadoPorId: 'user-recepcao',
    criadoPorNome: 'Atendente Maria',
  });
  assert.ok(at2.senha.startsWith('80-'), `Senha 80+ deve iniciar com 80-: ${at2.senha}`);
  console.log(`✅ Senha 80+ gerada corretamente: ${at2.senha}`);

  const at3 = await repo.adicionar({
    ubsId,
    ubsNome: 'UBS Central de Saúde da Família',
    data: dataHoje,
    pacienteId: 'pac-03',
    pacienteNome: 'Carlos Risco Agudo',
    pacienteCpf: '33344455566',
    tipoAtendimento: 'ACOLHIMENTO_TRIAGEM',
    prioridade: 'URGENCIA',
    consultorio: 'Sala de Triagem',
    criadoPorId: 'user-triagem',
    criadoPorNome: 'Enfermeira Clara',
  });
  assert.ok(at3.senha.startsWith('URG-'), `Senha Urgência deve iniciar com URG-: ${at3.senha}`);
  console.log(`✅ Senha Urgência gerada corretamente: ${at3.senha}`);

  // Test 2: Ordenação por Prioridade SUS (Urgência 1 > 80+ 2 > Normal 7)
  const filaOrdenada = await repo.listar({ ubsId, data: dataHoje });
  assert.strictEqual(filaOrdenada[0].id, at3.id, 'Urgência deve ser o 1º da fila aguardando');
  assert.strictEqual(filaOrdenada[1].id, at2.id, 'Superprioridade 80+ deve ser o 2º da fila aguardando');
  assert.strictEqual(filaOrdenada[2].id, at1.id, 'Normal deve ser o 3º da fila');
  console.log('✅ Ordenação por Prioridades SUS validada com sucesso (Urgência > 80+ > Normal)');

  // Test 3: Disparo de Chamada no Painel de TV
  const chamadaUC = new ChamarPacienteUbsUseCase(repo);
  const chamadaRes = await chamadaUC.exec({
    atendimentoId: at2.id,
    consultorio: 'Consultório 02',
    crm: 'CRM/SP 123456',
    operadorId: 'med-01',
    operadorNome: 'Dr. Roberto Clínico',
  });
  assert.strictEqual(chamadaRes.atendimento.status, 'CHAMADO');
  assert.strictEqual(chamadaRes.chamada.pacienteNome, 'Dona Maria Idosa (82 anos)');
  assert.strictEqual(chamadaRes.chamada.consultorio, 'Consultório 02');
  console.log('✅ Chamar paciente atualizou status para CHAMADO e criou registro de chamada para TV');

  // Test 4: Consulta do Painel de TV (Sala de Espera)
  const painelUC = new ObterUltimasChamadasPainelUbsUseCase(repo);
  const painelRes = await painelUC.exec(ubsId, 5);
  assert.ok(painelRes.chamadaAtual !== null, 'Painel TV deve exibir a chamada atual');
  assert.strictEqual(painelRes.chamadaAtual?.atendimentoId, at2.id);
  console.log('✅ Endpoint do Painel TV retornou chamada atual para reprodução em áudio e vídeo');

  // Test 5: Transições de Status (EM_ATENDIMENTO -> CONCLUIDO)
  const statusUC = new AtualizarStatusAtendimentoUbsUseCase(repo);
  const emAtendimento = await statusUC.exec({
    atendimentoId: at2.id,
    status: 'EM_ATENDIMENTO',
    operadorId: 'med-01',
  });
  assert.strictEqual(emAtendimento.status, 'EM_ATENDIMENTO');
  assert.ok(emAtendimento.iniciadoEm !== null);

  const concluido = await statusUC.exec({
    atendimentoId: at2.id,
    status: 'CONCLUIDO',
    observacao: 'Consulta realizada. Prescrito anti-hipertensivo e solicitado retorno.',
    operadorId: 'med-01',
  });
  assert.strictEqual(concluido.status, 'CONCLUIDO');
  assert.ok(concluido.finalizadoEm !== null);
  console.log('✅ Ciclo completo de atendimento clínico concluído com sucesso');

  // Test 6: Listagem e Contadores com ListarFilaDiaUbsUseCase
  const listarUC = new ListarFilaDiaUbsUseCase(repo);
  const resumo = await listarUC.exec({ ubsId, data: dataHoje });
  assert.strictEqual(resumo.total, 3);
  assert.strictEqual(resumo.concluidos, 1);
  assert.strictEqual(resumo.aguardando, 2);
  console.log(`✅ Contadores da fila da UBS calculados com precisão: Total=${resumo.total}, Aguardando=${resumo.aguardando}, Concluídos=${resumo.concluidos}`);

  console.log('🎉 Todos os testes do módulo UBS Atendimento & Fila Diária passaram com 100% de sucesso!');
}

runUbsAtendimentoTests().catch((err) => {
  console.error('❌ Erro nos testes do módulo UBS:', err);
  process.exit(1);
});
