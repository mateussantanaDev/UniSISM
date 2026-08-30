<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	interface NavItem {
		label: string;
		href: string;
		shortcut: string;
		/** Se definido, só aparece quando `predicate` retorna true. */
		quando?: () => boolean;
	}

	const auth = useAuth();

	let items = $derived<NavItem[]>([
		{ label: 'Dashboard', href: '/ubs/dashboard', shortcut: 'D' },
		{
			label: 'Recepção & Fila',
			href: '/ubs/recepcao/fila',
			shortcut: 'F',
			quando: () => auth.me?.escopo === 'UBS' || auth.me?.role === 'DESENVOLVEDOR' || auth.me?.role === 'ADMIN'
		},
		{
			label: 'Consultório Médico',
			href: '/ubs/medico/agenda',
			shortcut: 'C',
			quando: () => auth.podeConsolidarEncaminhamento || auth.me?.role === 'MEDICO' || auth.me?.role === 'MEDICO_ESPECIALISTA' || auth.me?.role === 'DESENVOLVEDOR'
		},
		{
			label: 'Painel TV (Chamada)',
			href: '/ubs/recepcao/painel',
			shortcut: 'T'
		},
		{
			label: 'Novo Encaminhamento',
			href: '/ubs/novo-encaminhamento',
			shortcut: 'N',
			quando: () => auth.podeConsolidarEncaminhamento
		},
		{
			label: 'Pacientes (PEC)',
			href: '/ubs/pacientes',
			shortcut: 'P',
			quando: () => auth.me?.escopo === 'UBS' || auth.me?.role === 'DESENVOLVEDOR'
		},
		{ label: 'Histórico', href: '/ubs/historico', shortcut: 'H' },
		{ label: 'Resposta SMS', href: '/ubs/respostas-sms', shortcut: 'R' }
	]);

	let itensVisiveis = $derived(items.filter((i) => !i.quando || i.quando()));

	let current = $derived(page.url.pathname);

	function ativo(href: string): boolean {
		return current === href || current.startsWith(href + '/');
	}

	let perfilAtivo = $derived(current.startsWith('/ubs/perfil'));
</script>

<aside
	class="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white font-mono text-sm"
>
	<div class="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-4">
		<div class="flex items-center gap-2">
			<div
				class="flex h-8 w-8 items-center justify-center bg-blue-900 text-xs font-bold text-white"
			>
				U
			</div>
			<div class="leading-tight">
				<div class="text-xs font-bold tracking-widest text-slate-900">UNISISM</div>
				<div class="text-[10px] tracking-wider text-slate-500">UBS / FACE 1</div>
			</div>
		</div>
	</div>

	<div class="border-b border-slate-200 bg-gradient-to-b from-blue-50 to-white px-4 py-3">
		<div class="text-[10px] tracking-wider text-slate-500">
			{auth.me?.escopo === 'UBS'
				? 'UNIDADE OPERACIONAL'
				: auth.me?.escopo === 'PREFEITURA'
					? 'PREFEITURA'
					: 'ACESSO GLOBAL'}
		</div>
		<div class="truncate text-xs font-semibold text-slate-900">
			{auth.me?.unidade ?? auth.me?.prefeitura ?? 'UNISISM'}
		</div>
		{#if auth.me?.prefeitura && auth.me?.unidade}
			<div class="truncate text-[11px] text-slate-600">{auth.me.prefeitura}</div>
		{/if}
	</div>

	<nav class="flex flex-1 flex-col gap-1 overflow-y-auto py-3">
		{#each itensVisiveis as item (item.href)}
			{@const active = ativo(item.href)}
			<a
				href={item.href}
				class="mx-2 flex items-center justify-between border-l-2 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-all
					{active
					? 'border-blue-900 bg-blue-50 text-blue-900 shadow-sm'
					: 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'}"
			>
				<span>{item.label}</span>
				<kbd
					class="border px-1.5 py-0.5 text-[9px] font-normal
					{active ? 'border-blue-900 bg-white text-blue-900' : 'border-slate-300 bg-slate-100 text-slate-500'}"
				>
					{item.shortcut}
				</kbd>
			</a>
		{/each}
	</nav>

	<button
		type="button"
		onclick={() => goto('/ubs/perfil')}
		class="group flex w-full items-center gap-2.5 border-t-2 border-l-2 bg-gradient-to-b from-white to-slate-50 px-4 py-3 text-left transition-colors
			{perfilAtivo
			? 'border-t-slate-200 border-l-blue-900 bg-slate-100'
			: 'border-t-slate-200 border-l-transparent hover:bg-slate-100 hover:border-l-slate-300'}"
		aria-label="Abrir perfil do atendente"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center border font-mono text-[11px] font-bold text-white
				{perfilAtivo ? 'border-blue-900 bg-blue-900' : 'border-slate-300 bg-blue-900 group-hover:border-blue-900'}"
		>
			{auth.me?.iniciais ?? '··'}
		</div>
		<div class="min-w-0 flex-1 leading-tight">
			<div class="text-[10px] tracking-wider text-slate-500">SESSÃO ATIVA</div>
			<div
				class="truncate text-xs font-semibold
					{perfilAtivo ? 'text-blue-900' : 'text-slate-900 group-hover:text-blue-900'}"
			>
				{auth.me?.nome ?? 'Atendente'}
			</div>
			<div class="flex items-center gap-1.5 text-[11px] text-emerald-700">
				<span class="inline-block h-1.5 w-1.5 bg-emerald-600"></span>
				<span class="font-semibold">{auth.me?.role ?? 'OPERACIONAL'}</span>
			</div>
		</div>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			class="h-3 w-3
				{perfilAtivo ? 'text-blue-900' : 'text-slate-400 group-hover:text-blue-900'}"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
		</svg>
	</button>
</aside>
