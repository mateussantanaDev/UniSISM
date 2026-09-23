import { getContext, setContext } from 'svelte';
import type {
	CampoPacienteEssencial,
	EstadoCivil,
	PacienteCadastroParcial,
	PrioridadeClinica,
	RacaCor,
	Sexo
} from '$lib/api/types';

export interface NovoEncaminhamentoState {
	solicitacaoFile: File[];
	anexos: File[];
	extraindo: boolean;
	consolidando: boolean;
	preenchido: boolean;
	protocoloCriado: string | null;
	confianca: number;
	erroConsolidar: string;

	nomePaciente: string;
	cpf: string;
	cartaoSus: string;
	dataNascimento: string;
	sexo: Sexo;
	telefone: string;
	endereco: string;

	medicoSolicitante: string;
	crm: string;
	especialidade: string;
	cid10: string;
	cidDescricao: string;
	justificativa: string;
	prioridade: PrioridadeClinica;

	// ─────────── Enriquecimento do cadastro ───────────
	/** Busca em andamento no backend pelo CPF extraído. */
	buscandoPaciente: boolean;
	/** Paciente encontrado no banco (shape parcial). Null se é cadastro novo. */
	pacienteExistente: PacienteCadastroParcial | null;
	/**
	 * Lista canônica de campos essenciais faltantes — entregue pelo backend em
	 * `GET /pacientes/por-cpf/:cpf`. Se o paciente não existe, vem a lista
	 * completa dos 10 essenciais; se existe e está completo, vem `[]`.
	 */
	camposFaltantes: CampoPacienteEssencial[];
	/** true quando o backend confirmou que o cadastro está completo. */
	cadastroCompleto: boolean;
	/** Valores preenchidos pelo usuário no form complementar. */
	complementos: ComplementosPaciente;
}

/**
 * Subset de `Paciente` (POST /encaminhamentos) com os complementares que
 * o backend aceita no upsert incremental. Todos opcionais — o backend só
 * preenche o que está vazio no banco (preserva edições existentes).
 */
export interface ComplementosPaciente {
	// Identidade
	nomeMae: string;
	nomePai: string;
	// Sociodemográfico
	estadoCivil: EstadoCivil | '';
	escolaridade: string;
	profissao: string;
	racaCor: RacaCor | '';
	// Contato
	telefoneSecundario: string;
	email: string;
	nomeSocial: string;
	// Endereço
	bairro: string;
	municipio: string;
	uf: string;
	cep: string;
}

export interface NovoEncaminhamentoContext {
	state: NovoEncaminhamentoState;
	extrairPdf: (file: File) => Promise<void>;
	adicionarAnexos: (files: File[]) => void;
	removerAnexo: (index: number) => void;
	consolidar: () => Promise<string | null>;
	resetar: () => void;
}

const KEY = Symbol('novo-enc-ctx');

export function setNovoEncaminhamentoContext(ctx: NovoEncaminhamentoContext) {
	setContext(KEY, ctx);
}

export function useNovoEncaminhamento(): NovoEncaminhamentoContext {
	const ctx = getContext<NovoEncaminhamentoContext>(KEY);
	if (!ctx) {
		throw new Error('useNovoEncaminhamento deve ser chamado dentro de /ubs/novo-encaminhamento');
	}
	return ctx;
}

export function estadoInicial(): NovoEncaminhamentoState {
	return {
		solicitacaoFile: [],
		anexos: [],
		extraindo: false,
		consolidando: false,
		preenchido: false,
		protocoloCriado: null,
		confianca: 0,
		erroConsolidar: '',

		nomePaciente: '',
		cpf: '',
		cartaoSus: '',
		dataNascimento: '',
		sexo: 'OUTRO',
		telefone: '',
		endereco: '',

		medicoSolicitante: '',
		crm: '',
		especialidade: '',
		cid10: '',
		cidDescricao: '',
		justificativa: '',
		prioridade: 'ELETIVA',

		buscandoPaciente: false,
		pacienteExistente: null,
		camposFaltantes: [],
		cadastroCompleto: false,
		complementos: complementosVazios()
	};
}

export function complementosVazios(): ComplementosPaciente {
	return {
		nomeMae: '',
		nomePai: '',
		estadoCivil: '',
		escolaridade: '',
		profissao: '',
		racaCor: '',
		telefoneSecundario: '',
		email: '',
		nomeSocial: '',
		bairro: '',
		municipio: '',
		uf: '',
		cep: ''
	};
}
