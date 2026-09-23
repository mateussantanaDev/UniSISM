<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { PacienteResumo, Encaminhamento, PacientesMetricasResponse } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import ModalDossiePaciente from '$lib/presentation/components/centro/ModalDossiePaciente.svelte';
	import ImprimirProntuario from '$lib/presentation/components/prontuario/ImprimirProntuario.svelte';
	import type { PacienteCompleto } from '$lib/domain/models/Paciente';
	import {
		IconSearch,
		IconFileText,
		IconChevronLeft,
		IconChevronRight,
		IconChevronsLeft,
		IconChevronsRight
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	let listaPacientes = $state<PacienteResumo[]>([]);
	let encaminhamentosCentro = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroEspecialidade = $state('TODAS');

	let paginaAtual = $state(1);
	let limite = $state(50);
	let totalRegistros = $state(0);
	let totalPaginas = $state(1);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	let metricas = $state<PacientesMetricasResponse>({
		totalCadastrados: 0,
		totalCronicos: 0,
		totalEncAtivos: 0,
		totalSemAtendimento90d: 0
	});

	// Modal Dossiê & Impressão
	let modalDossieAberto = $state(false);
	let pacienteDossie = $state<PacienteCompleto | null>(null);
	let carregandoDossie = $state(false);
	let modalImprimirAberto = $state(false);

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
				q: busca.trim() || undefined
			});

			if (Array.isArray(res)) {
				listaPacientes = res;
				totalRegistros =
					metricas.totalCadastrados ||
					(res.length >= limite ? paginaAtual * limite + 1 : res.length);
				totalPaginas = Math.max(1, Math.ceil(totalRegistros / limite));
			} else if (res && typeof res === 'object') {
				listaPacientes = res.itens ?? [];
				totalRegistros = res.total ?? (metricas.totalCadastrados || listaPacientes.length);
				totalPaginas = res.totalPages ?? Math.max(1, Math.ceil(totalRegistros / limite));
				paginaAtual = res.page ?? paginaAtual;
			}
		} catch (err) {
			console.error('Erro ao carregar pacientes:', err);
		} finally {
			carregando = false;
		}
	}

	async function carregarEncaminhamentos() {
		try {
			const encs = await api.encaminhamentos.list({ limit: 1000 }).catch(() => []);
			encaminhamentosCentro = encs.filter((e: Encaminhamento) => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return (
						f === 'CENTRO_ESPECIALIDADES' ||
						f === 'CEM' ||
						(f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO')
					);
				}
			});
		} catch (err) {
			console.error('Erro ao carregar encaminhamentos:', err);
		}
	}

	onMount(() => {
		carregarMetricas();
		carregarEncaminhamentos();
		carregarPacientes();
	});

	function aoMudarBusca(e: Event) {
		const target = e.target as HTMLInputElement;
		busca = target.value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			paginaAtual = 1;
			carregarPacientes();
		}, 300);
	}

	function irParaPagina(p: number) {
		if (p < 1 || p > totalPaginas) return;
		paginaAtual = p;
		carregarPacientes();
	}

	// Mapa de atendimentos vinculados por paciente
	let mapaAtendimentos = $derived.by(() => {
		const mapa = new Map<string, { total: number; ultimaData?: string; ultimaEsp?: string }>();
		for (const e of encaminhamentosCentro) {
			const cpf = e.paciente?.cpf;
			if (!cpf) continue;
			const atual = mapa.get(cpf) || { total: 0 };
			atual.total += 1;
			if (
				e.agendamentoPrevisto &&
				(!atual.ultimaData || e.agendamentoPrevisto > atual.ultimaData)
			) {
				atual.ultimaData = e.agendamentoPrevisto.substring(0, 10);
				atual.ultimaEsp = e.solicitacao?.especialidadeSolicitada;
			}
			mapa.set(cpf, atual);
		}
		return mapa;
	});

	let especialidadesUnicas = $derived.by(() => {
		const setEsp = new Set<string>();
		for (const e of encaminhamentosCentro) {
			if (e.solicitacao?.especialidadeSolicitada) {
				setEsp.add(e.solicitacao.especialidadeSolicitada);
			}
		}
		return Array.from(setEsp).sort();
	});

	let filtrados = $derived.by(() => {
		if (filtroEspecialidade === 'TODAS') return listaPacientes;
		return listaPacientes.filter((p) => {
			const info = mapaAtendimentos.get(p.cpf);
			return info?.ultimaEsp === filtroEspecialidade;
		});
	});

	async function abrirDossie(id: string) {
		modalDossieAberto = true;
		carregandoDossie = true;
		try {
			const res = await api.pacientes.byId(id);
			pacienteDossie = res as any;
		} catch (e) {
			console.error(e);
		} finally {
			carregandoDossie = false;
		}
	}
</script>

<svelte:head>
	<title>Base de Pacientes & Histórico · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<PanelHeader
		title="BASE DE PACIENTES & HISTÓRICO CLÍNICO — {nomeOrgao.toUpperCase()}"
		subtitle="Acesso unificado aos cidadãos referenciados para atendimento secundário especializado, histórico de consultas e prontuário PEC."
	/>

	<!-- Barra de Métricas -->
	<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				CIDADÃOS NO CADASTRO
			</div>
			<div class="mt-2 font-sans text-2xl font-black text-slate-900">
				{metricas.totalCadastrados
					? metricas.totalCadastrados.toLocaleString('pt-BR')
					: totalRegistros.toLocaleString('pt-BR')}
			</div>
			<div class="mt-1 font-mono text-[10px] text-slate-500">
				Base municipal integrada (SUS/PEC)
			</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				COM ATENDIMENTO NO {siglaOrgao}
			</div>
			<div
				class="mt-2 text-2xl font-black {ehCeo ? 'text-emerald-800' : 'text-blue-900'} font-sans"
			>
				{mapaAtendimentos.size}
			</div>
			<div class="mt-1 font-mono text-[10px] text-slate-500">
				{ehCeo ? 'Tratamentos Odontológicos' : 'Consultas Especializadas'}
			</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				ENCAMINHAMENTOS RECEBIDOS
			</div>
			<div class="mt-2 font-sans text-2xl font-black text-amber-700">
				{encaminhamentosCentro.length}
			</div>
			<div class="mt-1 font-mono text-[10px] text-slate-500">Total regulado pelas UBSs</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				ESPECIALIDADES ATIVAS
			</div>
			<div class="mt-2 font-sans text-2xl font-black text-indigo-900">
				{especialidadesUnicas.length}
			</div>
			<div class="mt-1 font-mono text-[10px] text-slate-500">
				{ehCeo ? 'Áreas de Saúde Bucal' : 'Clínicas Médicas'}
			</div>
		</div>
	</section>

	<!-- Barra de Controles e Busca -->
	<section
		class="flex flex-col justify-between gap-3 border border-slate-200 bg-white p-4 md:flex-row md:items-center"
	>
		<div class="flex flex-1 items-center gap-2">
			<div class="relative w-full max-w-md">
				<input
					type="text"
					value={busca}
					oninput={aoMudarBusca}
					placeholder="Buscar por Nome, CPF ou Cartão SUS na base de 58 mil cidadãos..."
					class="w-full border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 focus:bg-white"
				/>
				{#if busca}
					<button
						type="button"
						onclick={() => {
							busca = '';
							paginaAtual = 1;
							carregarPacientes();
						}}
						class="absolute top-2 right-2 text-xs font-bold text-slate-400 hover:text-slate-700"
					>
						✕
					</button>
				{/if}
			</div>

			{#if especialidadesUnicas.length > 0}
				<select
					bind:value={filtroEspecialidade}
					class="border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 focus:bg-white"
				>
					<option value="TODAS">TODAS AS ESPECIALIDADES</option>
					{#each especialidadesUnicas as esp}
						<option value={esp}>{esp.toUpperCase()}</option>
					{/each}
				</select>
			{/if}
		</div>

		<div class="text-right font-mono text-[11px] text-slate-500">
			Mostrando <strong
				>{totalRegistros === 0 ? 0 : (paginaAtual - 1) * limite + 1}–{Math.min(
					paginaAtual * limite,
					totalRegistros
				)}</strong
			>
			de <strong>{totalRegistros.toLocaleString('pt-BR')}</strong> cidadãos
		</div>
	</section>

	<!-- Tabela de Pacientes -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500">
			Carregando base de cidadãos e histórico do {siglaOrgao}...
		</div>
	{:else}
		<div class="overflow-x-auto border border-slate-200 bg-white shadow-xs">
			<table class="w-full text-left font-mono text-xs">
				<thead
					class="border-b border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase"
				>
					<tr>
						<th class="p-3">PACIENTE / CIDADÃO</th>
						<th class="p-3">CPF / CARTÃO SUS</th>
						<th class="p-3">UBS DE VÍNCULO</th>
						<th class="p-3">HISTÓRICO NO {siglaOrgao}</th>
						<th class="p-3">ÚLTIMO ATENDIMENTO</th>
						<th class="p-3 text-right">AÇÕES</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each filtrados as pac (pac.id)}
						{@const info = mapaAtendimentos.get(pac.cpf)}
						<tr class="transition-colors hover:bg-slate-50">
							<td class="p-3 font-sans">
								<div class="font-bold text-slate-900">{pac.nome}</div>
								<div class="font-mono text-[10px] text-slate-500">
									Sexo: {pac.sexo} · Nasc: {pac.dataNascimento}
								</div>
							</td>
							<td class="p-3">
								<div class="font-bold text-slate-800">{pac.cpf}</div>
								<div class="text-[10px] text-slate-500">{pac.cartaoSus || 'Sem CNS'}</div>
							</td>
							<td class="p-3 font-sans">
								<span
									class="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
								>
									{pac.unidadeVinculada || 'Rede Municipal'}
								</span>
							</td>
							<td class="p-3">
								{#if info && info.total > 0}
									<span
										class="font-bold {ehCeo
											? 'border-emerald-300 bg-emerald-50 text-emerald-800'
											: 'border-blue-300 bg-blue-50 text-blue-900'} border px-2 py-0.5 text-[10px]"
									>
										{info.total}
										{info.total === 1
											? ehCeo
												? 'Procedimento'
												: 'Consulta'
											: ehCeo
												? 'Procedimentos'
												: 'Consultas'}
									</span>
								{:else}
									<span class="text-[10px] text-slate-400">Sem registro prévio</span>
								{/if}
							</td>
							<td class="p-3">
								{#if info && info.ultimaData}
									<div class="font-bold text-slate-800">{info.ultimaData}</div>
									<div class="text-[10px] text-slate-500 uppercase">
										{info.ultimaEsp || 'Especialidade'}
									</div>
								{:else}
									<span class="text-[10px] text-slate-400">—</span>
								{/if}
							</td>
							<td class="p-3 text-right">
								<button
									type="button"
									onclick={() => abrirDossie(pac.id)}
									class="ml-auto flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-800 uppercase hover:bg-slate-100"
								>
									<IconFileText size={13} />
									<span>Dossiê Prontuário</span>
								</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="p-8 text-center text-slate-500 font-sans">
								Nenhum paciente localizado com os filtros selecionados.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Barra de Paginação -->
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs"
			>
				<div class="font-mono text-slate-600">
					Mostrando <strong class="text-slate-900"
						>{totalRegistros === 0 ? 0 : (paginaAtual - 1) * limite + 1}–{Math.min(
							paginaAtual * limite,
							totalRegistros
						)}</strong
					>
					de <strong class="text-slate-900">{totalRegistros.toLocaleString('pt-BR')}</strong> munícipes
				</div>

				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={() => irParaPagina(1)}
						disabled={paginaAtual <= 1}
						class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
						title="Primeira página"
					>
						«
					</button>
					<button
						type="button"
						onclick={() => irParaPagina(paginaAtual - 1)}
						disabled={paginaAtual <= 1}
						class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
						title="Página anterior"
					>
						‹ Anterior
					</button>

					<span
						class="border border-slate-300 bg-white px-3 py-1 font-mono text-xs font-bold text-blue-900"
					>
						Pág. {paginaAtual} de {totalPaginas}
					</span>

					<button
						type="button"
						onclick={() => irParaPagina(paginaAtual + 1)}
						disabled={paginaAtual >= totalPaginas}
						class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
						title="Próxima página"
					>
						Próxima ›
					</button>
					<button
						type="button"
						onclick={() => irParaPagina(totalPaginas)}
						disabled={paginaAtual >= totalPaginas}
						class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
						title="Última página"
					>
						»
					</button>

					<select
						bind:value={limite}
						onchange={() => {
							paginaAtual = 1;
							carregarPacientes();
						}}
						class="ml-2 border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 outline-none"
					>
						<option value={25}>25 / pág</option>
						<option value={50}>50 / pág</option>
						<option value={100}>100 / pág</option>
					</select>
				</div>
			</div>
		</div>
	{/if}
</div>

<ModalDossiePaciente
	isOpen={modalDossieAberto}
	carregando={carregandoDossie}
	paciente={pacienteDossie}
	onClose={() => {
		modalDossieAberto = false;
		pacienteDossie = null;
	}}
	onImprimirProntuario={() => {
		modalImprimirAberto = true;
	}}
/>

{#if modalImprimirAberto && pacienteDossie}
	<ImprimirProntuario
		paciente={pacienteDossie as any}
		operador="Operador {siglaOrgao}"
		prefeitura="Secretaria Municipal de Saúde"
		unidade={nomeOrgao}
		onFechar={() => (modalImprimirAberto = false)}
	/>
{/if}
