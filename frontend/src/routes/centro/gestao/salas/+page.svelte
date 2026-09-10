<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import type {
		SalaConsultorioCentro,
		AlocacaoProfissionalSala,
		EspecialidadeSigtapCentro
	} from '$lib/api/types';
	import {
		IconAlertTriangle,
		IconCheck,
		IconInfoCircle,
		IconBuildingHospital,
		IconUser,
		IconDental,
		IconStethoscope,
		IconTools,
		IconPlus,
		IconTrash,
		IconEdit,
		IconCalendar,
		IconClock,
		IconUsers,
		IconX
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloUnidadeFisica = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório Médico');
	let rotuloUnidadeFisicaPlural = $derived(ehCeo ? 'Cadeiras Odontológicas' : 'Consultórios e Salas');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista' : 'Médico Especialista');

	const DIAS_SEMANA = [
		{ sigla: 'SEG', label: 'Segunda-feira' },
		{ sigla: 'TER', label: 'Terça-feira' },
		{ sigla: 'QUA', label: 'Quarta-feira' },
		{ sigla: 'QUI', label: 'Quinta-feira' },
		{ sigla: 'SEX', label: 'Sexta-feira' },
		{ sigla: 'SAB', label: 'Sábado' }
	];

	const DIAS_MAP: Record<number, string> = {
		0: 'DOM',
		1: 'SEG',
		2: 'TER',
		3: 'QUA',
		4: 'QUI',
		5: 'SEX',
		6: 'SAB'
	};
	const diaSemanaHoje = DIAS_MAP[new Date().getDay()] || 'SEG';

	// State
	let carregando = $state(true);
	let salvando = $state(false);
	let mensagemSucesso = $state('');
	let erro = $state('');

	let listaSalas = $state<SalaConsultorioCentro[]>([]);
	let especialidadesCatalogo = $state<EspecialidadeSigtapCentro[]>([]);
	let usuariosMedicos = $state<Array<{ id: string; nome: string; registro: string; cargo: string; role: string }>>([]);

	// Modal State
	let modalAberto = $state(false);
	let modoEdicao = $state(false);
	let salaEmEdicaoId = $state<string | null>(null);

	let formCodigo = $state('');
	let formNome = $state('');
	let formEspecialidade = $state('');
	let formAla = $state('Ala A — Térreo');
	let formEquipamentosTexto = $state('');
	let formStatus = $state<'DISPONIVEL' | 'EM_ATENDIMENTO' | 'MANUTENCAO' | 'RESERVADA'>('DISPONIVEL');
	let formProfissionais = $state<AlocacaoProfissionalSala[]>([]);

	// Mini-form para adicionar profissional na sala
	let profSelecionado = $state('');
	let profNomeManual = $state('');
	let profRegistro = $state('');
	let profEspecialidade = $state('');
	let profDias = $state<string[]>(['SEG', 'QUA']);
	let profHorario = $state('08:00 às 12:00');
	let erroAdicionarProf = $state('');
	let erroModalSala = $state('');

	const TAG_ESCALA = '__ESCALA_SALA__:';

	function parseSalaEquipamentos(equipamentosRaw: string[], medicoAlocado?: string, crm?: string, esp?: string) {
		const equipamentosFisicos: string[] = [];
		let alocados: AlocacaoProfissionalSala[] = [];

		for (const eq of equipamentosRaw || []) {
			if (typeof eq === 'string' && eq.startsWith(TAG_ESCALA)) {
				try {
					const parsed = JSON.parse(eq.slice(TAG_ESCALA.length));
					if (Array.isArray(parsed)) {
						alocados = parsed;
					}
				} catch (e) {
					console.warn('Erro ao decodificar escala da sala:', e);
				}
			} else {
				equipamentosFisicos.push(eq);
			}
		}

		if (alocados.length === 0 && medicoAlocado) {
			alocados.push({
				medicoNome: medicoAlocado,
				medicoRegistro: crm || '',
				especialidade: esp || '',
				diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
				horario: '08:00 às 12:00'
			});
		}

		return { equipamentosFisicos, alocados };
	}

	function serializarEquipamentos(equipamentosFisicos: string[], alocados: AlocacaoProfissionalSala[]): string[] {
		const filtrados = (equipamentosFisicos || []).filter(e => !e.startsWith(TAG_ESCALA));
		if (alocados && alocados.length > 0) {
			filtrados.push(`${TAG_ESCALA}${JSON.stringify(alocados)}`);
		}
		return filtrados;
	}

	async function carregarDados() {
		carregando = true;
		erro = '';
		try {
			const [resSalas, resEsp, resUsuarios, resEscalas] = await Promise.all([
				api.centroGestao.listSalas({ centro: siglaOrgao }).catch(() => []),
				api.centroGestao.listEspecialidades({ centro: siglaOrgao }).catch(() => []),
				api.admin.listUsuarios().catch(() => []),
				api.centroGestao.listEscalas({ centro: siglaOrgao }).catch(() => [])
			]);

			listaSalas = (Array.isArray(resSalas) ? resSalas : []).map(s => {
				const { equipamentosFisicos, alocados } = parseSalaEquipamentos(s.equipamentos, s.medicoAlocado, s.medicoCrm, s.especialidadePrincipal);
				return {
					...s,
					equipamentos: equipamentosFisicos,
					profissionaisAlocados: alocados
				};
			});

			especialidadesCatalogo = Array.isArray(resEsp) ? resEsp : [];

			// Filtrar médicos/dentistas cadastrados no centro
			const profsMap = new Map<string, { id: string; nome: string; registro: string; cargo: string; role: string }>();

			if (Array.isArray(resUsuarios)) {
				for (const u of resUsuarios) {
					const role = (u.role || '').toUpperCase();
					const cargo = ((u as any).cargo || '').toUpperCase();
					const eProfissional = ehCeo
						? (role.includes('DENTISTA') || cargo.includes('DENT') || cargo.includes('ODONTO') || u.tipoUnidade === 'CEO')
						: (role.includes('MEDICO') || cargo.includes('MED') || cargo.includes('CLINIC') || u.tipoUnidade === 'CEM');

					if (eProfissional && u.nome) {
						profsMap.set(u.nome, {
							id: u.id,
							nome: u.nome,
							registro: u.cpf ? `CRO/CRM-${u.cpf.slice(0, 4)}` : '',
							cargo: (u as any).cargo || (ehCeo ? 'Cirurgião-Dentista' : 'Médico Especialista'),
							role: u.role
						});
					}
				}
			}

			// Complementar com profissionais que já constam em escalas
			if (Array.isArray(resEscalas)) {
				for (const esc of resEscalas) {
					if (esc.medicoNome && !profsMap.has(esc.medicoNome)) {
						profsMap.set(esc.medicoNome, {
							id: esc.medicoId || 'esc-' + esc.id,
							nome: esc.medicoNome,
							registro: esc.crm || '',
							cargo: esc.especialidade || (ehCeo ? 'Cirurgião-Dentista' : 'Médico Especialista'),
							role: ehCeo ? 'DENTISTA' : 'MEDICO'
						});
					}
				}
			}

			usuariosMedicos = Array.from(profsMap.values());
		} catch (e: any) {
			console.info('[UniSISM] Falha ao carregar dados:', e);
			listaSalas = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarDados();
	});

	function abrirModalNovaSala() {
		modoEdicao = false;
		salaEmEdicaoId = null;
		formCodigo = `${ehCeo ? 'CAD' : 'CONS'}-${String(listaSalas.length + 1).padStart(2, '0')}`;
		formNome = `${rotuloUnidadeFisica} ${String(listaSalas.length + 1).padStart(2, '0')}`;
		formEspecialidade = especialidadesCatalogo.length > 0 ? especialidadesCatalogo[0].nome : (ehCeo ? 'Endodontia' : 'Clínica Médica');
		formAla = 'Ala A — Térreo';
		formEquipamentosTexto = ehCeo
			? 'Cadeira Odontológica Completa, Fotopolimerizador, Sugador Cirúrgico'
			: 'Maca Articulada, Esfigmomanômetro, Foco Clínico';
		formStatus = 'DISPONIVEL';
		formProfissionais = [];

		resetSubFormProfissional();
		erroModalSala = '';
		modalAberto = true;
	}

	function abrirModalEdicao(sala: SalaConsultorioCentro) {
		modoEdicao = true;
		salaEmEdicaoId = sala.id;
		formCodigo = sala.codigo;
		formNome = sala.nome;
		formEspecialidade = sala.especialidadePrincipal;
		formAla = sala.ala || 'Ala A — Térreo';
		formEquipamentosTexto = sala.equipamentos.join(', ');
		formStatus = sala.status;
		formProfissionais = JSON.parse(JSON.stringify(sala.profissionaisAlocados || []));

		resetSubFormProfissional();
		erroModalSala = '';
		modalAberto = true;
	}

	function resetSubFormProfissional() {
		profSelecionado = '';
		profNomeManual = '';
		profRegistro = '';
		profEspecialidade = formEspecialidade || '';
		profDias = ['SEG', 'QUA'];
		profHorario = '08:00 às 12:00';
		erroAdicionarProf = '';
	}

	function aoSelecionarUsuarioProfissional(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		profSelecionado = id;
		if (!id) return;

		const user = usuariosMedicos.find(u => u.id === id);
		if (user) {
			profNomeManual = user.nome;
			profRegistro = user.registro || '';
			if (!profEspecialidade && user.cargo) {
				profEspecialidade = user.cargo;
			}
		}
	}

	function toggleDiaSemana(sigla: string) {
		if (profDias.includes(sigla)) {
			profDias = profDias.filter(d => d !== sigla);
		} else {
			profDias = [...profDias, sigla];
		}
	}

	function adicionarProfissionalNaSala() {
		const nome = (profNomeManual || '').trim();
		if (!nome) {
			erroAdicionarProf = `Informe ou selecione o nome do ${rotuloProfissional.toLowerCase()}.`;
			return;
		}

		if (profDias.length === 0) {
			erroAdicionarProf = 'Selecione ao menos um dia da semana para o atendimento.';
			return;
		}

		erroAdicionarProf = '';

		const novo: AlocacaoProfissionalSala = {
			medicoId: profSelecionado || 'manual-' + Date.now(),
			medicoNome: nome,
			medicoRegistro: profRegistro.trim() || (ehCeo ? 'CRO-PE' : 'CRM-PE'),
			especialidade: (profEspecialidade || formEspecialidade || 'Atendimento Especializado').trim(),
			diasSemana: [...profDias],
			horario: profHorario.trim() || '08:00 às 12:00'
		};

		formProfissionais = [...formProfissionais, novo];
		resetSubFormProfissional();
	}

	function removerProfissionalDaSala(index: number) {
		formProfissionais = formProfissionais.filter((_, i) => i !== index);
	}

	async function salvarSala() {
		if (!formCodigo.trim() || !formNome.trim()) {
			erroModalSala = 'Preencha os campos obrigatórios (Código e Nome da Sala).';
			return;
		}

		// Validação estrita solicitada pelo usuário
		if (formProfissionais.length === 0) {
			erroModalSala = `É obrigatório alocar ao menos um ${rotuloProfissional.toLowerCase()} e definir seus dias de atendimento nesta sala/cadeira.`;
			return;
		}

		erroModalSala = '';
		salvando = true;

		const equipamentosFisicos = formEquipamentosTexto
			.split(',')
			.map(s => s.trim())
			.filter(Boolean);

		const equipamentosSerializados = serializarEquipamentos(equipamentosFisicos, formProfissionais);
		const primeiroProf = formProfissionais[0];

		try {
			if (modoEdicao && salaEmEdicaoId) {
				const payload: Partial<SalaConsultorioCentro> = {
					codigo: formCodigo.trim(),
					nome: formNome.trim(),
					especialidadePrincipal: formEspecialidade || primeiroProf?.especialidade || 'Geral',
					status: formStatus,
					equipamentos: equipamentosSerializados,
					ala: formAla.trim()
				};

				await api.centroGestao.atualizarSala(salaEmEdicaoId, payload);

				listaSalas = listaSalas.map(s => {
					if (s.id === salaEmEdicaoId) {
						return {
							...s,
							...payload,
							equipamentos: equipamentosFisicos,
							profissionaisAlocados: formProfissionais,
							medicoAlocado: primeiroProf?.medicoNome,
							medicoCrm: primeiroProf?.medicoRegistro
						};
					}
					return s;
				});

				mensagemSucesso = `✓ ${rotuloUnidadeFisica} ${formCodigo} atualizada com sucesso! (${formProfissionais.length} profissional(is) alocado(s))`;
			} else {
				const payload: Partial<SalaConsultorioCentro> = {
					codigo: formCodigo.trim(),
					nome: formNome.trim(),
					especialidadePrincipal: formEspecialidade || primeiroProf?.especialidade || 'Geral',
					status: formStatus,
					equipamentos: equipamentosSerializados,
					ala: formAla.trim()
				};

				const res = await api.centroGestao.criarSala(payload);

				const novaSala: SalaConsultorioCentro = {
					id: res.id || 'sala-' + Date.now(),
					codigo: formCodigo.trim(),
					nome: formNome.trim(),
					especialidadePrincipal: formEspecialidade || primeiroProf?.especialidade || 'Geral',
					status: formStatus,
					equipamentos: equipamentosFisicos,
					ala: formAla.trim(),
					profissionaisAlocados: formProfissionais,
					medicoAlocado: primeiroProf?.medicoNome,
					medicoCrm: primeiroProf?.medicoRegistro
				};

				listaSalas = [...listaSalas, novaSala];
				mensagemSucesso = `✓ ${rotuloUnidadeFisica} ${novaSala.codigo} cadastrada com sucesso! (${formProfissionais.length} profissional(is) alocado(s))`;
			}

			modalAberto = false;
			setTimeout(() => mensagemSucesso = '', 5000);
		} catch (e: any) {
			console.error('Erro ao salvar sala:', e);
			erroModalSala = e?.message || 'Erro ao comunicar com a API. Tente novamente.';
		} finally {
			salvando = false;
		}
	}

	async function alterarStatusSala(sala: SalaConsultorioCentro, novoStatus: SalaConsultorioCentro['status']) {
		sala.status = novoStatus;
		try {
			await api.centroGestao.atualizarSala(sala.id, { status: novoStatus });
		} catch (e) {
			console.info('[UniSISM] Atualizar sala salvo em transição.', e);
		}
		mensagemSucesso = `✓ Status da sala ${sala.codigo} alterado para ${novoStatus}.`;
		setTimeout(() => mensagemSucesso = '', 4000);
	}

	async function excluirSala(sala: SalaConsultorioCentro) {
		if (!confirm(`Tem certeza que deseja excluir o ${rotuloUnidadeFisica.toLowerCase()} ${sala.codigo} (${sala.nome})?`)) {
			return;
		}

		try {
			await api.centroGestao.deletarSala(sala.id);
			listaSalas = listaSalas.filter(s => s.id !== sala.id);
			mensagemSucesso = `✓ ${rotuloUnidadeFisica} ${sala.codigo} removida com sucesso.`;
			setTimeout(() => mensagemSucesso = '', 4000);
		} catch (e: any) {
			console.error('Erro ao excluir sala:', e);
			alert('Falha ao excluir sala: ' + (e?.message || 'Erro inesperado'));
		}
	}

	function quemAtendeHoje(alocados?: AlocacaoProfissionalSala[]): AlocacaoProfissionalSala[] {
		if (!alocados) return [];
		return alocados.filter(a => a.diasSemana.includes(diaSemanaHoje));
	}
</script>

<svelte:head>
	<title>ERP Gestão - Infraestrutura & {rotuloUnidadeFisicaPlural} · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="GESTÃO DE INFRAESTRUTURA & {rotuloUnidadeFisicaPlural.toUpperCase()} — {nomeOrgao.toUpperCase()}"
		subtitle="Mapeamento e controle em tempo real de {rotuloUnidadeFisicaPlural.toLowerCase()}, escala de uso compartilhado, médicos alocados e status operacional."
	/>

	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 flex flex-col gap-1 shadow-sm whitespace-pre-wrap">
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">SUCESSO</span>
				<span>ESTRUTURA ATUALIZADA</span>
			</div>
			<div class="text-xs font-mono font-normal mt-1">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Control Bar -->
	<section class="border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
		<div>
			<div class="flex items-center gap-2">
				<span class="font-bold text-slate-900 text-xs uppercase">{rotuloUnidadeFisicaPlural.toUpperCase()} CADASTRADAS</span>
				<span class="bg-slate-100 text-slate-800 border border-slate-300 font-bold px-2 py-0.5 text-[10px]">
					{listaSalas.length} {listaSalas.length === 1 ? 'UNIDADE' : 'UNIDADES'}
				</span>
			</div>
			<span class="text-slate-500 text-[10px] block mt-0.5">
				Capacidade física instalada com controle de médicos e dias de atendimento compartilhados
			</span>
		</div>
		<button
			onclick={abrirModalNovaSala}
			class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950 flex items-center justify-center gap-2 transition"
		>
			<IconPlus size={14} />
			<span>+ Cadastrar {rotuloUnidadeFisica}</span>
		</button>
	</section>

	<!-- Grid de Consultórios / Cadeiras -->
	<section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
		{#each listaSalas as sala (sala.id)}
			{@const alocados = sala.profissionaisAlocados || []}
			{@const emTurnoHoje = quemAtendeHoje(alocados)}
			{@const compartilhada = alocados.length > 1}

			<div class="border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4 shadow-xs hover:border-slate-400 transition">
				<div>
					<!-- Topo do Card -->
					<div class="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
						<div>
							<div class="flex items-center gap-2">
								<span class="bg-slate-900 text-white font-mono px-2 py-0.5 text-xs font-bold">{sala.codigo}</span>
								<span class="font-bold text-slate-900 font-sans text-sm">{sala.nome}</span>
							</div>
							<div class="text-[10px] text-slate-500 font-mono mt-1">
								Ala / Localização: <strong class="text-slate-800">{sala.ala || 'Térreo'}</strong>
							</div>
						</div>

						<div class="flex flex-col items-end gap-1.5 shrink-0">
							{#if sala.status === 'EM_ATENDIMENTO'}
								<span class="bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold px-2 py-0.5 text-[10px]">EM ATENDIMENTO</span>
							{:else if sala.status === 'DISPONIVEL'}
								<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 text-[10px]">LIVRE / DISPONÍVEL</span>
							{:else if sala.status === 'MANUTENCAO'}
								<span class="bg-rose-100 text-rose-900 border border-rose-300 font-bold px-2 py-0.5 text-[10px]">EM MANUTENÇÃO</span>
							{:else}
								<span class="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 text-[10px]">RESERVADA</span>
							{/if}

							{#if compartilhada}
								<span class="bg-blue-50 text-blue-900 border border-blue-200 text-[9px] font-bold px-1.5 py-0.5 flex items-center gap-1">
									<IconUsers size={11} />
									<span>COMPARTILHADA ({alocados.length})</span>
								</span>
							{:else}
								<span class="bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-bold px-1.5 py-0.5">
									DEDICADA (1)
								</span>
							{/if}
						</div>
					</div>

					<!-- Destaque: Atendimento de Hoje -->
					{#if emTurnoHoje.length > 0}
						<div class="mt-3 bg-emerald-50 border border-emerald-300 p-2.5 text-emerald-950 font-sans text-xs flex items-start gap-2">
							<span class="bg-emerald-700 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 shrink-0 mt-0.5">HOJE ({diaSemanaHoje})</span>
							<div>
								{#each emTurnoHoje as prof}
									<div class="font-bold flex items-center gap-1.5">
										{#if ehCeo}
											<IconDental size={13} class="text-emerald-800" />
										{:else}
											<IconStethoscope size={13} class="text-emerald-800" />
										{/if}
										<span>{prof.medicoNome}</span>
										<span class="text-emerald-700 text-[10px] font-mono">({prof.medicoRegistro || prof.especialidade})</span>
										<span class="text-[10px] text-emerald-800 font-mono">· {prof.horario || 'Turno Ativo'}</span>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="mt-3 bg-slate-50 border border-slate-200 p-2 text-slate-500 font-mono text-[10px] flex items-center gap-1.5">
							<IconInfoCircle size={12} class="text-slate-400 shrink-0" />
							<span>Nenhum profissional em escala para hoje ({diaSemanaHoje})</span>
						</div>
					{/if}

					<!-- Profissionais Alocados e Dias de Atendimento -->
					<div class="mt-4 border border-slate-200 bg-slate-50 p-3">
						<div class="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
							<span class="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
								<IconCalendar size={12} />
								<span>ESCALA DE PROFISSIONAIS ALOCADOS:</span>
							</span>
							<span class="text-[9px] font-mono text-slate-500">{alocados.length} {alocados.length === 1 ? 'médico' : 'médicos'}</span>
						</div>

						{#if alocados.length > 0}
							<div class="flex flex-col gap-2">
								{#each alocados as prof}
									<div class="bg-white border border-slate-200 p-2 text-xs flex flex-col gap-1.5 shadow-2xs">
										<div class="flex items-center justify-between">
											<div class="font-bold text-slate-900 flex items-center gap-1.5 font-sans">
												<IconUser size={13} class="text-blue-900 shrink-0" />
												<span>{prof.medicoNome}</span>
												{#if prof.medicoRegistro}
													<span class="font-mono text-[10px] text-slate-500 font-normal">({prof.medicoRegistro})</span>
												{/if}
											</div>
											<span class="bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold px-1.5 py-0.5">
												{prof.especialidade}
											</span>
										</div>

										<div class="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono pt-1 border-t border-slate-100">
											<div class="flex items-center gap-1">
												<span class="text-slate-500">Dias:</span>
												{#each prof.diasSemana as d}
													<span class="border {d === diaSemanaHoje ? 'border-emerald-600 bg-emerald-100 text-emerald-900 font-black' : 'border-slate-300 bg-slate-100 text-slate-700'} px-1 py-0.2">
														{d}
													</span>
												{/each}
											</div>
											<div class="text-slate-600 flex items-center gap-1">
												<IconClock size={11} class="text-slate-400" />
												<span>{prof.horario || 'Turno Regular'}</span>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-center py-2 text-slate-400 text-[10px] font-mono">
								Nenhum profissional alocado nesta sala.
							</div>
						{/if}
					</div>

					<!-- Equipamentos Instalados -->
					<div class="mt-3">
						<span class="text-slate-500 text-[10px] uppercase font-bold block mb-1">Equipamentos Instalados:</span>
						<div class="flex flex-wrap gap-1">
							{#each sala.equipamentos as eq}
								<span class="bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 text-[10px] font-mono">{eq}</span>
							{:else}
								<span class="text-slate-400 text-[10px] font-mono">Nenhum equipamento registrado</span>
							{/each}
						</div>
					</div>
				</div>

				<!-- Rodapé do Card com Ações -->
				<div class="border-t border-slate-100 pt-3 flex flex-col gap-2">
					<div class="flex items-center justify-between text-[11px]">
						<span class="text-slate-500 font-mono text-[10px]">Alterar Status:</span>
						<div class="flex gap-1">
							<button
								onclick={() => alterarStatusSala(sala, 'DISPONIVEL')}
								class="border border-emerald-700 bg-emerald-50 text-emerald-900 px-2 py-0.5 font-bold hover:bg-emerald-100 transition text-[10px]"
								title="Marcar como disponível"
							>
								Livre
							</button>
							<button
								onclick={() => alterarStatusSala(sala, 'EM_ATENDIMENTO')}
								class="border border-indigo-700 bg-indigo-50 text-indigo-900 px-2 py-0.5 font-bold hover:bg-indigo-100 transition text-[10px]"
								title="Marcar como em atendimento"
							>
								Ocupada
							</button>
							<button
								onclick={() => alterarStatusSala(sala, 'MANUTENCAO')}
								class="border border-rose-700 bg-rose-50 text-rose-900 px-2 py-0.5 font-bold hover:bg-rose-100 transition text-[10px]"
								title="Marcar como em manutenção"
							>
								Manutenção
							</button>
						</div>
					</div>

					<div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
						<button
							onclick={() => abrirModalEdicao(sala)}
							class="border border-slate-300 bg-slate-50 text-slate-800 px-3 py-1 font-bold text-[11px] hover:bg-slate-100 flex items-center gap-1.5 transition"
						>
							<IconEdit size={12} />
							<span>Editar Sala & Escala</span>
						</button>
						<button
							onclick={() => excluirSala(sala)}
							class="border border-rose-300 bg-rose-50 text-rose-800 px-2.5 py-1 font-bold text-[11px] hover:bg-rose-100 flex items-center gap-1 transition"
							title="Remover sala"
						>
							<IconTrash size={12} />
							<span>Excluir</span>
						</button>
					</div>
				</div>
			</div>
		{:else}
			{#if !carregando}
				<div class="col-span-full border-2 border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 font-mono text-xs flex flex-col items-center gap-3">
					<IconBuildingHospital size={36} class="text-slate-300" />
					<div class="font-bold text-slate-700 text-sm">
						Nenhum {rotuloUnidadeFisica.toLowerCase()} cadastrado no banco de dados.
					</div>
					<p class="max-w-md text-slate-500 text-xs">
						Cadastre os consultórios e cadeiras do centro definindo os médicos e os dias de atendimento correspondentes.
					</p>
					<button
						onclick={abrirModalNovaSala}
						class="mt-2 border border-blue-900 bg-blue-900 text-white px-5 py-2.5 font-bold text-xs uppercase tracking-wider hover:bg-blue-950 transition"
					>
						+ Cadastrar {rotuloUnidadeFisica}
					</button>
				</div>
			{/if}
		{/each}
	</section>
</div>

<!-- Modal: Cadastrar / Editar Consultório ou Cadeira -->
{#if modalAberto}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-2xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.15)] max-h-[90vh] flex flex-col">
			<!-- Cabeçalho Modal -->
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs flex items-center gap-2">
					<IconBuildingHospital size={15} />
					<span>{modoEdicao ? `Editar ${rotuloUnidadeFisica}: ${formCodigo}` : `+ Cadastrar Novo(a) ${rotuloUnidadeFisica}`}</span>
				</div>
				<button onclick={() => modalAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<!-- Conteúdo com Scroll -->
			<div class="p-5 overflow-y-auto flex flex-col gap-4">
				{#if erroModalSala}
					<div class="border-2 border-rose-300 bg-rose-50 p-3 text-rose-900 font-bold flex items-start gap-2">
						<IconAlertTriangle size={16} class="text-rose-700 shrink-0 mt-0.5" />
						<span class="font-sans text-xs">{erroModalSala}</span>
					</div>
				{/if}

				<!-- Dados da Sala -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="sl-cod" class="font-bold text-slate-700 text-[11px] uppercase">Código / Identificador *</label>
						<input
							id="sl-cod"
							type="text"
							bind:value={formCodigo}
							placeholder="Ex: CONS-01 ou CAD-01"
							class="border border-slate-300 p-2 text-xs font-mono outline-none focus:border-slate-900"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="sl-nome" class="font-bold text-slate-700 text-[11px] uppercase">Nome de Identificação *</label>
						<input
							id="sl-nome"
							type="text"
							bind:value={formNome}
							placeholder="Ex: Consultório 01 — Cardiologia"
							class="border border-slate-300 p-2 text-xs font-mono outline-none focus:border-slate-900"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="sl-esp" class="font-bold text-slate-700 text-[11px] uppercase">Especialidade / Área Principal</label>
						{#if especialidadesCatalogo.length > 0}
							<select
								id="sl-esp"
								bind:value={formEspecialidade}
								class="border border-slate-300 p-2 text-xs font-mono bg-white outline-none focus:border-slate-900"
							>
								{#each especialidadesCatalogo as esp}
									<option value={esp.nome}>{esp.nome.toUpperCase()}</option>
								{/each}
							</select>
						{:else}
							<input
								id="sl-esp"
								type="text"
								bind:value={formEspecialidade}
								placeholder="Ex: Cardiologia ou Endodontia"
								class="border border-slate-300 p-2 text-xs font-mono outline-none focus:border-slate-900"
							/>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						<label for="sl-ala" class="font-bold text-slate-700 text-[11px] uppercase">Ala / Setor / Andar</label>
						<input
							id="sl-ala"
							type="text"
							bind:value={formAla}
							placeholder="Ex: Ala A — Térreo"
							class="border border-slate-300 p-2 text-xs font-mono outline-none focus:border-slate-900"
						/>
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label for="sl-eq" class="font-bold text-slate-700 text-[11px] uppercase">Equipamentos Instalados (separados por vírgula)</label>
					<input
						id="sl-eq"
						type="text"
						bind:value={formEquipamentosTexto}
						placeholder="Ex: Maca Articulada, Raio-X Digital, Eletrocardiograma"
						class="border border-slate-300 p-2 text-xs font-mono outline-none focus:border-slate-900"
					/>
				</div>

				<!-- SEÇÃO DE ALOCAÇÃO DE MÉDICOS E DIAS DE ATENDIMENTO -->
				<div class="border-2 border-blue-900 bg-blue-50/40 p-4 mt-2">
					<div class="flex items-center justify-between border-b border-blue-200 pb-2 mb-3">
						<div>
							<div class="font-bold text-blue-950 text-xs uppercase flex items-center gap-1.5">
								<IconUsers size={15} class="text-blue-900" />
								<span>{rotuloProfissional.toUpperCase()}S ALOCADOS & DIAS DE ATENDIMENTO *</span>
							</div>
							<span class="text-blue-800 text-[10px] block mt-0.5">
								Obrigatório informar quem atende nesta sala e em quais dias da semana (permite compartilhamento de sala)
							</span>
						</div>
						<span class="bg-blue-900 text-white font-mono text-[10px] font-bold px-2 py-0.5">
							{formProfissionais.length} ALOCADO(S)
						</span>
					</div>

					<!-- Lista de profissionais já alocados nesta sala -->
					{#if formProfissionais.length > 0}
						<div class="flex flex-col gap-2 mb-3">
							{#each formProfissionais as prof, idx}
								<div class="border border-slate-300 bg-white p-2.5 flex items-center justify-between gap-2 shadow-2xs">
									<div class="flex-1">
										<div class="font-bold text-slate-900 font-sans text-xs flex items-center gap-2">
											<span>{prof.medicoNome}</span>
											{#if prof.medicoRegistro}
												<span class="text-slate-500 font-mono text-[10px]">({prof.medicoRegistro})</span>
											{/if}
											<span class="bg-slate-100 border border-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 font-mono">
												{prof.especialidade}
											</span>
										</div>
										<div class="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-600">
											<span>Dias:</span>
											<div class="flex gap-1">
												{#each prof.diasSemana as d}
													<span class="bg-blue-100 text-blue-900 font-bold border border-blue-300 px-1.5 py-0.2">
														{d}
													</span>
												{/each}
											</div>
											<span class="text-slate-400">·</span>
											<span>{prof.horario}</span>
										</div>
									</div>

									<button
										type="button"
										onclick={() => removerProfissionalDaSala(idx)}
										class="text-rose-700 hover:text-rose-900 border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-bold flex items-center gap-1 transition"
										title="Remover este profissional da sala"
									>
										<IconTrash size={12} />
										<span>Remover</span>
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<div class="bg-amber-50 border border-amber-300 p-2.5 text-amber-900 text-[11px] mb-3 flex items-center gap-2">
							<IconAlertTriangle size={15} class="text-amber-700 shrink-0" />
							<span>Nenhum profissional alocado ainda. Adicione ao menos um abaixo para salvar a sala.</span>
						</div>
					{/if}

					<!-- Mini-form para adicionar profissional -->
					<div class="border border-slate-300 bg-white p-3 flex flex-col gap-2.5">
						<span class="font-bold text-slate-800 text-[11px] uppercase block">
							+ Adicionar / Vincular {rotuloProfissional} à Sala
						</span>

						{#if erroAdicionarProf}
							<div class="border border-rose-200 bg-rose-50 p-1.5 text-rose-800 text-[10px] font-bold">
								{erroAdicionarProf}
							</div>
						{/if}

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<div class="flex flex-col gap-1">
								<label for="sl-sel-prof" class="text-[10px] font-bold text-slate-600 uppercase">Selecionar {rotuloProfissional} Cadastrado</label>
								<select
									id="sl-sel-prof"
									value={profSelecionado}
									onchange={aoSelecionarUsuarioProfissional}
									class="border border-slate-300 p-1.5 text-xs bg-slate-50 font-mono outline-none"
								>
									<option value="">-- Escolha da lista ou digite abaixo --</option>
									{#each usuariosMedicos as user}
										<option value={user.id}>{user.nome} ({user.registro || user.cargo})</option>
									{/each}
								</select>
							</div>

							<div class="flex flex-col gap-1">
								<label for="sl-nome-manual" class="text-[10px] font-bold text-slate-600 uppercase">Nome do Profissional *</label>
								<input
									id="sl-nome-manual"
									type="text"
									bind:value={profNomeManual}
									placeholder="Ex: Dra. Mariana Vasconcelos"
									class="border border-slate-300 p-1.5 text-xs font-mono outline-none"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<div class="flex flex-col gap-1">
								<label for="sl-registro-prof" class="text-[10px] font-bold text-slate-600 uppercase">Registro Profissional (CRM/CRO)</label>
								<input
									id="sl-registro-prof"
									type="text"
									bind:value={profRegistro}
									placeholder="Ex: CRM-PE 8940"
									class="border border-slate-300 p-1.5 text-xs font-mono outline-none"
								/>
							</div>

							<div class="flex flex-col gap-1">
								<label for="sl-esp-prof" class="text-[10px] font-bold text-slate-600 uppercase">Especialidade na Sala</label>
								<input
									id="sl-esp-prof"
									type="text"
									bind:value={profEspecialidade}
									placeholder={formEspecialidade || 'Ex: Cardiologia'}
									class="border border-slate-300 p-1.5 text-xs font-mono outline-none"
								/>
							</div>
						</div>

						<!-- Seleção dos Dias da Semana -->
						<div class="flex flex-col gap-1.5">
							<span class="text-[10px] font-bold text-slate-600 uppercase">Dias de Atendimento nesta Sala *</span>
							<div class="flex flex-wrap gap-1.5">
								{#each DIAS_SEMANA as dia}
									{@const selecionado = profDias.includes(dia.sigla)}
									<button
										type="button"
										onclick={() => toggleDiaSemana(dia.sigla)}
										class="px-2.5 py-1 text-[11px] font-bold border transition {selecionado ? 'bg-blue-900 border-blue-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}"
									>
										{dia.sigla} · {dia.label.split('-')[0]}
									</button>
								{/each}
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end pt-1">
							<div class="flex flex-col gap-1">
								<label for="sl-turno-prof" class="text-[10px] font-bold text-slate-600 uppercase">Turno / Horário de Atendimento</label>
								<select
									id="sl-turno-prof"
									bind:value={profHorario}
									class="border border-slate-300 p-1.5 text-xs bg-white font-mono outline-none"
								>
									<option value="08:00 às 12:00">08:00 às 12:00 (Manhã)</option>
									<option value="13:00 às 17:00">13:00 às 17:00 (Tarde)</option>
									<option value="08:00 às 17:00">08:00 às 17:00 (Integral)</option>
									<option value="18:00 às 22:00">18:00 às 22:00 (Noite)</option>
								</select>
							</div>

							<button
								type="button"
								onclick={adicionarProfissionalNaSala}
								class="border border-emerald-700 bg-emerald-700 text-white p-2 font-bold text-xs uppercase hover:bg-emerald-800 transition flex items-center justify-center gap-1.5"
							>
								<IconPlus size={14} />
								<span>Adicionar Profissional à Sala</span>
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Rodapé Modal -->
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button
					type="button"
					onclick={() => modalAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-100 transition"
				>
					Cancelar
				</button>
				<button
					type="button"
					disabled={salvando}
					onclick={salvarSala}
					class="border border-blue-900 bg-blue-900 px-6 py-2 font-bold text-white uppercase hover:bg-blue-950 transition disabled:opacity-50 flex items-center gap-2"
				>
					{#if salvando}
						<span>Salvando...</span>
					{:else}
						<IconCheck size={14} />
						<span>{modoEdicao ? 'Salvar Alterações' : `✓ Cadastrar ${rotuloUnidadeFisica}`}</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
