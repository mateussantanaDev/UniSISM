/**
 * UNISISM · Face 4 (TFD / Gestão Logística) — Tipos compartilhados.
 *
 * Fonte canônica: backend `v0.8.2` (BlaBlaCar UX).
 * Documentação: `backend/docs/TFD_FRONTEND.md` + `TFD_API.md`.
 *
 * Estes tipos refletem 1:1 o que o backend devolve. Não importar nada daqui
 * em `types.ts` (core) — manter separado para a Face 4 ser plug-and-play.
 */

// ============================================================
// Frota
// ============================================================

export type TipoVeiculo = 'VAN' | 'ONIBUS' | 'CARRO' | 'AMBULANCIA';
export type StatusVeiculo = 'ATIVO' | 'EM_MANUTENCAO' | 'INATIVO';
export type Combustivel =
	| 'DIESEL'
	| 'GASOLINA'
	| 'ETANOL'
	| 'FLEX'
	| 'GNV'
	| 'ELETRICO';

export interface Veiculo {
	id: string;
	placa: string;
	modelo: string;
	tipo: TipoVeiculo;
	capacidade: number;
	ano: number;
	combustivel: Combustivel;
	consumoMedioKml: number;
	hodometroAtualKm: number;
	proximaRevisaoKm: number | null;
	proximaRevisaoEm: string | null;
	status: StatusVeiculo;
	prefeituraId: string;
	criadoEm: string;
	atualizadoEm: string;
}

export interface CriarVeiculoRequest {
	placa: string;
	modelo: string;
	tipo: TipoVeiculo;
	capacidade: number;
	ano: number;
	combustivel: Combustivel;
	consumoMedioKml: number;
	hodometroAtualKm?: number;
	proximaRevisaoKm?: number | null;
	proximaRevisaoEm?: string | null;
	prefeituraId?: string;
}

export type AtualizarVeiculoRequest = Partial<CriarVeiculoRequest> & {
	status?: StatusVeiculo;
};

// ============================================================
// Motoristas
// ============================================================

export type CategoriaCNH = 'B' | 'C' | 'D' | 'E';
export type StatusMotorista = 'ATIVO' | 'AFASTADO' | 'INATIVO';

export interface Motorista {
	id: string;
	nome: string;
	cpf: string;
	cnh: string;
	categoriaCnh: CategoriaCNH;
	validadeCnh: string;
	telefone: string;
	status: StatusMotorista;
	totalViagens: number;
	totalKmRodados: number;
	/** Dias até CNH vencer. Negativo = já vencida. */
	cnhVencidaEm: number;
	prefeituraId: string;
	criadoEm: string;
	atualizadoEm: string;
}

export interface CriarMotoristaRequest {
	nome: string;
	cpf: string;
	cnh: string;
	categoriaCnh: CategoriaCNH;
	validadeCnh: string;
	telefone: string;
	prefeituraId?: string;
}

export type AtualizarMotoristaRequest = Partial<CriarMotoristaRequest> & {
	status?: StatusMotorista;
};

// ============================================================
// Solicitações TFD
// ============================================================

export type StatusSolicitacaoTFD =
	| 'PENDENTE'
	| 'APROVADA'
	| 'ALOCADA'
	| 'REALIZADA'
	| 'NEGADA'
	| 'CANCELADA';

export type PrioridadeTFD = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
export type TipoAnexoSolicitacaoTFD =
	| 'COMPROVANTE_ENCAMINHAMENTO'
	| 'EXAME'
	| 'LAUDO'
	| 'OUTRO';
export type StatusScanAnexo = 'PENDENTE' | 'LIMPO' | 'INFECTADO' | 'FALHOU';

export interface AnexoSolicitacaoTFD {
	id: string;
	nome: string;
	tipo: TipoAnexoSolicitacaoTFD;
	tamanhoKb: number;
	scanStatus: StatusScanAnexo;
	uploadEm: string;
}

/**
 * Dados do acompanhante (informados pelo regulador no cadastro).
 * Quando `acompanhanteNecessario=false`, o objeto vem como `null`.
 */
export interface DadosAcompanhante {
	nome: string;
	cpf: string;
	dataNascimento: string;
	telefone: string;
	parentesco: string;
	rg?: string;
}

export interface SolicitacaoTFD {
	id: string;
	protocolo: string;
	pacienteId: string;
	pacienteNome: string | null;
	pacienteCpf: string | null;
	ubsId: string;
	ubsNome: string | null;
	encaminhamentoOrigemId: string | null;
	destino: string;
	unidadeDestino: string | null;
	especialidade: string;
	motivo: string;
	dataDesejada: string;
	acompanhanteNecessario: boolean;
	/** Detalhe do acompanhante quando `acompanhanteNecessario=true`. */
	acompanhante: DadosAcompanhante | null;
	prioridade: PrioridadeTFD;
	status: StatusSolicitacaoTFD;
	observacoes: string | null;
	motivoNegacao: string | null;
	viagemId: string | null;
	criadaEm: string;
	/** Operador que abriu a solicitação (REGULADOR_TFD/GESTOR_TFD/etc.). */
	criadaPorId: string | null;
	criadaPorNome: string | null;
	decididaEm: string | null;
	decididaPorId: string | null;
	anexos: AnexoSolicitacaoTFD[];
	isRegistroTardio?: boolean;
	dataRealizadaRetroativa?: string | null;
	justificativaRegistroTardio?: string | null;
	comprovanteHospitalDestino?: string | null;
}

/**
 * Dados completos do paciente quando criado **inline** pelo REGULADOR_TFD
 * (paciente que ainda não existe no sistema). O backend faz upsert por
 * CPF antes de gravar a solicitação.
 *
 * Para usar paciente já existente, prefira `pacienteId`.
 */
export interface DadosPacienteInline {
	nome: string;
	cpf: string;
	dataNascimento: string;
	sexo: 'M' | 'F' | 'OUTRO';
	telefone: string;
	endereco: string;
	cartaoSus?: string;
	nomeMae?: string;
	rg?: string;
	bairro?: string;
	municipio?: string;
	uf?: string;
	cep?: string;
}

export interface CriarSolicitacaoRequest {
	/**
	 * Modo "paciente existente" — quando o paciente já está cadastrado
	 * (por encaminhamento UBS, viagem anterior, etc.) basta o ID.
	 */
	pacienteId?: string;
	/**
	 * Modo "cadastro de passageiro novo" (REGULADOR_TFD) — informa
	 * dados completos. O backend cria/atualiza o paciente por CPF
	 * antes de associar à solicitação.
	 */
	paciente?: DadosPacienteInline;
	ubsId?: string;
	encaminhamentoOrigemId?: string;
	destino: string;
	unidadeDestino?: string;
	especialidade: string;
	motivo: string;
	dataDesejada: string;
	acompanhanteNecessario?: boolean;
	/** Obrigatório quando `acompanhanteNecessario=true`. */
	acompanhante?: DadosAcompanhante;
	prioridade: PrioridadeTFD;
	observacoes?: string;
	prefeituraId?: string;
	isRegistroTardio?: boolean;
	dataRealizadaRetroativa?: string;
	justificativaRegistroTardio?: string;
	comprovanteHospitalDestino?: string;
	statusDirect?: StatusSolicitacaoTFD;
}

export interface AprovarSolicitacaoRequest {
	observacoes?: string;
	/** Se informado, aprova + aloca atomicamente (UX BlaBlaCar). */
	alocacao?: { viagemId: string; numeroAssento?: number };
}

export interface ListSolicitacoesQuery {
	status?: StatusSolicitacaoTFD;
	prioridade?: PrioridadeTFD;
	q?: string;
	prefeituraId?: string;
	/**
	 * Quando `true`, devolve apenas as solicitações criadas pelo operador
	 * autenticado (`criadaPorId === me.id`). Usado no dashboard simplificado
	 * do REGULADOR_TFD ("o que eu mandei").
	 */
	criadaPorMim?: boolean;
}

// ============================================================
// Viagens
// ============================================================

export type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type PresencaPassageiro =
	| 'AGUARDANDO'
	| 'CONFIRMADO'
	| 'EMBARCADO'
	| 'AUSENTE'
	| 'DESISTIU';

export interface PassageiroViagem {
	id: string;
	solicitacaoId: string;
	protocolo: string | null;
	pacienteId: string;
	pacienteNome: string | null;
	pacienteCpf: string | null;
	especialidade: string | null;
	prioridade: PrioridadeTFD | null;
	numeroAssento: number | null;
	acompanhante: boolean;
	presenca: PresencaPassageiro;
	observacao: string | null;
	marcadoEm: string | null;
}

export interface ViagemFrota {
	id: string;
	data: string;
	horaSaida: string;
	horaPrevistaRetorno: string | null;
	veiculoId: string;
	veiculoPlaca: string | null;
	veiculoModelo: string | null;
	veiculoCapacidade: number | null;
	motoristaId: string;
	motoristaNome: string | null;
	destino: string;
	unidadeDestino: string | null;
	rotaResumo: string | null;
	kmEstimados: number | null;
	kmInicialHodometro: number | null;
	kmFinalHodometro: number | null;
	vagasTotais: number;
	vagasOcupadas: number;
	observacoes: string | null;
	status: StatusViagem;
	motivoCancelamento: string | null;
	criadaEm: string;
	iniciadaEm: string | null;
	concluidaEm: string | null;
	passageiros: PassageiroViagem[];
	assentosOcupados: number[];
	prefeituraId: string;
	isRegistroTardio?: boolean;
	justificativaTardia?: string | null;
}

export interface CriarViagemRequest {
	data: string;
	horaSaida: string;
	horaPrevistaRetorno?: string;
	veiculoId?: string;
	placa?: string;
	motoristaId: string;
	destino: string;
	unidadeDestino?: string;
	rotaResumo?: string;
	kmEstimados?: number;
	vagasTotais?: number;
	observacoes?: string;
	prefeituraId?: string;
	isRegistroTardio?: boolean;
	justificativaTardia?: string;
	statusDirect?: StatusViagem;
}

export interface AtualizarViagemRequest {
	data?: string;
	horaSaida?: string;
	horaPrevistaRetorno?: string;
	destino?: string;
	unidadeDestino?: string;
	rotaResumo?: string;
	kmEstimados?: number;
	observacoes?: string;
}

export interface IniciarViagemRequest {
	kmInicialHodometro: number;
}

export interface ConcluirViagemRequest {
	kmFinalHodometro: number;
	observacoes?: string;
}

export interface CancelarViagemRequest {
	motivo: string;
}

export interface AlocarPassageiroRequest {
	solicitacaoId: string;
	numeroAssento?: number;
}

export interface MarcarPresencaRequest {
	presenca: 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';
	observacao?: string;
}

export interface ListViagensQuery {
	status?: StatusViagem;
	desde?: string;
	ate?: string;
	prefeituraId?: string;
}

// ============================================================
// Abastecimento
// ============================================================

export type StatusAbastecimento =
	| 'SOLICITADO'
	| 'LIBERADO'
	| 'REALIZADO'
	| 'NEGADO';

export interface Abastecimento {
	id: string;
	protocolo: string;
	veiculoId: string;
	veiculoPlaca: string | null;
	motoristaId: string | null;
	motoristaNome: string | null;
	viagemId: string | null;
	posto: string;
	combustivel: Combustivel;
	litros: number;
	valorPorLitro: number;
	valorEstimado: number;
	valorTotal: number;
	hodometroKm: number;
	kmDesdeUltimo: number | null;
	consumoCalcKml: number | null;
	status: StatusAbastecimento;
	motivoNegacao: string | null;
	temComprovante: boolean;
	solicitadoEm: string;
	liberadoEm: string | null;
	realizadoEm: string | null;
	prefeituraId: string;
}

export interface SolicitarAbastecimentoRequest {
	veiculoId?: string;
	placa?: string;
	motoristaId?: string;
	viagemId?: string;
	posto: string;
	combustivel: Combustivel;
	/** Modo balcão — informa só o valor total. */
	valorEstimado?: number;
	/** Modo cálculo — backend faz multiplicação. */
	litrosEstimados?: number;
	valorPorLitroEstimado?: number;
	hodometroKm: number;
	prefeituraId?: string;
}

export interface RegistrarComprovanteAbastecimentoRequest {
	litros: number;
	valorPorLitro: number;
	valorTotal: number;
	hodometroKm: number;
	file: File;
}

export interface ListAbastecimentosQuery {
	status?: StatusAbastecimento;
	veiculoId?: string;
	desde?: string;
	ate?: string;
	/**
	 * Obrigatório para escopo GLOBAL (DESENVOLVEDOR) — backend retorna
	 * 403 `PREFEITURA_REQUERIDA` quando ausente nesse escopo.
	 */
	prefeituraId?: string;
}

// ============================================================
// Saldo
// ============================================================

export interface SaldoVeiculo {
	veiculoId: string;
	veiculoPlaca: string | null;
	veiculoModelo: string | null;
	mes: string;
	saldoMensal: number;
	saldoConsumido: number;
	saldoReservado: number;
	saldoDisponivel: number;
	prefeituraId: string;
}

export interface AjustarSaldoRequest {
	veiculoId: string;
	mes: string;
	novoSaldoMensal: number;
	justificativa: string;
}

/**
 * Origem do recurso para aporte de saldo (rastreabilidade contábil/TCM).
 *  - EMPENHO: empenho orçamentário emitido pela Prefeitura.
 *  - PORTARIA: portaria SMS (suplementação).
 *  - REPASSE_FEDERAL: repasse Fundo a Fundo (FNS/SUS).
 *  - REPASSE_ESTADUAL: SES / Tesouro estadual.
 *  - REMANEJAMENTO: realocação interna entre veículos / dotações.
 *  - OUTRO: usar campo `descricaoFonte`.
 */
export type FonteRecurso =
	| 'EMPENHO'
	| 'PORTARIA'
	| 'REPASSE_FEDERAL'
	| 'REPASSE_ESTADUAL'
	| 'REMANEJAMENTO'
	| 'OUTRO';

export interface AporteSaldoFrotaRequest {
	/** Quando informado, aporta no saldo de UM veículo. */
	veiculoId?: string;
	/** Quando true, aporta um valor único e o backend rateia entre os veículos ATIVOS. */
	rateioGeral?: boolean;
	mes: string;
	valorBRL: number;
	fonte: FonteRecurso;
	numeroDocumento?: string;
	descricaoFonte?: string;
	justificativa: string;
}

export interface AporteSaldoFrota {
	id: string;
	veiculoId: string | null;
	veiculoPlaca: string | null;
	mes: string;
	valorBRL: number;
	fonte: FonteRecurso;
	numeroDocumento: string | null;
	descricaoFonte: string | null;
	justificativa: string;
	operadorId: string;
	operadorNome: string;
	criadoEm: string;
	/** Quando o aporte é feito via rateio entre veículos, todos os
	 * registros do mesmo lote compartilham este ID. Permite agrupar
	 * na exibição do histórico. */
	grupoRateioId: string | null;
	prefeituraId: string;
}

// ============================================================
// Saldo de Ajuda de Custo
// ============================================================

/**
 * Orçamento mensal global para ajuda de custo a pacientes em viagens TFD.
 * Fica num "pote único" da prefeitura — não é por veículo.
 *
 * O backend devolve sempre um único registro por (prefeitura, mês).
 */
export interface SaldoAjudaCusto {
	prefeituraId: string;
	mes: string;
	saldoMensal: number;
	saldoConsumido: number;
	saldoReservado: number;
	saldoDisponivel: number;
	/** Limites de teto por categoria (0 = sem limite). */
	tetoAlimentacao: number;
	tetoHospedagem: number;
	tetoDeslocamento: number;
	atualizadoEm: string;
}

export interface AjustarSaldoAjudaCustoRequest {
	mes: string;
	novoSaldoMensal: number;
	tetoAlimentacao?: number;
	tetoHospedagem?: number;
	tetoDeslocamento?: number;
	justificativa: string;
}

export interface AporteSaldoAjudaCustoRequest {
	mes: string;
	valorBRL: number;
	fonte: FonteRecurso;
	numeroDocumento?: string;
	descricaoFonte?: string;
	justificativa: string;
}

export interface AporteSaldoAjudaCusto {
	id: string;
	mes: string;
	valorBRL: number;
	fonte: FonteRecurso;
	numeroDocumento: string | null;
	descricaoFonte: string | null;
	justificativa: string;
	operadorId: string;
	operadorNome: string;
	criadoEm: string;
	prefeituraId: string;
}

// ============================================================
// Ajuda de Custo
// ============================================================

export type StatusAjudaCusto =
	| 'PENDENTE'
	| 'AUTORIZADA'
	| 'PAGA'
	| 'NEGADA'
	| 'CANCELADA';

export type CategoriaAjuda =
	| 'ALIMENTACAO'
	| 'HOSPEDAGEM'
	| 'DESLOCAMENTO_LOCAL'
	| 'OUTRO';

export type MetodoPagamento = 'PIX' | 'TRANSFERENCIA' | 'DINHEIRO_RH';

export interface ItemAjudaCusto {
	categoria: CategoriaAjuda;
	descricao: string;
	valorBRL: number;
}

export interface AjudaCusto {
	id: string;
	protocolo: string;
	viagemId: string;
	pacienteId: string;
	pacienteNome: string | null;
	pacienteCpf: string | null;
	itens: ItemAjudaCusto[];
	valorTotal: number;
	status: StatusAjudaCusto;
	metodoPagamento: MetodoPagamento | null;
	motivoNegacao: string | null;
	temComprovante: boolean;
	criadaEm: string;
	autorizadaEm: string | null;
	pagaEm: string | null;
	prefeituraId: string;
}

export interface SolicitarAjudaCustoRequest {
	viagemId: string;
	pacienteId: string;
	itens: ItemAjudaCusto[];
	prefeituraId?: string;
}

export interface ListAjudasCustoQuery {
	status?: StatusAjudaCusto;
	pacienteId?: string;
	/** Obrigatório em escopo GLOBAL — backend retorna 403 sem. */
	prefeituraId?: string;
}

// ============================================================
// Auditoria
// ============================================================

export type AcaoAuditoriaTFD =
	| 'VEICULO_CRIADO'
	| 'VEICULO_ATUALIZADO'
	| 'VEICULO_MANUTENCAO'
	| 'VEICULO_REATIVADO'
	| 'VEICULO_DELETADO'
	| 'MOTORISTA_CRIADO'
	| 'MOTORISTA_ATUALIZADO'
	| 'MOTORISTA_AFASTADO'
	| 'MOTORISTA_REATIVADO'
	| 'MOTORISTA_DELETADO'
	| 'SOLICITACAO_CRIADA'
	| 'SOLICITACAO_APROVADA'
	| 'SOLICITACAO_NEGADA'
	| 'SOLICITACAO_ANEXO_ENVIADO'
	| 'VIAGEM_CRIADA'
	| 'VIAGEM_ATUALIZADA'
	| 'VIAGEM_INICIADA'
	| 'VIAGEM_CONCLUIDA'
	| 'VIAGEM_CANCELADA'
	| 'PASSAGEIRO_ALOCADO'
	| 'PASSAGEIRO_REMOVIDO'
	| 'PRESENCA_MARCADA'
	| 'ABASTECIMENTO_SOLICITADO'
	| 'ABASTECIMENTO_LIBERADO'
	| 'ABASTECIMENTO_NEGADO'
	| 'ABASTECIMENTO_REALIZADO'
	| 'SALDO_AJUSTADO'
	| 'SALDO_APORTADO'
	| 'SALDO_AJUDA_AJUSTADO'
	| 'SALDO_AJUDA_APORTADO'
	| 'AJUDA_CUSTO_CRIADA'
	| 'AJUDA_CUSTO_AUTORIZADA'
	| 'AJUDA_CUSTO_PAGA'
	| 'AJUDA_CUSTO_NEGADA';

export interface RegistroAuditoriaTFD {
	id: string;
	acao: AcaoAuditoriaTFD;
	recursoTipo: string;
	recursoId: string;
	recursoProtocolo: string | null;
	operadorId: string;
	operadorNome: string;
	operadorMatricula: string;
	operadorRole: string;
	ip: string;
	userAgent: string;
	antes: Record<string, unknown> | null;
	depois: Record<string, unknown> | null;
	hashAnterior: string;
	hash: string;
	em: string;
	prefeituraId: string;
}

export interface ListAuditoriaQuery {
	recursoTipo?: string;
	recursoId?: string;
	desde?: string;
	ate?: string;
	prefeituraId?: string;
}

// ============================================================
// Relatórios analíticos
// ============================================================

/**
 * Relatório agregado por especialidade — fundamenta a decisão de
 * "compensa contratar especialista local vs. mandar pacientes para fora".
 *
 * Retorna uma linha por especialidade com contagem de viagens, total de
 * pacientes únicos, custo estimado total e ticket médio por viagem.
 */
export interface RelatorioEspecialidadeItem {
	especialidade: string;
	totalSolicitacoes: number;
	totalRealizadas: number;
	totalPendentes: number;
	totalNegadas: number;
	pacientesUnicos: number;
	destinosMaisFrequentes: string[];
	custoEstimadoBRL: number;
	custoMedioPorViagemBRL: number;
}

export interface RelatorioEspecialidadeQuery {
	/** Janela de análise; default: últimos 12 meses. */
	desde?: string;
	ate?: string;
	prefeituraId?: string;
}

export interface RelatorioEspecialidadeResposta {
	periodo: { desde: string; ate: string };
	totalGeralSolicitacoes: number;
	totalGeralCustoBRL: number;
	itens: RelatorioEspecialidadeItem[];
}

// ============================================================
// SOLICITAÇÕES TFD VINDAS DO APP PACIENTE (Face 3 → Face 4)
// ============================================================
// Endpoints: `/v1/tfd/solicitacoes-paciente/*` (6 endpoints).
// RBAC: GESTOR_TFD, ADMIN, DESENVOLVEDOR (rwGestor).
//
// Fluxo de estados (sempre transição única, audit hash-chain):
//   AGUARDANDO → APROVADA  (com numeroAssento auto ou explícito)
//   AGUARDANDO → RECUSADA  (com motivo ≥5 chars)
//   APROVADA   → EMBARCADA (sem body)
//   EMBARCADA  → CONCLUIDA (sem body)
//   * → CANCELADA (vem do app paciente — DELETE /v1/paciente/tfd/solicitacoes/:id)
//
// Concorrência: backend usa lock pessimista `SELECT FOR UPDATE` na viagem ao
// aprovar; 2 gestores aprovando concorrente disputam → um sai com 409
// `TFD_VIAGEM_SEM_VAGAS` em vez de overbook.

export type StatusTfdPaciente =
	| 'AGUARDANDO'
	| 'APROVADA'
	| 'RECUSADA'
	| 'CANCELADA'
	| 'EMBARCADA'
	| 'CONCLUIDA';

/**
 * Prioridade derivada NO SERVIDOR a partir do encaminhamento vinculado:
 *   - sem encaminhamento OU ELETIVA          → NORMAL
 *   - encaminhamento PRIORITARIA             → PRIORITARIA
 *   - encaminhamento URGENTE ou EMERGENCIA   → URGENTE
 */
export type PrioridadeTfdPaciente = 'NORMAL' | 'PRIORITARIA' | 'URGENTE';

/** DTO de solicitação retornada pelas rotas admin. */
export interface TfdPacienteSolicAdmin {
	id: string;
	status: StatusTfdPaciente;
	prioridade: PrioridadeTfdPaciente;
	paciente: {
		contaId: string;
		nome: string;
		/** CPF formatado se disponível, dígitos caso contrário. */
		cpf: string;
	};
	viagem: {
		id: string;
		destino: string;
		unidadeDestino: string;
		/** ISO 8601 UTC da data da viagem (00:00). */
		data: string;
		/** Hora local 'HH:mm' do embarque. */
		horaSaida: string;
		vagasTotais: number;
		/** Conta passageiros UBS + solicitações app APROVADAS/EMBARCADAS. */
		vagasOcupadas: number;
	};
	justificativaPaciente: string;
	/** Nome do acompanhante quando informado. */
	acompanhante: string | null;
	encaminhamentoId: string | null;
	encaminhamentoProtocolo: string | null;
	/** Atribuído na aprovação (auto "A{n}" ou explícito do operador). */
	numeroAssento: string | null;
	motivoRecusa: string | null;
	/** Nome do gestor TFD que tomou a última ação. */
	operadorNome: string | null;
	tentativasReabertura: number;
	criadaEm: string;
	aprovadaEm: string | null;
	recusadaEm: string | null;
	canceladaEm: string | null;
}

export interface ListTfdPacienteSolicQuery {
	status?: StatusTfdPaciente;
	viagemId?: string;
	prioridade?: PrioridadeTfdPaciente;
	/** Obrigatório em escopo GLOBAL — backend retorna 403 sem. */
	prefeituraId?: string;
}

/** Body do POST `/aprovar`. Se omitido, backend atribui sequencial. */
export interface AprovarTfdPacienteSolicRequest {
	numeroAssento?: string;
}

/** Body do POST `/recusar`. */
export interface RecusarTfdPacienteSolicRequest {
	motivo: string; // ≥ 5 chars
}
