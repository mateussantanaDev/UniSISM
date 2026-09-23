<script lang="ts">
	import { page } from '$app/state';

	interface Tab {
		label: string;
		href: string;
		shortcut?: string;
		badge?: string | number;
		badgeTone?: 'default' | 'warning' | 'critical' | 'success';
	}

	interface Props {
		tabs: Tab[];
	}

	let { tabs }: Props = $props();
	let current = $derived(page.url.pathname);

	const badgeTones = {
		default: 'border-slate-300 bg-white text-slate-700',
		warning: 'border-amber-600 bg-amber-50 text-amber-800',
		critical: 'border-red-700 bg-red-50 text-red-800',
		success: 'border-emerald-700 bg-emerald-50 text-emerald-800'
	};
</script>

<nav
	class="flex flex-wrap items-stretch border border-slate-200 bg-slate-50"
	aria-label="Sub-navegação"
>
	{#each tabs as tab (tab.href)}
		{@const active = current === tab.href}
		<a
			href={tab.href}
			class="relative flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 font-mono text-[11px] font-bold tracking-widest uppercase transition-colors
				{active ? 'bg-white text-blue-900' : 'text-slate-600 hover:bg-white hover:text-slate-900'}"
		>
			{#if active}
				<span class="absolute top-0 left-0 h-0.5 w-full bg-blue-900"></span>
			{/if}
			<span>{tab.label}</span>
			{#if tab.badge !== undefined}
				<span
					class="border px-1.5 py-px text-[10px] font-bold tracking-wider
						{badgeTones[tab.badgeTone ?? 'default']}"
				>
					{tab.badge}
				</span>
			{/if}
			{#if tab.shortcut}
				<kbd
					class="border px-1 py-px text-[9px] font-normal
						{active ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-500'}"
				>
					{tab.shortcut}
				</kbd>
			{/if}
		</a>
	{/each}
</nav>
