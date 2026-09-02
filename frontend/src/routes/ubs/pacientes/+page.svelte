<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { PacienteResumo } from '$lib/domain/models/Paciente';
	import type { FiltroPacienteEspecial, PacientesMetricasResponse } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();
	let lista = $state<PacienteResumo[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let paginaAtual = $state(1);
	let limite = $state(50);
	let totalRegistros = $state(0);
	let totalPaginas = $state(1);

	let metricas = $state<PacientesMetricasResponse>({
		totalCadastrados: 0,
		totalCronicos: 0,
		totalEncAtivos: 0,
		totalSemAtendimento90d: 0
	});

	type FiltroEspecial = 'TODOS' | FiltroPacienteEspecial;
	let filtro = $state<FiltroEspecial>('TODOS');

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	async function carregarMetricas() {
		try {
			metricas = await api.pacientes.metricas();
		} catch (err) {
			console.error('Erro ao carregar metricas:', err);
		}
	}

	async function carregarPacientes() {
		carregando = true;
		try {
			const res: any = await api.pacientes.listPaginado({
				page: paginaAtual,
				limit: limite,
				q: busca.trim() || undefined,
				filtro: filtro === 'TODOS' ? undefined : filtro
			});

			if (Array.isArray(res)) {
				lista = res;
				totalRegistros = metricas.totalCadastrados || (res.length >= limite ? paginaAtual * limite + 1 : res.length);
				totalPaginas = Math.max(1, Math.ceil(totalRegistros / limite));
			} else if (res && typeof res === 'object') {
				lista = res.itens ?? [];
				totalRegistros = res.total ?? (metricas.totalCadastrados || lista.length);
				totalPaginas = res.totalPages ?? Math.max(1, Math.ceil(totalRegistros / limite));
				paginaAtual = res.page ?? paginaAtual;
			}
		} catch (err) {
			console.error('Erro ao carregar pacientes:', err);
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarMetricas();
		carregarPacientes();
	});

	function aoMudarBusca(valor: string) {
		busca = valor;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			paginaAtual = 1;
			carregarPacientes();
		}, 300);
	}

	function aoMudarFiltro(f: FiltroEspecial) {
		filtro = f;
		paginaAtual = 1;
		carregarPacientes();
	}

	function irParaPagina(p: number) {
		if (p < 1 || p > totalPaginas || p === paginaAtual) return;
		paginaAtual = p;
		carregarPacientes();
	}

	function idade(iso: string): number {
		const hoje = new Date();
		const nasc = new Date(iso);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return a;
	}

	function diasDesde(iso?: string): number {
		if (!iso) return Infinity;
		return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
	}

	function formatarUltimo(iso?: string): string {
		if (!iso) return 'Nunca atendido';
		const dias = diasDesde(iso);
		if (dias === 0) return 'Hoje';
		if (dias === 1) return 'Ontem';
		if (dias < 30) return `Há ${dias} dias`;
		if (dias < 365) return `Há ${Math.floor(dias / 30)} meses`;
		return `Há ${Math.floor(dias / 365)} anos`;
	}

	const filtros: { valor: FiltroEspecial; label: string; tone: string }[] = [
		{ valor: 'TODOS', label: 'Todos', tone: 'border-slate-300' },
		{ valor: 'COM_CRONICAS', label: 'Com Condições Crônicas', tone: 'border-amber-600' },
		{ valor: 'COM_ENCAMINHAMENTOS', label: 'Com Encaminhamentos', tone: 'border-blue-900' },
		{ valor: 'SEM_ATENDIMENTO_90D', label: 'Sem Atendimento >90d', tone: 'border-red-700' }
	];
</script>

<svelte:head>
	<title>Pacientes do Posto · PEC · UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<!-- Métricas -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Pacientes Cadastrados"
			value={metricas.totalCadastrados || totalRegistros}
			sublabel={auth.me?.unidade ? `Vinculados à ${auth.me.unidade}` : 'Rede municipal'}
		/>
		<MetricCard
			label="Com Condições Crônicas"
			value={metricas.totalCronicos}
			sublabel="HiperDia · Diabéticos · outros"
			accent="warning"
		/>
		<MetricCard
			label="Encaminhamentos Ativos"
			value={metricas.totalEncAtivos}
			sublabel="Aguardando ou com pendência"
			accent="default"
		/>
		<MetricCard
			label="Sem Atendimento >90d"
			value={metricas.totalSemAtendimento90d}
			sublabel="Busca ativa recomendada"
			accent="critical"
		/>
	</section>

	<!-- Lista -->
	<div class="border border-slate-200 bg-white shadow-sm">
		<PanelHeader
			title="Pacientes do Posto"
			subtitle="Prontuário Eletrônico do Cidadão — base municipal completa"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{totalRegistros.toLocaleString('pt-BR')} PACIENTES
			</span>
		</PanelHeader>

		<div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<div class="flex flex-1 items-center gap-2">
				<label
					for="busca"
					class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					Buscar
				</label>
				<input
					id="busca"
					type="text"
					bind:value={busca}
					oninput={() => aoMudarBusca(busca)}
					placeholder="Buscar por Nome, CPF, Cartão SUS, Mãe ou Equipe..."
					class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="flex items-center gap-1">
				{#each filtros as f (f.valor)}
					<button
						type="button"
						onclick={() => aoMudarFiltro(f.valor)}
						class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
							{filtro === f.valor
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
					>
						{f.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">CPF</th>
						<th class="border-r border-slate-200 px-3 py-2">Cartão SUS</th>
						<th class="border-r border-slate-200 px-3 py-2">Idade / Sexo</th>
						<th class="border-r border-slate-200 px-3 py-2">Equipe ESF / UBS</th>
						<th class="border-r border-slate-200 px-3 py-2 text-center">Crônicas</th>
						<th class="border-r border-slate-200 px-3 py-2 text-center">Enc. Ativos</th>
						<th class="border-r border-slate-200 px-3 py-2">Último Atendimento</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(8) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="9" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if lista.length === 0}
						<tr>
							<td colspan="9" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum paciente encontrado com os filtros aplicados.
							</td>
						</tr>
					{:else}
						{#each lista as p (p.id)}
							{@const abandono = diasDesde(p.ultimoAtendimento) > 90}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => goto(`/ubs/pacientes/${p.id}`)}
							>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									{p.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{p.cpf}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{p.cartaoSus || '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{idade(p.dataNascimento)}a · {p.sexo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									<div>{p.unidadeVinculada}</div>
									{#if p.equipeSaudeFamilia}
										<div class="text-[10px] text-slate-500">{p.equipeSaudeFamilia}</div>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center">
									{#if p.condicoesCronicasAtivas > 0}
										<span
											class="border border-amber-600 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
										>
											{p.condicoesCronicasAtivas}
										</span>
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center">
									{#if p.encaminhamentosAtivos > 0}
										<span
											class="border border-blue-900 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-900"
										>
											{p.encaminhamentosAtivos}
										</span>
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 {abandono
										? 'font-bold text-red-700'
										: 'text-slate-700'}"
								>
									{formatarUltimo(p.ultimoAtendimento)}
								</td>
								<td class="px-3 py-2" onclick={(ev) => ev.stopPropagation()}>
									<PrimaryButton
										label="Abrir PEC"
										variant="secondary"
										onclick={() => goto(`/ubs/pacientes/${p.id}`)}
									/>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Paginação -->
		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs">
			<div class="font-mono text-slate-600">
				Mostrando <strong class="text-slate-900">{totalRegistros === 0 ? 0 : (paginaAtual - 1) * limite + 1}–{Math.min(paginaAtual * limite, totalRegistros)}</strong> de <strong class="text-slate-900">{totalRegistros.toLocaleString('pt-BR')}</strong> pacientes
			</div>

			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={() => irParaPagina(1)}
					disabled={paginaAtual <= 1}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
					title="Primeira página"
				>
					«
				</button>
				<button
					type="button"
					onclick={() => irParaPagina(paginaAtual - 1)}
					disabled={paginaAtual <= 1}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
					title="Página anterior"
				>
					‹ Anterior
				</button>

				<span class="border border-slate-300 bg-white px-3 py-1 font-mono text-xs font-bold text-blue-900">
					Pág. {paginaAtual} de {totalPaginas}
				</span>

				<button
					type="button"
					onclick={() => irParaPagina(paginaAtual + 1)}
					disabled={paginaAtual >= totalPaginas}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
					title="Próxima página"
				>
					Próxima ›
				</button>
				<button
					type="button"
					onclick={() => irParaPagina(totalPaginas)}
					disabled={paginaAtual >= totalPaginas}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
					title="Última página"
				>
					»
				</button>

				<select
					bind:value={limite}
					onchange={() => { paginaAtual = 1; carregarPacientes(); }}
					class="ml-2 border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 outline-none"
				>
					<option value={25}>25 / pág</option>
					<option value={50}>50 / pág</option>
					<option value={100}>100 / pág</option>
				</select>
			</div>
		</div>
	</div>
</div>
