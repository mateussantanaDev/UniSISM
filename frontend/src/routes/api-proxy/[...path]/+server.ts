import type { RequestHandler } from './$types';

const VPS_API_BASE = 'http://184.107.179.209:3333/v1';

export const fallback: RequestHandler = async ({ request, params, url }) => {
	const path = params.path || '';
	const targetUrl = new URL(`${VPS_API_BASE}/${path}${url.search}`);

	const headers = new Headers(request.headers);
	headers.delete('host');
	headers.delete('connection');

	const init: RequestInit = {
		method: request.method,
		headers
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = await request.arrayBuffer();
	}

	try {
		const response = await fetch(targetUrl.toString(), init);
		return response;
	} catch (err: any) {
		return new Response(
			JSON.stringify({
				error: {
					code: 'VPS_UNREACHABLE',
					message: err?.message || 'Falha ao conectar com o backend da VPS'
				}
			}),
			{
				status: 502,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			}
		);
	}
};
