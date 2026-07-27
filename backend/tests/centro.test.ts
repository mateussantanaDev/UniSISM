import assert from 'assert';
import { findDoctor } from '../src/modules/gestao/application/use-cases/OtimizadorVagas';
import { ListarFilaEsperaCentroRecepcaoUseCase } from '../src/modules/centro/application/use-cases/ListarFilaEsperaCentroRecepcaoUseCase';
import { ObterAgendaDiaRecepcaoUseCase } from '../src/modules/centro/application/use-cases/ObterAgendaDiaRecepcaoUseCase';
import { AgendarConsultaCentroUseCase } from '../src/modules/centro/application/use-cases/AgendarConsultaCentroUseCase';
import { RegistrarPresencaPacienteUseCase } from '../src/modules/centro/application/use-cases/RegistrarPresencaPacienteUseCase';
import { AgendamentoBalcaoRecepcaoUseCase } from '../src/modules/centro/application/use-cases/AgendamentoBalcaoRecepcaoUseCase';
import { DesmarcarReagendarConsultaUseCase } from '../src/modules/centro/application/use-cases/DesmarcarReagendarConsultaUseCase';

import { ListarAgendaMedicoCentroUseCase } from '../src/modules/centro/application/use-cases/ListarAgendaMedicoCentroUseCase';
import { ChamarPacienteMedicoUseCase } from '../src/modules/centro/application/use-cases/ChamarPacienteMedicoUseCase';
import { ObterProntuarioPacienteMedicoUseCase } from '../src/modules/centro/application/use-cases/ObterProntuarioPacienteMedicoUseCase';
import { RegistrarConsultaSOAPMedicoUseCase } from '../src/modules/centro/application/use-cases/RegistrarConsultaSOAPMedicoUseCase';
import { EncaminhamentoIntermunicipalMedicoUseCase } from '../src/modules/centro/application/use-cases/EncaminhamentoIntermunicipalMedicoUseCase';

import { GestaoCotasUseCase } from '../src/modules/centro/application/use-cases/GestaoCotasUseCase';
import { GestaoEscalasUseCase } from '../src/modules/centro/application/use-cases/GestaoEscalasUseCase';
import { RemanejamentoLoteUseCase } from '../src/modules/centro/application/use-cases/RemanejamentoLoteUseCase';
import { RelatorioBpaUseCase } from '../src/modules/centro/application/use-cases/RelatorioBpaUseCase';
import { AuditoriaCentroUseCase } from '../src/modules/centro/application/use-cases/AuditoriaCentroUseCase';
import { MetricasDashboardDiretoriaUseCase } from '../src/modules/centro/application/use-cases/MetricasDashboardDiretoriaUseCase';
import { GestaoSalasUseCase } from '../src/modules/centro/application/use-cases/GestaoSalasUseCase';
import { GestaoEspecialidadesCatalogoUseCase } from '../src/modules/centro/application/use-cases/GestaoEspecialidadesCatalogoUseCase';

async function runTests() {
  console.log('🧪 Running ERP Gestão do Centro de Especialidades unit tests (v3.1.0)...');

  // Test 1: Doctor selection logic in OtimizadorVagas
  const doctorCardio = findDoctor('Dr. Roberto Medeiros', '', 'Cardiologia');
  assert.strictEqual(doctorCardio.nome, 'Dr. Roberto Medeiros');
  assert.strictEqual(doctorCardio.especialidade, 'Cardiologia');
  console.log('✅ findDoctor correctly identified Dr. Roberto Medeiros');

  const doctorOftalmo = findDoctor('', 'Exame para olho', 'Oftalmologia');
  assert.strictEqual(doctorOftalmo.especialidade, 'Oftalmologia');
  console.log('✅ findDoctor correctly identified especialista em Oftalmologia');

  // Test 2: Instantiation of all Reception Use Cases (Fase 1)
  const filaUC = new ListarFilaEsperaCentroRecepcaoUseCase();
  const agendarUC = new AgendarConsultaCentroUseCase();
  const agendaDiaUC = new ObterAgendaDiaRecepcaoUseCase();
  const presencaUC = new RegistrarPresencaPacienteUseCase();
  const balcaoUC = new AgendamentoBalcaoRecepcaoUseCase();
  const desmarcarReagendarUC = new DesmarcarReagendarConsultaUseCase();

  // Test 3: Instantiation of all Doctor Use Cases (Fase 2)
  const agendaMedicoUC = new ListarAgendaMedicoCentroUseCase();
  const chamarUC = new ChamarPacienteMedicoUseCase();
  const prontuarioUC = new ObterProntuarioPacienteMedicoUseCase();
  const registrarSoapUC = new RegistrarConsultaSOAPMedicoUseCase();
  const intermunicipalUC = new EncaminhamentoIntermunicipalMedicoUseCase();

  // Test 4: Instantiation of Management & Executive Board ERP Use Cases (Fase 3 / ERP v3.1.0)
  const cotasUC = new GestaoCotasUseCase();
  const escalasUC = new GestaoEscalasUseCase();
  const remanejamentoUC = new RemanejamentoLoteUseCase();
  const bpaUC = new RelatorioBpaUseCase();
  const auditUC = new AuditoriaCentroUseCase();
  const dashboardUC = new MetricasDashboardDiretoriaUseCase();
  const salasUC = new GestaoSalasUseCase();
  const especialidadesUC = new GestaoEspecialidadesCatalogoUseCase();

  assert(filaUC && agendarUC && agendaDiaUC && presencaUC && balcaoUC && desmarcarReagendarUC, 'All Reception use cases loaded');
  assert(agendaMedicoUC && chamarUC && prontuarioUC && registrarSoapUC && intermunicipalUC, 'All Doctor use cases loaded');
  assert(cotasUC && escalasUC && remanejamentoUC && bpaUC && auditUC && dashboardUC && salasUC && especialidadesUC, 'All Management ERP use cases loaded');

  console.log('✅ All 19 ERP Centro de Especialidades UseCases instantiated successfully');
  console.log('🎉 All tests completed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
