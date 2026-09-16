import { getContext, setContext } from 'svelte';
import type { MeResponse, Role } from '$lib/api/types';

/**
 * Sessão autenticada — populada pelo `+layout.svelte` raiz de cada Face
 * (`/ubs/+layout.svelte`, `/sms/+layout.svelte`) logo após login.
 *
 * Expõe `me` + helpers de RBAC para o UI esconder botões/menus que o
 * backend já proíbe via 403 (defesa em profundidade).
 *
 * Os helpers específicos de cada Face são opcionais para permitir que
 * um layout exponha apenas o que consome, mantendo retrocompatibilidade.
 */
export interface AuthContext {
	readonly me: MeResponse | null;
	readonly carregando: boolean;

	// ─────────── Face 1 · UBS ───────────
	readonly podeConsolidarEncaminhamento: boolean;

	// ─────────── Administração (transversal) ───────────
	readonly podeCriarUsuario: boolean;
	readonly podeCriarUbs: boolean;
	readonly podeCriarPrefeitura: boolean;
	readonly ehAdminGlobalOuPrefeitura: boolean;
	/**
	 * Flag mestra para UI de edit/delete/desativar de recursos administráveis
	 * (usuários, UBSs, prefeituras, etc.). Verdadeiro apenas para ADMIN e
	 * DESENVOLVEDOR. O backend continua sendo fonte de verdade — isso é
	 * defesa em profundidade para esconder botões que resultariam em 403.
	 */
	readonly ehAdminOuDev: boolean;

	// ─────────── Face 2 · SMS / Regulação ───────────
	/**
	 * Opcionais — cada layout raiz expõe apenas o que sua UI consome.
	 * Para consumir, usar sempre com `??` ou verificar truthy.
	 */
	readonly podeAprovarEncaminhamento?: boolean;
	readonly podeRegistrarPendencia?: boolean;
	readonly podeRejeitarEncaminhamento?: boolean;
	readonly podeVerFilaRegulacao?: boolean;
	/**
	 * Atendente "normal" da SMS — REGULADOR_SMS sem perfil de admin.
	 * Recebe a UI simplificada (dashboard com 4 cards, exploradores de
	 * solicitações e respostas, detalhe minimal de 3 abas).
	 */
	readonly ehReguladorSimples?: boolean;

	// ─────────── Face 4 · TFD / Gestão Logística ───────────
	/** Pode operar a frota do TFD: criar viagens, alocar passageiros, fechar embarques. */
	readonly podeGerenciarTFD?: boolean;
	/**
	 * Atendente "normal" do TFD — REGULADOR_TFD sem perfil de gestão.
	 * Recebe a UI minimalista (dashboard com contadores próprios + tela
	 * única de cadastro de passageiro).
	 */
	readonly ehReguladorTfdSimples?: boolean;
	/**
	 * Pode cadastrar usuários TFD (REGULADOR_TFD/GESTOR_TFD).
	 * GESTOR_TFD pode cadastrar REGULADOR_TFD; ADMIN/DEV podem criar
	 * qualquer role.
	 */
	readonly podeCadastrarUsuarioTFD?: boolean;

	logout: () => Promise<void>;
}

const KEY = Symbol('auth-ctx');

export function setAuthContext(ctx: AuthContext) {
	setContext(KEY, ctx);
}

export function useAuth(): AuthContext {
	const ctx = getContext<AuthContext>(KEY);
	if (!ctx) throw new Error('useAuth deve ser chamado dentro de /ubs, /sms ou /tfd');
	return ctx;
}

/**
 * Utilitários puros de RBAC — testáveis sem contexto Svelte.
 * A regra de negócio é: o backend é a fonte de verdade; estes helpers
 * apenas espelham o que o backend aceita, evitando mostrar botões que
 * resultariam em 403.
 */
export const rbac = {
	// ────────── Face 1 · UBS ──────────
	podeConsolidarEncaminhamento(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'ATENDENTE_UBS' ||
			role === 'COORDENADOR_UBS' ||
			role === 'MEDICO' ||
			role === 'MEDICO_ESPECIALISTA' ||
			role === 'DESENVOLVEDOR'
		);
	},

	// ────────── Face 2 · SMS / Regulação ──────────
	/** Aprovar encaminhamento (transição AGUARDANDO_REGULACAO → APROVADO). */
	podeAprovarEncaminhamento(role: Role | undefined): boolean {
		if (!role) return false;
		return role === 'REGULADOR_SMS' || role === 'DESENVOLVEDOR';
	},
	/** Registrar pendência (transição AGUARDANDO_REGULACAO → PENDENCIA_DOCUMENTO). */
	podeRegistrarPendencia(role: Role | undefined): boolean {
		if (!role) return false;
		return role === 'REGULADOR_SMS' || role === 'DESENVOLVEDOR';
	},
	/** Rejeitar encaminhamento (transição → REJEITADO). */
	podeRejeitarEncaminhamento(role: Role | undefined): boolean {
		if (!role) return false;
		return role === 'REGULADOR_SMS' || role === 'DESENVOLVEDOR';
	},
	/** Visualizar a fila completa da regulação. */
	podeVerFilaRegulacao(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'REGULADOR_SMS' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		);
	},
	/**
	 * REGULADOR_SMS "puro" — atendente normal sem nível administrativo.
	 * Recebe UI simplificada (sem analytics, auditoria, configurações).
	 */
	ehReguladorSimples(role: Role | undefined): boolean {
		return role === 'REGULADOR_SMS';
	},

	// ────────── Face 4 · TFD / Gestão Logística ──────────
	/**
	 * Operar a frota do TFD: criar viagens, alocar passageiros, fechar
	 * embarques, marcar viagem como concluída/cancelada, gerar relatórios.
	 * REGULADOR_TFD **não** entra aqui — ele só cadastra solicitações.
	 */
	podeGerenciarTFD(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'GESTOR_TFD' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		);
	},
	/**
	 * REGULADOR_TFD "puro" — atendente que apenas cadastra passageiros
	 * e acompanha sua produção. Não aprova, não aloca, não conduz frota.
	 */
	ehReguladorTfdSimples(role: Role | undefined): boolean {
		return role === 'REGULADOR_TFD';
	},
	/**
	 * Pode criar usuários do TFD (REGULADOR_TFD subordinados).
	 * GESTOR_TFD entra aqui — escalonamento permitido pra cadastrar
	 * sua equipe sem precisar acionar o admin da Prefeitura.
	 */
	podeCadastrarUsuarioTFD(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'GESTOR_TFD' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		);
	},

	// ────────── Administração ──────────
	podeCriarUsuario(role: Role | undefined): boolean {
		return role === 'DESENVOLVEDOR' || role === 'ADMIN';
	},
	podeCriarUbs(role: Role | undefined): boolean {
		return role === 'DESENVOLVEDOR' || role === 'ADMIN';
	},
	podeCriarPrefeitura(role: Role | undefined): boolean {
		return role === 'DESENVOLVEDOR';
	},
	/**
	 * Pode editar/excluir/desativar recursos administráveis transversalmente
	 * (usuários, UBSs, prefeituras). DESENVOLVEDOR tem acesso global;
	 * ADMIN opera dentro do escopo da prefeitura (o backend injeta o filtro).
	 */
	podeAdministrarRecursos(role: Role | undefined): boolean {
		return role === 'DESENVOLVEDOR' || role === 'ADMIN';
	},

	// ────────── Acesso por Face (segurança / isolation) ──────────
	/**
	 * Face 1 · UBS → terminal de ingestão.
	 * Permitido apenas para roles da atenção básica e DEV técnico.
	 */
	podeAcessarFace1UBS(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'ATENDENTE_UBS' ||
			role === 'COORDENADOR_UBS' ||
			role === 'MEDICO' ||
			role === 'DESENVOLVEDOR'
		);
	},
	/**
	 * Face 2 · SMS → centro de comando da Secretaria.
	 * Permitido para regulador, admin da prefeitura e DEV.
	 */
	podeAcessarFace2SMS(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'REGULADOR_SMS' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		);
	},
	/**
	 * Face 4 · TFD → centro de comando logístico (frota, embarques, custos).
	 * Permitido para gestor TFD, regulador TFD, admin da prefeitura e DEV.
	 */
	podeAcessarFace4TFD(role: Role | undefined): boolean {
		if (!role) return false;
		return (
			role === 'GESTOR_TFD' ||
			role === 'REGULADOR_TFD' ||
			role === 'ATENDENTE_TFD' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		);
	},
	/**
	 * Face padrão pra onde redirecionar logo após o login.
	 * Usuários com unidade/tipoUnidade CEO → /ceo.
	 * Usuários com unidade/tipoUnidade CEM → /cem.
	 * Atendente/coordenador UBS → /ubs.
	 * Gestor TFD → /tfd.
	 * Regulador/Admin/DEV sem unidade específica → /sms.
	 */
	faceDestinoPadrao(
		role: Role | undefined,
		me?: MeResponse | null
	): string {
		if (!role) return '/login';

		const tipoUnidade = me?.tipoUnidade?.toUpperCase();
		const nomeUnidade = me?.unidade?.toUpperCase() || '';
		const cargo = me?.cargo?.toUpperCase() || '';
		const ehCeo = tipoUnidade === 'CEO' || nomeUnidade.includes('CEO') || nomeUnidade.includes('ODONTOL') || cargo.includes('CEO') || cargo.includes('DENTIST');
		const ehCem = tipoUnidade === 'CEM' || (nomeUnidade.includes('CEM') && !nomeUnidade.includes('CEO')) || cargo.includes('CEM');

		if (ehCeo) {
			if (role === 'MEDICO' || role === 'MEDICO_ESPECIALISTA') return '/ceo/medico/agenda';
			if (role === 'ENFERMEIRO') return '/ceo/enfermagem/triagem';
			if (role === 'ATENDENTE_CENTRO') return '/ceo/recepcao/fila';
			return '/ceo/gestao/dashboard';
		}

		if (ehCem) {
			if (role === 'MEDICO' || role === 'MEDICO_ESPECIALISTA') return '/cem/medico/agenda';
			if (role === 'ENFERMEIRO') return '/cem/enfermagem/triagem';
			if (role === 'ATENDENTE_CENTRO') return '/cem/recepcao/fila';
			return '/cem/gestao/dashboard';
		}

		if (role === 'ENFERMEIRO') return '/cem/enfermagem/triagem';
		if (role === 'MEDICO_ESPECIALISTA') return '/centro/medico/agenda';
		if (role === 'ATENDENTE_CENTRO') return '/centro/recepcao/fila';
		if (role === 'MEDICO') return '/ubs/dashboard';
		if (role === 'ATENDENTE_UBS' || role === 'COORDENADOR_UBS') return '/ubs/dashboard';
		if (role === 'GESTOR_TFD' || role === 'REGULADOR_TFD' || role === 'ATENDENTE_TFD') return '/tfd/dashboard';
		if (role === 'MOTORISTA_TFD') return '/tfd/viagens';
		if (role === 'REGULADOR_SMS' || role === 'ADMIN') return '/sms/dashboard';
		if (role === 'DESENVOLVEDOR') return '/sms/dashboard';
		return '/login';
	}
};
