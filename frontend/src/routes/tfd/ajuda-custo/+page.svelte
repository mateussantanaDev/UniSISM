<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarCpf, formatarData } from '$lib/presentation/utils/tfdFormat';
	import type {
		AjudaCusto,
		CategoriaAjuda,
		ItemAjudaCusto,
		MetodoPagamento,
		PassageiroViagem,
		StatusAjudaCusto,
		ViagemFrota
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let ajudas = $state<AjudaCusto[]>([]);
	let viagens = $state<ViagemFrota[]>([]);
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);
	let filtro = $state<'TODOS' | StatusAjudaCusto>('TODOS');

	const lista = $derived.by(() => {
		if (filtro === 'TODOS') return ajudas;
		return ajudas.filter((a) => a.status === filtro);
	});

	const filtros: Array<'TODOS' | StatusAjudaCusto> = [
		'TODOS',
		'PENDENTE',
		'AUTORIZADA',
		'PAGA',
		'NEGADA',
		'CANCELADA'
	];

	const tone: Record<StatusAjudaCusto, string> = {
		PENDENTE: 'border-amber-600 bg-amber-50 text-amber-800',
		AUTORIZADA: 'border-blue-700 bg-blue-50 text-blue-900',
		PAGA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		NEGADA: 'border-red-700 bg-red-50 text-red-800',
		CANCELADA: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	const totalPagasMes = $derived(
		ajudas.filter((a) => a.status === 'PAGA').reduce((acc, a) => acc + a.valorTotal, 0)
	);
	const totalPendentes = $derived(
		ajudas.filter((a) => a.status === 'PENDENTE' || a.status === 'AUTORIZADA').length
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
			const [ac, vs] = await Promise.all([
				api.tfd.ajudasCusto.list(),
				api.tfd.viagens.list().catch(() => [] as ViagemFrota[])
			]);
			ajudas = ac;
			viagens = vs;
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// ──────────────────────────────────────────────────────────
	// Pagar
	// ──────────────────────────────────────────────────────────
	let pagandoId = $state<string | null>(null);
	let metodo = $state<MetodoPagamento>('PIX');
	let comprovanteFile = $state<File | null>(null);
	let pagarIdemKey = $state<string>('');
	let processando = $state(false);

	function abrirPagamento(id: string) {
		pagandoId = id;
		metodo = 'PIX';
		comprovanteFile = null;
		// Idempotência — evita pagamento duplo se o usuário clicar duas vezes.
		pagarIdemKey = crypto.randomUUID();
	}

	function onFile(event: Event) {
		const input = event.target as HTMLInputElement;
		comprovanteFile = input.files?.[0] ?? null;
	}

	async function pagar() {
		if (!pagandoId || !comprovanteFile) return;
		processando = true;
		try {
			await api.tfd.ajudasCusto.pagar(pagandoId, metodo, comprovanteFile, {
				idempotencyKey: pagarIdemKey
			});
			pagandoId = null;
			comprovanteFile = null;
			notificar('ok', 'Pagamento registrado · auditado.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function autorizar(id: string) {
		try {
			await api.tfd.ajudasCusto.autorizar(id);
			notificar('ok', 'Ajuda de custo autorizada para pagamento.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	// ──────────────────────────────────────────────────────────
	// Negar
	// ──────────────────────────────────────────────────────────
	let negarId = $state<string | null>(null);
	let motivoNegar = $state('');
	async function negar() {
		if (!negarId || motivoNegar.trim().length < 10) return;
		try {
			await api.tfd.ajudasCusto.negar(negarId, motivoNegar.trim());
			notificar('ok', 'Ajuda negada · operação registrada.');
			negarId = null;
			motivoNegar = '';
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	// ──────────────────────────────────────────────────────────
	// Nova Ajuda de Custo
	// ──────────────────────────────────────────────────────────
	let novaAberto = $state(false);
	let novaViagemId = $state('');
	let novaPacienteId = $state('');
	/**
	 * Tipo local com `valorBRL: string` pra ligar direto no `FormField`
	 * (que tem fallback ''). O `Number()` acontece no submit.
	 */
	type NovoItemForm = { categoria: CategoriaAjuda; descricao: string; valorBRL: string };
	let novosItens = $state<NovoItemForm[]>([]);
	let processandoNova = $state(false);
	let erroNova = $state('');

	// Registro Tardio / Reembolso Retroativo de Ajuda de Custo
	let isRegistroTardioAjuda = $state(false);
	let dataConcessaoRetroativa = $state(new Date().toISOString().substring(0, 10));
	let justificativaTardiaAjuda = $state('Reembolso retroativo concedido após apresentação de recibos e atestado de comparecimento.');

	const categorias: Array<{ value: CategoriaAjuda; label: string }> = [
		{ value: 'ALIMENTACAO', label: 'Alimentação' },
		{ value: 'HOSPEDAGEM', label: 'Hospedagem' },
		{ value: 'DESLOCAMENTO_LOCAL', label: 'Deslocamento Local' },
		{ value: 'OUTRO', label: 'Outro' }
	];

	const passageirosDaViagem = $derived.by<PassageiroViagem[]>(() => {
		const v = viagens.find((x) => x.id === novaViagemId);
		return v ? v.passageiros : [];
	});

	const totalNovaAjuda = $derived(
		novosItens.reduce((acc, it) => acc + (Number(it.valorBRL) || 0), 0)
	);

	function abrirNova() {
		novaViagemId = '';
		novaPacienteId = '';
		novosItens = [
			{ categoria: 'ALIMENTACAO', descricao: '', valorBRL: '' }
		];
		erroNova = '';
		novaAberto = true;
	}

	function adicionarItem() {
		novosItens = [
			...novosItens,
			{ categoria: 'ALIMENTACAO', descricao: '', valorBRL: '' }
		];
	}

	function removerItem(idx: number) {
		novosItens = novosItens.filter((_, i) => i !== idx);
	}

	async function salvarNova() {
		erroNova = '';
		if (!novaViagemId) {
			erroNova = 'Selecione a viagem.';
			return;
		}
		if (!novaPacienteId) {
			erroNova = 'Selecione o paciente.';
			return;
		}
		if (novosItens.length === 0) {
			erroNova = 'Adicione ao menos 1 item.';
			return;
		}
		for (const it of novosItens) {
			if (!it.descricao.trim()) {
				erroNova = 'Cada item precisa de descrição.';
				return;
			}
			if (!it.valorBRL.trim() || Number(it.valorBRL) <= 0) {
				erroNova = 'Cada item precisa de valor maior que zero.';
				return;
			}
		}
		processandoNova = true;
		try {
			await api.tfd.ajudasCusto.solicitar({
				viagemId: novaViagemId,
				pacienteId: novaPacienteId,
				itens: novosItens.map((it) => ({
					categoria: it.categoria,
					descricao: isRegistroTardioAjuda
						? `[REEMBOLSO RETROATIVO - ${dataConcessaoRetroativa.split('-').reverse().join('/')}] ${it.descricao.trim()} · Justificativa: ${justificativaTardiaAjuda}`
						: it.descricao.trim(),
					valorBRL: Number(it.valorBRL)
				}))
			});
			novaAberto = false;
			notificar('ok', isRegistroTardioAjuda ? '✓ Reembolso tardio registrado com sucesso no histórico TFD.' : 'Ajuda de custo criada · pendente de autorização.');
			await carregar();
		} catch (e) {
			erroNova = mensagemErroTfd(e);
		} finally {
			processandoNova = false;
		}
	}

	const viagensDisponiveis = $derived(
		viagens.filter((v) => v.status !== 'CANCELADA' && v.passageiros.length > 0)
	);
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

	<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
		<MetricCard
			label="Total"
			value={carregando ? '—' : ajudas.length}
			sublabel="Ajudas no mês"
		/>
		<MetricCard
			label="Aguardando"
			value={carregando ? '—' : totalPendentes}
			sublabel="Pendentes ou autorizadas"
			accent="warning"
		/>
		<MetricCard
			label="Pago no Mês"
			value={carregando ? '—' : formatarBRL(totalPagasMes)}
			sublabel="Repasses concluídos"
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Ajudas de Custo"
			subtitle="Repasses a pacientes em viagens TFD (alimentação, hospedagem, deslocamento)"
			index="01"
		>
			{#if podeOperar}
				<PrimaryButton label="+ Nova Ajuda" onclick={abrirNova} />
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
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Itens</th>
						<th class="border-r border-slate-200 px-3 py-2">Valor</th>
						<th class="border-r border-slate-200 px-3 py-2">Método</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(4) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if lista.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhuma ajuda de custo.
							</td>
						</tr>
					{:else}
						{#each lista as a (a.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2">
									<a href={`/tfd/ajuda-custo/${a.id}`}>{a.protocolo}</a>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{a.pacienteNome ?? '—'}
									<div class="text-[10px] text-slate-500">{formatarCpf(a.pacienteCpf)}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-[11px] text-slate-700">
									{a.itens.length} item(s):
									{a.itens
										.map((i) => i.categoria)
										.join(', ')
										.toLowerCase()}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
									{formatarBRL(a.valorTotal)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{a.metodoPagamento ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {tone[a.status]}"
									>
										{a.status}
									</span>
								</td>
								<td class="px-3 py-2">
									{#if podeOperar}
										<div class="flex flex-wrap gap-1">
											{#if a.status === 'PENDENTE'}
												<button
													type="button"
													onclick={() => autorizar(a.id)}
													class="border border-blue-900 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-blue-900 uppercase hover:bg-blue-100"
												>
													Autorizar
												</button>
												<button
													type="button"
													onclick={() => {
														negarId = a.id;
														motivoNegar = '';
													}}
													class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-red-800 uppercase hover:bg-red-100"
												>
													Negar
												</button>
											{:else if a.status === 'AUTORIZADA'}
												<button
													type="button"
													onclick={() => abrirPagamento(a.id)}
													class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-800 uppercase hover:bg-emerald-100"
												>
													Pagar
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

<!-- Modal Nova Ajuda de Custo -->
<Modal
	isOpen={novaAberto}
	onClose={() => (novaAberto = false)}
	title="Nova Ajuda de Custo"
	subtitle="Vínculo com viagem · paciente · itens (alimentação/hospedagem/deslocamento)"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="flex flex-col gap-3">
			<!-- Registro Tardio / Reembolso Retroativo -->
			<div class="border border-amber-300 bg-amber-50/60 p-3 flex flex-col gap-2 font-mono text-xs">
				<div class="flex items-center justify-between">
					<span class="font-bold text-amber-950 uppercase tracking-wider text-[10px]">
						⚡ TIPO DE SOLICITAÇÃO DE AJUDA DE CUSTO
					</span>
					<span class="text-[9px] text-amber-800 font-bold uppercase">Prévia vs Reembolso Tardio</span>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						onclick={() => isRegistroTardioAjuda = false}
						class="px-2.5 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {!isRegistroTardioAjuda ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
					>
						<span>💰 PRÉVIA REGULAR</span>
					</button>
					<button
						type="button"
						onclick={() => isRegistroTardioAjuda = true}
						class="px-2.5 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {isRegistroTardioAjuda ? 'border-amber-900 bg-amber-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
					>
						<span>🔙 REEMBOLSO TARDIO</span>
					</button>
				</div>

				{#if isRegistroTardioAjuda}
					<div class="flex flex-col gap-2 border-t border-amber-300 pt-2 font-sans text-xs">
						<div class="bg-amber-100 border border-amber-300 p-2 text-[10px] text-amber-950">
							<strong>💡 Reembolso Retroativo:</strong> Registre ajudas de custo reembolsadas ao paciente após a apresentação dos comprovantes/comprovantes de comparecimento de viagens emergenciais já realizadas.
						</div>
						<div class="grid grid-cols-2 gap-2 font-mono">
							<div class="flex flex-col gap-1">
								<label for="dt-aj-tardia" class="text-[9px] font-bold text-amber-950 uppercase">Data do Reembolso/Viagem *</label>
								<input
									id="dt-aj-tardia"
									type="date"
									bind:value={dataConcessaoRetroativa}
									class="border border-amber-400 bg-white px-2 py-1 outline-none text-xs font-mono font-bold"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label for="just-aj-tardia" class="text-[9px] font-bold text-amber-950 uppercase">Justificativa do Reembolso *</label>
								<input
									id="just-aj-tardia"
									type="text"
									bind:value={justificativaTardiaAjuda}
									class="border border-amber-400 bg-white px-2 py-1 outline-none text-xs font-sans"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="flex flex-col">
				<label
					for="vid"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Viagem
				</label>
				<select
					id="vid"
					bind:value={novaViagemId}
					onchange={() => (novaPacienteId = '')}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="">— Selecione uma viagem —</option>
					{#each viagensDisponiveis as v (v.id)}
						<option value={v.id}>
							{formatarData(v.data)} · {v.destino} · {v.veiculoPlaca ?? '—'}
						</option>
					{/each}
				</select>
			</div>
			<div class="col-span-6 flex flex-col">
				<label
					for="pid"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Paciente (passageiro da viagem)
				</label>
				<select
					id="pid"
					bind:value={novaPacienteId}
					disabled={!novaViagemId}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-slate-50"
				>
					<option value="">
						{novaViagemId ? '— Selecione o paciente —' : '— Escolha a viagem antes —'}
					</option>
					{#each passageirosDaViagem as p (p.id)}
						<option value={p.pacienteId}>{p.pacienteNome ?? p.pacienteId}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="border border-slate-200">
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"
			>
				<div class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
					Itens da Ajuda · {novosItens.length}
				</div>
				<button
					type="button"
					onclick={adicionarItem}
					class="border border-blue-900 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:bg-blue-100"
				>
					+ Adicionar Item
				</button>
			</div>
			<div class="flex flex-col gap-2 px-3 py-3">
				{#each novosItens as item, idx (idx)}
					<div class="grid grid-cols-12 gap-2 border border-slate-200 bg-slate-50 p-2">
						<div class="col-span-4 flex flex-col">
							<label
								for="cat-{idx}"
								class="mb-0.5 text-[9px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Categoria
							</label>
							<select
								id="cat-{idx}"
								bind:value={item.categoria}
								class="w-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							>
								{#each categorias as c (c.value)}
									<option value={c.value}>{c.label}</option>
								{/each}
							</select>
						</div>
						<div class="col-span-5 flex flex-col">
							<label
								for="desc-{idx}"
								class="mb-0.5 text-[9px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Descrição
							</label>
							<input
								id="desc-{idx}"
								type="text"
								bind:value={item.descricao}
								placeholder={item.categoria === 'ALIMENTACAO'
									? 'Ex.: 2 refeições no dia da consulta'
									: item.categoria === 'HOSPEDAGEM'
										? 'Ex.: 1 diária em pousada conveniada'
										: item.categoria === 'DESLOCAMENTO_LOCAL'
											? 'Ex.: 2 corridas táxi UBS↔hospital'
											: 'Ex.: medicamentos no caminho'}
								class="w-full border border-slate-300 bg-white px-2 py-1 font-sans text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							/>
						</div>
						<div class="col-span-2 flex flex-col">
							<label
								for="val-{idx}"
								class="mb-0.5 text-[9px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Valor (R$)
							</label>
							<input
								id="val-{idx}"
								type="number"
								min="0"
								step="0.01"
								bind:value={item.valorBRL}
								class="w-full border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							/>
						</div>
						<div class="col-span-1 flex items-end justify-end">
							<button
								type="button"
								onclick={() => removerItem(idx)}
								disabled={novosItens.length === 1}
								class="border border-red-700 bg-red-50 px-2 py-1 font-mono text-[10px] font-bold text-red-800 uppercase hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Remover item"
							>
								×
							</button>
						</div>
					</div>
				{/each}
			</div>

			<div
				class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2"
			>
				<div class="font-mono text-[10px] tracking-widest text-slate-600 uppercase">
					Total
				</div>
				<div class="font-mono text-sm font-bold text-blue-900">
					{formatarBRL(totalNovaAjuda)}
				</div>
			</div>
		</div>

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[11px] text-blue-900"
		>
			Ao salvar, a ajuda fica em <strong>PENDENTE</strong> e <strong>reserva</strong> o valor no
			saldo de ajuda de custo. A liberação para pagamento exige autorização (próximo passo).
		</div>

		{#if erroNova}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erroNova}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (novaAberto = false)}
			/>
			<PrimaryButton
				label="Criar Ajuda de Custo"
				onclick={salvarNova}
				loading={processandoNova}
			/>
		</div>
	</div>
</Modal>

<!-- Modal Negar -->
<Modal
	isOpen={negarId !== null}
	onClose={() => (negarId = null)}
	title="Negar Ajuda de Custo"
	subtitle="Motivo obrigatório · auditado"
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

<!-- Modal Pagar -->
<Modal
	isOpen={pagandoId !== null}
	onClose={() => (pagandoId = null)}
	title="Registrar Pagamento"
	subtitle="Comprovante anexado · auditado"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="flex flex-col">
			<label
				for="met"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Método de Pagamento
			</label>
			<select
				id="met"
				bind:value={metodo}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="PIX">PIX</option>
				<option value="TRANSFERENCIA">Transferência Bancária</option>
				<option value="DINHEIRO_RH">Dinheiro · RH</option>
			</select>
		</div>
		<div class="flex flex-col">
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
		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[11px] text-blue-900"
		>
			📎 O comprovante passa por scan antimalware e fica anexado para auditoria do TCM/TJ.
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (pagandoId = null)} />
			<PrimaryButton
				label="Confirmar Pagamento"
				onclick={pagar}
				loading={processando}
				disabled={!comprovanteFile}
			/>
		</div>
	</div>
</Modal>
