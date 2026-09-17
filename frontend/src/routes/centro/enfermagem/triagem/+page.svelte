<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { Encaminhamento, SinaisVitaisTriagem, RealizarTriagemRequest } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconSearch,
		IconClock,
		IconUser,
		IconStethoscope,
		IconHeartRateMonitor,
		IconScale,
		IconVolume,
		IconCalendar,
		IconDental,
		IconRefresh,
		IconPlus
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	// Estado da listagem
	let pacientes = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state('');
	let mensagemSucesso = $state('');
	let busca = $state('');
	let dataFiltro = $state(new Date().toISOString().substring(0, 10));
	let filtroStatus = $state<'TODOS' | 'AGUARDANDO' | 'CHAMADOS' | 'CONCLUIDOS'>('TODOS');

	// Configuração do consultório / sala da enfermeira
	let salaTriagemPadrao = $state('SALA DE TRIAGEM 01');

	// Modal de Triagem
	let modalTriagemAberto = $state(false);
	let pacienteSelecionado = $state<Encaminhamento | null>(null);
	let apenasVisualizacao = $state(false);
	let erroModal = $state('');
	let salvandoTriagem = $state(false);

	// Campos do formulário de triagem clínica
	let formPressao = $state('120/80');
	let formFc = $state<number | undefined>(75);
	let formFr = $state<number | undefined>(18);
	let formTemp = $state<number | undefined>(36.5);
	let formGlicemia = $state<number | undefined>(98);
	let formSpo2 = $state<number | undefined>(98);
	let formPeso = $state<number | undefined>(70);
	let formAltura = $state<number | undefined>(170);
	let formClassificacaoRisco = $state<'VERMELHO' | 'LARANJA' | 'AMARELO' | 'VERDE' | 'AZUL'>('VERDE');
	let formQueixa = $state('');
	let formAlergias = $state('');
	let formMedicamentos = $state('');
	let formCoren = $state('');

	function extrairHorario(p: Encaminhamento): string {
		const dt = p.agendamentoPrevisto;
		if (!dt) return '--:--';
		if (dt.includes('T')) return dt.split('T')[1]?.substring(0, 5) || '--:--';
		if (dt.includes(' ')) return dt.split(' ')[1]?.substring(0, 5) || '--:--';
		return '--:--';
	}

	// Cálculo automático de IMC reativo
	let imcCalculado = $derived.by(() => {
		if (!formPeso || !formAltura || formPeso <= 0 || formAltura <= 0) return null;
		const alturaMetros = formAltura / 100;
		const imc = formPeso / (alturaMetros * alturaMetros);
		return Number(imc.toFixed(1));
	});

	let classificacaoImc = $derived.by(() => {
		if (imcCalculado === null) return { texto: 'Não informado', cor: 'text-slate-500' };
		if (imcCalculado < 18.5) return { texto: 'Abaixo do peso', cor: 'text-amber-700 bg-amber-50 border-amber-300' };
		if (imcCalculado <= 24.9) return { texto: 'Eutrófico / Normal', cor: 'text-emerald-700 bg-emerald-50 border-emerald-300' };
		if (imcCalculado <= 29.9) return { texto: 'Sobrepeso', cor: 'text-yellow-800 bg-yellow-50 border-yellow-300' };
		if (imcCalculado <= 34.9) return { texto: 'Obesidade Grau I', cor: 'text-orange-800 bg-orange-50 border-orange-300' };
		if (imcCalculado <= 39.9) return { texto: 'Obesidade Grau II', cor: 'text-red-700 bg-red-50 border-red-300' };
		return { texto: 'Obesidade Mórbida Grau III', cor: 'text-red-900 bg-red-100 border-red-500' };
	});

	// Métricas
	let totalFila = $derived(pacientes.length);
	let aguardandoTriagem = $derived(pacientes.filter(p => !p.triagemRealizada).length);
	let triagensConcluidas = $derived(pacientes.filter(p => p.triagemRealizada).length);
	let chamadosParaTriagem = $derived(pacientes.filter(p => p.chamadaTriagemEm && !p.triagemRealizada).length);

	// Lista filtrada
	let pacientesExibidos = $derived.by(() => {
		return pacientes.filter(p => {
			const b = busca.trim().toLowerCase();
			if (b) {
				const matchNome = (p.paciente?.nome || '').toLowerCase().includes(b);
				const matchCpf = (p.paciente?.cpf || '').replace(/\D/g, '').includes(b.replace(/\D/g, ''));
				const matchEsp = (p.solicitacao?.especialidadeSolicitada || '').toLowerCase().includes(b);
				const matchProf = (p.profissionalAtribuido || p.profissionalAgendado || '').toLowerCase().includes(b);
				if (!matchNome && !matchCpf && !matchEsp && !matchProf) return false;
			}

			if (filtroStatus === 'AGUARDANDO') return !p.triagemRealizada && !p.chamadaTriagemEm;
			if (filtroStatus === 'CHAMADOS') return !p.triagemRealizada && !!p.chamadaTriagemEm;
			if (filtroStatus === 'CONCLUIDOS') return p.triagemRealizada;

			return true;
		});
	});

	async function carregarFila() {
		carregando = true;
		erro = '';
		try {
			const res = await api.centroEnfermagem.listFila({
				centro: siglaOrgao,
				data: dataFiltro,
				busca: busca.trim() || undefined
			});
			pacientes = res.fila || [];
		} catch (e: any) {
			console.error(e);
			if (e?.status === 401 || e?.code === 'TOKEN_AUSENTE' || e?.code === 'TOKEN_EXPIRADO') {
				erro = 'Sessão expirada ou não autenticada. Redirecionando para o login...';
				api.tokens.set(null);
				setTimeout(() => goto('/login', { replaceState: true }), 1200);
			} else {
				erro = `Falha ao carregar fila de triagem: ${e?.message || 'Erro do servidor'}`;
			}
			pacientes = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			const salvo = localStorage.getItem('unisism_sala_triagem');
			if (salvo) salaTriagemPadrao = salvo;
			const corenSalvo = localStorage.getItem('unisism_coren_enfermagem');
			if (corenSalvo) formCoren = corenSalvo;
		}
		if (!api.tokens.get()) {
			erro = 'Sessão não identificada. Redirecionando para login...';
			carregando = false;
			goto('/login', { replaceState: true });
			return;
		}
		carregarFila();
	});

	function atualizarSalaPadrao(nova: string) {
		salaTriagemPadrao = nova;
		if (typeof window !== 'undefined') {
			localStorage.setItem('unisism_sala_triagem', nova);
		}
	}

	async function chamarPacienteTv(p: Encaminhamento) {
		try {
			await api.centroEnfermagem.chamar(p.id, {
				consultorio: salaTriagemPadrao
			});
			mensagemSucesso = `✓ Paciente "${p.paciente?.nome || 'Selecionado'}" chamado no Painel da TV para "${salaTriagemPadrao}"!`;
			p.chamadaTriagemEm = new Date().toISOString();
			p.consultorioTriagem = salaTriagemPadrao;
			setTimeout(() => mensagemSucesso = '', 4000);
		} catch (e: any) {
			console.error(e);
			alert(`Erro ao chamar paciente: ${e?.message || 'Falha do sistema'}`);
		}
	}

	function abrirModalTriagem(p: Encaminhamento, somenteVisualizar = false) {
		pacienteSelecionado = p;
		apenasVisualizacao = somenteVisualizar;
		erroModal = '';

		if (p.triagemDados) {
			const d = p.triagemDados;
			formPressao = d.pressaoArterial || '120/80';
			formFc = d.frequenciaCardiaca;
			formFr = d.frequenciaRespiratoria;
			formTemp = d.temperatura;
			formGlicemia = d.glicemiaCapilar;
			formSpo2 = d.saturacaoO2;
			formPeso = d.pesoKg ?? d.peso;
			formAltura = d.alturaCm ?? d.altura;
			formClassificacaoRisco = d.classificacaoRisco || 'VERDE';
			formQueixa = d.queixaPrincipal || '';
			formAlergias = d.alergiasRelatadas || '';
			formMedicamentos = d.medicamentosEmUso || '';
			formCoren = p.triagemCoren || formCoren;
		} else {
			formPressao = '120/80';
			formFc = 75;
			formFr = 18;
			formTemp = 36.5;
			formGlicemia = 98;
			formSpo2 = 98;
			formPeso = 70;
			formAltura = 170;
			formClassificacaoRisco = 'VERDE';
			formQueixa = '';
			formAlergias = '';
			formMedicamentos = '';
		}

		modalTriagemAberto = true;
	}

	async function submeterTriagem() {
		if (!pacienteSelecionado) return;
		if (!formPressao.trim()) {
			erroModal = 'Informe a Pressão Arterial (ex: 120/80).';
			return;
		}
		if (!formCoren.trim()) {
			erroModal = 'Informe o COREN do profissional de enfermagem responsável.';
			return;
		}

		salvandoTriagem = true;
		erroModal = '';

		try {
			if (typeof window !== 'undefined') {
				localStorage.setItem('unisism_coren_enfermagem', formCoren.trim());
			}

			const payload: RealizarTriagemRequest = {
				pressaoArterial: formPressao.trim(),
				frequenciaCardiaca: formFc ? Number(formFc) : undefined,
				frequenciaRespiratoria: formFr ? Number(formFr) : undefined,
				temperatura: formTemp ? Number(formTemp) : undefined,
				glicemiaCapilar: formGlicemia ? Number(formGlicemia) : undefined,
				saturacaoO2: formSpo2 ? Number(formSpo2) : undefined,
				pesoKg: formPeso ? Number(formPeso) : undefined,
				alturaCm: formAltura ? Number(formAltura) : undefined,
				imc: imcCalculado ?? undefined,
				classificacaoRisco: formClassificacaoRisco,
				queixaPrincipal: formQueixa.trim() || undefined,
				alergiasRelatadas: formAlergias.trim() || undefined,
				medicamentosEmUso: formMedicamentos.trim() || undefined,
				coren: formCoren.trim()
			};

			await api.centroEnfermagem.triar(pacienteSelecionado.id, payload);

			modalTriagemAberto = false;
			mensagemSucesso = `✓ Triagem clínica concluída com sucesso para o paciente "${pacienteSelecionado.paciente?.nome}". Liberado para o médico especialista!`;
			await carregarFila();
			setTimeout(() => mensagemSucesso = '', 5000);
		} catch (e: any) {
			console.error(e);
			erroModal = `Falha ao salvar triagem: ${e?.message || 'Erro do servidor'}`;
		} finally {
			salvandoTriagem = false;
		}
	}
</script>

<svelte:head>
	<title>Enfermagem & Triagem Clínica · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="TRIAGEM CLÍNICA & AFERIÇÃO DE SINAIS VITAIS — {nomeOrgao.toUpperCase()}"
		subtitle="Módulo de enfermagem: chamada em painel de TV, acolhimento humanizado, aferição de parâmetros hemodinâmicos, antropometria e liberação de consultas especializadas."
	/>

	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 flex flex-col gap-1 shadow-sm whitespace-pre-wrap">
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">SUCESSO</span>
				<span>FLUXO DE ENFERMAGEM ATUALIZADO</span>
			</div>
			<div class="text-xs font-mono font-normal mt-1">{mensagemSucesso}</div>
		</div>
	{/if}

	{#if erro}
		<div class="border-2 border-red-700 bg-red-50 p-4 font-bold text-red-900 flex items-center gap-2 shadow-sm">
			<IconAlertTriangle size={18} class="text-red-700 shrink-0" />
			<span>{erro}</span>
		</div>
	{/if}

	<!-- METRIC CARDS -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
		<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
			<span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Agendados Hoje</span>
			<div class="flex items-baseline justify-between mt-2">
				<span class="text-2xl font-black text-slate-900">{totalFila}</span>
				<span class="text-xs font-semibold text-slate-600 font-sans">pacientes</span>
			</div>
		</div>

		<div class="border border-amber-300 bg-amber-50/60 p-4 flex flex-col justify-between">
			<span class="text-[10px] uppercase font-bold text-amber-800 tracking-wider flex items-center gap-1">
				<IconClock size={12} />
				<span>Aguardando Triagem</span>
			</span>
			<div class="flex items-baseline justify-between mt-2">
				<span class="text-2xl font-black text-amber-900">{aguardandoTriagem}</span>
				<span class="text-[10px] font-bold text-amber-700 bg-amber-200/70 px-1.5 py-0.5 uppercase">Pendente</span>
			</div>
		</div>

		<div class="border border-purple-300 bg-purple-50/60 p-4 flex flex-col justify-between">
			<span class="text-[10px] uppercase font-bold text-purple-800 tracking-wider flex items-center gap-1">
				<IconVolume size={12} />
				<span>Chamados no Painel</span>
			</span>
			<div class="flex items-baseline justify-between mt-2">
				<span class="text-2xl font-black text-purple-900">{chamadosParaTriagem}</span>
				<span class="text-[10px] font-bold text-purple-700 bg-purple-200/70 px-1.5 py-0.5 uppercase">A caminho</span>
			</div>
		</div>

		<div class="border border-emerald-300 bg-emerald-50/60 p-4 flex flex-col justify-between">
			<span class="text-[10px] uppercase font-bold text-emerald-800 tracking-wider flex items-center gap-1">
				<IconCheck size={12} />
				<span>Triagens Concluídas</span>
			</span>
			<div class="flex items-baseline justify-between mt-2">
				<span class="text-2xl font-black text-emerald-900">{triagensConcluidas}</span>
				<span class="text-[10px] font-bold text-emerald-700 bg-emerald-200/70 px-1.5 py-0.5 uppercase">Prontos</span>
			</div>
		</div>
	</div>

	<!-- BARRA DE CONTROLE & SALA DE TRIAGEM -->
	<div class="border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
		<div class="flex flex-wrap items-center gap-3">
			<!-- Seletor de Data -->
			<div class="flex items-center gap-1.5 bg-slate-50 border border-slate-300 px-2.5 py-1">
				<IconCalendar size={14} class="text-slate-500" />
				<input
					type="date"
					bind:value={dataFiltro}
					onchange={carregarFila}
					class="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none"
				/>
			</div>

			<!-- Sala de Triagem Configurada -->
			<div class="flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-2.5 py-1">
				<span class="text-[10px] font-bold text-purple-900 uppercase">Minha Sala de Triagem:</span>
				<input
					type="text"
					value={salaTriagemPadrao}
					onchange={(e) => atualizarSalaPadrao((e.target as HTMLInputElement).value)}
					placeholder="Ex: SALA DE TRIAGEM 01"
					class="bg-white border border-purple-300 px-1.5 py-0.5 text-xs font-bold text-purple-950 focus:outline-none w-44"
				/>
			</div>

			<!-- Botão de Atualizar -->
			<button
				type="button"
				onclick={carregarFila}
				class="border border-slate-300 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors"
			>
				<IconRefresh size={14} />
				<span>Atualizar</span>
			</button>
		</div>

		<!-- Ações Rápidas -->
		<div class="flex items-center gap-2">
			<a
				href={ehCeo ? '/ceo/recepcao/balcao' : '/cem/recepcao/balcao'}
				class="border border-blue-900 bg-blue-900 text-white hover:bg-blue-950 px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
			>
				<IconPlus size={14} />
				<span>Agendar Paciente (Balcão)</span>
			</a>
		</div>
	</div>

	<!-- FILTROS E BUSCA -->
	<div class="border border-slate-200 bg-white p-3 flex flex-col md:flex-row items-center justify-between gap-3">
		<div class="relative w-full md:w-80">
			<input
				type="text"
				bind:value={busca}
				placeholder="Buscar paciente por nome, CPF ou especialidade..."
				class="w-full border border-slate-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none"
			/>
			<IconSearch size={14} class="absolute left-2.5 top-2 text-slate-400" />
		</div>

		<!-- Filtros de Status -->
		<div class="flex border border-slate-300 p-0.5 bg-slate-100 text-[11px] w-full md:w-auto overflow-x-auto">
			<button
				type="button"
				onclick={() => filtroStatus = 'TODOS'}
				class="px-3 py-1 font-bold uppercase transition-colors {filtroStatus === 'TODOS' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}"
			>
				Todos ({totalFila})
			</button>
			<button
				type="button"
				onclick={() => filtroStatus = 'AGUARDANDO'}
				class="px-3 py-1 font-bold uppercase transition-colors {filtroStatus === 'AGUARDANDO' ? 'bg-amber-700 text-white' : 'text-slate-700 hover:bg-slate-200'}"
			>
				Aguardando ({aguardandoTriagem})
			</button>
			<button
				type="button"
				onclick={() => filtroStatus = 'CHAMADOS'}
				class="px-3 py-1 font-bold uppercase transition-colors {filtroStatus === 'CHAMADOS' ? 'bg-purple-800 text-white' : 'text-slate-700 hover:bg-slate-200'}"
			>
				Chamados na TV ({chamadosParaTriagem})
			</button>
			<button
				type="button"
				onclick={() => filtroStatus = 'CONCLUIDOS'}
				class="px-3 py-1 font-bold uppercase transition-colors {filtroStatus === 'CONCLUIDOS' ? 'bg-emerald-800 text-white' : 'text-slate-700 hover:bg-slate-200'}"
			>
				Concluídos ({triagensConcluidas})
			</button>
		</div>
	</div>

	<!-- TABELA DE PACIENTES PARA TRIAGEM -->
	<div class="border border-slate-200 bg-white overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-900 text-white text-[10px] uppercase font-bold tracking-wider">
						<th class="p-3">Horário</th>
						<th class="p-3">Paciente</th>
						<th class="p-3">Especialidade / Profissional</th>
						<th class="p-3">Exige Triagem?</th>
						<th class="p-3">Status da Triagem</th>
						<th class="p-3">Sinais Vitais Aferidos</th>
						<th class="p-3 text-right">Ações de Enfermagem</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 text-xs font-mono">
					{#if carregando}
						<tr>
							<td colspan="7" class="p-8 text-center text-slate-500 font-sans">
								Carregando fila de triagem...
							</td>
						</tr>
					{:else if pacientesExibidos.length === 0}
						<tr>
							<td colspan="7" class="p-8 text-center text-slate-500 font-sans">
								Nenhum paciente encontrado para esta data ou filtro.
							</td>
						</tr>
					{:else}
						{#each pacientesExibidos as p (p.id)}
							<tr class="hover:bg-slate-50 {p.triagemRealizada ? 'bg-emerald-50/20' : p.chamadaTriagemEm ? 'bg-purple-50/20' : ''}">
								<td class="p-3 font-bold text-slate-900">
									<div class="flex items-center gap-1 text-slate-800">
										<IconClock size={12} class="text-slate-500" />
										<span>{extrairHorario(p)}</span>
									</div>
								</td>
								<td class="p-3">
									<div class="font-bold text-slate-900 font-sans text-xs">{p.paciente?.nome}</div>
									<div class="text-[10px] text-slate-500 font-mono">CPF: {p.paciente?.cpf || 'Não informado'}</div>
								</td>
								<td class="p-3">
									<div class="font-bold text-blue-900">{p.solicitacao?.especialidadeSolicitada}</div>
									<div class="text-[10px] text-slate-600">{p.profissionalAtribuido || p.profissionalAgendado || 'A definir'}</div>
								</td>
								<td class="p-3">
									{#if p.necessitaTriagem}
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[9px] uppercase">
											SIM (OBRIGATÓRIA)
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-300 font-bold text-[9px] uppercase">
											DISPENSADA
										</span>
									{/if}
								</td>
								<td class="p-3">
									{#if p.triagemRealizada}
										<div class="flex flex-col gap-1">
											<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px] uppercase w-fit">
												<IconCheck size={11} />
												<span>TRIADO</span>
											</span>
											{#if p.triagemPorNome}
												<span class="text-[9px] text-slate-500 font-sans">Enf. {p.triagemPorNome}</span>
											{/if}
										</div>
									{:else if p.chamadaTriagemEm}
										<div class="flex flex-col gap-1">
											<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-300 font-bold text-[10px] uppercase w-fit animate-pulse">
												<IconVolume size={11} />
												<span>CHAMADO NA TV</span>
											</span>
											<span class="text-[9px] text-purple-800 font-mono">{p.consultorioTriagem || 'SALA DE TRIAGEM'}</span>
										</div>
									{:else}
										<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] uppercase">
											<IconClock size={11} />
											<span>AGUARDANDO</span>
										</span>
									{/if}
								</td>
								<td class="p-3">
									{#if p.triagemDados}
										<div class="flex flex-wrap gap-1.5 text-[10px]">
											<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800">
												PA: {p.triagemDados.pressaoArterial || '--'}
											</span>
											{#if p.triagemDados.frequenciaCardiaca}
												<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-slate-800">
													FC: {p.triagemDados.frequenciaCardiaca} bpm
												</span>
											{/if}
											{#if p.triagemDados.saturacaoO2}
												<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-slate-800">
													SpO2: {p.triagemDados.saturacaoO2}%
												</span>
											{/if}
											{#if p.triagemDados.temperatura}
												<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-slate-800">
													{p.triagemDados.temperatura}°C
												</span>
											{/if}
											{#if p.triagemDados.imc}
												<span class="bg-blue-50 border border-blue-300 px-1.5 py-0.5 font-bold text-blue-900">
													IMC: {p.triagemDados.imc}
												</span>
											{/if}
										</div>
									{:else}
										<span class="text-slate-400 italic text-[10px]">Não aferidos</span>
									{/if}
								</td>
								<td class="p-3 text-right">
									<div class="flex items-center justify-end gap-1.5">
										<!-- Chamar no Painel de TV -->
										<button
											type="button"
											onclick={() => chamarPacienteTv(p)}
											class="border border-purple-400 bg-purple-50 text-purple-900 hover:bg-purple-100 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
											title="Chamar paciente no Painel da TV da sala de espera"
										>
											<IconVolume size={12} />
											<span>Chamar na TV</span>
										</button>

										<!-- Realizar ou Ver Triagem -->
										{#if p.triagemRealizada}
											<button
												type="button"
												onclick={() => abrirModalTriagem(p, true)}
												class="border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors"
											>
												Ver Ficha
											</button>
										{:else}
											<button
												type="button"
												onclick={() => abrirModalTriagem(p, false)}
												class="border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
											>
												<IconHeartRateMonitor size={12} />
												<span>Triar</span>
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- MODAL DE TRIAGEM CLÍNICA & SINAIS VITAIS -->
{#if modalTriagemAberto && pacienteSelecionado}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs overflow-y-auto">
		<div class="w-full max-w-2xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)] my-8">
			<!-- Header Modal -->
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs flex items-center gap-2">
					<IconHeartRateMonitor size={16} />
					<span>{apenasVisualizacao ? 'FICHA DE TRIAGEM CLÍNICA DE ENFERMAGEM' : 'REALIZAR TRIAGEM CLÍNICA & SINAIS VITAIS'}</span>
				</div>
				<button onclick={() => modalTriagemAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
				{#if erroModal}
					<div class="border border-red-700 bg-red-50 p-2 text-xs font-bold text-red-900 flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="text-red-700 shrink-0" />
						<span>{erroModal}</span>
					</div>
				{/if}

				<!-- Banner Identificação Paciente -->
				<div class="border border-blue-200 bg-blue-50/70 p-3 flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="font-black text-blue-950 font-sans text-sm">{pacienteSelecionado.paciente?.nome}</span>
						<span class="text-[10px] font-bold bg-blue-900 text-white px-2 py-0.5 uppercase">
							{pacienteSelecionado.solicitacao?.especialidadeSolicitada}
						</span>
					</div>
					<div class="flex flex-wrap gap-4 text-[10px] text-slate-700 font-mono mt-1">
						<span>CPF: <strong>{pacienteSelecionado.paciente?.cpf || 'Não informado'}</strong></span>
						<span>Médico: <strong>{pacienteSelecionado.profissionalAtribuido || pacienteSelecionado.profissionalAgendado || 'A definir'}</strong></span>
						<span>Horário: <strong>{extrairHorario(pacienteSelecionado)}</strong></span>
					</div>
				</div>

				<!-- Bloco 1: Sinais Vitais -->
				<div>
					<span class="font-bold text-slate-900 uppercase text-[11px] block border-b border-slate-200 pb-1 mb-2">
						1. Parâmetros Hemodinâmicos & Sinais Vitais
					</span>
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
						<div class="flex flex-col gap-1">
							<label for="triagem-pa" class="font-bold text-slate-700 text-[10px]">Pressão Arterial (PA) *</label>
							<input
								id="triagem-pa"
								type="text"
								bind:value={formPressao}
								disabled={apenasVisualizacao}
								placeholder="ex: 120/80"
								class="border border-slate-300 p-2 text-xs font-bold bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-fc" class="font-bold text-slate-700 text-[10px]">Freq. Cardíaca (FC bpm)</label>
							<input
								id="triagem-fc"
								type="number"
								bind:value={formFc}
								disabled={apenasVisualizacao}
								placeholder="bpm"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-fr" class="font-bold text-slate-700 text-[10px]">Freq. Respiratória (FR ipm)</label>
							<input
								id="triagem-fr"
								type="number"
								bind:value={formFr}
								disabled={apenasVisualizacao}
								placeholder="ipm"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-temp" class="font-bold text-slate-700 text-[10px]">Temperatura (°C)</label>
							<input
								id="triagem-temp"
								type="number"
								step="0.1"
								bind:value={formTemp}
								disabled={apenasVisualizacao}
								placeholder="36.5"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-spo2" class="font-bold text-slate-700 text-[10px]">Saturação SpO2 (%)</label>
							<input
								id="triagem-spo2"
								type="number"
								bind:value={formSpo2}
								disabled={apenasVisualizacao}
								placeholder="98"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-glic" class="font-bold text-slate-700 text-[10px]">Glicemia Capilar (mg/dL)</label>
							<input
								id="triagem-glic"
								type="number"
								bind:value={formGlicemia}
								disabled={apenasVisualizacao}
								placeholder="99"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
					</div>
				</div>

				<!-- Bloco 2: Antropometria & IMC -->
				<div>
					<span class="font-bold text-slate-900 uppercase text-[11px] block border-b border-slate-200 pb-1 mb-2">
						2. Antropometria & Cálculo de IMC
					</span>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
						<div class="flex flex-col gap-1">
							<label for="triagem-peso" class="font-bold text-slate-700 text-[10px]">Peso (kg)</label>
							<input
								id="triagem-peso"
								type="number"
								step="0.1"
								bind:value={formPeso}
								disabled={apenasVisualizacao}
								placeholder="70.0"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label for="triagem-altura" class="font-bold text-slate-700 text-[10px]">Altura (cm)</label>
							<input
								id="triagem-altura"
								type="number"
								bind:value={formAltura}
								disabled={apenasVisualizacao}
								placeholder="170"
								class="border border-slate-300 p-2 text-xs bg-white"
							/>
						</div>
						<div class="border border-blue-300 bg-blue-50/50 p-2 flex flex-col justify-center">
							<span class="text-[9px] font-bold uppercase text-blue-900">Índice de Massa Corporal (IMC)</span>
							<div class="flex items-center gap-2 mt-0.5">
								<span class="text-base font-black text-blue-950 font-mono">{imcCalculado ?? '--'}</span>
								<span class="text-[9px] font-bold px-1.5 py-0.5 border {classificacaoImc.cor}">
									{classificacaoImc.texto}
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Bloco 3: Classificação Manchester / Risco -->
				<div>
					<span class="font-bold text-slate-900 uppercase text-[11px] block border-b border-slate-200 pb-1 mb-2">
						3. Classificação de Risco Clínico (Protocolo de Manchester)
					</span>
					<div class="grid grid-cols-5 gap-1.5 text-center">
						<button
							type="button"
							disabled={apenasVisualizacao}
							onclick={() => formClassificacaoRisco = 'VERMELHO'}
							class="p-2 border text-[10px] font-bold transition-all {formClassificacaoRisco === 'VERMELHO' ? 'border-red-600 bg-red-600 text-white shadow-md' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}"
						>
							VERMELHO
							<span class="block text-[8px] font-normal">Emergência (0m)</span>
						</button>
						<button
							type="button"
							disabled={apenasVisualizacao}
							onclick={() => formClassificacaoRisco = 'LARANJA'}
							class="p-2 border text-[10px] font-bold transition-all {formClassificacaoRisco === 'LARANJA' ? 'border-orange-600 bg-orange-500 text-white shadow-md' : 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100'}"
						>
							LARANJA
							<span class="block text-[8px] font-normal">Muito Urgente (10m)</span>
						</button>
						<button
							type="button"
							disabled={apenasVisualizacao}
							onclick={() => formClassificacaoRisco = 'AMARELO'}
							class="p-2 border text-[10px] font-bold transition-all {formClassificacaoRisco === 'AMARELO' ? 'border-yellow-600 bg-yellow-400 text-slate-950 shadow-md' : 'border-yellow-200 bg-yellow-50 text-yellow-900 hover:bg-yellow-100'}"
						>
							AMARELO
							<span class="block text-[8px] font-normal">Urgente (50m)</span>
						</button>
						<button
							type="button"
							disabled={apenasVisualizacao}
							onclick={() => formClassificacaoRisco = 'VERDE'}
							class="p-2 border text-[10px] font-bold transition-all {formClassificacaoRisco === 'VERDE' ? 'border-emerald-600 bg-emerald-600 text-white shadow-md' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}"
						>
							VERDE
							<span class="block text-[8px] font-normal">Pouco Urgente</span>
						</button>
						<button
							type="button"
							disabled={apenasVisualizacao}
							onclick={() => formClassificacaoRisco = 'AZUL'}
							class="p-2 border text-[10px] font-bold transition-all {formClassificacaoRisco === 'AZUL' ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'}"
						>
							AZUL
							<span class="block text-[8px] font-normal">Não Urgente</span>
						</button>
					</div>
				</div>

				<!-- Bloco 4: Anamnese e Observações de Enfermagem -->
				<div>
					<span class="font-bold text-slate-900 uppercase text-[11px] block border-b border-slate-200 pb-1 mb-2">
						4. Anamnese de Enfermagem & Queixa Principal
					</span>
					<div class="flex flex-col gap-2">
						<div class="flex flex-col gap-1">
							<label for="triagem-queixa" class="font-bold text-slate-700 text-[10px]">Queixa Principal & Sintomas Relatados</label>
							<textarea
								id="triagem-queixa"
								rows="2"
								bind:value={formQueixa}
								disabled={apenasVisualizacao}
								placeholder="Descreva a queixa inicial relatada pelo paciente durante o acolhimento..."
								class="border border-slate-300 p-2 text-xs font-sans bg-white"
							></textarea>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<div class="flex flex-col gap-1">
								<label for="triagem-alergias" class="font-bold text-slate-700 text-[10px]">Alergias Relatadas</label>
								<input
									id="triagem-alergias"
									type="text"
									bind:value={formAlergias}
									disabled={apenasVisualizacao}
									placeholder="ex: Dipirona, Penicilina, Látex..."
									class="border border-slate-300 p-2 text-xs font-sans bg-white"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label for="triagem-meds" class="font-bold text-slate-700 text-[10px]">Medicamentos em Uso</label>
								<input
									id="triagem-meds"
									type="text"
									bind:value={formMedicamentos}
									disabled={apenasVisualizacao}
									placeholder="ex: Losartana 50mg, Metformina..."
									class="border border-slate-300 p-2 text-xs font-sans bg-white"
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Bloco 5: Responsável Técnico -->
				<div class="border-t border-slate-200 pt-2 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<label for="triagem-coren" class="font-bold text-slate-700 text-[10px]">COREN do Profissional Responsável *</label>
						<input
							id="triagem-coren"
							type="text"
							bind:value={formCoren}
							disabled={apenasVisualizacao}
							placeholder="ex: COREN-PE 123456"
							class="border border-slate-300 px-2 py-1 text-xs font-bold bg-white w-48"
						/>
					</div>
				</div>
			</div>

			<!-- Footer Modal -->
			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalTriagemAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Fechar
				</button>
				{#if !apenasVisualizacao}
					<button
						onclick={submeterTriagem}
						disabled={salvandoTriagem}
						class="border border-emerald-800 bg-emerald-800 px-5 py-2 font-bold text-white uppercase hover:bg-emerald-900 flex items-center gap-1.5"
					>
						{#if salvandoTriagem}
							<span>Salvando...</span>
						{:else}
							<IconCheck size={14} />
							<span>✓ Salvar Triagem e Liberar para Médico</span>
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
