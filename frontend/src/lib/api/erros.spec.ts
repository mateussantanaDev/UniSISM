import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { mensagemErroSms } from './erros-sms';
import { mensagemErroTfd } from './erros-tfd';

describe('mensagens amigaveis de erro', () => {
	it('traduz codigos TFD conhecidos para mensagens estaveis da tela', () => {
		const error = new ApiError(409, {
			error: { code: 'MOTIVO_OBRIGATORIO', message: 'backend message' }
		});

		expect(mensagemErroTfd(error)).toBe('Motivo é obrigatório (mínimo 10 caracteres).');
	});

	it('mantem mensagem original quando TFD recebe codigo ainda nao catalogado', () => {
		const error = new ApiError(422, {
			error: { code: 'FORA_DO_ESCOPO', message: 'Mensagem nova do backend' }
		});

		expect(mensagemErroTfd(error)).toBe('Mensagem nova do backend');
	});

	it('usa fallback de conexao para erros TFD que nao vieram da API', () => {
		expect(mensagemErroTfd(new TypeError('fetch failed'))).toBe('Falha de conexão com o servidor.');
	});

	it('traduz codigos SMS conhecidos para o modo simplificado', () => {
		const error = new ApiError(409, {
			error: { code: 'ANEXO_NAO_LIBERADO', message: 'backend message' }
		});

		expect(mensagemErroSms(error)).toBe(
			'Anexo em verificação de antivírus. Tente novamente em instantes.'
		);
	});

	it('mantem mensagem original quando SMS recebe codigo ainda nao catalogado', () => {
		const error = new ApiError(404, {
			error: { code: 'FORA_DO_ESCOPO', message: 'Mensagem SMS nova' }
		});

		expect(mensagemErroSms(error)).toBe('Mensagem SMS nova');
	});
});
