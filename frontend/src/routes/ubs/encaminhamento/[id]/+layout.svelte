<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import ResolverPendencia from '$lib/presentation/components/ResolverPendencia.svelte';
	import EditarEncaminhamento from '$lib/presentation/components/EditarEncaminhamento.svelte';
	import ImprimirSolicitacaoEncaminhamento from '$lib/presentation/components/ImprimirSolicitacaoEncaminhamento.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/domain/models/Encaminhamento';
	import { setEncaminhamentoContext } from '$lib/presentation/contexts/encaminhamentoContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	let { children } = $props();

	let encaminhamento = $state<Encaminhamento | null>(null);
	let carregando = $state(true);
	let erro = $state(false);
	let resolverAberto = $state(false);
	let editarAberto = $state(false);
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

	function handleResolvido(atualizado: Encaminhamento) {
		encaminhamento = atualizado;
		resolverAberto = false;
	}

	function handleEditado(atualizado: Encaminhamento) {
		encaminhamento = atualizado;
		editarAberto = false;
	}

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

	const tabs = [
		{ label: 'Resumo', slug: '', shortcut: '1' },
		{ label: 'Paciente', slug: '/paciente', shortcut: '2' },
		{ label: 'Solicitação Clínica', slug: '/clinico', shortcut: '3' },
		{ label: 'Anexos', slug: '/anexos', shortcut: '4' },
		{ label: 'Linha do Tempo', slug: '/historico', shortcut: '5' }
	];

	let baseHref = $derived(`/ubs/encaminhamento/${page.params.id}`);
	let currentPath = $derived(page.url.pathname);

	function isActive(slug: string): boolean {
		const href = `${baseHref}${slug}`;
		return slug === '' ? currentPath === baseHref : currentPath === href;
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Action bar + Tab nav -->
	<div class="border border-slate-200 bg-white">
		<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={() => goto('/ubs/historico')}
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
					/ UBS / HISTÓRICO /
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
				<div class="flex items-center gap-2">
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
					{#if encaminhamento.status === 'AGUARDANDO_REGULACAO' && auth.podeConsolidarEncaminhamento}
						<PrimaryButton
							label="Editar"
							variant="secondary"
							onclick={() => (editarAberto = true)}
						/>
					{/if}
					{#if encaminhamento.status === 'PENDENCIA_DOCUMENTO' && auth.podeConsolidarEncaminhamento}
						<PrimaryButton label="Resolver Pendência" onclick={() => (resolverAberto = true)} />
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
				O ID informado não foi localizado na base. Verifique o link e tente novamente.
			</p>
			<div class="mt-4">
				<PrimaryButton
					label="Voltar ao Histórico"
					variant="secondary"
					onclick={() => goto('/ubs/historico')}
				/>
			</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

{#if encaminhamento}
	<Modal
		isOpen={resolverAberto}
		onClose={() => (resolverAberto = false)}
		title="Resolver Pendência"
		subtitle="Readequação e reenvio à Regulação"
		maxWidth="lg"
	>
		<ResolverPendencia
			{encaminhamento}
			onCancel={() => (resolverAberto = false)}
			onResolved={handleResolvido}
		/>
	</Modal>

	<Modal
		isOpen={editarAberto}
		onClose={() => (editarAberto = false)}
		title="Editar Encaminhamento"
		subtitle="Corrigir dados antes da regulação"
		maxWidth="lg"
	>
		<EditarEncaminhamento
			{encaminhamento}
			onCancel={() => (editarAberto = false)}
			onSaved={handleEditado}
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
