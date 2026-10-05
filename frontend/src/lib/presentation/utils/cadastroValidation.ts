export function cpfValido(value: string): boolean {
	const cpf = value.replace(/[.\-\s]/g, '');
	if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
	for (let size = 9; size <= 10; size++) {
		let sum = 0;
		for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
		const digit = (sum * 10) % 11;
		if (Number(cpf[size]) !== (digit === 10 ? 0 : digit)) return false;
	}
	return true;
}

export function hojeRecife(): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function nascimentoValido(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= hojeRecife();
}
