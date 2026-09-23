<script lang="ts">
	interface Props {
		label: string;
		onclick?: () => void;
		disabled?: boolean;
		loading?: boolean;
		variant?: 'primary' | 'secondary' | 'danger';
		type?: 'button' | 'submit' | 'reset';
		shortcut?: string;
		fullWidth?: boolean;
	}

	let {
		label,
		onclick,
		disabled = false,
		loading = false,
		variant = 'primary',
		type = 'button',
		shortcut = '',
		fullWidth = false
	}: Props = $props();

	const variants = {
		primary:
			'bg-blue-900 text-white border-blue-900 hover:bg-blue-950 active:bg-blue-950 active:shadow-inner disabled:bg-slate-400 disabled:border-slate-400 transition-all',
		secondary:
			'bg-white text-slate-900 border-slate-300 hover:border-slate-500 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 transition-all',
		danger:
			'bg-red-800 text-white border-red-800 hover:bg-red-900 active:bg-red-950 disabled:bg-slate-400 disabled:border-slate-400 transition-all'
	};
</script>

<button
	{type}
	{onclick}
	disabled={disabled || loading}
	class="inline-flex items-center justify-center gap-2 border px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors disabled:cursor-not-allowed
		{variants[variant]}
		{fullWidth ? 'w-full' : ''}"
>
	{#if loading}
		<span class="inline-block h-3 w-3 animate-spin border-2 border-current border-t-transparent"
		></span>
		<span>PROCESSANDO...</span>
	{:else}
		<span>{label}</span>
		{#if shortcut}
			<kbd class="border border-current/40 px-1 py-px text-[9px] font-normal opacity-80">
				{shortcut}
			</kbd>
		{/if}
	{/if}
</button>
