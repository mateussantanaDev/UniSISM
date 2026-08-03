import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { ApiClient, ApiError } from './client';

const DEFAULT_BASE = 'http://localhost:3333/v1';
const DEFAULT_KEY = 'unisism-frontend-2026-4f2b8d9e';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE;
const apiKey = import.meta.env.VITE_API_KEY ?? DEFAULT_KEY;

/** Cliente HTTP singleton. */
export const api = new ApiClient(baseUrl, undefined, apiKey);

/** Códigos de erro que indicam sessão expirada/ausente — disparam redirect ao /login. */
const SESSION_EXPIRED_CODES = new Set([
	'TOKEN_EXPIRADO',
	'TOKEN_AUSENTE',
	'NAO_AUTENTICADO',
	'SESSAO_INDETERMINADA'
]);

if (browser) {
	api.setOnUnauthorized((code) => {
		if (!SESSION_EXPIRED_CODES.has(code)) return;
		api.tokens.set(null);
		if (!location.pathname.startsWith('/login')) {
			goto('/login', { replaceState: true });
		}
	});
}

export { ApiError };
export type { AnexoUpload } from './client';
