/**
 * Tradução pt-BR dos códigos de erro relevantes para o **modo simplificado
 * da Face 2 (REGULADOR_SMS)**.
 *
 * Catálogo extraído de `backend/docs/SMS_SIMPLES_BACKEND.md` v0.9.1 §9.
 *
 * Sempre traduz pelo `code` (estável); quando o código não estiver
 * listado, cai pra `e.message` do backend.
 */

import { ApiError } from './client';

export const ERROS_SMS_SIMPLES: Record<string, string> = {
	// 4xx · validação
	PAYLOAD_INVALIDO: 'Dados inválidos. Verifique os campos.',
	PARAMS_INCOMPATIVEIS: 'Combinação de filtros inválida (ex.: mês sem ano, ano sem UBS).',

	// 401 / 403 · auth
	TOKEN_AUSENTE: 'Sessão expirada. Faça login novamente.',
	TOKEN_EXPIRADO: 'Sessão expirada. Faça login novamente.',
	NAO_AUTENTICADO: 'Sessão inválida. Faça login novamente.',
	PERMISSAO_INSUFICIENTE: 'Sua função não tem permissão para este recurso.',

	// 404 · recursos
	ENCAMINHAMENTO_NAO_ENCONTRADO: 'Encaminhamento não encontrado (ou pertence a outra prefeitura).',
	UBS_NAO_ENCONTRADA: 'UBS não encontrada.',
	ANEXO_NAO_ENCONTRADO: 'Anexo não encontrado (ou pertence a outra prefeitura).',

	// 409 · scan
	ANEXO_NAO_LIBERADO: 'Anexo em verificação de antivírus. Tente novamente em instantes.',

	// 500
	ERRO_INTERNO: 'Erro inesperado. Tente novamente.'
};

/** Resolve a mensagem amigável para um erro qualquer da API (modo simples). */
export function mensagemErroSms(e: unknown): string {
	if (e instanceof ApiError) {
		return ERROS_SMS_SIMPLES[e.code] ?? e.message ?? 'Falha ao executar operação.';
	}
	return 'Falha de conexão com o servidor.';
}
