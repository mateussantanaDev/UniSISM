import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type TokenStorage } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			'content-type': 'application/json',
			...(init.headers as Record<string, string> | undefined)
		}
	});
}

function createStorage(initial: string | null = 'jwt-token'): TokenStorage {
	return {
		get: () => initial,
		set: (next) => {
			initial = next;
		}
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

function stubLocalStorage() {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			store.delete(key);
		})
	});
	return store;
}

describe('ApiClient rotas reais TFD, Centro e Paciente App', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('monta aporte de saldo TFD com body contabil e idempotency key', async () => {
		const fetchMock = stubFetch(jsonResponse([]));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage());

		await client.tfd.saldo.aportar(
			{
				veiculoId: 'veiculo-1',
				mes: '2026-09',
				valorBRL: 1500,
				fonte: 'EMPENHO',
				numeroDocumento: 'EMP-2026-001',
				justificativa: 'aporte mensal aprovado'
			},
			{ idempotencyKey: 'saldo-2026-09-veiculo-1' }
		);

		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(url).toBe('https://api.unisism.test/v1/tfd/saldo/aportar');
		expect(init.method).toBe('POST');
		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['X-Idempotency-Key']).toBe('saldo-2026-09-veiculo-1');
		expect(JSON.parse(init.body as string)).toMatchObject({
			veiculoId: 'veiculo-1',
			mes: '2026-09',
			valorBRL: 1500,
			fonte: 'EMPENHO'
		});
	});

	it('envia comprovante de abastecimento como multipart sem Content-Type manual', async () => {
		const fetchMock = stubFetch(jsonResponse({ id: 'abast-1' }));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage(), 'api-key');

		await client.tfd.abastecimentos.registrarComprovante(
			'abast/1',
			{
				file: new File(['comprovante'], 'cupom.pdf', { type: 'application/pdf' }),
				litros: 40,
				valorPorLitro: 6.25,
				valorTotal: 250,
				hodometroKm: 10200
			},
			{ idempotencyKey: 'comprovante-abast-1' }
		);

		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(url).toBe('https://api.unisism.test/v1/tfd/abastecimentos/abast%2F1/comprovante');
		expect(init.method).toBe('POST');
		expect(headers['Content-Type']).toBeUndefined();
		expect(headers['x-api-key']).toBe('api-key');
		expect(headers['X-Idempotency-Key']).toBe('comprovante-abast-1');
		expect(init.body).toBeInstanceOf(FormData);
	});

	it('codifica IDs em acoes de ajuda de custo e preserva motivo no payload', async () => {
		const fetchMock = stubFetch(jsonResponse({ id: 'ajuda-1' }));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage());

		await client.tfd.ajudasCusto.negar('ajuda/1', 'documentacao incompleta');

		const [url, init] = lastFetchCall(fetchMock);
		expect(url).toBe('https://api.unisism.test/v1/tfd/ajudas-custo/ajuda%2F1/negar');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({ motivo: 'documentacao incompleta' });
	});

	it('sanitiza CPF na busca de paciente do Centro antes de chamar a API', async () => {
		const fetchMock = stubFetch(jsonResponse({ existe: false }));
		const client = new ApiClient('https://api.unisism.test/v1', createStorage());

		await client.centroRecepcao.buscarPacientePorCpf('123.456.789-10');

		const [url] = lastFetchCall(fetchMock);
		expect(url).toBe('https://api.unisism.test/v1/centro/recepcao/pacientes/por-cpf/12345678910');
	});

	it('usa token separado do paciente app e preserva api key nas notificacoes', async () => {
		const store = stubLocalStorage();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: 'pac-token', paciente: { id: 'pac-1' } }))
			.mockResolvedValueOnce(jsonResponse([]));
		vi.stubGlobal('fetch', fetchMock);
		const client = new ApiClient('https://api.unisism.test/v1', createStorage(), 'api-key');

		await client.pacienteApp.login({ cpf: '12345678910', senha: '12345678910' });
		await client.pacienteApp.notificacoes(true);

		const [url, init] = lastFetchCall(fetchMock);
		const headers = init.headers as Record<string, string>;
		expect(store.get('unisism_paciente_token')).toBe('pac-token');
		expect(url).toBe('https://api.unisism.test/v1/paciente-app/notificacoes?apenasNaoLidas=true');
		expect(headers.Authorization).toBe('Bearer pac-token');
		expect(headers['x-api-key']).toBe('api-key');
	});
});
