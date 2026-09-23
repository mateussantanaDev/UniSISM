<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarCpf, formatarData } from '$lib/presentation/utils/tfdFormat';
	import type { CategoriaCNH, Motorista, StatusMotorista } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let motoristas = $state<Motorista[]>([]);
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);

	let busca = $state('');

	const filtrada = $derived.by(() => {
		if (!busca.trim()) return motoristas;
		const q = busca.toLowerCase();
		return motoristas.filter(
			(m) =>
				m.nome.toLowerCase().includes(q) ||
				formatarCpf(m.cpf).includes(busca) ||
				m.cpf.includes(busca.replace(/\D/g, '')) ||
				m.cnh.includes(busca)
		);
	});

	const ativos = $derived(motoristas.filter((m) => m.status === 'ATIVO').length);
	const afastados = $derived(motoristas.filter((m) => m.status === 'AFASTADO').length);
	const totalKm = $derived(motoristas.reduce((acc, m) => acc + m.totalKmRodados, 0));

	const statusTone: Record<StatusMotorista, string> = {
		ATIVO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		AFASTADO: 'border-amber-600 bg-amber-50 text-amber-800',
		INATIVO: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	// Modal criar
	let modalAberto = $state(false);
	let nome = $state('');
	let cpf = $state('');
	let cnh = $state('');
	let categoriaCnh = $state<CategoriaCNH>('D');
	let validadeCnh = $state('');
	let telefone = $state('');
	let processando = $state(false);
	let erro = $state('');

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function reset() {
		nome = '';
		cpf = '';
		cnh = '';
		categoriaCnh = 'D';
		validadeCnh = '';
		telefone = '';
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
			motoristas = await api.tfd.motoristas.list();
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function criar() {
		erro = '';
		if (!nome.trim() || !cpf.trim() || !cnh.trim() || !validadeCnh || !telefone.trim()) {
			erro = 'Todos os campos são obrigatórios.';
			return;
		}
		processando = true;
		try {
			await api.tfd.motoristas.create({
				nome: nome.trim(),
				cpf: cpf.replace(/\D/g, ''),
				cnh: cnh.trim(),
				categoriaCnh,
				validadeCnh,
				telefone: telefone.trim()
			});
			modalAberto = false;
			notificar('ok', 'Motorista cadastrado.');
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
			{mensagem.tipo === 'ok' ? '✓' : '⚠'}
			{mensagem.texto}
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
			label="Cadastrados"
			value={carregando ? '—' : motoristas.length}
			sublabel="Quadro total"
		/>
		<MetricCard
			label="Ativos"
			value={carregando ? '—' : ativos}
			sublabel="Operando"
			accent="success"
		/>
		<MetricCard
			label="Afastados"
			value={carregando ? '—' : afastados}
			sublabel="Indisponíveis"
			accent="warning"
		/>
		<MetricCard
			label="Total KM Rodados"
			value={carregando ? '—' : totalKm.toLocaleString('pt-BR')}
			sublabel="Histórico do quadro"
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Motoristas"
			subtitle="Cadastro de condutores com CNH e categoria"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {motoristas.length}
			</span>
			{#if podeOperar}
				<PrimaryButton label="+ Novo Motorista" shortcut="N" onclick={abrirCriar} />
			{/if}
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<input
				type="text"
				bind:value={busca}
				placeholder="Nome, CPF, CNH..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">CPF</th>
						<th class="border-r border-slate-200 px-3 py-2">CNH</th>
						<th class="border-r border-slate-200 px-3 py-2">Cat.</th>
						<th class="border-r border-slate-200 px-3 py-2">Validade</th>
						<th class="border-r border-slate-200 px-3 py-2">Telefone</th>
						<th class="border-r border-slate-200 px-3 py-2">Viagens</th>
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
								Nenhum motorista encontrado.
							</td>
						</tr>
					{:else}
						{#each filtrada as m (m.id)}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => goto(`/tfd/motoristas/${m.id}`)}
							>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{m.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarCpf(m.cpf)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">{m.cnh}</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">{m.categoriaCnh}</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarData(m.validadeCnh)}
									{#if m.cnhVencidaEm < 0}
										<span
											class="ml-1 border border-red-700 bg-red-50 px-1 text-[9px] font-bold text-red-800 uppercase"
											>VENCIDA</span
										>
									{:else if m.cnhVencidaEm <= 60}
										<span
											class="ml-1 border border-amber-600 bg-amber-50 px-1 text-[9px] font-bold text-amber-800 uppercase"
											>A VENCER</span
										>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">{m.telefone}</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{m.totalViagens}
								</td>
								<td class="px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusTone[
											m.status
										]}"
									>
										{m.status}
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

<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Cadastrar Motorista"
	subtitle="Quadro permanente · auditado"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome Completo" name="nome" span={12} bind:value={nome} />
			<FormField
				label="CPF"
				name="cpf"
				span={4}
				mono
				placeholder="000.000.000-00"
				bind:value={cpf}
			/>
			<FormField label="CNH" name="cnh" span={4} mono bind:value={cnh} />
			<div class="col-span-2 flex flex-col">
				<label
					for="cat"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Categoria
				</label>
				<select
					id="cat"
					bind:value={categoriaCnh}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="B">B</option>
					<option value="C">C</option>
					<option value="D">D</option>
					<option value="E">E</option>
				</select>
			</div>
			<FormField
				label="Validade CNH"
				name="val"
				type="date"
				span={2}
				mono
				bind:value={validadeCnh}
			/>
			<FormField
				label="Telefone"
				name="tel"
				span={6}
				mono
				placeholder="(00) 00000-0000"
				bind:value={telefone}
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
