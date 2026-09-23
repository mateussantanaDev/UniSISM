<script lang="ts">
	interface Props {
		title: string;
		subtitle?: string;
		index?: string;
		children?: import('svelte').Snippet;
	}

	let { title, subtitle = '', index = '', children }: Props = $props();
</script>

<div
	class="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3"
>
	<div class="flex items-center gap-3">
		{#if index}
			<span
				class="flex h-6 w-6 items-center justify-center bg-blue-900 font-mono text-[11px] font-bold text-white"
			>
				{index}
			</span>
		{/if}
		<div class="leading-tight">
			<h2 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
				{title}
			</h2>
			{#if subtitle}
				<div class="text-[11px] text-slate-600">{subtitle}</div>
			{/if}
		</div>
	</div>
	{#if children}
		<div class="flex items-center gap-2">
			{@render children()}
		</div>
	{/if}
</div>
