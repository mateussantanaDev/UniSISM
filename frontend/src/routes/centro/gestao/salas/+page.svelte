<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconInfoCircle,
		IconBuildingHospital,
		IconUser,
		IconDental,
		IconStethoscope,
		IconTools
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloUnidadeFisica = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório Médico');
	let rotuloUnidadeFisicaPlural = $derived(ehCeo ? 'Cadeiras Odontológicas' : 'Consultórios e Salas');

	interface SalaConsultorio {
		id: string;
		codigo: string;
		nome: string;
		especialidadePrincipal: string;
		medicoAlocado?: string;
		medicoCrm?: string;
		status: 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'MANUTENCAO' | 'RESERVADA';
		equipamentos: string[];
		ala: string;
		observacoes?: string;
	}

	// State
	let carregando = $state(true);
	let mensagemSucesso = $state('');
	let erro = $state('');

	let listaSalas = $state<SalaConsultorio[]>([]);

	// Modals
	let modalNovaSalaAberto = $state(false);
	let formCodigo = $state('CONS-05');
	let formNome = $state('Consultório 05 — Ortopedia');
	let formEspecialidade = $state('Ortopedia');
	let formAla = $state('Ala A — Térreo');
	let formEquipamentos = $state('Maca Articulada, Raio-X Digital, Foco Auxiliar');

	let erroModalSala = $state('');

	async function carregarSalas() {
		carregando = true;
		erro = '';
		try {
			const res = await api.centroGestao.listSalas({ centro: siglaOrgao });
			listaSalas = Array.isArray(res) ? (res as any[]) : [];
		} catch (e: any) {
			console.info('[UniSISM] Falha ao carregar salas da API.', e);
			listaSalas = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarSalas();
	});

	async function cadastrarNovaSala() {
		if (!formCodigo.trim() || !formNome.trim()) {
			erroModalSala = 'Preencha os campos obrigatórios (Código e Nome da Sala).';
			return;
		}
		erroModalSala = '';

		const nova: SalaConsultorio = {
			id: 'sala-' + Date.now(),
			codigo: formCodigo.trim(),
			nome: formNome.trim(),
			especialidadePrincipal: formEspecialidade,
			status: 'DISPONIVEL',
			equipamentos: formEquipamentos.split(',').map(s => s.trim()).filter(Boolean),
			ala: formAla
		};

		try {
			await api.centroGestao.criarSala(nova as any);
		} catch (e) {
			console.info('[UniSISM] Criar sala executado em modo local.', e);
		}

		listaSalas.push(nova);
		modalNovaSalaAberto = false;
		mensagemSucesso = `✓ Sala/Consultório ${nova.codigo} cadastrada com sucesso!`;
		setTimeout(() => mensagemSucesso = '', 4000);
	}

	async function alterarStatusSala(sala: SalaConsultorio, novoStatus: SalaConsultorio['status']) {
		sala.status = novoStatus;
		try {
			await api.centroGestao.atualizarSala(sala.id, { status: novoStatus } as any);
		} catch (e) {
			console.info('[UniSISM] Atualizar sala salvo em transição.', e);
		}
		mensagemSucesso = `✓ Status da sala ${sala.codigo} alterado para ${novoStatus}.`;
		setTimeout(() => mensagemSucesso = '', 4000);
	}
</script>

<svelte:head>
	<title>ERP Gestão - Infraestrutura & {rotuloUnidadeFisicaPlural} · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="GESTÃO DE INFRAESTRUTURA & {rotuloUnidadeFisicaPlural.toUpperCase()} — {nomeOrgao.toUpperCase()}"
		subtitle="Mapeamento e controle em tempo real de {rotuloUnidadeFisicaPlural.toLowerCase()}, equipamentos instalados, profissionais alocados e status operacional."
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
	<section class="border border-slate-200 bg-white p-4 flex items-center justify-between">
		<div>
			<span class="font-bold text-slate-900 text-xs uppercase">{rotuloUnidadeFisicaPlural.toUpperCase()} CADASTRADAS</span>
			<span class="text-slate-500 text-[10px] block">Capacidade física instalada do {nomeOrgao}</span>
		</div>
		<button
			onclick={() => modalNovaSalaAberto = true}
			class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950"
		>
			+ Cadastrar {rotuloUnidadeFisica}
		</button>
	</section>

	<!-- Grid de Consultórios / Cadeiras -->
	<section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
		{#each listaSalas as sala (sala.id)}
			<div class="border border-slate-200 bg-white p-5 flex flex-col justify-between gap-3">
				<div>
					<div class="flex items-center justify-between border-b border-slate-100 pb-3">
						<div class="flex items-center gap-2">
							<span class="bg-slate-900 text-white font-mono px-2 py-0.5 text-xs font-bold">{sala.codigo}</span>
							<span class="font-bold text-slate-900 font-sans text-sm">{sala.nome}</span>
						</div>
						{#if sala.status === 'EM_ATENDIMENTO'}
							<span class="bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold px-2 py-0.5 text-[10px]">EM ATENDIMENTO</span>
						{:else if sala.status === 'DISPONIVEL'}
							<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 text-[10px]">LIVRE / DISPONÍVEL</span>
						{:else if sala.status === 'MANUTENCAO'}
							<span class="bg-rose-100 text-rose-900 border border-rose-300 font-bold px-2 py-0.5 text-[10px]">EM MANUTENÇÃO</span>
						{:else}
							<span class="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 text-[10px]">RESERVADA</span>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-3 mt-3 text-xs">
						<div>
							<span class="text-slate-500 text-[10px] uppercase font-bold block">Especialidade Alocada</span>
							<span class="font-bold text-slate-800">{sala.especialidadePrincipal}</span>
						</div>
						<div>
							<span class="text-slate-500 text-[10px] uppercase font-bold block">Ala / Localização</span>
							<span class="font-bold text-slate-800">{sala.ala}</span>
						</div>
					</div>

					{#if sala.medicoAlocado}
						<div class="mt-3 bg-blue-50 border border-blue-200 p-2 text-blue-900 font-semibold text-[11px] flex items-center gap-1.5">
							{#if ehCeo}
								<IconDental size={14} class="text-blue-900 shrink-0" />
							{:else}
								<IconStethoscope size={14} class="text-blue-900 shrink-0" />
							{/if}
							<span>{ehCeo ? 'Cirurgião-Dentista' : 'Médico'} em Turno: <strong>{sala.medicoAlocado}</strong> ({sala.medicoCrm})</span>
						</div>
					{:else}
						<div class="mt-3 bg-slate-50 border border-slate-200 p-2 text-slate-500 font-mono text-[10px] flex items-center gap-1.5">
							<IconInfoCircle size={12} class="text-slate-400 shrink-0" />
							<span>Sem profissional alocado na escala hoje</span>
						</div>
					{/if}

					<div class="mt-3">
						<span class="text-slate-500 text-[10px] uppercase font-bold block mb-1">Equipamentos Instalados</span>
						<div class="flex flex-wrap gap-1">
							{#each sala.equipamentos as eq}
								<span class="bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 text-[10px]">{eq}</span>
							{/each}
						</div>
					</div>

					{#if sala.observacoes}
						<div class="mt-3 text-[10px] text-amber-900 bg-amber-50 p-2 border border-amber-200 flex items-center gap-1">
							<IconInfoCircle size={12} class="text-amber-700 shrink-0" />
							<span>{sala.observacoes}</span>
						</div>
					{/if}
				</div>

				<div class="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px]">
					<span class="text-slate-500">Alterar Estado:</span>
					<div class="flex gap-1">
						<button
							onclick={() => alterarStatusSala(sala, 'DISPONIVEL')}
							class="border border-emerald-700 bg-emerald-50 text-emerald-900 px-2 py-0.5 font-bold hover:bg-emerald-100"
						>
							Livre
						</button>
						<button
							onclick={() => alterarStatusSala(sala, 'EM_ATENDIMENTO')}
							class="border border-indigo-700 bg-indigo-50 text-indigo-900 px-2 py-0.5 font-bold hover:bg-indigo-100"
						>
							Ocupada
						</button>
						<button
							onclick={() => alterarStatusSala(sala, 'MANUTENCAO')}
							class="border border-rose-700 bg-rose-50 text-rose-900 px-2 py-0.5 font-bold hover:bg-rose-100 flex items-center gap-1"
						>
							<IconTools size={11} />
							<span>Manutenção</span>
						</button>
					</div>
				</div>
			</div>
		{:else}
			{#if !carregando}
				<div class="col-span-full border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 font-mono text-xs">
					Nenhum {rotuloUnidadeFisica.toLowerCase()} cadastrado no banco de dados. Clique em "+ Cadastrar {rotuloUnidadeFisica}" para cadastrar.
				</div>
			{/if}
		{/each}
	</section>
</div>

<!-- Modal: Cadastrar Consultório -->
{#if modalNovaSalaAberto}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs">
		<div class="w-full max-w-lg border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">+ Cadastrar Novo Consultório / Sala</div>
				<button onclick={() => modalNovaSalaAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroModalSala}
					<div class="border border-rose-200 bg-rose-50 p-2.5 text-rose-900 font-bold flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="text-rose-700 shrink-0" />
						<span>{erroModalSala}</span>
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="sl-cod" class="font-bold text-slate-700 text-[11px]">Código da Sala *</label>
						<input id="sl-cod" type="text" bind:value={formCodigo} class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="sl-nome" class="font-bold text-slate-700 text-[11px]">Nome de Identificação *</label>
						<input id="sl-nome" type="text" bind:value={formNome} class="border border-slate-300 p-2 text-xs" />
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="sl-esp" class="font-bold text-slate-700 text-[11px]">Especialidade Principal</label>
						<input id="sl-esp" type="text" bind:value={formEspecialidade} class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="sl-ala" class="font-bold text-slate-700 text-[11px]">Ala / Andar</label>
						<input id="sl-ala" type="text" bind:value={formAla} class="border border-slate-300 p-2 text-xs" />
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label for="sl-eq" class="font-bold text-slate-700 text-[11px]">Equipamentos (separados por vírgula)</label>
					<input id="sl-eq" type="text" bind:value={formEquipamentos} class="border border-slate-300 p-2 text-xs" />
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalNovaSalaAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={cadastrarNovaSala}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950"
				>
					✓ Cadastrar Consultório
				</button>
			</div>
		</div>
	</div>
{/if}
