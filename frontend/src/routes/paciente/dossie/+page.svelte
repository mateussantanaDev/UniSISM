<script lang="ts">
	import { onMount } from 'svelte';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';
	import type { DossieResumoDto, AtendimentoDto, VacinacaoDto, ExameDto } from '$lib/api/types';
	import {
		IconNotes,
		IconCalendarEvent,
		IconVaccine,
		IconTestPipe,
		IconSearch,
		IconAlertCircle,
		IconHeartRateMonitor,
		IconPill,
		IconRefresh
	} from '@tabler/icons-svelte';

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
		atendimentos.filter((a) => {
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
		vacinas.filter((v) => {
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
		exames.filter((e) => {
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
	<title>Prontuário & Dossiê Clínico · UniSISM Águas Belas</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-6">
	<!-- Top Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
		<div>
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				DOSSIÊ CLÍNICO DIGITAL DO CIDADÃO
			</div>
			<h1 class="font-mono text-lg font-bold tracking-wide text-slate-900 sm:text-xl uppercase flex items-center gap-2">
				<IconNotes size={20} class="text-blue-900" />
				<span>Prontuário e Histórico de Saúde</span>
			</h1>
			<p class="text-xs text-slate-600 mt-0.5">
				Consultas ambulatoriais, carteira de vacinas, laudos e condições crônicas registradas na rede municipal.
			</p>
		</div>

		<button
			onclick={carregarDados}
			disabled={loading}
			class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 disabled:opacity-50 transition-colors"
		>
			<IconRefresh size={14} class={loading ? 'animate-spin' : ''} />
			<span>Atualizar</span>
		</button>
	</div>

	<!-- Segmented Tabs Navigation B2G -->
	<div class="flex border-b border-slate-200 bg-slate-100 p-1 gap-1 overflow-x-auto">
		<button
			type="button"
			onclick={() => { activeTab = 'resumo'; buscaTerm = ''; }}
			class="flex-1 min-w-[120px] py-2 px-3 font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 {activeTab === 'resumo'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}"
		>
			<IconNotes size={15} />
			<span>Resumo</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'atendimentos'; buscaTerm = ''; }}
			class="flex-1 min-w-[130px] py-2 px-3 font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 {activeTab === 'atendimentos'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}"
		>
			<IconCalendarEvent size={15} />
			<span>Consultas ({atendimentos.length})</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'vacinas'; buscaTerm = ''; }}
			class="flex-1 min-w-[130px] py-2 px-3 font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 {activeTab === 'vacinas'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}"
		>
			<IconVaccine size={15} />
			<span>Vacinas ({vacinas.length})</span>
		</button>
		<button
			type="button"
			onclick={() => { activeTab = 'exames'; buscaTerm = ''; }}
			class="flex-1 min-w-[130px] py-2 px-3 font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 {activeTab === 'exames'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}"
		>
			<IconTestPipe size={15} />
			<span>Exames ({exames.length})</span>
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 shadow-sm">
			<div class="w-8 h-8 border-[3px] border-blue-900 border-t-transparent animate-spin"></div>
			<p class="mt-3 font-mono text-xs font-bold tracking-widest text-slate-500 uppercase">
				Carregando histórico do prontuário...
			</p>
		</div>
	{:else if error}
		<div class="p-4 bg-red-50 border border-red-700 font-mono text-xs text-red-800">
			<p class="font-bold flex items-center gap-2">
				<IconAlertCircle size={16} />
				<span>NÃO FOI POSSÍVEL CARREGAR O HISTÓRICO CLÍNICO</span>
			</p>
			<p class="mt-1">{error}</p>
			<button
				onclick={carregarDados}
				class="mt-3 px-3 py-1.5 border border-red-800 bg-red-800 text-white font-mono text-xs font-bold uppercase hover:bg-red-900"
			>
				Tentar Novamente
			</button>
		</div>
	{:else}
		<!-- TAB: RESUMO -->
		{#if activeTab === 'resumo'}
			<div class="space-y-6">
				<!-- KPI counters (MetricCard standard) -->
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div class="group relative flex flex-col border border-slate-200 bg-white p-4 shadow-sm">
						<div class="absolute top-0 left-0 h-full w-1 bg-blue-900"></div>
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							CONSULTAS REALIZADAS
						</div>
						<div class="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900">
							{resumo?.totalAtendimentos ?? atendimentos.length}
						</div>
						<div class="mt-1 text-[11px] text-slate-600">Atendimentos no histórico municipal</div>
					</div>

					<div class="group relative flex flex-col border border-slate-200 bg-white p-4 shadow-sm">
						<div class="absolute top-0 left-0 h-full w-1 bg-amber-600"></div>
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							DOSES DE VACINAS
						</div>
						<div class="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900">
							{resumo?.totalVacinas ?? vacinas.length}
						</div>
						<div class="mt-1 text-[11px] text-slate-600">Doses registradas na carteira digital</div>
					</div>

					<div class="group relative flex flex-col border border-slate-200 bg-white p-4 shadow-sm">
						<div class="absolute top-0 left-0 h-full w-1 bg-emerald-700"></div>
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							EXAMES LAUDADOS
						</div>
						<div class="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900">
							{resumo?.totalExames ?? exames.length}
						</div>
						<div class="mt-1 text-[11px] text-slate-600">Procedimentos laboratoriais e imagem</div>
					</div>
				</div>

				<!-- Tipo Sanguíneo se houver -->
				{#if resumo?.tipoSanguineo}
					<div class="border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
						<span class="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider">
							TIPO SANGUÍNEO DO CIDADÃO
						</span>
						<span class="border border-red-700 bg-red-50 text-red-900 px-3 py-1 font-mono font-black text-sm">
							{resumo.tipoSanguineo}
						</span>
					</div>
				{/if}

				<!-- Alergias -->
				<div class="border border-slate-200 bg-white p-4 shadow-sm space-y-3">
					<div class="flex items-center gap-2 border-b border-slate-100 pb-2">
						<span class="flex h-5 w-5 items-center justify-center bg-red-700 font-mono text-[10px] font-bold text-white">
							!
						</span>
						<h3 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
							Alergias Cadastradas
						</h3>
					</div>

					{#if resumo?.alergias && resumo.alergias.length > 0}
						<div class="flex flex-wrap gap-2 pt-1 font-mono text-xs">
							{#each resumo.alergias as alergia}
								<span class="border border-red-700 bg-red-50 text-red-900 px-2 py-1 font-bold">
									⚠ {alergia}
								</span>
							{/each}
						</div>
					{:else}
						<p class="font-mono text-xs text-slate-500 italic">Nenhuma alergia medicamentosa ou alimentar relatada no prontuário.</p>
					{/if}
				</div>

				<!-- Medicamentos em uso contínuo -->
				<div class="border border-slate-200 bg-white p-4 shadow-sm space-y-3">
					<div class="flex items-center gap-2 border-b border-slate-100 pb-2">
						<IconPill size={16} class="text-blue-900" />
						<h3 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
							Medicamentos em Uso Contínuo
						</h3>
					</div>

					{#if resumo?.medicamentosUsoContinuo && resumo.medicamentosUsoContinuo.length > 0}
						<div class="space-y-2 pt-1 font-mono text-xs">
							{#each resumo.medicamentosUsoContinuo as med}
								<div class="p-2.5 bg-slate-50 border border-slate-200 flex items-center justify-between">
									<p class="font-bold text-slate-900 uppercase">{med}</p>
									<span class="border border-blue-700 bg-blue-50 text-blue-900 px-2 py-0.5 text-[10px] font-bold uppercase">
										USO CONTÍNUO
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="font-mono text-xs text-slate-500 italic">Nenhum medicamento de uso contínuo ativo no momento.</p>
					{/if}
				</div>

				<!-- Condições crônicas -->
				<div class="border border-slate-200 bg-white p-4 shadow-sm space-y-3">
					<div class="flex items-center gap-2 border-b border-slate-100 pb-2">
						<IconHeartRateMonitor size={16} class="text-blue-900" />
						<h3 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
							Condições Crônicas & Acompanhamento na UBS
						</h3>
					</div>

					{#if resumo?.condicoesCronicas && resumo.condicoesCronicas.length > 0}
						<div class="space-y-2 pt-1 font-mono text-xs">
							{#each resumo.condicoesCronicas as cond}
								<div class="p-2.5 bg-slate-50 border border-slate-200 flex items-center justify-between">
									<p class="font-bold text-slate-900 uppercase">{cond}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="font-mono text-xs text-slate-500 italic">Nenhuma condição crônica registrada.</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- TAB: ATENDIMENTOS -->
		{#if activeTab === 'atendimentos'}
			<div class="space-y-4">
				<div class="relative">
					<IconSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="BUSCAR POR PROFISSIONAL, UNIDADE OU DIAGNÓSTICO..."
						class="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
					/>
				</div>

				{#if atendimentosFiltrados.length === 0}
					<div class="text-center py-12 bg-white border border-slate-200 p-6 shadow-sm">
						<p class="font-mono text-xs font-bold text-slate-600 uppercase">Nenhum atendimento localizado no período.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each atendimentosFiltrados as atend}
							<div class="border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
								<div class="flex items-center justify-between border-b border-slate-100 pb-2">
									<span class="border border-blue-700 bg-blue-50 text-blue-900 px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
										{atend.tipo || 'CONSULTA MÉDICA'}
									</span>
									<span class="font-mono text-xs font-bold text-slate-600">
										{formatarData(atend.data)}
									</span>
								</div>

								<div>
									<h4 class="font-mono text-sm font-bold text-slate-900 uppercase">
										{atend.queixaPrincipal || 'Atendimento Clínico Ambulatorial'}
									</h4>
									{#if atend.profissionalNome}
										<p class="font-mono text-xs text-slate-700 mt-1">
											PROFISSIONAL: <strong>{atend.profissionalNome}</strong>
											{#if atend.profissionalEspecialidade}
												<span class="text-slate-500 font-normal">({atend.profissionalEspecialidade})</span>
											{/if}
										</p>
									{/if}
									{#if atend.localNome}
										<p class="font-mono text-xs text-slate-600 mt-0.5">
											UNIDADE: {atend.localNome}
										</p>
									{/if}
								</div>

								{#if atend.cid10 || atend.condutaResumida}
									<div class="pt-2 border-t border-slate-100 space-y-1.5 font-mono text-xs">
										{#if atend.cid10}
											<div>
												<span class="text-[10px] font-bold text-slate-500 uppercase">DIAGNÓSTICO (CID-10):</span>
												<p class="text-slate-800 mt-0.5">
													<strong class="text-blue-900">{atend.cid10}</strong>
													{#if atend.cid10Descricao}
														— {atend.cid10Descricao}
													{/if}
												</p>
											</div>
										{/if}
										{#if atend.condutaResumida}
											<div>
												<span class="text-[10px] font-bold text-slate-500 uppercase">CONDUTA MÉDICA:</span>
												<p class="text-slate-700 mt-0.5">{atend.condutaResumida}</p>
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
					<IconSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="BUSCAR VACINA POR NOME, FABRICANTE OU LOTE..."
						class="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
					/>
				</div>

				{#if vacinasFiltradas.length === 0}
					<div class="text-center py-12 bg-white border border-slate-200 p-6 shadow-sm">
						<p class="font-mono text-xs font-bold text-slate-600 uppercase">Nenhum registro de vacinação encontrado.</p>
					</div>
				{:else}
					<div class="grid gap-3">
						{#each vacinasFiltradas as vacina}
							<div class="border border-slate-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4">
								<div class="space-y-1 font-mono">
									<h4 class="text-sm font-bold text-slate-900 uppercase">{vacina.vacina}</h4>
									<div class="text-xs text-slate-600 space-y-0.5">
										<p>DOSE: <strong class="text-slate-900">{vacina.dose}</strong></p>
										{#if vacina.fabricante}
											<p>FABRICANTE: {vacina.fabricante} {#if vacina.lote}· LOTE: {vacina.lote}{/if}</p>
										{/if}
										{#if vacina.localAplicacao}
											<p>LOCAL: {vacina.localAplicacao}</p>
										{/if}
										{#if vacina.aplicadorNome}
											<p>APLICADOR: {vacina.aplicadorNome}</p>
										{/if}
									</div>
								</div>
								<div class="text-right shrink-0">
									<span class="inline-block border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800">
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
					<IconSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						bind:value={buscaTerm}
						placeholder="BUSCAR EXAME POR NOME, CATEGORIA OU RESULTADO..."
						class="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
					/>
				</div>

				{#if examesFiltrados.length === 0}
					<div class="text-center py-12 bg-white border border-slate-200 p-6 shadow-sm">
						<p class="font-mono text-xs font-bold text-slate-600 uppercase">Nenhum exame cadastrado no histórico.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each examesFiltrados as exame}
							<div class="border border-slate-200 bg-white p-4 shadow-sm space-y-2.5 font-mono">
								<div class="flex items-center justify-between border-b border-slate-100 pb-2">
									<span class="border border-slate-300 bg-slate-50 text-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase">
										{exame.categoria || 'EXAME'}
									</span>
									<span class="border px-2 py-0.5 text-[10px] font-bold uppercase {exame.resultadoStatus === 'NORMAL' ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : exame.resultadoStatus === 'ALTERADO' || exame.resultadoStatus === 'CRITICO' ? 'border-red-700 bg-red-50 text-red-800' : 'border-amber-600 bg-amber-50 text-amber-800'}">
										{exame.resultadoStatus || 'PENDENTE'}
									</span>
								</div>

								<div>
									<h4 class="font-bold text-slate-900 text-sm uppercase">{exame.nome}</h4>
									<div class="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
										<span>REALIZADO EM: {formatarData(exame.realizadoEm)}</span>
										{#if exame.unidadeExecutora}
											<span>LOCAL: {exame.unidadeExecutora}</span>
										{/if}
										{#if exame.solicitanteNome}
											<span>SOLICITANTE: {exame.solicitanteNome}</span>
										{/if}
									</div>
								</div>

								{#if exame.resultadoResumo}
									<div class="mt-2 p-2.5 bg-slate-50 border border-slate-200 text-xs">
										<p class="font-bold text-slate-900 uppercase">RESULTADO:</p>
										<p class="text-slate-700 mt-0.5 font-sans">{exame.resultadoResumo}</p>
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
