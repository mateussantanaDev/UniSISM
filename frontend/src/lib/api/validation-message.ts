const labels: Record<string, string> = {
	cpf: 'CPF', email: 'E-mail', senha: 'Senha', nome: 'Nome', telefone: 'Telefone',
	dataNascimento: 'Data de nascimento', ubsId: 'UBS de origem', prefeituraId: 'Prefeitura',
	role: 'Perfil', tipoUnidade: 'Tipo de unidade', cargo: 'Cargo', endereco: 'Endereço',
	bairro: 'Bairro', codigoSigtap: 'Código SIGTAP', tempoPadraoMinutos: 'Duração',
	valorTabelaBrl: 'Valor', dataAgendada: 'Data do agendamento', horaAgendada: 'Horário',
	medicoId: 'Profissional', especialidade: 'Especialidade', consultorio: 'Consultório'
};

/** Describe validation failures without exposing submitted values or server internals. */
export function validationMessage(details: Record<string, unknown> | undefined): string | undefined {
	if (!Array.isArray(details?.issues)) return undefined;
	const messages = details.issues.flatMap((raw) => {
		if (!raw || typeof raw !== 'object') return [];
		const issue = raw as Record<string, unknown>;
		const path = Array.isArray(issue.path) ? issue.path.map(String) : [];
		const field = path.at(-1) || '';
		const label = labels[field] || field.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Formulário';
		let reason = 'confira o valor informado.';
		if (issue.code === 'invalid_type' && issue.received === 'undefined') reason = 'preencha este campo.';
		else if (issue.code === 'invalid_string' && issue.validation === 'email') reason = 'informe um endereço de e-mail válido.';
		else if (issue.code === 'too_small' && typeof issue.minimum === 'number') {
			reason = issue.type === 'string' ? `informe ao menos ${issue.minimum} caracteres.` : `informe um valor ${issue.inclusive ? 'maior ou igual a' : 'maior que'} ${issue.minimum}.`;
		} else if (issue.code === 'too_big' && typeof issue.maximum === 'number') {
			reason = issue.type === 'string' ? `use no máximo ${issue.maximum} caracteres.` : `informe um valor ${issue.inclusive ? 'menor ou igual a' : 'menor que'} ${issue.maximum}.`;
		} else if (issue.code === 'invalid_enum_value') reason = 'selecione uma opção válida.';
		else if (issue.code === 'custom' && typeof issue.message === 'string') reason = issue.message;
		return [`${label}: ${reason}`];
	});
	return messages.length ? [...new Set(messages)].join(' ') : undefined;
}
