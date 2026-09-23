import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, type TokenStorage } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText,
		headers: {
			'content-type': 'application/json',
			...(init.headers as Record<string, string> | undefined)
		}
	});
}

function textResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: init.status ?? 200,
		statusText: init.statusText,
		headers: init.headers
	});
}

function createStorage(initial: string | null = null): TokenStorage & { value(): string | null } {
	let token = initial;
	return {
		get: () => token,
		set: (next) => {
			token = next;
		},
		value: () => token
	};
}

function stubFetch(response: Response) {
	const fetchMock = vi.fn().mockResolvedValue(response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function lastFetchCall(fetchMock: ReturnType<typeof stubFetch>): [string, RequestInit] {
	return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

describe('ApiClient contrato HTTP', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('anexa bearer token e x-api-key trimada em requests autenticados', async () => {
		const fetchMock = stubFetch(jsonResponse({ ok: true }));
		const storage = createStorage('jwt-token-xyz');
		const client = new ApiClient('https://api.unisism.test/v1/', storage, '  api-key-prod  ');

		await client.get('/health');

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(url).toBe('https://api.unisism.test/v1/health');
		expect(headers.Accept).toBe('application/json');
		expect(headers.Authorization).toBe('Bearer jwt-token-xyz');
		expect(headers['x-api-key']).toBe('api-key-prod');
	});

	it('omite api key vazia e ignora filtros nulos, indefinidos ou vazios na query', async () => {
		const fetchMock = stubFetch(jsonResponse([]));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage(), '   ');

		await client.get('/pacientes', {
			q: 'maria silva',
			cpf: '',
			ativo: false,
			pagina: 0,
			desde: undefined,
			ate: null
		});

		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(url).toBe('https://api.unisism.test/v1/pacientes?q=maria+silva&ativo=false&pagina=0');
		expect(headers['x-api-key']).toBeUndefined();
	});

	it('envia POST JSON com idempotency key sem perder headers comuns', async () => {
		const fetchMock = stubFetch(jsonResponse({ id: 'rel-1' }));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage('jwt-token'));

		await client.post(
			'/relatorios',
			{ tipo: 'PACIENTES', formato: 'PDF' },
			{ idempotencyKey: 'idem-1' }
		);

		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(url).toBe('https://api.unisism.test/v1/relatorios');
		expect(init.method).toBe('POST');
		expect(headers.Accept).toBe('application/json');
		expect(headers.Authorization).toBe('Bearer jwt-token');
		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['X-Idempotency-Key']).toBe('idem-1');
		expect(init.body).toBe(JSON.stringify({ tipo: 'PACIENTES', formato: 'PDF' }));
	});

	it('salva o token retornado no login e limpa token mesmo quando logout falha', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: 'jwt-novo', refreshToken: 'refresh-1' }))
			.mockResolvedValueOnce(
				jsonResponse(
					{ error: { code: 'TOKEN_EXPIRADO', message: 'Sessao expirada' } },
					{ status: 401 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		const storage = createStorage('jwt-antigo');
		const client = new ApiClient('https://api.unisism.test/v1', storage);

		await client.auth.login({ login: 'SMS-047291', senha: 'senha-segura' });
		await expect(client.auth.logout('refresh-1')).rejects.toMatchObject({
			status: 401,
			code: 'TOKEN_EXPIRADO'
		});

		expect(storage.value()).toBeNull();
	});

	it('dispara callback de 401 com code do backend e preserva ApiError tipado', async () => {
		const fetchMock = stubFetch(
			jsonResponse(
				{
					error: {
						code: 'TOKEN_EXPIRADO',
						message: 'Sessao expirada',
						details: { reason: 'expired' }
					}
				},
				{ status: 401 }
			)
		);
		const onUnauthorized = vi.fn();
		const client = new ApiClient('https://api.unisism.test/v1', createStorage());
		client.setOnUnauthorized(onUnauthorized);

		await expect(client.auth.me()).rejects.toMatchObject({
			status: 401,
			code: 'TOKEN_EXPIRADO',
			details: { reason: 'expired' }
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(onUnauthorized).toHaveBeenCalledWith('TOKEN_EXPIRADO');
	});

	it('transforma erro nao JSON em ERRO_INTERNO sem tentar parsear texto', async () => {
		stubFetch(textResponse('gateway down', { status: 502, statusText: 'Bad Gateway' }));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage());

		await expect(client.get('/dashboard/metrics')).rejects.toMatchObject({
			status: 502,
			code: 'ERRO_INTERNO',
			message: 'Bad Gateway'
		});
	});

	it('baixa blobs extraindo filename do Content-Disposition e codificando id', async () => {
		const fetchMock = stubFetch(
			new Response(new Blob(['pdf']), {
				status: 200,
				headers: {
					'content-disposition': 'attachment; filename="relatorio-final.pdf"'
				}
			})
		);
		const client = new ApiClient('https://api.unisism.test/v1', createStorage('jwt-token'));

		const result = await client.relatorios.download('rel/1');

		const [url] = lastFetchCall(fetchMock);
		expect(url).toBe('https://api.unisism.test/v1/relatorios/rel%2F1/download');
		expect(result.filename).toBe('relatorio-final.pdf');
		expect(result.blob.size).toBe(3);
	});

	it('mantem ApiError como classe publica para fluxos de UI distinguirem falhas da API', () => {
		const error = new ApiError(422, {
			error: { code: 'PAYLOAD_INVALIDO', message: 'Dados invalidos' }
		});

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({
			status: 422,
			code: 'PAYLOAD_INVALIDO',
			message: 'Dados invalidos'
		});
	});
});
