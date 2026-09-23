<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import EditarVeiculo from '$lib/presentation/components/EditarVeiculo.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarData, mesAtual } from '$lib/presentation/utils/tfdFormat';
	import type { Abastecimento, SaldoVeiculo, Veiculo, ViagemFrota } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);
	let podeExcluir = $derived(!!auth.ehAdminOuDev);

	const id = $derived(page.params.id ?? '');

	let v = $state<Veiculo | null>(null);
	let viagens = $state<ViagemFrota[]>([]);
	let abastecimentos = $state<Abastecimento[]>([]);
	let saldo = $state<SaldoVeiculo | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	let editarAberto = $state(false);
	let excluirAberto = $state(false);
	let excluindo = $state(false);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function excluir() {
		if (!v) return;
		excluindo = true;
		try {
			await api.tfd.veiculos.remove(v.id);
			notificar('ok', 'Veículo excluído.');
			setTimeout(() => goto('/tfd/frota'), 800);
		} catch (e) {
			if (e instanceof ApiError && (e.code === 'CONFLITO' || e.code === 'TFD_VEICULO_EM_USO')) {
				notificar('erro', 'Veículo tem viagens registradas — só pode ser desativado.');
			} else {
				notificar('erro', mensagemErroTfd(e));
			}
			excluirAberto = false;
		} finally {
			excluindo = false;
		}
	}

	const totalGastoBRL = $derived(
		abastecimentos.filter((a) => a.status === 'REALIZADO').reduce((acc, a) => acc + a.valorTotal, 0)
	);
	const totalLitros = $derived(
		abastecimentos.filter((a) => a.status === 'REALIZADO').reduce((acc, a) => acc + a.litros, 0)
	);

	async function carregar() {
		if (!id) return;
		carregando = true;
		erro = null;
		try {
			const [vDado, vgs, abs, sld] = await Promise.all([
				api.tfd.veiculos.byId(id),
				api.tfd.viagens.list().then((all) => all.filter((x) => x.veiculoId === id)),
				api.tfd.abastecimentos.list({ veiculoId: id }),
				api.tfd.saldo.list(mesAtual()).then((all) => all.find((s) => s.veiculoId === id) ?? null)
			]);
			v = vDado;
			viagens = vgs;
			abastecimentos = abs;
			saldo = sld;
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function toggleStatus() {
		if (!v) return;
		try {
			if (v.status === 'ATIVO') {
				await api.tfd.veiculos.manutencao(v.id);
				notificar('ok', 'Veículo marcado para manutenção.');
			} else {
				await api.tfd.veiculos.reativar(v.id);
				notificar('ok', 'Veículo reativado.');
			}
			v = await api.tfd.veiculos.byId(v.id);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	function alertaSaldoTone(s: SaldoVeiculo): 'success' | 'warning' | 'critical' {
		if (s.saldoMensal <= 0) return 'success';
		const pct = s.saldoConsumido / s.saldoMensal;
		if (pct >= 1) return 'critical';
		if (pct >= 0.8) return 'warning';
		return 'success';
	}
</script>

<div class="flex flex-col gap-4">
	<button
		type="button"
		onclick={() => goto('/tfd/frota')}
		class="self-start border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
	>
		← Voltar à Frota
	</button>

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

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white p-6">
			<div class="h-5 w-1/2 animate-pulse bg-slate-100"></div>
			<div class="mt-3 h-3 w-1/3 animate-pulse bg-slate-100"></div>
		</div>
	{:else if !v}
		<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
			<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
				Veículo não encontrado
			</div>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					VEÍCULO · {v.status}
				</div>
				<div class="font-mono text-base font-bold text-blue-900">{v.placa}</div>
				<div class="font-sans text-xs text-slate-700">{v.modelo}</div>
			</div>
			{#if podeOperar}
				<div class="flex flex-wrap gap-2">
					<PrimaryButton label="Editar" variant="secondary" onclick={() => (editarAberto = true)} />
					{#if v.status !== 'INATIVO'}
						<PrimaryButton
							label={v.status === 'ATIVO' ? 'Marcar Manutenção' : 'Reativar'}
							variant="secondary"
							onclick={toggleStatus}
						/>
					{/if}
					{#if podeExcluir}
						<PrimaryButton
							label="Excluir"
							variant="danger"
							onclick={() => (excluirAberto = true)}
						/>
					{/if}
				</div>
			{/if}
		</div>

		<!-- KPIs -->
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<MetricCard
				label="Hodômetro"
				value={`${v.hodometroAtualKm.toLocaleString('pt-BR')} km`}
				sublabel="Leitura atual"
			/>
			<MetricCard
				label="Consumo Médio"
				value={`${v.consumoMedioKml.toFixed(1)} km/L`}
				sublabel="Histórico declarado"
			/>
			<MetricCard
				label="Total Abastecido"
				value={formatarBRL(totalGastoBRL)}
				sublabel={`${totalLitros.toFixed(1)} L · histórico`}
			/>
			<MetricCard
				label="Saldo Disponível"
				value={saldo ? formatarBRL(saldo.saldoDisponivel) : '—'}
				sublabel={saldo ? `Mensal · ${saldo.mes}` : 'Sem saldo definido'}
				accent={saldo ? alertaSaldoTone(saldo) : 'default'}
			/>
		</div>

		<!-- Detalhes técnicos -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Especificações" index="01" />
			<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4 text-xs">
				<div class="col-span-3">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Tipo</dt>
					<dd class="mt-0.5 font-mono font-bold text-slate-900">{v.tipo}</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Ano</dt>
					<dd class="mt-0.5 font-mono text-slate-900">{v.ano}</dd>
				</div>
				<div class="col-span-3">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Combustível
					</dt>
					<dd class="mt-0.5 text-slate-900">{v.combustivel}</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Capacidade
					</dt>
					<dd class="mt-0.5 font-mono text-slate-900">{v.capacidade} assentos</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Cadastrado
					</dt>
					<dd class="mt-0.5 font-mono text-slate-900">
						{new Date(v.criadoEm).toLocaleDateString('pt-BR')}
					</dd>
				</div>
				{#if v.proximaRevisaoKm || v.proximaRevisaoEm}
					<div class="col-span-12 border-l-4 border-amber-600 bg-amber-50 px-3 py-2 text-amber-900">
						<strong class="font-mono tracking-wider uppercase">Próxima revisão:</strong>
						{#if v.proximaRevisaoKm}<span>
								@{v.proximaRevisaoKm.toLocaleString('pt-BR')} km</span
							>{/if}
						{#if v.proximaRevisaoEm}<span> · {formatarData(v.proximaRevisaoEm)}</span>{/if}
					</div>
				{/if}
			</dl>
		</div>

		<!-- Histórico de viagens -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Histórico de Viagens" index="02">
				<span
					class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
				>
					{viagens.length} REGISTROS
				</span>
			</PanelHeader>
			{#if viagens.length === 0}
				<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
					Nenhuma viagem para este veículo.
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr
								class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
							>
								<th class="border-r border-slate-200 px-3 py-2">Data</th>
								<th class="border-r border-slate-200 px-3 py-2">Saída</th>
								<th class="border-r border-slate-200 px-3 py-2">Motorista</th>
								<th class="border-r border-slate-200 px-3 py-2">Destino</th>
								<th class="border-r border-slate-200 px-3 py-2">Vagas</th>
								<th class="px-3 py-2">Status</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#each viagens as vg (vg.id)}
								<tr
									class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
									onclick={() => goto(`/tfd/viagens/${vg.id}`)}
								>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{formatarData(vg.data)}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
										{vg.horaSaida}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-800">
										{vg.motoristaNome ?? '—'}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
										{vg.destino}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{vg.vagasOcupadas}/{vg.vagasTotais}
									</td>
									<td class="px-3 py-2 text-slate-700">{vg.status.replace('_', ' ')}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Histórico de abastecimentos -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Abastecimentos" index="03">
				<span
					class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
				>
					{abastecimentos.length} REGISTROS
				</span>
			</PanelHeader>
			{#if abastecimentos.length === 0}
				<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
					Nenhum abastecimento registrado.
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr
								class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
							>
								<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
								<th class="border-r border-slate-200 px-3 py-2">Posto</th>
								<th class="border-r border-slate-200 px-3 py-2">Litros</th>
								<th class="border-r border-slate-200 px-3 py-2">Valor</th>
								<th class="border-r border-slate-200 px-3 py-2">Hodômetro</th>
								<th class="border-r border-slate-200 px-3 py-2">Consumo</th>
								<th class="px-3 py-2">Status</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#each abastecimentos as a (a.id)}
								<tr class="border-b border-slate-100 hover:bg-slate-50">
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
										{a.protocolo}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
										{a.posto}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{a.litros.toFixed(1)} L
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{formatarBRL(a.valorTotal)}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{a.hodometroKm.toLocaleString('pt-BR')}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{a.consumoCalcKml ? a.consumoCalcKml.toFixed(1) + ' km/L' : '—'}
									</td>
									<td class="px-3 py-2 text-slate-700">{a.status}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- ─── Modal: Editar ─────────────────────────────────────────── -->
{#if editarAberto && v}
	<Modal
		isOpen={editarAberto}
		title="Editar veículo"
		subtitle={v.placa + ' · ' + v.modelo}
		maxWidth="lg"
		onClose={() => (editarAberto = false)}
	>
		<EditarVeiculo
			veiculo={v}
			onCancel={() => (editarAberto = false)}
			onSaved={(novo) => {
				v = novo;
				editarAberto = false;
				notificar('ok', 'Veículo atualizado.');
			}}
		/>
	</Modal>
{/if}

<!-- ─── Modal: Excluir ────────────────────────────────────────── -->
{#if excluirAberto && v}
	<Modal
		isOpen={excluirAberto}
		title="Excluir veículo"
		subtitle="Ação irreversível"
		onClose={() => (excluirAberto = false)}
	>
		<div class="flex flex-col gap-3 py-1">
			<p class="text-sm text-slate-700">
				Confirma a exclusão de <strong>{v.placa}</strong> ({v.modelo})?
			</p>
			<p class="text-xs text-slate-500">
				Se houver viagens registradas, o backend impede a exclusão e sugere desativação. Auditoria
				do veículo é preservada.
			</p>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (excluirAberto = false)}
					disabled={excluindo}
				/>
				<PrimaryButton
					label={excluindo ? 'Excluindo...' : 'Confirmar exclusão'}
					variant="danger"
					onclick={excluir}
					disabled={excluindo}
				/>
			</div>
		</div>
	</Modal>
{/if}
