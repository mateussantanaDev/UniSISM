<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import type {
		Combustivel,
		StatusVeiculo,
		TipoVeiculo,
		Veiculo
	} from '$lib/api/tfd-types';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let veiculos = $state<Veiculo[]>([]);
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);

	let busca = $state('');

	const filtrada = $derived.by(() => {
		if (!busca.trim()) return veiculos;
		const q = busca.toLowerCase();
		return veiculos.filter(
			(v) =>
				v.placa.toLowerCase().includes(q) ||
				v.modelo.toLowerCase().includes(q) ||
				v.tipo.toLowerCase().includes(q)
		);
	});

	const ativos = $derived(veiculos.filter((v) => v.status === 'ATIVO').length);
	const manutencao = $derived(veiculos.filter((v) => v.status === 'EM_MANUTENCAO').length);
	const capacidadeTotal = $derived(
		veiculos.filter((v) => v.status === 'ATIVO').reduce((acc, v) => acc + v.capacidade, 0)
	);

	const statusTone: Record<StatusVeiculo, string> = {
		ATIVO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		EM_MANUTENCAO: 'border-amber-600 bg-amber-50 text-amber-800',
		INATIVO: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	// Modal criar
	let modalAberto = $state(false);
	let placa = $state('');
	let modelo = $state('');
	let tipo = $state<TipoVeiculo>('VAN');
	// Strings pra ligar direto no FormField (fallback ''). Convertidas pra
	// Number no submit. Svelte 5 rejeita bind:value de tipo diferente.
	let capacidade = $state('15');
	let ano = $state(String(new Date().getFullYear()));
	let combustivel = $state<Combustivel>('DIESEL');
	let consumoMedioKml = $state('8');
	let hodometroAtualKm = $state('0');

	let processando = $state(false);
	let erro = $state('');
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function reset() {
		placa = '';
		modelo = '';
		tipo = 'VAN';
		capacidade = '15';
		ano = String(new Date().getFullYear());
		combustivel = 'DIESEL';
		consumoMedioKml = '8';
		hodometroAtualKm = '0';
		erro = '';
	}

	function abrirCriar() {
		reset();
		modalAberto = true;
	}

	async function carregar() {
		carregando = true;
		erroLista = null;
		try {
			veiculos = await api.tfd.veiculos.list();
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function criar() {
		erro = '';
		if (!placa.trim() || !modelo.trim()) {
			erro = 'Placa e modelo são obrigatórios.';
			return;
		}
		processando = true;
		try {
			await api.tfd.veiculos.create({
				placa: placa.trim().toUpperCase(),
				modelo: modelo.trim(),
				tipo,
				capacidade: Number(capacidade) || 0,
				ano: Number(ano),
				combustivel,
				consumoMedioKml: Number(consumoMedioKml),
				hodometroAtualKm: Number(hodometroAtualKm)
			});
			modalAberto = false;
			notificar('ok', 'Veículo cadastrado.');
			reset();
			await carregar();
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			processando = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-900'
				: 'border-red-700 bg-red-50 text-red-900'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'} {mensagem.texto}
		</div>
	{/if}

	{#if erroLista}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erroLista}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Frota Cadastrada"
			value={carregando ? '—' : veiculos.length}
			sublabel="Total de veículos"
		/>
		<MetricCard
			label="Ativos"
			value={carregando ? '—' : ativos}
			sublabel="Disponíveis pra operação"
			accent="success"
		/>
		<MetricCard
			label="Em Manutenção"
			value={carregando ? '—' : manutencao}
			sublabel="Indisponíveis temporariamente"
			accent="warning"
		/>
		<MetricCard
			label="Capacidade Total"
			value={carregando ? '—' : capacidadeTotal}
			sublabel="Assentos da frota ativa"
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Frota de Veículos"
			subtitle="Cadastro de placas, capacidade e consumo"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {veiculos.length}
			</span>
			{#if podeOperar}
				<PrimaryButton label="+ Novo Veículo" shortcut="N" onclick={abrirCriar} />
			{/if}
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<input
				type="text"
				bind:value={busca}
				placeholder="Placa, modelo, tipo..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Placa</th>
						<th class="border-r border-slate-200 px-3 py-2">Modelo</th>
						<th class="border-r border-slate-200 px-3 py-2">Tipo</th>
						<th class="border-r border-slate-200 px-3 py-2">Cap.</th>
						<th class="border-r border-slate-200 px-3 py-2">Combust.</th>
						<th class="border-r border-slate-200 px-3 py-2">Hodômetro</th>
						<th class="border-r border-slate-200 px-3 py-2">Consumo</th>
						<th class="px-3 py-2">Status</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="8" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum veículo encontrado.
							</td>
						</tr>
					{:else}
						{#each filtrada as v (v.id)}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => goto(`/tfd/frota/${v.id}`)}
							>
								<td
									class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									{v.placa}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{v.modelo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{v.tipo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{v.capacidade}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{v.combustivel}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{v.hodometroAtualKm.toLocaleString('pt-BR')} km
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{v.consumoMedioKml.toFixed(1)} km/L
								</td>
								<td class="px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusTone[
											v.status
										]}"
									>
										{v.status === 'EM_MANUTENCAO' ? 'MANUT.' : v.status}
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal criar -->
<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Cadastrar Novo Veículo"
	subtitle="Frota TFD · auditado"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Placa"
				name="placa"
				span={4}
				mono
				placeholder="ABC-1D23"
				bind:value={placa}
			/>
			<FormField
				label="Modelo"
				name="modelo"
				span={8}
				placeholder="Ex.: Renault Master 16 lug. 2023"
				bind:value={modelo}
			/>

			<div class="col-span-3 flex flex-col">
				<label
					for="tipo"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Tipo
				</label>
				<select
					id="tipo"
					bind:value={tipo}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="VAN">Van</option>
					<option value="ONIBUS">Ônibus</option>
					<option value="CARRO">Carro</option>
					<option value="AMBULANCIA">Ambulância</option>
				</select>
			</div>
			<FormField
				label="Capacidade"
				name="capacidade"
				type="number"
				span={2}
				mono
				bind:value={capacidade}
			/>
			<FormField
				label="Ano"
				name="ano"
				type="number"
				span={2}
				mono
				bind:value={ano}
			/>
			<div class="col-span-3 flex flex-col">
				<label
					for="comb"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Combustível
				</label>
				<select
					id="comb"
					bind:value={combustivel}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="DIESEL">Diesel</option>
					<option value="GASOLINA">Gasolina</option>
					<option value="ETANOL">Etanol</option>
					<option value="FLEX">Flex</option>
					<option value="GNV">GNV</option>
					<option value="ELETRICO">Elétrico</option>
				</select>
			</div>
			<FormField
				label="Consumo (km/L)"
				name="consumo"
				type="number"
				span={2}
				mono
				bind:value={consumoMedioKml}
			/>
			<FormField
				label="Hodômetro Atual (km)"
				name="hod"
				type="number"
				span={4}
				mono
				bind:value={hodometroAtualKm}
			/>
		</div>

		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (modalAberto = false)} />
			<PrimaryButton label="Cadastrar" onclick={criar} loading={processando} />
		</div>
	</div>
</Modal>
