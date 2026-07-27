// Composition root — instancia repositórios, serviços, use cases e controllers.
import { PrismaAtendenteRepository } from '../infrastructure/database/PrismaAtendenteRepository';
import { PrismaSessaoRepository } from '../infrastructure/database/PrismaSessaoRepository';
import { PrismaPasswordResetRepository } from '../infrastructure/database/PrismaPasswordResetRepository';
import { PrismaEncaminhamentoRepository } from '../infrastructure/database/PrismaEncaminhamentoRepository';
import { PrismaPacienteRepository } from '../infrastructure/database/PrismaPacienteRepository';

import { BcryptPasswordHasher } from '../infrastructure/security/BcryptPasswordHasher';
import { JwtTokenService } from '../infrastructure/security/JwtTokenService';
import { buildFileStorage } from '../infrastructure/storage';
import { PdfParseService } from '../infrastructure/services/PdfParseService';
import { PrismaAuditLogger } from '../infrastructure/audit/PrismaAuditLogger';
import { buildScanner } from '../infrastructure/scan/ClamavScanner';
import {
  OutboxPublisher,
  logOnlyOutboxHandler,
} from '../infrastructure/outbox/OutboxBus';

import { LoginUseCase } from '../application/auth/LoginUseCase';
import { LogoutUseCase } from '../application/auth/LogoutUseCase';
import { ForgotPasswordUseCase } from '../application/auth/ForgotPasswordUseCase';
import { buildEmailService } from '../infrastructure/email/EmailService';
import { VerifyCodeUseCase } from '../application/auth/VerifyCodeUseCase';
import { ResetPasswordUseCase } from '../application/auth/ResetPasswordUseCase';
import { MeUseCase } from '../application/auth/MeUseCase';
import { GetProfileUseCase } from '../application/perfil/GetProfileUseCase';
import { ChangePasswordUseCase } from '../application/perfil/ChangePasswordUseCase';
import { RevokeOtherSessionsUseCase } from '../application/perfil/RevokeOtherSessionsUseCase';
import { GetMetricsUseCase } from '../application/dashboard/GetMetricsUseCase';
import { ExtractPdfUseCase } from '../application/encaminhamentos/ExtractPdfUseCase';
import { CreateEncaminhamentoUseCase } from '../application/encaminhamentos/CreateEncaminhamentoUseCase';
import { ListEncaminhamentosUseCase } from '../application/encaminhamentos/ListEncaminhamentosUseCase';
import { GetEncaminhamentoUseCase } from '../application/encaminhamentos/GetEncaminhamentoUseCase';
import { ResolverPendenciaUseCase } from '../application/encaminhamentos/ResolverPendenciaUseCase';
import { ListPacientesUseCase } from '../application/pacientes/ListPacientesUseCase';
import { GetPacienteUseCase } from '../application/pacientes/GetPacienteUseCase';
import { CriarRelatorioUseCase } from '../modules/relatorios/application/CriarRelatorioUseCase';
import { ListarRelatoriosUseCase } from '../modules/relatorios/application/ListarRelatoriosUseCase';
import { BaixarRelatorioUseCase } from '../modules/relatorios/application/BaixarRelatorioUseCase';
import { RelatorioWorker } from '../modules/relatorios/application/RelatorioWorker';
import { ExpiracaoCron } from '../modules/relatorios/application/ExpiracaoCron';
import { RelatoriosController as RelatoriosControllerV2 } from '../modules/relatorios/presentation/RelatoriosController';
import { CreatePrefeituraUseCase } from '../application/admin/CreatePrefeituraUseCase';
import { ListPrefeiturasUseCase } from '../application/admin/ListPrefeiturasUseCase';
import { CreateUbsUseCase } from '../application/admin/CreateUbsUseCase';
import { ListUbsUseCase } from '../application/admin/ListUbsUseCase';
import { CreateUsuarioUseCase } from '../application/admin/CreateUsuarioUseCase';
import { ListUsuariosUseCase } from '../application/admin/ListUsuariosUseCase';
import { GetIntegracoesUseCase } from '../application/admin/GetIntegracoesUseCase';
import { SaveIntegracaoUseCase } from '../application/admin/SaveIntegracaoUseCase';

import { AuthController } from '../presentation/controllers/AuthController';
import { PerfilController } from '../presentation/controllers/PerfilController';
import { DashboardController } from '../presentation/controllers/DashboardController';
import { EncaminhamentoController } from '../presentation/controllers/EncaminhamentoController';
import { PacienteController } from '../presentation/controllers/PacienteController';
import { AdminController } from '../presentation/controllers/AdminController';
import { GetDownloadAnexoUseCase } from '../application/anexos/GetDownloadAnexoUseCase';
import { AnexosController } from '../presentation/controllers/AnexosController';
import { RecomendacoesController } from '../presentation/controllers/RecomendacoesController';
import { SmsBannersAdminController } from '../presentation/controllers/SmsBannersAdminController';
import {
  ListarBannersAdminUseCase,
  ObterBannerAdminUseCase,
  CriarBannerAdminUseCase,
  AtualizarBannerAdminUseCase,
  DeletarBannerAdminUseCase,
} from '../application/admin/SmsBannerAdminUseCases';
import { BannersRateLimiter } from '../modules/paciente-app/infrastructure/BannersRateLimiter';
import {
  ListarRecomendacoesUseCase,
  ObterRecomendacaoUseCase,
  CriarRecomendacaoUseCase,
  AtualizarRecomendacaoUseCase,
  DeletarRecomendacaoUseCase,
} from '../application/admin/RecomendacoesEspecialidadeUseCases';

import { AprovarEncaminhamentoUseCase } from '../modules/gestao/application/use-cases/AprovarEncaminhamentoUseCase';
import { RegistrarPendenciaUseCase } from '../modules/gestao/application/use-cases/RegistrarPendenciaUseCase';
import { RejeitarEncaminhamentoUseCase } from '../modules/gestao/application/use-cases/RejeitarEncaminhamentoUseCase';
import { RegistrarRespostaSusUseCase } from '../modules/gestao/application/use-cases/RegistrarRespostaSusUseCase';
import { GetArvoreEncaminhamentosUseCase } from '../modules/gestao/application/use-cases/GetArvoreEncaminhamentosUseCase';
import { ListarFilaEsperaCentroUseCase } from '../modules/gestao/application/use-cases/ListarFilaEsperaCentroUseCase';
import { AgendarEncaminhamentoUseCase } from '../modules/gestao/application/use-cases/AgendarEncaminhamentoUseCase';
import { ListarAgendaEspecialistaUseCase } from '../modules/gestao/application/use-cases/ListarAgendaEspecialistaUseCase';
import { RegistrarAtendimentoEspecialistaUseCase } from '../modules/gestao/application/use-cases/RegistrarAtendimentoEspecialistaUseCase';
import { RegulacaoController } from '../modules/gestao/presentation/controllers/RegulacaoController';
import { EspecialistaController } from '../modules/gestao/presentation/controllers/EspecialistaController';
import { buildEspecialistaRoutes } from '../modules/gestao/presentation/routes/especialista.routes';

import { ListarFilaEsperaCentroRecepcaoUseCase } from '../modules/centro/application/use-cases/ListarFilaEsperaCentroRecepcaoUseCase';
import { AgendarConsultaCentroUseCase } from '../modules/centro/application/use-cases/AgendarConsultaCentroUseCase';
import { ObterAgendaDiaRecepcaoUseCase } from '../modules/centro/application/use-cases/ObterAgendaDiaRecepcaoUseCase';
import { RegistrarPresencaPacienteUseCase } from '../modules/centro/application/use-cases/RegistrarPresencaPacienteUseCase';
import { AgendamentoBalcaoRecepcaoUseCase } from '../modules/centro/application/use-cases/AgendamentoBalcaoRecepcaoUseCase';
import { DesmarcarReagendarConsultaUseCase } from '../modules/centro/application/use-cases/DesmarcarReagendarConsultaUseCase';
import { GestaoCotasUseCase } from '../modules/centro/application/use-cases/GestaoCotasUseCase';
import { GestaoEscalasUseCase } from '../modules/centro/application/use-cases/GestaoEscalasUseCase';
import { RemanejamentoLoteUseCase } from '../modules/centro/application/use-cases/RemanejamentoLoteUseCase';
import { RelatorioBpaUseCase } from '../modules/centro/application/use-cases/RelatorioBpaUseCase';
import { AuditoriaCentroUseCase } from '../modules/centro/application/use-cases/AuditoriaCentroUseCase';
import { MetricasDashboardDiretoriaUseCase } from '../modules/centro/application/use-cases/MetricasDashboardDiretoriaUseCase';
import { ListarAgendaMedicoCentroUseCase } from '../modules/centro/application/use-cases/ListarAgendaMedicoCentroUseCase';
import { ChamarPacienteMedicoUseCase } from '../modules/centro/application/use-cases/ChamarPacienteMedicoUseCase';
import { ObterProntuarioPacienteMedicoUseCase } from '../modules/centro/application/use-cases/ObterProntuarioPacienteMedicoUseCase';
import { RegistrarConsultaSOAPMedicoUseCase } from '../modules/centro/application/use-cases/RegistrarConsultaSOAPMedicoUseCase';
import { EncaminhamentoIntermunicipalMedicoUseCase } from '../modules/centro/application/use-cases/EncaminhamentoIntermunicipalMedicoUseCase';
import { CentroRecepcaoController } from '../modules/centro/presentation/controllers/CentroRecepcaoController';
import { CentroGestaoController } from '../modules/centro/presentation/controllers/CentroGestaoController';
import { CentroMedicoController } from '../modules/centro/presentation/controllers/CentroMedicoController';

import { UpdateUsuarioUseCase } from '../application/admin/UpdateUsuarioUseCase';
import { DeleteUsuarioUseCase } from '../application/admin/DeleteUsuarioUseCase';
import { AlterarAtivoUsuarioUseCase } from '../application/admin/AlterarAtivoUsuarioUseCase';
import { ResetarSenhaUsuarioUseCase } from '../application/admin/ResetarSenhaUsuarioUseCase';
import { UpdatePrefeituraUseCase } from '../application/admin/UpdatePrefeituraUseCase';
import { DeletePrefeituraUseCase } from '../application/admin/DeletePrefeituraUseCase';
import { UpdateUbsUseCase } from '../application/admin/UpdateUbsUseCase';
import { DeleteUbsUseCase } from '../application/admin/DeleteUbsUseCase';
import { UpdateEncaminhamentoUseCase } from '../application/encaminhamentos/UpdateEncaminhamentoUseCase';
import { DeleteEncaminhamentoUseCase } from '../application/encaminhamentos/DeleteEncaminhamentoUseCase';
import { UpdatePacienteUseCase } from '../application/pacientes/UpdatePacienteUseCase';
import { DeletePacienteUseCase } from '../application/pacientes/DeletePacienteUseCase';
import { BuscarPacientePorCpfUseCase } from '../application/pacientes/BuscarPacientePorCpfUseCase';

import { PrismaProntuarioAuditLogger } from '../modules/prontuario/infrastructure/PrismaProntuarioAuditLogger';
import { AddAlergiaUseCase, RemoveAlergiaUseCase } from '../modules/prontuario/application/alergias';
import {
  AddCondicaoCronicaUseCase,
  UpdateCondicaoCronicaUseCase,
  RemoveCondicaoCronicaUseCase,
} from '../modules/prontuario/application/condicoes-cronicas';
import {
  AddMedicamentoUseCase,
  UpdateMedicamentoUseCase,
  RemoveMedicamentoUseCase,
} from '../modules/prontuario/application/medicamentos';
import { SetHistoricoFamiliarUseCase } from '../modules/prontuario/application/historico-familiar';
import {
  AddAtendimentoUseCase,
  RemoveAtendimentoUseCase,
} from '../modules/prontuario/application/atendimentos';
import { AddExameUseCase, RemoveExameUseCase } from '../modules/prontuario/application/exames';
import { AddVacinaUseCase, RemoveVacinaUseCase } from '../modules/prontuario/application/vacinas';
import {
  AddViagemTfdUseCase,
  UpdateViagemTfdUseCase,
  RemoveViagemTfdUseCase,
} from '../modules/prontuario/application/viagens-tfd';
import { ProntuarioController } from '../modules/prontuario/presentation/ProntuarioController';

import { TfdAuditLogger } from '../modules/tfd/infrastructure/TfdAuditLogger';
import { NotificacaoPacienteService } from '../infrastructure/services/NotificacaoPacienteService';
import { VeiculosTfdUseCases } from '../modules/tfd/application/veiculos';
import { MotoristasTfdUseCases } from '../modules/tfd/application/motoristas';
import { SolicitacoesTfdUseCases } from '../modules/tfd/application/solicitacoes';
import { ViagensTfdUseCases } from '../modules/tfd/application/viagens';
import { AbastecimentosUseCases } from '../modules/tfd/application/abastecimentos';
import { SaldoUseCases } from '../modules/tfd/application/saldo';
import { AjudasCustoUseCases } from '../modules/tfd/application/ajudas-custo';
import { AuditoriaTfdUseCases } from '../modules/tfd/application/auditoria';
import {
  ListarTfdPacienteSolicAdminUseCase,
  ObterTfdPacienteSolicAdminUseCase,
  AprovarTfdPacienteSolicUseCase,
  RecusarTfdPacienteSolicUseCase,
  MarcarEmbarqueTfdPacUseCase,
  MarcarConclusaoTfdPacUseCase,
} from '../modules/tfd/application/tfd-paciente-solicitacoes';
import { TfdController } from '../modules/tfd/presentation/TfdController';

import { LoginPacienteUseCase } from '../modules/paciente-app/application/use-cases/LoginPacienteUseCase';
import { RefreshTokenPacienteUseCase } from '../modules/paciente-app/application/use-cases/RefreshTokenPacienteUseCase';
import { AtivarContaPacienteUseCase } from '../modules/paciente-app/application/use-cases/AtivarContaPacienteUseCase';
import { ListarMeusEncaminhamentosUseCase } from '../modules/paciente-app/application/use-cases/ListarMeusEncaminhamentosUseCase';
import { ListarNotificacoesUseCase } from '../modules/paciente-app/application/use-cases/ListarNotificacoesUseCase';
import { TrocarSenhaPacienteUseCase } from '../modules/paciente-app/application/use-cases/TrocarSenhaPacienteUseCase';
import { EsqueciSenhaPacienteUseCase } from '../modules/paciente-app/application/use-cases/EsqueciSenhaPacienteUseCase';
import { RedefinirSenhaPacienteUseCase } from '../modules/paciente-app/application/use-cases/RedefinirSenhaPacienteUseCase';
import { PasswordRecoveryRateLimiter } from '../modules/paciente-app/infrastructure/PasswordRecoveryRateLimiter';
import { RecoveryTokenPurgeCron } from '../modules/paciente-app/infrastructure/RecoveryTokenPurgeCron';
import { DownloadAnexoPacienteUseCase } from '../modules/paciente-app/application/use-cases/DownloadAnexoPacienteUseCase';
import { DownloadAnexoRateLimiter } from '../modules/paciente-app/infrastructure/DownloadAnexoRateLimiter';
import { DossieRateLimiter } from '../modules/paciente-app/infrastructure/DossieRateLimiter';
import {
  RegistrarPushDispositivoUseCase,
  RevogarPushDispositivoUseCase,
} from '../modules/paciente-app/application/use-cases/PushDispositivoUseCases';
import { buildPushProvider } from '../infrastructure/push/buildPushProvider';
import { PushDispatcherWorker } from '../modules/paciente-app/infrastructure/PushDispatcherWorker';
import { PushTokenCleanupCron } from '../modules/paciente-app/infrastructure/PushTokenCleanupCron';
import { ObterMinhaUbsUseCase } from '../modules/paciente-app/application/use-cases/ObterMinhaUbsUseCase';
import {
  RegistrarFcmPacienteUseCase,
  RevogarFcmPacienteUseCase,
} from '../modules/paciente-app/application/use-cases/FcmDispositivoUseCases';
import {
  DossieResumoUseCase,
  DossieAtendimentosUseCase,
  DossieVacinacoesUseCase,
  DossieExamesUseCase,
  ObterAtendimentoUseCase,
  ObterVacinacaoUseCase,
  ObterExameUseCase,
} from '../modules/paciente-app/application/use-cases/DossieUseCases';
import {
  ListarBannersAtivosUseCase,
  ObterBannerUseCase,
  MarcarBannerVistoUseCase,
} from '../modules/paciente-app/application/use-cases/BannersUseCases';
import {
  ListarTfdViagensPacienteUseCase,
  ObterTfdViagemPacienteUseCase,
  ListarMinhasSolicitacoesTfdUseCase,
  ObterMinhaSolicitacaoTfdUseCase,
  CriarSolicitacaoTfdPacienteUseCase,
  CancelarSolicitacaoTfdPacienteUseCase,
} from '../modules/paciente-app/application/use-cases/TfdPacienteUseCases';
import { PacienteAppController } from '../modules/paciente-app/presentation/controllers/PacienteAppController';

import { LoginMotoristaUseCase } from '../modules/motorista-app/application/use-cases/LoginMotoristaUseCase';
import { TrocarSenhaMotoristaUseCase } from '../modules/motorista-app/application/use-cases/TrocarSenhaMotoristaUseCase';
import { LogoutMotoristaUseCase } from '../modules/motorista-app/application/use-cases/LogoutMotoristaUseCase';
import { MeMotoristaUseCase } from '../modules/motorista-app/application/use-cases/MeMotoristaUseCase';
import { ListarMinhasViagensUseCase } from '../modules/motorista-app/application/use-cases/ListarMinhasViagensUseCase';
import { ObterViagemMotoristaUseCase } from '../modules/motorista-app/application/use-cases/ObterViagemMotoristaUseCase';
import { IniciarViagemMotoristaUseCase } from '../modules/motorista-app/application/use-cases/IniciarViagemMotoristaUseCase';
import { ConcluirViagemMotoristaUseCase } from '../modules/motorista-app/application/use-cases/ConcluirViagemMotoristaUseCase';
import { MarcarPresencaMotoristaUseCase } from '../modules/motorista-app/application/use-cases/MarcarPresencaMotoristaUseCase';
import { ListarMinhasAjudasUseCase } from '../modules/motorista-app/application/use-cases/ListarMinhasAjudasUseCase';
import {
  RegistrarFcmTokenUseCase,
  RevogarFcmTokenUseCase,
} from '../modules/motorista-app/application/use-cases/FcmTokenUseCases';
import { MotoristaAppController } from '../modules/motorista-app/presentation/controllers/MotoristaAppController';

export function buildContainer() {
  const atendentes = new PrismaAtendenteRepository();
  const sessoes = new PrismaSessaoRepository();
  const resets = new PrismaPasswordResetRepository();
  const encaminhamentosRepo = new PrismaEncaminhamentoRepository();
  const pacientesRepo = new PrismaPacienteRepository();

  const hasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService();
  const storage = buildFileStorage();
  const pdfExtractor = new PdfParseService();
  const audit = new PrismaAuditLogger();
  const scanner = buildScanner();

  // Outbox publisher (start é feito em main/server.ts depois do boot)
  const outbox = new OutboxPublisher(logOnlyOutboxHandler, {
    intervalMs: Number(process.env['OUTBOX_INTERVAL_MS'] ?? 500),
  });

  const emailService = buildEmailService();

  const loginUC = new LoginUseCase(atendentes, sessoes, hasher, tokens, audit);
  const logoutUC = new LogoutUseCase(sessoes, tokens);
  const forgotUC = new ForgotPasswordUseCase(atendentes, resets, hasher, emailService);
  const verifyUC = new VerifyCodeUseCase(atendentes, resets, hasher);
  const resetUC = new ResetPasswordUseCase(atendentes, resets, sessoes, hasher);
  const meUC = new MeUseCase(atendentes);

  const getProfileUC = new GetProfileUseCase();
  const changePasswordUC = new ChangePasswordUseCase(atendentes, sessoes, hasher);
  const revokeOthersUC = new RevokeOtherSessionsUseCase(sessoes);

  const getMetricsUC = new GetMetricsUseCase(encaminhamentosRepo);

  const extractPdfUC = new ExtractPdfUseCase(pdfExtractor);
  const createEncUC = new CreateEncaminhamentoUseCase(encaminhamentosRepo, storage, scanner);
  const listEncUC = new ListEncaminhamentosUseCase(encaminhamentosRepo);
  const getEncUC = new GetEncaminhamentoUseCase(encaminhamentosRepo);
  const resolverUC = new ResolverPendenciaUseCase(encaminhamentosRepo, storage);

  const listPacUC = new ListPacientesUseCase(pacientesRepo);
  const getPacUC = new GetPacienteUseCase(pacientesRepo);

  // ----- Módulo Relatórios (LGPD-first) -----
  const relWorker = new RelatorioWorker(storage);
  const criarRelUC = new CriarRelatorioUseCase(relWorker);
  const listarRelUC = new ListarRelatoriosUseCase();
  const baixarRelUC = new BaixarRelatorioUseCase(storage);
  const relExpiracaoCron = new ExpiracaoCron(storage);

  const createPrefeituraUC = new CreatePrefeituraUseCase();
  const listPrefeiturasUC = new ListPrefeiturasUseCase();
  const createUbsUC = new CreateUbsUseCase(audit);
  const listUbsUC = new ListUbsUseCase();
  const createUsuarioUC = new CreateUsuarioUseCase(hasher, audit);
  const listUsuariosUC = new ListUsuariosUseCase();
  const updateUsuarioUC = new UpdateUsuarioUseCase(audit);
  const deleteUsuarioUC = new DeleteUsuarioUseCase(audit);
  const alterarAtivoUC = new AlterarAtivoUsuarioUseCase(audit);
  const resetarSenhaUC = new ResetarSenhaUsuarioUseCase(hasher, audit);
  const updatePrefeituraUC = new UpdatePrefeituraUseCase(audit);
  const deletePrefeituraUC = new DeletePrefeituraUseCase(audit);
  const updateUbsUC = new UpdateUbsUseCase(audit);
  const deleteUbsUC = new DeleteUbsUseCase(audit);
  const updateEncUC = new UpdateEncaminhamentoUseCase(audit);
  const deleteEncUC = new DeleteEncaminhamentoUseCase(audit);
  const updatePacienteUC = new UpdatePacienteUseCase(pacientesRepo, audit);
  const deletePacienteUC = new DeletePacienteUseCase(audit);
  const buscarPacientePorCpfUC = new BuscarPacientePorCpfUseCase();

  const authController = new AuthController(loginUC, logoutUC, forgotUC, verifyUC, resetUC, meUC);
  const perfilController = new PerfilController(getProfileUC, changePasswordUC, revokeOthersUC);
  const dashboardController = new DashboardController(getMetricsUC);
  const encController = new EncaminhamentoController(
    extractPdfUC,
    createEncUC,
    listEncUC,
    getEncUC,
    resolverUC,
    updateEncUC,
    deleteEncUC,
    atendentes,
  );
  const downloadAnexoUC = new GetDownloadAnexoUseCase(storage);
  const anexosController = new AnexosController(downloadAnexoUC);
  const pacController = new PacienteController(
    listPacUC,
    getPacUC,
    updatePacienteUC,
    deletePacienteUC,
    buscarPacientePorCpfUC,
  );
  const relController = new RelatoriosControllerV2(criarRelUC, listarRelUC, baixarRelUC, atendentes);
  const getIntegracoesUC = new GetIntegracoesUseCase();
  const saveIntegracaoUC = new SaveIntegracaoUseCase();

  const adminController = new AdminController(
    createPrefeituraUC,
    listPrefeiturasUC,
    createUbsUC,
    listUbsUC,
    createUsuarioUC,
    listUsuariosUC,
    updateUsuarioUC,
    deleteUsuarioUC,
    alterarAtivoUC,
    resetarSenhaUC,
    updatePrefeituraUC,
    deletePrefeituraUC,
    updateUbsUC,
    deleteUbsUC,
    getIntegracoesUC,
    saveIntegracaoUC,
  );

  // ----- Recomendações por especialidade (CRUD admin) -----
  // CREATE/UPDATE/DELETE recebem `audit` pra registrar em `auditoria_logs`
  // (mutação afeta UX de paciente, precisa rastreabilidade administrativa).
  const recomendacoesController = new RecomendacoesController(
    new ListarRecomendacoesUseCase(),
    new ObterRecomendacaoUseCase(),
    new CriarRecomendacaoUseCase(audit),
    new AtualizarRecomendacaoUseCase(audit),
    new DeletarRecomendacaoUseCase(audit),
  );

  // ----- Banners SMS (CMS admin · CRUD por DEV/ADMIN/REG) -----
  const smsBannersAdminController = new SmsBannersAdminController(
    new ListarBannersAdminUseCase(),
    new ObterBannerAdminUseCase(),
    new CriarBannerAdminUseCase(audit),
    new AtualizarBannerAdminUseCase(audit),
    new DeletarBannerAdminUseCase(audit),
  );

  // ----- Módulo Gestão (Face 2 · SMS) -----
  const aprovarUC = new AprovarEncaminhamentoUseCase();
  const pendenciaUC = new RegistrarPendenciaUseCase();
  const rejeitarUC = new RejeitarEncaminhamentoUseCase();
  const respostaSusUC = new RegistrarRespostaSusUseCase(storage, scanner);
  const arvoreUC = new GetArvoreEncaminhamentosUseCase();
  const filaCentroUC = new ListarFilaEsperaCentroUseCase();
  const agendarUC = new AgendarEncaminhamentoUseCase();
  const regulacaoController = new RegulacaoController(
    atendentes,
    aprovarUC,
    pendenciaUC,
    rejeitarUC,
    respostaSusUC,
    arvoreUC,
    filaCentroUC,
    agendarUC,
  );

  const agendaEspecialistaUC = new ListarAgendaEspecialistaUseCase();
  const registrarAtendimentoEspecialistaUC = new RegistrarAtendimentoEspecialistaUseCase();
  const especialistaController = new EspecialistaController(
    atendentes,
    agendaEspecialistaUC,
    registrarAtendimentoEspecialistaUC,
  );

  // ----- Módulo Centro de Especialidades -----
  const centroRecepcaoController = new CentroRecepcaoController(
    atendentes,
    new ListarFilaEsperaCentroRecepcaoUseCase(),
    new AgendarConsultaCentroUseCase(),
    new ObterAgendaDiaRecepcaoUseCase(),
    new RegistrarPresencaPacienteUseCase(),
    new AgendamentoBalcaoRecepcaoUseCase(),
    new DesmarcarReagendarConsultaUseCase(),
  );

  const centroGestaoController = new CentroGestaoController(
    atendentes,
    new GestaoCotasUseCase(),
    new GestaoEscalasUseCase(),
    new RemanejamentoLoteUseCase(),
    new RelatorioBpaUseCase(),
    new AuditoriaCentroUseCase(),
    new MetricasDashboardDiretoriaUseCase(),
  );

  const centroMedicoController = new CentroMedicoController(
    atendentes,
    new ListarAgendaMedicoCentroUseCase(),
    new ChamarPacienteMedicoUseCase(),
    new ObterProntuarioPacienteMedicoUseCase(),
    new RegistrarConsultaSOAPMedicoUseCase(),
    new EncaminhamentoIntermunicipalMedicoUseCase(),
  );

  // ----- Módulo Prontuário (CRUD de sub-documentos) -----
  const prontuarioAudit = new PrismaProntuarioAuditLogger();
  const prontuarioController = new ProntuarioController({
    addAlergia: new AddAlergiaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeAlergia: new RemoveAlergiaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addCondicaoCronica: new AddCondicaoCronicaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    updateCondicaoCronica: new UpdateCondicaoCronicaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeCondicaoCronica: new RemoveCondicaoCronicaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addMedicamento: new AddMedicamentoUseCase(pacientesRepo, atendentes, prontuarioAudit),
    updateMedicamento: new UpdateMedicamentoUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeMedicamento: new RemoveMedicamentoUseCase(pacientesRepo, atendentes, prontuarioAudit),
    setHistoricoFamiliar: new SetHistoricoFamiliarUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addAtendimento: new AddAtendimentoUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeAtendimento: new RemoveAtendimentoUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addExame: new AddExameUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeExame: new RemoveExameUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addVacina: new AddVacinaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeVacina: new RemoveVacinaUseCase(pacientesRepo, atendentes, prontuarioAudit),
    addViagemTfd: new AddViagemTfdUseCase(pacientesRepo, atendentes, prontuarioAudit),
    updateViagemTfd: new UpdateViagemTfdUseCase(pacientesRepo, atendentes, prontuarioAudit),
    removeViagemTfd: new RemoveViagemTfdUseCase(pacientesRepo, atendentes, prontuarioAudit),
  });

  // ----- Módulo TFD (Face 4) -----
  const tfdAudit = new TfdAuditLogger();
  const notificacaoPacienteSvc = new NotificacaoPacienteService();
  const viagensTfdUC = new ViagensTfdUseCases(tfdAudit, atendentes);
  const tfdController = new TfdController({
    veiculos: new VeiculosTfdUseCases(tfdAudit, atendentes),
    motoristas: new MotoristasTfdUseCases(tfdAudit, atendentes, hasher),
    solicitacoes: new SolicitacoesTfdUseCases(tfdAudit, atendentes, storage, scanner),
    viagens: viagensTfdUC,
    abastecimentos: new AbastecimentosUseCases(tfdAudit, atendentes, storage, scanner),
    saldo: new SaldoUseCases(tfdAudit, atendentes),
    ajudasCusto: new AjudasCustoUseCases(tfdAudit, atendentes, storage),
    auditoria: new AuditoriaTfdUseCases(),
    solicPaciente: {
      listar: new ListarTfdPacienteSolicAdminUseCase(),
      obter: new ObterTfdPacienteSolicAdminUseCase(),
      aprovar: new AprovarTfdPacienteSolicUseCase(tfdAudit, notificacaoPacienteSvc),
      recusar: new RecusarTfdPacienteSolicUseCase(tfdAudit, notificacaoPacienteSvc),
      marcarEmbarque: new MarcarEmbarqueTfdPacUseCase(tfdAudit),
      marcarConclusao: new MarcarConclusaoTfdPacUseCase(tfdAudit),
    },
  });

  // ----- Módulo App do Motorista (Face 4 · mobile) -----
  const motoristaAppController = new MotoristaAppController(
    new LoginMotoristaUseCase(hasher, tokens, tfdAudit),
    new TrocarSenhaMotoristaUseCase(hasher, tfdAudit),
    new LogoutMotoristaUseCase(tfdAudit),
    new MeMotoristaUseCase(),
    new ListarMinhasViagensUseCase(),
    new ObterViagemMotoristaUseCase(),
    new IniciarViagemMotoristaUseCase(viagensTfdUC),
    new ConcluirViagemMotoristaUseCase(viagensTfdUC),
    new MarcarPresencaMotoristaUseCase(viagensTfdUC),
    new ListarMinhasAjudasUseCase(),
    new RegistrarFcmTokenUseCase(tfdAudit),
    new RevogarFcmTokenUseCase(tfdAudit),
  );

  // ----- Módulo App do Paciente (Face 3) -----
  // Rate limiter compartilhado entre middleware HTTP e use cases (defesa em profundidade).
  const passwordRecoveryRateLimiter = new PasswordRecoveryRateLimiter();
  // Rate limiter de downloads (60/15min/conta + 200/1h/conta + 300/15min/IP)
  const downloadAnexoRateLimiter = new DownloadAnexoRateLimiter();
  // Rate limiter de dossiê (120/15min/conta + 600/1h/conta + 1000/15min/IP)
  const dossieRateLimiter = new DossieRateLimiter();
  // Rate limiter de banners (240/15min/conta + 1200/1h/conta + 2000/15min/IP)
  const bannersRateLimiter = new BannersRateLimiter();

  // ----- Push notifications (v0.16+: provider-agnostic, ntfy.sh default) -----
  const pushProvider = buildPushProvider();
  // Dispatcher recebe emailService pra fallback urgente quando push falha
  const pushDispatcher = new PushDispatcherWorker(pushProvider, audit, emailService);
  const pushCleanupCron = new PushTokenCleanupCron(audit);
  const registrarPushUC = new RegistrarPushDispositivoUseCase(audit);
  const revogarPushUC = new RevogarPushDispositivoUseCase(audit);
  // Cron de purga de recovery tokens expirados/usados.
  const recoveryTokenPurgeCron = new RecoveryTokenPurgeCron(audit);

  const pacienteAppController = new PacienteAppController({
    login: new LoginPacienteUseCase(hasher),
    refresh: new RefreshTokenPacienteUseCase(audit),
    ativar: new AtivarContaPacienteUseCase(hasher),
    listEncs: new ListarMeusEncaminhamentosUseCase(),
    notifs: new ListarNotificacoesUseCase(),
    trocarSenha: new TrocarSenhaPacienteUseCase(hasher),
    esqueciSenha: new EsqueciSenhaPacienteUseCase(emailService, audit, passwordRecoveryRateLimiter),
    redefinirSenha: new RedefinirSenhaPacienteUseCase(hasher, audit, passwordRecoveryRateLimiter),
    obterMinhaUbs: new ObterMinhaUbsUseCase(),
    fcmRegistrar: new RegistrarFcmPacienteUseCase(registrarPushUC),
    fcmRevogar: new RevogarFcmPacienteUseCase(revogarPushUC),
    pushRegistrar: registrarPushUC,
    pushRevogar: revogarPushUC,
    dossieResumo: new DossieResumoUseCase(audit),
    dossieAtendimentos: new DossieAtendimentosUseCase(audit),
    dossieVacinacoes: new DossieVacinacoesUseCase(audit),
    dossieExames: new DossieExamesUseCase(audit),
    dossieObterAtendimento: new ObterAtendimentoUseCase(audit),
    dossieObterVacinacao: new ObterVacinacaoUseCase(audit),
    dossieObterExame: new ObterExameUseCase(audit),
    listarBanners: new ListarBannersAtivosUseCase(),
    obterBanner: new ObterBannerUseCase(),
    marcarBannerVisto: new MarcarBannerVistoUseCase(),
    listarTfdViagens: new ListarTfdViagensPacienteUseCase(),
    obterTfdViagem: new ObterTfdViagemPacienteUseCase(),
    listarMinhasSolicTfd: new ListarMinhasSolicitacoesTfdUseCase(),
    obterMinhaSolicTfd: new ObterMinhaSolicitacaoTfdUseCase(),
    criarSolicTfd: new CriarSolicitacaoTfdPacienteUseCase(),
    cancelarSolicTfd: new CancelarSolicitacaoTfdPacienteUseCase(tfdAudit),
    downloadAnexo: new DownloadAnexoPacienteUseCase(audit),
  });

  return {
    tokens,
    audit,
    scanner,
    outbox,
    storage,
    relExpiracaoCron,
    auth: authController,
    perfil: perfilController,
    dashboard: dashboardController,
    encaminhamentos: encController,
    anexos: anexosController,
    pacientes: pacController,
    relatorios: relController,
    admin: adminController,
    recomendacoes: recomendacoesController,
    smsBannersAdmin: smsBannersAdminController,
    regulacao: regulacaoController,
    especialista: especialistaController,
    centroRecepcao: centroRecepcaoController,
    centroGestao: centroGestaoController,
    centroMedico: centroMedicoController,
    pacienteApp: pacienteAppController,
    passwordRecoveryRateLimiter,
    downloadAnexoRateLimiter,
    dossieRateLimiter,
    bannersRateLimiter,
    recoveryTokenPurgeCron,
    pushDispatcher,
    pushCleanupCron,
    pushProvider,
    prontuario: prontuarioController,
    tfd: tfdController,
    motoristaApp: motoristaAppController,
  };
}

export type Container = ReturnType<typeof buildContainer>;
