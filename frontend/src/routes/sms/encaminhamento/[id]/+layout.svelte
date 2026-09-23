<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import AprovarEncaminhamento from '$lib/presentation/components/AprovarEncaminhamento.svelte';
	import SolicitarCorrecao from '$lib/presentation/components/SolicitarCorrecao.svelte';
	import RejeitarEncaminhamento from '$lib/presentation/components/RejeitarEncaminhamento.svelte';
	import RegistrarRespostaSUS from '$lib/presentation/components/RegistrarRespostaSUS.svelte';
	import RemarcarEncaminhamento from '$lib/presentation/components/RemarcarEncaminhamento.svelte';
	import ImprimirSolicitacaoEncaminhamento from '$lib/presentation/components/ImprimirSolicitacaoEncaminhamento.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { setEncaminhamentoContext } from '$lib/presentation/contexts/encaminhamentoContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	let { children } = $props();

	const auth = useAuth();

	// ─────────── Carregamento do encaminhamento (1x) ───────────
	let encaminhamento = $state<Encaminhamento | null>(null);
	let carregando = $state(true);
	let erro = $state(false);
	let imprimirAberto = $state(false);

	setEncaminhamentoContext({
		get encaminhamento() {
			return encaminhamento;
		},
		get carregando() {
			return carregando;
		},
		get erro() {
			return erro;
		},
		atualizar: (enc) => {
			encaminhamento = enc;
		}
	});

	$effect(() => {
		const id = page.params.id;
		if (!id) {
			erro = true;
			carregando = false;
			return;
		}
		carregando = true;
		erro = false;
		encaminhamento = null;

		api.encaminhamentos
			.byId(id)
			.then((r) => {
				encaminhamento = r;
			})
			.catch((e) => {
				if (e instanceof ApiError && e.code !== 'TOKEN_EXPIRADO') {
					erro = true;
				}
			})
			.finally(() => {
				carregando = false;
			});
	});

	// ─────────── Modais de ação ───────────
	let aprovarAberto = $state(false);
	let pendenciaAberto = $state(false);
	let rejeitarAberto = $state(false);
	let respostaSusAberto = $state(false);
	let remarcarAberto = $state(false);

	function onDecisao(atualizado: Encaminhamento) {
		encaminhamento = atualizado;
		aprovarAberto = false;
		pendenciaAberto = false;
		rejeitarAberto = false;
		respostaSusAberto = false;
		remarcarAberto = false;
	}

	// ─────────── Tabs ───────────
	const tabs = [
		{ label: 'Resumo', slug: '', shortcut: '1' },
		{ label: 'Paciente', slug: '/paciente', shortcut: '2' },
		{ label: 'Solicitação Clínica', slug: '/clinico', shortcut: '3' },
		{ label: 'Anexos', slug: '/anexos', shortcut: '4' },
		{ label: 'Linha do Tempo', slug: '/historico', shortcut: '5' }
	];

	let baseHref = $derived(`/sms/encaminhamento/${page.params.id}`);
	let currentPath = $derived(page.url.pathname);

	function isActive(slug: string): boolean {
		const href = `${baseHref}${slug}`;
		return slug === '' ? currentPath === baseHref : currentPath === href;
	}

	/** Ações de decisão só disponíveis enquanto aguarda análise. */
	let podeDecidir = $derived(!!encaminhamento && encaminhamento.status === 'AGUARDANDO_REGULACAO');

	/**
	 * Registro da resposta do SUS só é possível para encaminhamentos
	 * aprovados que ainda não receberam o PDF federal.
	 */
	let podeRegistrarRespostaSUS = $derived(
		!!encaminhamento && encaminhamento.status === 'APROVADO' && !encaminhamento.respostaSUS
	);

	function voltar() {
		if (history.length > 1) {
			history.back();
		} else {
			goto('/sms/solicitacoes');
		}
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Action bar + Tab nav -->
	<div class="border border-slate-200 bg-white">
		<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={voltar}
					class="flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-3 w-3"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
					</svg>
					VOLTAR
				</button>
				<span class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					/ SMS / DASHBOARD /
				</span>
				{#if encaminhamento}
					<span class="font-mono text-sm font-bold tracking-wider text-blue-900">
						{encaminhamento.protocolo}
					</span>
					<span class="truncate font-sans text-xs text-slate-600">
						· {encaminhamento.paciente.nome}
					</span>
				{/if}
			</div>

			{#if encaminhamento}
				<div class="flex flex-wrap items-center gap-2">
					<StatusBadge prioridade={encaminhamento.solicitacao.prioridade} />
					<StatusBadge status={encaminhamento.status} />
					<PrimaryButton
						label="Imprimir"
						variant="secondary"
						onclick={() => (imprimirAberto = true)}
					/>
					<PrimaryButton
						label="Baixar PDF"
						variant="secondary"
						onclick={() => (imprimirAberto = true)}
					/>

					{#if encaminhamento && (encaminhamento.status === 'AGUARDANDO_REGULACAO' || encaminhamento.status === 'APROVADO')}
						<PrimaryButton
							label="📅 Remarcar"
							variant="secondary"
							onclick={() => (remarcarAberto = true)}
						/>
					{/if}
					{#if podeDecidir && auth.podeRegistrarPendencia}
						<PrimaryButton
							label="Solicitar Correção"
							variant="secondary"
							onclick={() => (pendenciaAberto = true)}
						/>
					{/if}
					{#if podeDecidir && auth.podeRejeitarEncaminhamento}
						<PrimaryButton
							label="Rejeitar"
							variant="danger"
							onclick={() => (rejeitarAberto = true)}
						/>
					{/if}
					{#if podeDecidir && auth.podeAprovarEncaminhamento}
						<PrimaryButton label="Aprovar" onclick={() => (aprovarAberto = true)} />
					{/if}
					{#if podeRegistrarRespostaSUS && auth.podeAprovarEncaminhamento}
						<PrimaryButton
							label="Registrar Resposta SUS"
							onclick={() => (respostaSusAberto = true)}
						/>
					{/if}
				</div>
			{/if}
		</div>

		<nav
			class="flex flex-wrap items-stretch border-t border-slate-200 bg-slate-50"
			aria-label="Sub-navegação do encaminhamento"
		>
			{#each tabs as tab (tab.slug)}
				{@const active = isActive(tab.slug)}
				<a
					href={`${baseHref}${tab.slug}`}
					class="relative flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 font-mono text-[11px] font-bold tracking-widest uppercase transition-colors
						{active ? 'bg-white text-blue-900' : 'text-slate-600 hover:bg-white hover:text-slate-900'}"
				>
					{#if active}
						<span class="absolute top-0 left-0 h-0.5 w-full bg-blue-900"></span>
					{/if}
					<span>{tab.label}</span>
					<kbd
						class="border px-1 py-px text-[9px] font-normal
							{active ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-500'}"
					>
						{tab.shortcut}
					</kbd>
				</a>
			{/each}
		</nav>
	</div>

	{#if carregando}
		<div class="border border-slate-200 bg-white p-10 text-center">
			<div
				class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
				Carregando encaminhamento...
			</div>
		</div>
	{:else if erro || !encaminhamento}
		<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
			<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
				Encaminhamento não encontrado
			</div>
			<p class="mt-2 text-xs text-red-800">
				O ID informado não foi localizado ou não pertence ao escopo da sua prefeitura.
			</p>
			<div class="mt-4">
				<PrimaryButton
					label="Voltar ao Dashboard"
					variant="secondary"
					onclick={() => goto('/sms/dashboard')}
				/>
			</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<!-- Modais de decisão — renderizados apenas com encaminhamento carregado -->
{#if encaminhamento}
	<Modal
		isOpen={aprovarAberto}
		onClose={() => (aprovarAberto = false)}
		title="Aprovar Encaminhamento"
		subtitle="Autorização para a rede especializada"
		maxWidth="lg"
	>
		<AprovarEncaminhamento
			{encaminhamento}
			onCancel={() => (aprovarAberto = false)}
			onAprovado={onDecisao}
		/>
	</Modal>

	<Modal
		isOpen={pendenciaAberto}
		onClose={() => (pendenciaAberto = false)}
		title="Solicitar Correção à UBS"
		subtitle="Registro de pendência documental"
		maxWidth="lg"
	>
		<SolicitarCorrecao
			{encaminhamento}
			onCancel={() => (pendenciaAberto = false)}
			onRegistrado={onDecisao}
		/>
	</Modal>

	<Modal
		isOpen={rejeitarAberto}
		onClose={() => (rejeitarAberto = false)}
		title="Rejeitar Encaminhamento"
		subtitle="Decisão definitiva — sem possibilidade de reenvio"
		maxWidth="lg"
	>
		<RejeitarEncaminhamento
			{encaminhamento}
			onCancel={() => (rejeitarAberto = false)}
			onRejeitado={onDecisao}
		/>
	</Modal>

	<Modal
		isOpen={respostaSusAberto}
		onClose={() => (respostaSusAberto = false)}
		title="Registrar Resposta do SUS"
		subtitle="Anexar PDF oficial recebido do sistema federal"
		maxWidth="lg"
	>
		<RegistrarRespostaSUS
			{encaminhamento}
			onCancel={() => (respostaSusAberto = false)}
			onRegistrado={onDecisao}
		/>
	</Modal>

	<Modal
		isOpen={remarcarAberto}
		onClose={() => (remarcarAberto = false)}
		title="📅 Remarcar Atendimento (Fila de Regulação)"
		subtitle="Ajustar data e horário preservando a fila e prioridade clínica"
		maxWidth="lg"
	>
		<RemarcarEncaminhamento
			{encaminhamento}
			onCancel={() => (remarcarAberto = false)}
			onRemarcado={onDecisao}
		/>
	</Modal>

	{#if imprimirAberto}
		<ImprimirSolicitacaoEncaminhamento
			{encaminhamento}
			operador={auth.me?.nome}
			prefeitura={auth.me?.prefeitura}
			unidade={auth.me?.unidade}
			onFechar={() => (imprimirAberto = false)}
		/>
	{/if}
{/if}
