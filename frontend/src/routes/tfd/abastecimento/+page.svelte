<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarDataHora } from '$lib/presentation/utils/tfdFormat';
	import type {
		Abastecimento,
		Combustivel,
		Motorista,
		StatusAbastecimento,
		Veiculo
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let abastecimentos = $state<Abastecimento[]>([]);
	let veiculos = $state<Veiculo[]>([]);
	let motoristas = $state<Motorista[]>([]);
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);

	let filtro = $state<'TODOS' | StatusAbastecimento>('TODOS');

	const lista = $derived.by(() => {
		if (filtro === 'TODOS') return abastecimentos;
		return abastecimentos.filter((a) => a.status === filtro);
	});

	const filtros: Array<'TODOS' | StatusAbastecimento> = [
		'TODOS',
		'SOLICITADO',
		'LIBERADO',
		'REALIZADO',
		'NEGADO'
	];

	const statusTone: Record<StatusAbastecimento, string> = {
		SOLICITADO: 'border-amber-600 bg-amber-50 text-amber-800',
		LIBERADO: 'border-blue-700 bg-blue-50 text-blue-900',
		REALIZADO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		NEGADO: 'border-red-700 bg-red-50 text-red-800'
	};

	const pendentes = $derived(abastecimentos.filter((a) => a.status === 'SOLICITADO').length);
	const liberados = $derived(abastecimentos.filter((a) => a.status === 'LIBERADO').length);
	const realizados = $derived(abastecimentos.filter((a) => a.status === 'REALIZADO').length);
	const totalGastoMes = $derived(
		abastecimentos.filter((a) => a.status === 'REALIZADO').reduce((acc, a) => acc + a.valorTotal, 0)
	);

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function carregar() {
		carregando = true;
		erroLista = null;
		try {
			const [abs, vs, ms] = await Promise.all([
				api.tfd.abastecimentos.list(),
				api.tfd.veiculos.list(),
				api.tfd.motoristas.list()
			]);
			abastecimentos = abs;
			veiculos = vs;
			motoristas = ms;
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// Solicitar
	let solicitarAberto = $state(false);
	let veiculoId = $state('');
	let motoristaId = $state('');
	let posto = $state('');
	// Strings pra ligar direto no FormField (que tem fallback ''). Convertidas
	// pra Number só no submit. Svelte 5 rejeita bind:value={undefined} em
	// bindable com fallback.
	let valorEstimado = $state('');
	let combustivel = $state<Combustivel>('DIESEL');
	let hodometroKmSolicitar = $state('');
	let processando = $state(false);
	let erro = $state('');

	let veiculoSelecionado = $derived(veiculos.find((v) => v.id === veiculoId) ?? null);

	/**
	 * O backend rejeita "FLEX" no abastecimento — exige GASOLINA ou ETANOL
	 * (exatamente um dos dois). Para veículos FLEX, sugerimos GASOLINA por
	 * padrão e o operador escolhe entre os dois no select.
	 */
	$effect(() => {
		if (!veiculoSelecionado) return;
		const v = veiculoSelecionado;
		combustivel = v.combustivel === 'FLEX' ? 'GASOLINA' : v.combustivel;
		if (hodometroKmSolicitar === '') {
			hodometroKmSolicitar = String(v.hodometroAtualKm);
		}
	});

	// Para o select: quais combustíveis mostrar baseado no veículo escolhido.
	let combustiveisDisponiveis = $derived.by<Combustivel[]>(() => {
		if (!veiculoSelecionado) {
			return ['DIESEL', 'GASOLINA', 'ETANOL', 'GNV', 'ELETRICO'];
		}
		if (veiculoSelecionado.combustivel === 'FLEX') {
			return ['GASOLINA', 'ETANOL'];
		}
		return [veiculoSelecionado.combustivel];
	});

	const combustivelLabel: Record<Combustivel, string> = {
		DIESEL: 'Diesel',
		GASOLINA: 'Gasolina',
		ETANOL: 'Etanol',
		FLEX: 'Flex',
		GNV: 'GNV',
		ELETRICO: 'Elétrico'
	};

	function resetSolicitar() {
		veiculoId = '';
		motoristaId = '';
		posto = '';
		valorEstimado = '';
		hodometroKmSolicitar = '';
		erro = '';
	}

	async function solicitar() {
		erro = '';
		if (!veiculoId || !posto.trim() || !valorEstimado.trim() || !hodometroKmSolicitar.trim()) {
			erro = 'Placa, posto, valor estimado e hodômetro são obrigatórios.';
			return;
		}
		processando = true;
		try {
			await api.tfd.abastecimentos.solicitar({
				veiculoId,
				motoristaId: motoristaId || undefined,
				posto: posto.trim(),
				combustivel,
				valorEstimado: Number(valorEstimado),
				hodometroKm: Number(hodometroKmSolicitar)
			});
			solicitarAberto = false;
			resetSolicitar();
			notificar('ok', 'Abastecimento solicitado · aguardando liberação.');
			await carregar();
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			processando = false;
		}
	}

	// Liberar
	async function baixarComprovante(id: string) {
		try {
			const { blob, filename } = await api.tfd.abastecimentos.downloadComprovante(id);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	async function liberar(id: string) {
		try {
			await api.tfd.abastecimentos.liberar(id);
			notificar('ok', 'Abastecimento liberado · motorista pode ir ao posto.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	// Negar
	let negarId = $state<string | null>(null);
	let motivoNegar = $state('');
	async function negar() {
		if (!negarId || motivoNegar.trim().length < 10) return;
		try {
			await api.tfd.abastecimentos.negar(negarId, motivoNegar.trim());
			notificar('ok', 'Solicitação negada.');
			negarId = null;
			motivoNegar = '';
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	// Registrar realizado (com upload de comprovante)
	let realizadoId = $state<string | null>(null);
	let litros = $state('');
	let valorPorLitro = $state('');
	let valorTotal = $state('');
	let hodometroKm = $state('');
	let comprovanteFile = $state<File | null>(null);
	let comprovanteIdemKey = $state<string>('');

	function abrirRegistrar(a: Abastecimento) {
		realizadoId = a.id;
		litros = '';
		valorPorLitro = '';
		valorTotal = a.valorEstimado ? String(a.valorEstimado) : '';
		hodometroKm = String(a.hodometroKm ?? '');
		comprovanteFile = null;
		// Mesma chave durante toda a sessão do modal — se o usuário clicar
		// "Registrar" duas vezes, o backend devolve o mesmo resultado.
		comprovanteIdemKey = crypto.randomUUID();
	}

	function onFile(event: Event) {
		const input = event.target as HTMLInputElement;
		comprovanteFile = input.files?.[0] ?? null;
	}

	async function registrar() {
		if (
			!realizadoId ||
			!litros.trim() ||
			!valorPorLitro.trim() ||
			!valorTotal.trim() ||
			!hodometroKm.trim() ||
			!comprovanteFile
		)
			return;
		processando = true;
		try {
			await api.tfd.abastecimentos.registrarComprovante(
				realizadoId,
				{
					litros: Number(litros),
					valorPorLitro: Number(valorPorLitro),
					valorTotal: Number(valorTotal),
					hodometroKm: Number(hodometroKm),
					file: comprovanteFile
				},
				{ idempotencyKey: comprovanteIdemKey }
			);
			realizadoId = null;
			litros = '';
			valorPorLitro = '';
			valorTotal = '';
			hodometroKm = '';
			comprovanteFile = null;
			notificar('ok', 'Comprovante registrado · saldo atualizado.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
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
			label="Aguardando Liberação"
			value={carregando ? '—' : pendentes}
			sublabel="Solicitações abertas"
			accent="warning"
		/>
		<MetricCard
			label="Liberados"
			value={carregando ? '—' : liberados}
			sublabel="Pendentes de comprovante"
			accent="default"
		/>
		<MetricCard
			label="Realizados"
			value={carregando ? '—' : realizados}
			sublabel="Histórico do mês"
			accent="success"
		/>
		<MetricCard
			label="Gasto do Mês"
			value={carregando ? '—' : formatarBRL(totalGastoMes)}
			sublabel="Combustível consumido"
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Abastecimento da Frota"
			subtitle="Solicitação · liberação · comprovante"
			index="01"
		>
			{#if podeOperar}
				<PrimaryButton label="+ Solicitar" onclick={() => (solicitarAberto = true)} />
			{/if}
		</PanelHeader>

		<div
			class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			{#each filtros as f (f)}
				<button
					type="button"
					onclick={() => (filtro = f)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{filtro === f
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{f}
				</button>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Veículo</th>
						<th class="border-r border-slate-200 px-3 py-2">Posto</th>
						<th class="border-r border-slate-200 px-3 py-2">Litros</th>
						<th class="border-r border-slate-200 px-3 py-2">Valor</th>
						<th class="border-r border-slate-200 px-3 py-2">Solicitado</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(4) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="8" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if lista.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum abastecimento.
							</td>
						</tr>
					{:else}
						{#each lista as a (a.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{a.protocolo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{a.veiculoPlaca ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{a.posto}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{a.litros > 0 ? a.litros.toFixed(1) + ' L' : '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarBRL(a.valorTotal || a.valorEstimado)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-600">
									{formatarDataHora(a.solicitadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusTone[
											a.status
										]}"
									>
										{a.status}
									</span>
								</td>
								<td class="px-3 py-2">
									{#if podeOperar}
										<div class="flex flex-wrap gap-1">
											{#if a.status === 'SOLICITADO'}
												<button
													type="button"
													onclick={() => liberar(a.id)}
													class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-800 uppercase hover:bg-emerald-100"
												>
													Liberar
												</button>
												<button
													type="button"
													onclick={() => (negarId = a.id)}
													class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-red-800 uppercase hover:bg-red-100"
												>
													Negar
												</button>
											{:else if a.status === 'LIBERADO'}
												<button
													type="button"
													onclick={() => abrirRegistrar(a)}
													class="border border-blue-900 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-blue-900 uppercase hover:bg-blue-100"
												>
													Registrar Comprovante
												</button>
											{:else if a.status === 'REALIZADO' && a.temComprovante}
												<button
													type="button"
													onclick={() => baixarComprovante(a.id)}
													class="border border-slate-400 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
												>
													Baixar Comprovante
												</button>
											{/if}
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal Solicitar -->
<Modal
	isOpen={solicitarAberto}
	onClose={() => (solicitarAberto = false)}
	title="Solicitar Abastecimento"
	subtitle="Modo balcão · informe placa + valor estimado · auditado"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<!-- Placa + Motorista lado a lado (campos principais) -->
			<div class="col-span-6 flex flex-col">
				<label
					for="vid"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Placa do Veículo
				</label>
				<select
					id="vid"
					bind:value={veiculoId}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="">— Selecione uma placa —</option>
					{#each veiculos.filter((v) => v.status === 'ATIVO') as v (v.id)}
						<option value={v.id}>{v.placa} · {v.modelo}</option>
					{/each}
				</select>
			</div>
			<div class="col-span-6 flex flex-col">
				<label
					for="mid"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Motorista Responsável (opcional)
				</label>
				<select
					id="mid"
					bind:value={motoristaId}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="">— Sem motorista vinculado —</option>
					{#each motoristas.filter((m) => m.status === 'ATIVO') as m (m.id)}
						<option value={m.id}>{m.nome} · CNH cat. {m.categoriaCnh}</option>
					{/each}
				</select>
			</div>

			<!-- Valor + Combustível -->
			<div class="col-span-6 flex flex-col">
				<label
					for="val"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Valor Estimado (R$)
				</label>
				<input
					id="val"
					type="number"
					min="0"
					step="0.01"
					bind:value={valorEstimado}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>
			<div class="col-span-6 flex flex-col">
				<label
					for="comb"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Tipo de Combustível
				</label>
				<select
					id="comb"
					bind:value={combustivel}
					disabled={combustiveisDisponiveis.length === 1}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-slate-50"
				>
					{#each combustiveisDisponiveis as c (c)}
						<option value={c}>{combustivelLabel[c]}</option>
					{/each}
				</select>
				{#if veiculoSelecionado?.combustivel === 'FLEX'}
					<span class="mt-1 font-sans text-[11px] text-slate-500">
						Veículo FLEX · escolha o combustível efetivamente abastecido.
					</span>
				{:else if veiculoSelecionado}
					<span class="mt-1 font-sans text-[11px] text-slate-500">
						Combustível fixado pelo cadastro do veículo.
					</span>
				{/if}
			</div>

			<!-- Posto + Hodômetro -->
			<FormField
				label="Posto"
				name="posto"
				span={8}
				placeholder="Ex.: Posto Shell BR-101 km 87"
				bind:value={posto}
			/>
			<FormField
				label="Hodômetro (km)"
				name="hodm"
				type="number"
				span={4}
				mono
				bind:value={hodometroKmSolicitar}
			/>
		</div>

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[11px] text-blue-900"
		>
			Modo balcão: você informa direto o valor total estimado. Após liberação, o motorista vai ao
			posto e o gestor registra o comprovante (cupom fiscal) — só aí o valor entra no saldo da
			frota.
		</div>
		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (solicitarAberto = false)}
			/>
			<PrimaryButton label="Solicitar" onclick={solicitar} loading={processando} />
		</div>
	</div>
</Modal>

<!-- Modal Negar -->
<Modal
	isOpen={negarId !== null}
	onClose={() => (negarId = null)}
	title="Negar Solicitação"
	subtitle="Motivo obrigatório"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="flex flex-col">
			<label
				for="mn"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Motivo (mínimo 10 caracteres)
			</label>
			<textarea
				id="mn"
				bind:value={motivoNegar}
				rows="3"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700"
			></textarea>
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (negarId = null)} />
			<PrimaryButton
				label="Negar"
				variant="danger"
				onclick={negar}
				disabled={motivoNegar.trim().length < 10}
			/>
		</div>
	</div>
</Modal>

<!-- Modal Registrar Realizado -->
<Modal
	isOpen={realizadoId !== null}
	onClose={() => (realizadoId = null)}
	title="Registrar Comprovante"
	subtitle="Anexar nota fiscal · debita do saldo"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Litros Reais"
				name="litreais"
				type="number"
				span={4}
				mono
				bind:value={litros}
			/>
			<FormField
				label="R$ por Litro"
				name="vplit"
				type="number"
				span={4}
				mono
				bind:value={valorPorLitro}
			/>
			<FormField
				label="Valor Total (R$)"
				name="vtot"
				type="number"
				span={4}
				mono
				bind:value={valorTotal}
			/>
			<FormField
				label="Hodômetro (km)"
				name="hodm"
				type="number"
				span={6}
				mono
				bind:value={hodometroKm}
			/>
			<div class="col-span-6 flex flex-col">
				<label
					for="cmp"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Comprovante (PDF/Imagem)
				</label>
				<input
					id="cmp"
					type="file"
					accept="image/*,application/pdf"
					onchange={onFile}
					class="w-full border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>
		</div>
		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[11px] text-blue-900"
		>
			📎 O arquivo passa por scan antimalware antes de ser disponibilizado.
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (realizadoId = null)} />
			<PrimaryButton
				label="Registrar"
				onclick={registrar}
				loading={processando}
				disabled={!litros || !valorPorLitro || !valorTotal || !hodometroKm || !comprovanteFile}
			/>
		</div>
	</div>
</Modal>
