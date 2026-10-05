<script lang="ts">
	import { onMount } from 'svelte';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';
	import type { DossieResumoDto, AtendimentoDto, VacinacaoDto, ExameDto } from '$lib/api/types';

	const auth = usePacienteAuth();

	type TabType = 'resumo' | 'atendimentos' | 'vacinas' | 'exames';
	let activeTab = $state<TabType>('resumo');

	let loading = $state(true);
	let error = $state<string | null>(null);

	let resumo = $state<DossieResumoDto | null>(null);
	let atendimentos = $state<AtendimentoDto[]>([]);
	let vacinas = $state<VacinacaoDto[]>([]);
	let exames = $state<ExameDto[]>([]);

	let buscaTerm = $state('');

	onMount(async () => {
		await carregarDados();
	});

	async function carregarDados() {
		loading = true;
		error = null;
		try {
			const [resumoData, atendsData, vacinasData, examesData] = await Promise.all([
				api.pacienteApp.dossieResumo().catch(() => null),
				api.pacienteApp.dossieAtendimentos().catch(() => ({ items: [], nextCursor: null })),
				api.pacienteApp.dossieVacinacoes().catch(() => ({ items: [], nextCursor: null })),
				api.pacienteApp.dossieExames().catch(() => ({ items: [], nextCursor: null }))
			]);

			resumo = resumoData;
			atendimentos = atendsData?.items || [];
			vacinas = vacinasData?.items || [];
			exames = examesData?.items || [];
		} catch (e: any) {
			error = e.message || 'Falha ao carregar o prontuário do paciente.';
		} finally {
			loading = false;
		}
	}

	function formatarData(dataStr?: string | null): string {
		if (!dataStr) return '—';
		try {
			const d = new Date(dataStr);
			if (isNaN(d.getTime())) return dataStr;
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
		} catch {
			return dataStr;
		}
	}

	let atendimentosFiltrados = $derived(
		atendimentos.filter(a => {
			if (!buscaTerm.trim()) return true;
			const term = buscaTerm.toLowerCase();
			return (
				(a.queixaPrincipal && a.queixaPrincipal.toLowerCase().includes(term)) ||
				(a.cid10Descricao && a.cid10Descricao.toLowerCase().includes(term)) ||
				(a.cid10 && a.cid10.toLowerCase().includes(term)) ||
				(a.profissionalNome && a.profissionalNome.toLowerCase().includes(term)) ||
				(a.localNome && a.localNome.toLowerCase().includes(term))
			);
		})
	);

	let vacinasFiltradas = $derived(
		vacinas.filter(v => {
			if (!buscaTerm.trim()) return true;
			const term = buscaTerm.toLowerCase();
			return (
				(v.vacina && v.vacina.toLowerCase().includes(term)) ||
				(v.dose && v.dose.toLowerCase().includes(term)) ||
				(v.fabricante && v.fabricante.toLowerCase().includes(term)) ||
				(v.localAplicacao && v.localAplicacao.toLowerCase().includes(term))
			);
		})
	);

	let examesFiltrados = $derived(
		exames.filter(e => {
			if (!buscaTerm.trim()) return true;
			const term = buscaTerm.toLowerCase();
			return (
				(e.nome && e.nome.toLowerCase().includes(term)) ||
				(e.categoria && e.categoria.toLowerCase().includes(term)) ||
				(e.unidadeExecutora && e.unidadeExecutora.toLowerCase().includes(term)) ||
				(e.resultadoStatus && e.resultadoStatus.toLowerCase().includes(term))
			);
		})
	);
</script>

<svelte:head>
	<title>Meu Prontuário | UniSISM Cidadão</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
		<div class="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
			<svg class="w-64 h-64 text-white" fill="currentColor" viewBox="0 0 24 24">
				<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
			</svg>
		</div>
		<div class="relative z-10">
			<div class="flex items-center gap-2 mb-2">
				<span class="bg-emerald-500/40 text-emerald-100 text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider backdrop-blur-sm">
					Dossiê Clínico SUS
				</span>
			</div>
			<h1 class="text-2xl font-black tracking-tight">Histórico de Saúde</h1>
			<p class="text-emerald-100 text-sm mt-1 max-w-lg">
				Acompanhe seus atendimentos, receitas, carteira de vacinação e resultados de exames sincronizados com a rede municipal.
			</p>
		</div>
	</div>

	<!-- Segmented Tabs Navigation -->
	<div class="flex p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl gap-1 overflow-x-auto shadow-inner border border-slate-200/80 dark:border-slate-700/80">
		<button
			type="button"
			onclick={() => { activeTab = 'resumo'; buscaTerm = ''; }}
			class="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 {activeTab === 'resumo' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
			<span>Resumo</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'atendimentos'; buscaTerm = ''; }}
			class="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 {activeTab === 'atendimentos' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
			<span>Consultas ({atendimentos.length})</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'vacinas'; buscaTerm = ''; }}
			class="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 {activeTab === 'vacinas' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
			<span>Vacinas ({vacinas.length})</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'exames'; buscaTerm = ''; }}
			class="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 {activeTab === 'exames' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
			<span>Exames ({exames.length})</span>
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
			<div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
			<p class="mt-4 text-slate-500 dark:text-slate-400 font-medium">Buscando informações do seu prontuário...</p>
		</div>
	{:else if error}
		<div class="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-3xl text-rose-700 dark:text-rose-300">
			<p class="font-bold flex items-center gap-2">
				<svg class="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
				Não foi possível carregar o histórico
			</p>
			<p class="text-sm mt-1">{error}</p>
			<button onclick={carregarDados} class="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition">
				Tentar Novamente
			</button>
		</div>
	{:else}
		<!-- TAB: RESUMO -->
		{#if activeTab === 'resumo'}
			<div class="space-y-6">
				<!-- KPI counters -->
				<div class="grid grid-cols-3 gap-3">
					<div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center shadow-sm">
						<p class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{resumo?.totalAtendimentos ?? atendimentos.length}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Consultas</p>
					</div>
					<div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center shadow-sm">
						<p class="text-2xl font-black text-cyan-600 dark:text-cyan-400">{resumo?.totalVacinas ?? vacinas.length}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Doses de Vacina</p>
					</div>
					<div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center shadow-sm">
						<p class="text-2xl font-black text-amber-600 dark:text-amber-400">{resumo?.totalExames ?? exames.length}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Exames</p>
					</div>
				</div>

				<!-- Tipo Sanguíneo se houver -->
				{#if resumo?.tipoSanguineo}
					<div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
						<span class="text-xs text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">Tipo Sanguíneo</span>
						<span class="px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-xl font-black text-sm border border-rose-200/60">
							{resumo.tipoSanguineo}
						</span>
					</div>
				{/if}

				<!-- Alergias -->
				<div class="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
						</div>
						<h3 class="font-bold text-slate-900 dark:text-white">Alergias Cadastradas</h3>
					</div>

					{#if resumo?.alergias && resumo.alergias.length > 0}
						<div class="flex flex-wrap gap-2 pt-1">
							{#each resumo.alergias as alergia}
								<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40 text-xs font-semibold">
									<span class="w-2 h-2 rounded-full bg-rose-500"></span>
									{alergia}
								</span>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-slate-500 dark:text-slate-400 italic">Nenhuma alergia relatada no prontuário.</p>
					{/if}
				</div>

				<!-- Medicamentos em uso contínuo -->
				<div class="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
						</div>
						<h3 class="font-bold text-slate-900 dark:text-white">Medicamentos em Uso Contínuo</h3>
					</div>

					{#if resumo?.medicamentosUsoContinuo && resumo.medicamentosUsoContinuo.length > 0}
						<div class="space-y-2 pt-1">
							{#each resumo.medicamentosUsoContinuo as med}
								<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-start justify-between">
									<p class="font-semibold text-slate-900 dark:text-white text-sm">{med}</p>
									<span class="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">Uso contínuo</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-slate-500 dark:text-slate-400 italic">Nenhum medicamento ativo registrado.</p>
					{/if}
				</div>

				<!-- Condições crônicas -->
				<div class="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
						</div>
						<h3 class="font-bold text-slate-900 dark:text-white">Condições Crônicas & Acompanhamento</h3>
					</div>

					{#if resumo?.condicoesCronicas && resumo.condicoesCronicas.length > 0}
						<div class="space-y-2 pt-1">
							{#each resumo.condicoesCronicas as cond}
								<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
									<p class="font-medium text-slate-800 dark:text-slate-200 text-sm">{cond}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-slate-500 dark:text-slate-400 italic">Nenhuma condição crônica registrada.</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- TAB: ATENDIMENTOS -->
		{#if activeTab === 'atendimentos'}
			<div class="space-y-4">
				<div class="relative">
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="Buscar por profissional, unidade ou diagnóstico..."
						class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
					/>
					<svg class="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
				</div>

				{#if atendimentosFiltrados.length === 0}
					<div class="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6">
						<p class="text-slate-500 dark:text-slate-400 font-medium">Nenhum atendimento encontrado.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each atendimentosFiltrados as atend}
							<div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2.5">
								<div class="flex items-center justify-between">
									<span class="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
										{atend.tipo || 'CONSULTA_MEDICA'}
									</span>
									<span class="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
										{formatarData(atend.data)}
									</span>
								</div>

								<div>
									<h4 class="font-bold text-slate-900 dark:text-white text-base">
										{atend.queixaPrincipal || 'Atendimento Clínico'}
									</h4>
									{#if atend.profissionalNome}
										<p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
											Profissional: <span class="font-medium text-slate-900 dark:text-slate-200">{atend.profissionalNome}</span>
											{#if atend.profissionalEspecialidade}
												<span class="text-slate-400">({atend.profissionalEspecialidade})</span>
											{/if}
										</p>
									{/if}
									{#if atend.localNome}
										<p class="text-xs text-slate-500 dark:text-slate-400">
											Unidade: {atend.localNome}
										</p>
									{/if}
								</div>

								{#if atend.cid10 || atend.condutaResumida}
									<div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-xs">
										{#if atend.cid10}
											<div>
												<span class="font-semibold text-slate-700 dark:text-slate-300">Diagnóstico (CID-10):</span>
												<p class="text-slate-600 dark:text-slate-400 mt-0.5">
													<strong class="font-mono text-emerald-700 dark:text-emerald-400">{atend.cid10}</strong>
													{#if atend.cid10Descricao}
														— {atend.cid10Descricao}
													{/if}
												</p>
											</div>
										{/if}
										{#if atend.condutaResumida}
											<div>
												<span class="font-semibold text-slate-700 dark:text-slate-300">Conduta:</span>
												<p class="text-slate-600 dark:text-slate-400 mt-0.5">{atend.condutaResumida}</p>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- TAB: CARTEIRA DE VACINAS -->
		{#if activeTab === 'vacinas'}
			<div class="space-y-4">
				<div class="relative">
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="Buscar vacina por nome, fabricante ou unidade..."
						class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
					/>
					<svg class="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
				</div>

				{#if vacinasFiltradas.length === 0}
					<div class="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6">
						<p class="text-slate-500 dark:text-slate-400 font-medium">Nenhum registro de vacinação encontrado.</p>
					</div>
				{:else}
					<div class="grid gap-3">
						{#each vacinasFiltradas as vacina}
							<div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start justify-between gap-4">
								<div class="space-y-1">
									<div class="flex items-center gap-2">
										<span class="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
										<h4 class="font-bold text-slate-900 dark:text-white text-base">{vacina.vacina}</h4>
									</div>
									<div class="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
										<p>Dose: <strong class="text-slate-800 dark:text-slate-200">{vacina.dose}</strong></p>
										{#if vacina.fabricante}
											<p>Fabricante: {vacina.fabricante} {#if vacina.lote}· Lote: {vacina.lote}{/if}</p>
										{/if}
										{#if vacina.localAplicacao}
											<p>Local: {vacina.localAplicacao}</p>
										{/if}
										{#if vacina.aplicadorNome}
											<p>Aplicador: {vacina.aplicadorNome}</p>
										{/if}
									</div>
								</div>
								<div class="text-right shrink-0">
									<span class="inline-block px-2.5 py-1 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 rounded-xl text-xs font-bold border border-teal-200/60 dark:border-teal-800/60">
										{formatarData(vacina.aplicadaEm)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- TAB: EXAMES -->
		{#if activeTab === 'exames'}
			<div class="space-y-4">
				<div class="relative">
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="Buscar exame por nome, categoria ou unidade..."
						class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
					/>
					<svg class="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
				</div>

				{#if examesFiltrados.length === 0}
					<div class="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6">
						<p class="text-slate-500 dark:text-slate-400 font-medium">Nenhum exame cadastrado no histórico.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each examesFiltrados as exame}
							<div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2.5">
								<div class="flex items-center justify-between">
									<span class="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
										{exame.categoria || 'Exame'}
									</span>
									<span class="text-xs px-2.5 py-0.5 rounded-full font-bold {exame.resultadoStatus === 'NORMAL' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : exame.resultadoStatus === 'ALTERADO' || exame.resultadoStatus === 'CRITICO' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}">
										{exame.resultadoStatus || 'Pendente'}
									</span>
								</div>

								<div>
									<h4 class="font-bold text-slate-900 dark:text-white text-base">{exame.nome}</h4>
									<div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
										<span>Realizado em: {formatarData(exame.realizadoEm)}</span>
										{#if exame.unidadeExecutora}
											<span>Local: {exame.unidadeExecutora}</span>
										{/if}
										{#if exame.solicitanteNome}
											<span>Solicitante: {exame.solicitanteNome}</span>
										{/if}
									</div>
								</div>

								{#if exame.resultadoResumo}
									<div class="mt-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xs">
										<p class="font-semibold text-emerald-900 dark:text-emerald-200">Resultado:</p>
										<p class="text-slate-700 dark:text-slate-300 mt-0.5">{exame.resultadoResumo}</p>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
