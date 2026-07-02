<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarCpf, formatarDataHora } from '$lib/presentation/utils/tfdFormat';
	import type {
		AjudaCusto,
		CategoriaAjuda,
		MetodoPagamento,
		StatusAjudaCusto
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	/**
	 * Detalhe de Ajuda de Custo TFD.
	 *
	 * Backend: GET `/v1/tfd/ajudas-custo/:id` (RBAC: rwGestor).
	 *
	 * Ciclo: PENDENTE → AUTORIZADA → PAGA · ou → NEGADA · ou → CANCELADA.
	 *
	 * Ações condicionais ao status:
	 *   - PENDENTE: autorizar (rwGestor) ou negar (rwGestor)
	 *   - AUTORIZADA: pagar (rwAdmin — upload de comprovante)
	 *   - PAGA / NEGADA / CANCELADA: somente leitura
	 */
	const auth = useAuth();
	const id = $derived(page.params.id ?? '');
	const podeOperar = $derived(!!auth.podeGerenciarTFD);
	const podePagar = $derived(!!auth.ehAdminOuDev);

	let aj = $state<AjudaCusto | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	let negarAberto = $state(false);
	let motivoNegacao = $state('');
	let pagarAberto = $state(false);
	let metodoPagamento = $state<MetodoPagamento>('PIX');
	let comprovanteFile = $state<File | null>(null);
	let processando = $state(false);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function carregar() {
		if (!id) return;
		carregando = true;
		erro = null;
		try {
			aj = await api.tfd.ajudasCusto.byId(id);
		} catch (e) {
			erro = mensagemErroTfd(e);
			aj = null;
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function autorizar() {
		if (!aj) return;
		processando = true;
		try {
			aj = await api.tfd.ajudasCusto.autorizar(aj.id);
			notificar('ok', 'Ajuda autorizada · aguardando pagamento.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function negar() {
		if (!aj) return;
		const motivo = motivoNegacao.trim();
		if (motivo.length < 5) {
			notificar('erro', 'Motivo precisa ter ao menos 5 caracteres.');
			return;
		}
		processando = true;
		try {
			aj = await api.tfd.ajudasCusto.negar(aj.id, motivo);
			negarAberto = false;
			motivoNegacao = '';
			notificar('ok', 'Ajuda negada.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function pagar() {
		if (!aj || !comprovanteFile) {
			notificar('erro', 'Anexe o comprovante de pagamento.');
			return;
		}
		processando = true;
		try {
			aj = await api.tfd.ajudasCusto.pagar(aj.id, metodoPagamento, comprovanteFile);
			pagarAberto = false;
			comprovanteFile = null;
			notificar('ok', 'Pagamento registrado · comprovante anexado.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	function onFile(e: Event) {
		const t = e.target as HTMLInputElement;
		comprovanteFile = t.files?.[0] ?? null;
	}

	const statusTone: Record<StatusAjudaCusto, string> = {
		PENDENTE: 'border-amber-600 bg-amber-50 text-amber-800',
		AUTORIZADA: 'border-blue-700 bg-blue-50 text-blue-900',
		PAGA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		NEGADA: 'border-red-700 bg-red-50 text-red-800',
		CANCELADA: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	const categoriaLabel: Record<CategoriaAjuda, string> = {
		ALIMENTACAO: 'Alimentação',
		HOSPEDAGEM: 'Hospedagem',
		DESLOCAMENTO_LOCAL: 'Deslocamento local',
		OUTRO: 'Outro'
	};

	const metodoLabel: Record<MetodoPagamento, string> = {
		PIX: 'PIX',
		TRANSFERENCIA: 'Transferência bancária',
		DINHEIRO_RH: 'Dinheiro (RH)'
	};
</script>

<svelte:head>
	<title>Ajuda de Custo · TFD · UNISISM</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<button
		type="button"
		onclick={() => goto('/tfd/ajuda-custo')}
		class="self-start border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
	>
		← Voltar
	</button>

	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-800'
				: 'border-red-700 bg-red-50 text-red-800'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'} {mensagem.texto}
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
			Carregando...
		</div>
	{:else if erro || !aj}
		<div class="border border-red-700 bg-red-50 p-6 text-center font-mono text-sm font-bold text-red-800 uppercase">
			{erro ?? 'Ajuda de custo não encontrada'}
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					AJUDA DE CUSTO · {aj.status}
				</div>
				<div class="font-mono text-base font-bold text-blue-900">{aj.protocolo}</div>
				<div class="font-sans text-xs text-slate-700">
					Total: <strong>{formatarBRL(aj.valorTotal)}</strong>
				</div>
			</div>
			<span
				class="border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {statusTone[
					aj.status
				]}"
			>
				{aj.status}
			</span>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
			<!-- ─── Conteúdo ──────────────────────────────────────── -->
			<div class="flex flex-col gap-4">
				<!-- Paciente + Viagem -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Beneficiário" subtitle="Paciente designado e viagem vinculada" index="01" />
					<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
						<div class="col-span-12 md:col-span-7">
							<dt class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Paciente
							</dt>
							<dd class="mt-0.5 text-base font-bold text-slate-900">
								{aj.pacienteNome ?? '—'}
							</dd>
							<dd class="mt-0.5 font-mono text-[11px] text-slate-600">
								CPF {aj.pacienteCpf ? formatarCpf(aj.pacienteCpf) : '—'}
							</dd>
						</div>
						<div class="col-span-12 md:col-span-5">
							<dt class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Viagem
							</dt>
							<dd class="mt-0.5 font-mono text-sm">
								<a
									href={`/tfd/viagens/${aj.viagemId}`}
									class="text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									Abrir viagem →
								</a>
							</dd>
						</div>
					</dl>
				</div>

				<!-- Itens -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Itens da ajuda" subtitle="Categorias e valores" index="02">
						<span
							class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							{aj.itens.length} {aj.itens.length === 1 ? 'item' : 'itens'}
						</span>
					</PanelHeader>
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr
								class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
							>
								<th class="border-r border-slate-200 px-3 py-2">Categoria</th>
								<th class="border-r border-slate-200 px-3 py-2">Descrição</th>
								<th class="px-3 py-2 text-right">Valor</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#each aj.itens as item, i (i)}
								<tr class="border-b border-slate-100">
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{categoriaLabel[item.categoria]}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
										{item.descricao}
									</td>
									<td class="px-3 py-2 text-right text-slate-900">{formatarBRL(item.valorBRL)}</td>
								</tr>
							{/each}
							<tr class="bg-slate-50">
								<td colspan="2" class="px-3 py-2 text-right font-mono text-[10px] tracking-widest text-slate-600 uppercase">
									Total
								</td>
								<td class="px-3 py-2 text-right font-mono text-sm font-bold text-blue-900">
									{formatarBRL(aj.valorTotal)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<!-- Negação -->
				{#if aj.status === 'NEGADA' && aj.motivoNegacao}
					<div class="border border-red-700 bg-red-50 px-4 py-3">
						<div class="font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase">
							Motivo da negação
						</div>
						<p class="mt-1 text-sm whitespace-pre-wrap text-red-900">{aj.motivoNegacao}</p>
					</div>
				{/if}

				<!-- Comprovante -->
				{#if aj.status === 'PAGA' && aj.temComprovante}
					<div class="border border-emerald-700 bg-emerald-50 px-4 py-3">
						<div class="font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
							Pagamento registrado
						</div>
						<p class="mt-1 text-sm text-emerald-900">
							Método: <strong>{metodoLabel[aj.metodoPagamento ?? 'PIX']}</strong> · Comprovante anexado.
						</p>
					</div>
				{/if}

				<!-- Timeline -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Histórico" subtitle="Transições registradas" index="03" />
					<ul class="divide-y divide-slate-100 px-4 py-2 font-mono text-[11px]">
						<li class="flex items-center justify-between py-1.5">
							<span class="tracking-widest text-slate-600 uppercase">Criada</span>
							<span class="text-slate-900">{formatarDataHora(aj.criadaEm)}</span>
						</li>
						{#if aj.autorizadaEm}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-blue-900 uppercase">Autorizada</span>
								<span class="text-slate-900">{formatarDataHora(aj.autorizadaEm)}</span>
							</li>
						{/if}
						{#if aj.pagaEm}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-emerald-800 uppercase">Paga</span>
								<span class="text-slate-900">{formatarDataHora(aj.pagaEm)}</span>
							</li>
						{/if}
					</ul>
				</div>
			</div>

			<!-- ─── Painel de ação ────────────────────────────────── -->
			<aside class="flex flex-col gap-3">
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Ação" subtitle="Próximo passo" index="·" />
					<div class="flex flex-col gap-2 px-4 py-3">
						{#if !podeOperar}
							<p class="text-xs text-slate-500">
								Você não tem permissão para operar esta ajuda.
							</p>
						{:else if aj.status === 'PENDENTE'}
							<PrimaryButton
								label="Autorizar"
								onclick={autorizar}
								disabled={processando}
								fullWidth
							/>
							<PrimaryButton
								label="Negar"
								variant="danger"
								onclick={() => (negarAberto = true)}
								disabled={processando}
								fullWidth
							/>
						{:else if aj.status === 'AUTORIZADA'}
							{#if podePagar}
								<PrimaryButton
									label="Registrar pagamento"
									onclick={() => (pagarAberto = true)}
									disabled={processando}
									fullWidth
								/>
								<p class="mt-1 text-[11px] text-slate-500">
									Anexe o comprovante (recibo PIX, transferência).
								</p>
							{:else}
								<p class="text-xs text-slate-500">
									Pagamento exige permissão de Admin ou Desenvolvedor.
								</p>
							{/if}
						{:else}
							<p class="text-xs text-slate-500">
								Estado final ({aj.status}). Sem ações disponíveis.
							</p>
						{/if}
					</div>
				</div>
			</aside>
		</div>
	{/if}
</div>

<!-- ─── Modal: Negar ─────────────────────────────────────────── -->
{#if negarAberto && aj}
	<Modal isOpen={negarAberto} title="Negar ajuda de custo" onClose={() => (negarAberto = false)}>
		<div class="flex flex-col gap-3 py-1">
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Motivo <span class="text-red-700">*</span>
				</span>
				<textarea
					bind:value={motivoNegacao}
					rows={4}
					minlength={5}
					maxlength={500}
					placeholder="Descreva o motivo da negação..."
					class="border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
				<span class="text-[11px] text-slate-500">
					Mínimo 5 caracteres. {motivoNegacao.trim().length}/500.
				</span>
			</label>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (negarAberto = false)}
					disabled={processando}
				/>
				<PrimaryButton
					label={processando ? 'Negando...' : 'Confirmar negação'}
					variant="danger"
					onclick={negar}
					disabled={processando || motivoNegacao.trim().length < 5}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Pagar ─────────────────────────────────────────── -->
{#if pagarAberto && aj}
	<Modal isOpen={pagarAberto} title="Registrar pagamento" onClose={() => (pagarAberto = false)}>
		<div class="flex flex-col gap-3 py-1">
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Método de pagamento
				</span>
				<select
					bind:value={metodoPagamento}
					class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="PIX">PIX</option>
					<option value="TRANSFERENCIA">Transferência bancária</option>
					<option value="DINHEIRO_RH">Dinheiro (RH)</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Comprovante <span class="text-red-700">*</span>
				</span>
				<input
					type="file"
					accept="application/pdf,image/jpeg,image/png,image/webp"
					onchange={onFile}
					class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
				/>
				<span class="text-[11px] text-slate-500">
					PDF, JPG, PNG ou WebP. Até 10 MB. Será passado pelo antivírus.
				</span>
			</label>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (pagarAberto = false)}
					disabled={processando}
				/>
				<PrimaryButton
					label={processando ? 'Registrando...' : 'Confirmar pagamento'}
					onclick={pagar}
					disabled={processando || !comprovanteFile}
				/>
			</div>
		</div>
	</Modal>
{/if}
