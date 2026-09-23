import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { ApiClient, ApiError } from './client';

const VPS_BASE = 'http://184.107.179.209:3333/v1';
const DEFAULT_KEY = 'unisism-frontend-2026-4f2b8d9e';

function getBaseUrl(): string {
	if (import.meta.env.VITE_API_BASE_URL) {
		return import.meta.env.VITE_API_BASE_URL;
	}
	if (
		browser &&
		location.protocol === 'https:' &&
		!location.hostname.includes('localhost') &&
		!location.hostname.includes('127.0.0.1')
	) {
		return '/api-proxy';
	}
	return VPS_BASE;
}

const baseUrl = getBaseUrl();
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
export type { AnexoUpload, IntegracoesAdminResponse } from './client';
