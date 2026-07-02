/**
 * Geolocalização + reverse geocoding via OpenStreetMap Nominatim.
 * Usado apenas para exibir nome da prefeitura na tela de login
 * (antes do usuário autenticar e ter a prefeitura real via JWT).
 *
 * Uso típico:
 *   const loc = await detectarLocalizacao();
 *   if (loc) textoBranding = `PREFEITURA MUNICIPAL · ${loc.displayName}`;
 *
 * Sem dependências externas · sem chave de API · respeita LGPD:
 *   - lat/lng nunca enviados ao backend do UNISISM
 *   - somente à Nominatim (infraestrutura pública, Terms of Use OK)
 *   - resultado cacheado em sessionStorage pra evitar chamadas repetidas
 */

export interface LocationInfo {
	/** Nome do município (UPPER CASE). Ex.: "ÁGUAS BELAS". */
	municipio: string;
	/** Sigla do estado. Ex.: "PE". */
	uf: string;
	/** String pronta pra exibição. Ex.: "ÁGUAS BELAS / PE". */
	displayName: string;
}

const CACHE_KEY = 'unisism:location';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

const UF_POR_NOME: Record<string, string> = {
	Acre: 'AC',
	Alagoas: 'AL',
	Amapá: 'AP',
	Amazonas: 'AM',
	Bahia: 'BA',
	Ceará: 'CE',
	'Distrito Federal': 'DF',
	'Espírito Santo': 'ES',
	Goiás: 'GO',
	Maranhão: 'MA',
	'Mato Grosso': 'MT',
	'Mato Grosso do Sul': 'MS',
	'Minas Gerais': 'MG',
	Pará: 'PA',
	Paraíba: 'PB',
	Paraná: 'PR',
	Pernambuco: 'PE',
	Piauí: 'PI',
	'Rio de Janeiro': 'RJ',
	'Rio Grande do Norte': 'RN',
	'Rio Grande do Sul': 'RS',
	Rondônia: 'RO',
	Roraima: 'RR',
	'Santa Catarina': 'SC',
	'São Paulo': 'SP',
	Sergipe: 'SE',
	Tocantins: 'TO'
};

function siglaEstado(nome: string | undefined): string | null {
	if (!nome) return null;
	return UF_POR_NOME[nome] ?? null;
}

function lerCache(): LocationInfo | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LocationInfo & { ts: number };
		if (Date.now() - parsed.ts > CACHE_TTL_MS) {
			sessionStorage.removeItem(CACHE_KEY);
			return null;
		}
		return {
			municipio: parsed.municipio,
			uf: parsed.uf,
			displayName: parsed.displayName
		};
	} catch {
		return null;
	}
}

function gravarCache(loc: LocationInfo): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...loc, ts: Date.now() }));
	} catch {
		// Sem storage disponível — ignora silenciosamente.
	}
}

/** Pega a posição atual via browser API com timeout curto. */
function posicaoAtual(timeoutMs = 5000): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			reject(new Error('GEOLOCATION_INDISPONIVEL'));
			return;
		}
		navigator.geolocation.getCurrentPosition(resolve, reject, {
			timeout: timeoutMs,
			maximumAge: CACHE_TTL_MS,
			enableHighAccuracy: false
		});
	});
}

/** Reverse geocoding via Nominatim. */
async function reverseGeocode(
	lat: number,
	lon: number
): Promise<LocationInfo | null> {
	const url = new URL('https://nominatim.openstreetmap.org/reverse');
	url.searchParams.set('format', 'json');
	url.searchParams.set('lat', String(lat));
	url.searchParams.set('lon', String(lon));
	url.searchParams.set('zoom', '10');
	url.searchParams.set('addressdetails', '1');
	url.searchParams.set('accept-language', 'pt-BR');

	const res = await fetch(url.toString(), {
		headers: {
			Accept: 'application/json',
			// Nominatim exige User-Agent identificável.
			'User-Agent': 'UNISISM/1.0 (sistema institucional SUS municipal)'
		}
	});
	if (!res.ok) return null;
	const data = (await res.json()) as {
		address?: {
			city?: string;
			town?: string;
			municipality?: string;
			village?: string;
			state?: string;
		};
	};
	const addr = data.address ?? {};
	const municipio = addr.city ?? addr.town ?? addr.municipality ?? addr.village;
	const uf = siglaEstado(addr.state);
	if (!municipio || !uf) return null;

	const up = municipio.toUpperCase();
	return {
		municipio: up,
		uf,
		displayName: `${up} / ${uf}`
	};
}

/**
 * Detecta município + UF onde o browser está sendo usado.
 * Retorna `null` se o usuário negar permissão, o browser não suportar
 * geolocalização, ou o reverse geocoding falhar.
 */
export async function detectarLocalizacao(): Promise<LocationInfo | null> {
	const cached = lerCache();
	if (cached) return cached;

	try {
		const pos = await posicaoAtual();
		const loc = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
		if (loc) gravarCache(loc);
		return loc;
	} catch {
		return null;
	}
}
