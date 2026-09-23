<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconSearch,
		IconStethoscope,
		IconDental,
		IconFlask,
		IconFileText
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	interface EspecialidadeSigtap {
		id: string;
		nome: string;
		codigoSigtap: string;
		tempoPadraoMinutos: number;
		valorTabelaBrl: number;
		documentosObrigatorios: string[];
		preparoRequerido: string;
		ativa: boolean;
		tipoServico: 'CONSULTA' | 'PROCEDIMENTO';
		necessitaTriagem?: boolean;
	}

	let carregando = $state(true);
	let mensagemSucesso = $state('');
	let erro = $state('');
	let filtroTipo = $state<'TODOS' | 'CONSULTA' | 'PROCEDIMENTO'>('TODOS');

	let listaEspecialidades = $state<EspecialidadeSigtap[]>([]);

	let exibidas = $derived(
		listaEspecialidades.filter((e) => filtroTipo === 'TODOS' || e.tipoServico === filtroTipo)
	);

	// Modal State
	let modalNovaAberto = $state(false);
	let erroModal = $state('');
	let formNome = $state('');
	let formCodigo = $state('');
	let formTempo = $state(20);
	let formValor = $state(80.0);
	let formTipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('PROCEDIMENTO');
	let formDocs = $state('');
	let formPreparo = $state('');
	let formNecessitaTriagem = $state(false);

	async function carregarEspecialidades() {
		carregando = true;
		erro = '';
		try {
			const res = await api.centroGestao.listEspecialidades({ centro: siglaOrgao });
			if (Array.isArray(res)) {
				listaEspecialidades = (res as any[]).map((e) => ({
					...e,
					tipoServico:
						e.tipoServico ||
						(e.nome.toLowerCase().includes('exame') ||
						e.nome.toLowerCase().includes('procedimento') ||
						e.nome.toLowerCase().includes('eletro') ||
						e.nome.toLowerCase().includes('eco') ||
						e.nome.toLowerCase().includes('ultra') ||
						e.nome.toLowerCase().includes('biópsia') ||
						e.nome.toLowerCase().includes('raspagem') ||
						e.nome.toLowerCase().includes('canal')
							? 'PROCEDIMENTO'
							: 'CONSULTA')
				}));
			} else {
				listaEspecialidades = [];
			}
		} catch (e: any) {
			console.info('[UniSISM] Falha ao carregar especialidades.', e);
			listaEspecialidades = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarEspecialidades();
	});

	async function cadastrarEspecialidade() {
		if (!formNome.trim() || !formCodigo.trim()) {
			erroModal = 'Preencha o nome e o código SIGTAP / SIA-SUS.';
			return;
		}
		erroModal = '';

		const nova = {
			nome: formNome.trim(),
			codigoSigtap: formCodigo.trim(),
			tempoPadraoMinutos: Number(formTempo) || 20,
			valorTabelaBrl: Number(formValor) || 0,
			documentosObrigatorios: formDocs
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
			preparoRequerido: formPreparo.trim() || undefined,
			ativa: true,
			tipoServico: formTipoServico,
			necessitaTriagem: formNecessitaTriagem,
			centro: siglaOrgao
		};

		try {
			await api.centroGestao.criarEspecialidade(nova as any);
			await carregarEspecialidades();
			modalNovaAberto = false;
			formNome = '';
			formCodigo = '';
			formDocs = '';
			formPreparo = '';
			formNecessitaTriagem = false;
			mensagemSucesso = `✓ ${nova.tipoServico === 'PROCEDIMENTO' ? 'Procedimento' : 'Consulta'} "${nova.nome}" cadastrado com sucesso no catálogo do ${siglaOrgao}!`;
			setTimeout(() => (mensagemSucesso = ''), 4000);
		} catch (e: any) {
			console.error(e);
			erroModal = `Falha ao cadastrar especialidade: ${e?.message || 'Erro do servidor'}`;
		}
	}

	async function toggleTriagem(esp: EspecialidadeSigtap) {
		try {
			const novoValor = !esp.necessitaTriagem;
			await api.centroGestao.atualizarEspecialidade(esp.id, { necessitaTriagem: novoValor });
			esp.necessitaTriagem = novoValor;
			mensagemSucesso = `✓ Triagem de enfermagem para "${esp.nome}" agora está: ${novoValor ? 'OBRIGATÓRIA' : 'DISPENSADA'}.`;
			setTimeout(() => (mensagemSucesso = ''), 3000);
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao atualizar triagem: ${e?.message || 'Erro do servidor'}`;
		}
	}

	async function excluirEspecialidade(id: string, nome: string) {
		if (!confirm(`Deseja realmente desativar/remover "${nome}" do catálogo do ${siglaOrgao}?`)) {
			return;
		}
		try {
			await api.centroGestao.excluirEspecialidade(id);
			mensagemSucesso = `✓ Especialidade "${nome}" removida do catálogo.`;
			await carregarEspecialidades();
			setTimeout(() => (mensagemSucesso = ''), 4000);
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao remover especialidade: ${e?.message || 'Erro do servidor'}`;
		}
	}
</script>

<svelte:head>
	<title>ERP Gestão - Catálogo SIGTAP & Serviços · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="CATÁLOGO DE ESPECIALIDADES & TABELA SIGTAP / SUS — {nomeOrgao.toUpperCase()}"
		subtitle="Parâmetros clínicos do {nomeOrgao}: cadastramento de serviços, códigos SIGTAP/SIA-SUS, tempo médio de atendimento e diretrizes exigidas das UBSs."
	/>

	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div
			class="flex flex-col gap-1 border-2 border-emerald-700 bg-emerald-50 p-4 font-bold whitespace-pre-wrap text-emerald-900 shadow-sm"
		>
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 px-2 py-0.5 font-mono text-xs text-white">SUCESSO</span>
				<span>CATÁLOGO ATUALIZADO</span>
			</div>
			<div class="mt-1 font-mono text-xs font-normal">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Control Bar -->
	<section
		class="flex flex-col justify-between gap-3 border border-slate-200 bg-white p-4 md:flex-row md:items-center"
	>
		<div>
			<span class="text-xs font-bold text-slate-900 uppercase"
				>SERVIÇOS ESPECIALIZADOS HABILITADOS ({siglaOrgao})</span
			>
			<span class="block text-[10px] text-slate-500"
				>Catálogo oficial de Consultas e Procedimentos do {nomeOrgao}</span
			>
		</div>
		<div class="flex items-center gap-2">
			<!-- Filtro por Tipo -->
			<div class="flex border border-slate-300 bg-slate-100 p-0.5 text-[11px]">
				<button
					type="button"
					onclick={() => (filtroTipo = 'TODOS')}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'TODOS'
						? 'bg-blue-900 text-white'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					Todos ({listaEspecialidades.length})
				</button>
				<button
					type="button"
					onclick={() => (filtroTipo = 'CONSULTA')}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'CONSULTA'
						? 'bg-blue-900 text-white'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					Consultas ({listaEspecialidades.filter((e) => e.tipoServico === 'CONSULTA').length})
				</button>
				<button
					type="button"
					onclick={() => (filtroTipo = 'PROCEDIMENTO')}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'PROCEDIMENTO'
						? 'bg-purple-900 text-white'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					Procedimentos ({listaEspecialidades.filter((e) => e.tipoServico === 'PROCEDIMENTO')
						.length})
				</button>
			</div>

			<button
				onclick={() => (modalNovaAberto = true)}
				class="border border-blue-900 bg-blue-900 px-4 py-2 text-xs font-bold tracking-wider text-white uppercase hover:bg-blue-950"
			>
				+ Habilitar Serviço / SIGTAP
			</button>
		</div>
	</section>

	<!-- Tabela SIGTAP / Especialidades -->
	<section class="overflow-hidden border border-slate-200 bg-white">
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-left">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-900 text-[10px] font-bold tracking-wider text-white uppercase"
					>
						<th class="p-3">Tipo</th>
						<th class="p-3">Especialidade / Serviço</th>
						<th class="p-3">Código SIGTAP (SIA-SUS)</th>
						<th class="p-3">Tempo Padrão</th>
						<th class="p-3">Valor Repasse SIA-SUS</th>
						<th class="p-3">Documentos & Exames Obrigatórios (UBS)</th>
						<th class="p-3">Triagem Prévia</th>
						<th class="p-3">Status</th>
						<th class="p-3 text-right">Ações</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 font-mono text-xs">
					{#each exibidas as esp (esp.id)}
						<tr class="hover:bg-slate-50">
							<td class="p-3">
								{#if esp.tipoServico === 'PROCEDIMENTO'}
									<span
										class="flex w-fit items-center gap-1 border border-purple-300 bg-purple-100 px-2 py-0.5 text-[9px] font-bold tracking-wider text-purple-900 uppercase"
									>
										<IconFlask size={11} />
										<span>PROCEDIMENTO</span>
									</span>
								{:else}
									<span
										class="flex w-fit items-center gap-1 border border-blue-300 bg-blue-100 px-2 py-0.5 text-[9px] font-bold tracking-wider text-blue-900 uppercase"
									>
										{#if ehCeo}
											<IconDental size={11} />
										{:else}
											<IconStethoscope size={11} />
										{/if}
										<span>CONSULTA</span>
									</span>
								{/if}
							</td>
							<td class="p-3 font-sans font-bold text-slate-900">{esp.nome}</td>
							<td class="p-3">
								<span
									class="border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-900"
								>
									{esp.codigoSigtap}
								</span>
							</td>
							<td class="p-3 font-semibold text-slate-700">{esp.tempoPadraoMinutos} minutos</td>
							<td class="p-3 font-bold text-emerald-800">R$ {esp.valorTabelaBrl.toFixed(2)}</td>
							<td class="p-3 text-slate-700">
								<div class="flex flex-col gap-1">
									{#each (esp.documentosObrigatorios || []).filter((d) => !d.startsWith('CENTRO:')) as doc}
										<div
											class="flex items-center gap-1 border border-amber-200 bg-amber-50 p-1 font-sans text-[10px] text-amber-900"
										>
											<IconFileText size={11} class="shrink-0" />
											<span>{doc}</span>
										</div>
									{/each}
									<div class="mt-0.5 text-[10px] text-slate-500 italic">
										Preparo: {esp.preparoRequerido || 'Nenhum'}
									</div>
								</div>
							</td>
							<td class="p-3">
								<button
									type="button"
									onclick={() => toggleTriagem(esp)}
									class="flex items-center gap-1.5 border px-2 py-1 text-[10px] font-bold transition-colors {esp.necessitaTriagem
										? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
										: 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'}"
									title="Clique para alternar obrigatoriedade de triagem de enfermagem"
								>
									{#if esp.necessitaTriagem}
										<span class="h-2 w-2 rounded-full bg-amber-600"></span>
										<span>OBRIGATÓRIA</span>
									{:else}
										<span class="h-2 w-2 rounded-full bg-slate-400"></span>
										<span>DISPENSADA</span>
									{/if}
								</button>
							</td>
							<td class="p-3">
								<span
									class="border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900"
								>
									HABILITADA
								</span>
							</td>
							<td class="p-3 text-right">
								<button
									type="button"
									onclick={() => excluirEspecialidade(esp.id, esp.nome)}
									class="border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 uppercase transition-colors hover:bg-red-100"
								>
									Remover
								</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="9" class="p-6 text-center text-slate-500 font-sans">
								Nenhum serviço cadastrado nesta categoria.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<!-- Modal: Habilitar Especialidade -->
{#if modalNovaAberto}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs"
	>
		<div
			class="w-full max-w-lg border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white"
			>
				<div class="text-xs font-bold tracking-wider uppercase">
					+ Habilitar Novo Serviço / SIGTAP
				</div>
				<button
					onclick={() => (modalNovaAberto = false)}
					class="text-sm font-bold text-slate-400 hover:text-white">✕</button
				>
			</div>

			<div class="flex flex-col gap-4 p-5">
				{#if erroModal}
					<div
						class="flex items-center gap-1.5 border border-red-700 bg-red-50 p-2 text-xs font-bold text-red-900"
					>
						<IconAlertTriangle size={14} class="shrink-0 text-red-700" />
						<span>{erroModal}</span>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<label for="esp-tipo" class="text-[11px] font-bold text-slate-700"
						>Tipo de Serviço *</label
					>
					<select
						id="esp-tipo"
						bind:value={formTipoServico}
						class="border border-slate-300 bg-white p-2 text-xs font-bold"
					>
						<option value="CONSULTA"
							>{ehCeo
								? 'CONSULTA ODONTOLÓGICA ESPECIALIZADA'
								: 'CONSULTA MÉDICA ESPECIALIZADA'}</option
						>
						<option value="PROCEDIMENTO">PROCEDIMENTO DIAGNÓSTICO / TERAPÊUTICO</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="esp-nome" class="text-[11px] font-bold text-slate-700"
							>Nome do Serviço / Especialidade *</label
						>
						<input
							id="esp-nome"
							type="text"
							bind:value={formNome}
							class="border border-slate-300 p-2 text-xs"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="esp-cod" class="text-[11px] font-bold text-slate-700"
							>Código SIGTAP / SIA-SUS *</label
						>
						<input
							id="esp-cod"
							type="text"
							bind:value={formCodigo}
							class="border border-slate-300 p-2 text-xs font-bold"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="esp-tempo" class="text-[11px] font-bold text-slate-700"
							>Tempo Padrão (Minutos)</label
						>
						<input
							id="esp-tempo"
							type="number"
							bind:value={formTempo}
							class="border border-slate-300 p-2 text-xs"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="esp-val" class="text-[11px] font-bold text-slate-700"
							>Valor de Repasse Tabela SUS (R$)</label
						>
						<input
							id="esp-val"
							type="number"
							step="0.01"
							bind:value={formValor}
							class="border border-slate-300 p-2 text-xs"
						/>
					</div>
				</div>

				<div class="flex items-center gap-2.5 rounded border border-amber-200 bg-amber-50/70 p-3">
					<input
						id="esp-triagem"
						type="checkbox"
						bind:checked={formNecessitaTriagem}
						class="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-900"
					/>
					<label for="esp-triagem" class="cursor-pointer text-[11px] font-bold text-slate-800">
						Exige Triagem Prévia de Enfermagem (Aferição de sinais vitais e antropometria antes da
						consulta)
					</label>
				</div>

				<div class="flex flex-col gap-1">
					<label for="esp-docs" class="text-[11px] font-bold text-slate-700"
						>Exames / Documentos Exigidos da UBS</label
					>
					<input
						id="esp-docs"
						type="text"
						bind:value={formDocs}
						class="border border-slate-300 p-2 text-xs"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label for="esp-prep" class="text-[11px] font-bold text-slate-700"
						>Orientações de Preparo para o Paciente</label
					>
					<input
						id="esp-prep"
						type="text"
						bind:value={formPreparo}
						class="border border-slate-300 p-2 text-xs"
					/>
				</div>
			</div>

			<div
				class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3"
			>
				<button
					onclick={() => (modalNovaAberto = false)}
					class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100"
				>
					Cancelar
				</button>
				<button
					onclick={cadastrarEspecialidade}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950"
				>
					✓ Salvar no Catálogo SIGTAP
				</button>
			</div>
		</div>
	</div>
{/if}
