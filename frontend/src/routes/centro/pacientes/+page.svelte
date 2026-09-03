<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { PacienteResumo, Encaminhamento } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import ModalDossiePaciente from '$lib/presentation/components/centro/ModalDossiePaciente.svelte';
	import ImprimirProntuario from '$lib/presentation/components/prontuario/ImprimirProntuario.svelte';
	import type { PacienteCompleto } from '$lib/domain/models/Paciente';
	import { IconSearch, IconFileText } from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	let listaPacientes = $state<PacienteResumo[]>([]);
	let encaminhamentosCentro = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroEspecialidade = $state('TODAS');

	// Modal Dossiê & Impressão
	let modalDossieAberto = $state(false);
	let pacienteDossie = $state<PacienteCompleto | null>(null);
	let carregandoDossie = $state(false);
	let modalImprimirAberto = $state(false);

	onMount(async () => {
		try {
			const [pacs, encs] = await Promise.all([
				api.pacientes.list().catch(() => []),
				api.encaminhamentos.list({ limit: 1000 }).catch(() => [])
			]);

			listaPacientes = pacs;
			encaminhamentosCentro = encs.filter((e: Encaminhamento) => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return f === 'CENTRO_ESPECIALIDADES' || f === 'CEM' || (f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO');
				}
			});
		} finally {
			carregando = false;
		}
	});

	// Mapa de atendimentos vinculados por paciente
	let mapaAtendimentos = $derived.by(() => {
		const mapa = new Map<string, { total: number; ultimaData?: string; ultimaEsp?: string }>();
		for (const e of encaminhamentosCentro) {
			const cpf = e.paciente?.cpf;
			if (!cpf) continue;
			const atual = mapa.get(cpf) || { total: 0 };
			atual.total += 1;
			if (e.agendamentoPrevisto && (!atual.ultimaData || e.agendamentoPrevisto > atual.ultimaData)) {
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
		let res = listaPacientes.filter(p => {
			const termo = busca.toLowerCase().trim();
			const matchBusca = !termo ||
				p.nome.toLowerCase().includes(termo) ||
				p.cpf.includes(termo) ||
				(p.cartaoSus && p.cartaoSus.includes(termo));

			if (!matchBusca) return false;

			if (filtroEspecialidade !== 'TODAS') {
				const info = mapaAtendimentos.get(p.cpf);
				return info?.ultimaEsp === filtroEspecialidade;
			}

			return true;
		});
		return res;
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
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">CIDADÃOS NO CADASTRO</div>
			<div class="mt-2 text-2xl font-black text-slate-900 font-sans">{listaPacientes.length}</div>
			<div class="mt-1 text-[10px] text-slate-500 font-mono">Base municipal integrada</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">COM ATENDIMENTO NO {siglaOrgao}</div>
			<div class="mt-2 text-2xl font-black {ehCeo ? 'text-emerald-800' : 'text-blue-900'} font-sans">{mapaAtendimentos.size}</div>
			<div class="mt-1 text-[10px] text-slate-500 font-mono">{ehCeo ? 'Tratamentos Odontológicos' : 'Consultas Especializadas'}</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">ENCAMINHAMENTOS RECEBIDOS</div>
			<div class="mt-2 text-2xl font-black text-amber-700 font-sans">{encaminhamentosCentro.length}</div>
			<div class="mt-1 text-[10px] text-slate-500 font-mono">Total regulado pelas UBSs</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">ESPECIALIDADES ATIVAS</div>
			<div class="mt-2 text-2xl font-black text-indigo-900 font-sans">{especialidadesUnicas.length}</div>
			<div class="mt-1 text-[10px] text-slate-500 font-mono">{ehCeo ? 'Áreas de Saúde Bucal' : 'Clínicas Médicas'}</div>
		</div>
	</section>

	<!-- Barra de Controles e Busca -->
	<section class="border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
		<div class="flex flex-1 items-center gap-2">
			<input
				type="text"
				bind:value={busca}
				placeholder="Buscar por Nome do Paciente, CPF ou Cartão SUS..."
				class="w-full max-w-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono outline-none focus:border-slate-900 focus:bg-white"
			/>

			{#if especialidadesUnicas.length > 0}
				<select
					bind:value={filtroEspecialidade}
					class="border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono outline-none focus:border-slate-900 focus:bg-white"
				>
					<option value="TODAS">TODAS AS ESPECIALIDADES</option>
					{#each especialidadesUnicas as esp}
						<option value={esp}>{esp.toUpperCase()}</option>
					{/each}
				</select>
			{/if}
		</div>

		<div class="text-right text-[11px] text-slate-500 font-mono">
			Exibindo <strong>{filtrados.length}</strong> de {listaPacientes.length} registros
		</div>
	</section>

	<!-- Tabela de Pacientes -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500">
			Carregando base de cidadãos e histórico do {siglaOrgao}...
		</div>
	{:else}
		<div class="border border-slate-200 bg-white overflow-x-auto shadow-xs">
			<table class="w-full text-left font-mono text-xs">
				<thead class="border-b border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
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
						<tr class="hover:bg-slate-50 transition-colors">
							<td class="p-3 font-sans">
								<div class="font-bold text-slate-900">{pac.nome}</div>
								<div class="text-[10px] text-slate-500 font-mono">Sexo: {pac.sexo} · Nasc: {pac.dataNascimento}</div>
							</td>
							<td class="p-3">
								<div class="font-bold text-slate-800">{pac.cpf}</div>
								<div class="text-[10px] text-slate-500">{pac.cartaoSus || 'Sem CNS'}</div>
							</td>
							<td class="p-3 font-sans">
								<span class="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 font-semibold">
									{pac.unidadeVinculada || 'Rede Municipal'}
								</span>
							</td>
							<td class="p-3">
								{#if info && info.total > 0}
									<span class="font-bold {ehCeo ? 'text-emerald-800 bg-emerald-50 border-emerald-300' : 'text-blue-900 bg-blue-50 border-blue-300'} border px-2 py-0.5 text-[10px]">
										{info.total} {info.total === 1 ? (ehCeo ? 'Procedimento' : 'Consulta') : (ehCeo ? 'Procedimentos' : 'Consultas')}
									</span>
								{:else}
									<span class="text-slate-400 text-[10px]">Sem registro prévio</span>
								{/if}
							</td>
							<td class="p-3">
								{#if info && info.ultimaData}
									<div class="font-bold text-slate-800">{info.ultimaData}</div>
									<div class="text-[10px] text-slate-500 uppercase">{info.ultimaEsp || 'Especialidade'}</div>
								{:else}
									<span class="text-slate-400 text-[10px]">—</span>
								{/if}
							</td>
							<td class="p-3 text-right">
								<button
									type="button"
									onclick={() => abrirDossie(pac.id)}
									class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-100 uppercase flex items-center gap-1.5 ml-auto"
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
		onFechar={() => modalImprimirAberto = false}
	/>
{/if}
