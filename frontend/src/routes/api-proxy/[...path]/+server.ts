import type { RequestHandler } from './$types';

const VPS_API_BASE = 'http://184.107.179.209:3333/v1';

async function handleProxy({ request, params, url }: any) {
	const path = params.path || '';
	const targetUrl = `${VPS_API_BASE}/${path}${url.search}`;

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
		const response = await fetch(targetUrl, init);
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
}

export const GET: RequestHandler = handleProxy;
export const POST: RequestHandler = handleProxy;
export const PUT: RequestHandler = handleProxy;
export const PATCH: RequestHandler = handleProxy;
export const DELETE: RequestHandler = handleProxy;
export const OPTIONS: RequestHandler = handleProxy;
export const HEAD: RequestHandler = handleProxy;
export const fallback: RequestHandler = handleProxy;
