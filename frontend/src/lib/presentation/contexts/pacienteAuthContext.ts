import { getContext, setContext } from 'svelte';
import type { PacienteMeResponse } from '$lib/api/types';

export interface PacienteAuthContext {
	readonly me: PacienteMeResponse | null;
	readonly carregando: boolean;
	logout: () => Promise<void>;
	refresh: () => Promise<void>;
}

const KEY = Symbol('paciente-auth-ctx');

export function setPacienteAuthContext(ctx: PacienteAuthContext) {
	setContext(KEY, ctx);
}

export function usePacienteAuth(): PacienteAuthContext {
	const ctx = getContext<PacienteAuthContext>(KEY);
	if (!ctx) throw new Error('usePacienteAuth deve ser chamado dentro de /paciente');
	return ctx;
}
