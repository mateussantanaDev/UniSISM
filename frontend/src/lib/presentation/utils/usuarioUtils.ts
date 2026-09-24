import type { Role } from '$lib/api/types';

export interface UsuarioFormatavel {
	role?: Role | string | null;
	tipoUnidade?: string | null;
	cargo?: string | null;
	funcao?: string | null;
}

/**
 * Retorna o título/cargo profissional contextualizado de acordo com o papel e o tipo de unidade (CEO, CEM, UBS, SMS, TFD).
 * Evita que usuários de Centros (ex: Coordenador do CEO) apareçam como "Coordenador UBS" na Secretaria de Saúde.
 */
export function formatarCargoPerfil(
	u: UsuarioFormatavel | null | undefined,
	faceContext?: string | null
): string {
	if (!u) return '—';
	const role = String(u.role || '').toUpperCase();
	const cargo = String(u.cargo || '').trim();
	const cargoUpper = cargo.toUpperCase();
	const funcaoUpper = String(u.funcao || '').toUpperCase();

	let tipo = String(faceContext || u.tipoUnidade || '').toUpperCase();

	// Se o contexto ou tipo é SMS, forçar a titulação funcional da Secretaria de Saúde
	if (tipo === 'SMS' || faceContext?.toUpperCase() === 'SMS') {
		if (cargoUpper.includes('REGULADOR') || role === 'REGULADOR_SMS') {
			return 'Regulador(a) da SMS';
		}
		if (cargoUpper.includes('COORDENADOR') || role === 'COORDENADOR_UBS') {
			return 'Coordenador(a) da SMS';
		}
		if (cargoUpper.includes('DIRETOR') || cargoUpper.includes('GESTOR') || role === 'ADMIN') {
			return 'Diretor(a) / Gestor(a) da SMS';
		}
		if (cargoUpper.includes('ATENDENTE') || role === 'ATENDENTE_CENTRO' || role === 'ATENDENTE_UBS') {
			return 'Atendente / Recepção da SMS';
		}
		if (cargoUpper.includes('ENFERMEIRO') || role === 'ENFERMEIRO') {
			return 'Enfermeiro(a) / Regulação';
		}
		if (cargoUpper.includes('MÉDICO') || cargoUpper.includes('MEDICO') || role === 'MEDICO') {
			return 'Médico(a) Regulador(a)';
		}
		return 'Regulador(a) da SMS';
	}

	if (!tipo || tipo === 'NULL' || tipo === 'UNDEFINED') {
		if (
			cargoUpper.includes('CEO') ||
			cargoUpper.includes('DENTIST') ||
			cargoUpper.includes('ODONTOL') ||
			funcaoUpper.includes('CEO') ||
			funcaoUpper.includes('ODONTOL')
		) {
			tipo = 'CEO';
		} else if (
			cargoUpper.includes('CEM') ||
			funcaoUpper.includes('CEM') ||
			funcaoUpper.includes('ESPECIALIDADES MÉDICAS')
		) {
			tipo = 'CEM';
		}
	}

	// Se o cargo foi definido explicitamente e não é um placeholder legado ou incompatível com a face atual
	if (cargo && !cargoUpper.includes('ATENDENTE DE REGULAÇÃO')) {
		if (tipo === 'SMS' && (cargoUpper.includes('CEO') || cargoUpper.includes('CEM'))) {
			// Ignora o cargo legado antigo do banco incompatível com a face SMS
		} else if (tipo === 'CEO' && cargoUpper.includes('CEM')) {
			// Ignora o cargo CEM incompatível com CEO
		} else if (tipo === 'CEM' && cargoUpper.includes('CEO')) {
			// Ignora o cargo CEO incompatível com CEM
		} else {
			if (tipo === 'CEO') {
				if (
					cargoUpper.includes('COORDENADOR') &&
					(cargoUpper.includes('UBS') || !cargoUpper.includes('CEO'))
				) {
					return 'Coordenador(a) do CEO';
				}
				if (
					cargoUpper.includes('REGULADOR') &&
					(cargoUpper.includes('SMS') || cargoUpper.includes('UBS') || !cargoUpper.includes('CEO'))
				) {
					return 'Regulador(a) do CEO';
				}
			}
			if (tipo === 'CEM') {
				if (
					cargoUpper.includes('COORDENADOR') &&
					(cargoUpper.includes('UBS') || !cargoUpper.includes('CEM'))
				) {
					return 'Coordenador(a) do CEM';
				}
				if (
					cargoUpper.includes('REGULADOR') &&
					(cargoUpper.includes('SMS') || cargoUpper.includes('UBS') || !cargoUpper.includes('CEM'))
				) {
					return 'Regulador(a) do CEM';
				}
			}
			return cargo;
		}
	}

	if (tipo === 'SMS') {
		switch (role) {
			case 'COORDENADOR_UBS':
				return 'Coordenador(a) da SMS';
			case 'ADMIN':
				return 'Diretor(a) / Gestor(a) da SMS';
			case 'MEDICO':
				return 'Médico(a) Regulador(a)';
			case 'MEDICO_ESPECIALISTA':
				return 'Médico(a) Especialista da SMS';
			case 'ATENDENTE_CENTRO':
			case 'ATENDENTE_UBS':
				return 'Atendente / Recepção da SMS';
			case 'ENFERMEIRO':
				return 'Enfermeiro(a) / Regulação';
			case 'REGULADOR_SMS':
				return 'Regulador(a) da SMS';
		}
	}

	if (tipo === 'CEO') {
		switch (role) {
			case 'COORDENADOR_UBS':
				return 'Coordenador(a) do CEO';
			case 'ADMIN':
				return 'Diretor(a) / Gestor Geral do CEO';
			case 'MEDICO':
				return 'Cirurgião-Dentista Especialista';
			case 'MEDICO_ESPECIALISTA':
				return 'Cirurgião-Dentista Plantonista';
			case 'ATENDENTE_CENTRO':
			case 'ATENDENTE_UBS':
				return 'Atendente / Recepção CEO';
			case 'ENFERMEIRO':
				return 'Enfermeiro(a) do CEO';
			case 'REGULADOR_SMS':
				return 'Regulador(a) do CEO';
		}
	}

	if (tipo === 'CEM') {
		switch (role) {
			case 'COORDENADOR_UBS':
				return 'Coordenador(a) do CEM';
			case 'ADMIN':
				return 'Diretor(a) / Gestor Geral do CEM';
			case 'MEDICO':
				return 'Médico(a) Especialista CEM';
			case 'MEDICO_ESPECIALISTA':
				return 'Médico(a) Plantonista CEM';
			case 'ATENDENTE_CENTRO':
			case 'ATENDENTE_UBS':
				return 'Atendente / Recepção CEM';
			case 'ENFERMEIRO':
				return 'Enfermeiro(a) de Triagem CEM';
			case 'REGULADOR_SMS':
				return 'Regulador(a) do CEM';
		}
	}

	if (tipo === 'UBS') {
		switch (role) {
			case 'COORDENADOR_UBS':
				return 'Coordenador(a) de UBS';
			case 'ATENDENTE_UBS':
				return 'Atendente de UBS';
			case 'ENFERMEIRO':
				return 'Enfermeiro(a) de UBS';
			case 'MEDICO':
				return 'Médico(a) de Família / UBS';
		}
	}

	if (tipo === 'TFD') {
		switch (role) {
			case 'GESTOR_TFD':
				return 'Gestor(a) do TFD';
			case 'REGULADOR_TFD':
				return 'Regulador(a) do TFD';
			case 'ATENDENTE_TFD':
				return 'Atendente do TFD';
			case 'MOTORISTA_TFD':
				return 'Motorista TFD';
		}
	}

	switch (role) {
		case 'COORDENADOR_UBS':
			return 'Coordenador(a) de UBS';
		case 'ATENDENTE_UBS':
			return 'Atendente de UBS';
		case 'ATENDENTE_CENTRO':
			return 'Atendente de Recepção';
		case 'ENFERMEIRO':
			return 'Enfermeiro(a) / Triagem';
		case 'MEDICO':
			return 'Médico(a) Clínico';
		case 'MEDICO_ESPECIALISTA':
			return 'Médico(a) Especialista';
		case 'REGULADOR_SMS':
			return 'Regulador(a) SMS';
		case 'ADMIN':
			return 'Administrador(a) Geral';
		case 'DESENVOLVEDOR':
			return 'Desenvolvedor(a) / TI';
		case 'GESTOR_TFD':
			return 'Gestor(a) do TFD';
		case 'REGULADOR_TFD':
			return 'Regulador(a) do TFD';
		case 'ATENDENTE_TFD':
			return 'Atendente do TFD';
		case 'MOTORISTA_TFD':
			return 'Motorista TFD';
		default:
			return role || 'Profissional';
	}
}

/**
 * Retorna o rótulo da unidade de vinculação (ex: CEO, CEM, UBS ou SMS)
 */
export function formatarVinculoUsuario(u: {
	tipoUnidade?: string | null;
	ubs?: { nome: string } | null;
	prefeitura?: { nome: string } | null;
}): string {
	const tipo = String(u.tipoUnidade || '').toUpperCase();
	const prefNome = u.prefeitura?.nome ? ` (${u.prefeitura.nome})` : '';

	if (tipo === 'CEO') return `CEO — Centro Odontológico${prefNome}`;
	if (tipo === 'CEM') return `CEM — Centro Médico${prefNome}`;
	if (tipo === 'TFD') return `TFD — Logística & Viagens${prefNome}`;
	if (tipo === 'SMS') return `SMS — Secretaria de Saúde${prefNome}`;
	if (u.ubs?.nome) return `UBS · ${u.ubs.nome}`;
	if (u.prefeitura?.nome) return `Prefeitura · ${u.prefeitura.nome}`;
	return 'Escopo Global';
}
