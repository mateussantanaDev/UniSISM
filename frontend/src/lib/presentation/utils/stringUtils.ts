/**
 * Utilitários puros para manipulação e formatação segura de strings e datas no frontend.
 * Previne falhas de runtime (ex: undefined em splits, strings vazias, falhas de internacionalização).
 */

/**
 * Obtém as iniciais do nome com tratamento contra múltiplos espaços,
 * nomes únicos ou strings indefinidas/vazias.
 * Exemplo: "Maria Silva" -> "MS", "João" -> "JO", "  Carlos   Eduardo  " -> "CE", "" -> "U"
 */
export function obterIniciais(nome?: string | null): string {
	if (!nome || typeof nome !== 'string') return 'U';
	const partes = nome.trim().split(/\s+/).filter(Boolean);
	if (partes.length === 0) return 'U';
	if (partes.length === 1) {
		const palavra = partes[0];
		return (palavra.length >= 2 ? palavra.substring(0, 2) : palavra).toUpperCase();
	}
	const primeira = partes[0][0] || '';
	const segunda = partes[1][0] || '';
	return (primeira + segunda).toUpperCase();
}

/**
 * Divide uma data/hora formatada ou ISO em partes de data e hora com segurança,
 * garantindo que a hora nunca seja undefined.
 */
export function separarDataHora(dataHoraStr?: string | null): { data: string; hora: string } {
	if (!dataHoraStr || typeof dataHoraStr !== 'string') {
		return { data: '—', hora: '—' };
	}

	const limpo = dataHoraStr.trim();
	if (limpo.includes(' ')) {
		const [data, hora] = limpo.split(/\s+/);
		return { data: data || '—', hora: hora || '—' };
	}

	if (limpo.includes('T')) {
		const [data, horaComZ] = limpo.split('T');
		const hora = horaComZ ? horaComZ.substring(0, 5) : '—';
		return { data: data || '—', hora };
	}

	return { data: limpo, hora: '—' };
}

/**
 * Formata um valor numérico em MB/KB com tratamento de tipos seguros.
 */
export function formatarBytes(bytes?: number | null): string {
	if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 KB';
	if (bytes >= 1048576) {
		return `${(bytes / 1048576).toFixed(2)} MB`;
	}
	return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Calcula a idade exata em anos considerando o dia e mês de nascimento.
 */
export function calcularIdadeExata(dataNascimento?: string | null): number {
	if (!dataNascimento || typeof dataNascimento !== 'string') return 0;
	const d = new Date(dataNascimento);
	if (isNaN(d.getTime())) return 0;
	const hoje = new Date();
	let idade = hoje.getFullYear() - d.getFullYear();
	const m = hoje.getMonth() - d.getMonth();
	if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) {
		idade--;
	}
	return Math.max(0, idade);
}
