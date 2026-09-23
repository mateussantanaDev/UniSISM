<script lang="ts">
	type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

	interface Props {
		label: string;
		value: string;
		name: string;
		hint?: string;
		readonly?: boolean;
		placeholder?: string;
		span?: Span;
		mono?: boolean;
		loading?: boolean;
		type?: 'text' | 'password' | 'email' | 'number' | 'date';
	}

	let {
		label,
		value = $bindable(''),
		name,
		hint = '',
		readonly = false,
		placeholder = '',
		span = 3,
		mono = false,
		loading = false,
		type = 'text'
	}: Props = $props();

	const spanMap: Record<Span, string> = {
		1: 'col-span-1',
		2: 'col-span-2',
		3: 'col-span-3',
		4: 'col-span-4',
		5: 'col-span-5',
		6: 'col-span-6',
		7: 'col-span-7',
		8: 'col-span-8',
		9: 'col-span-9',
		10: 'col-span-10',
		11: 'col-span-11',
		12: 'col-span-12'
	};
	let spanClass = $derived(spanMap[span]);
</script>

<div class="{spanClass} flex flex-col">
	<label
		for={name}
		class="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
	>
		<span>{label}</span>
		{#if hint}<span class="text-slate-400 normal-case">{hint}</span>{/if}
	</label>
	<div class="relative">
		<input
			id={name}
			{name}
			{type}
			{placeholder}
			{readonly}
			bind:value
			class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none
				read-only:bg-slate-50 read-only:text-slate-700 focus:border-blue-900
				focus:ring-1 focus:ring-blue-900
				{mono ? 'font-mono tracking-wide' : ''}
				{loading ? 'animate-pulse' : ''}"
		/>
		{#if loading}
			<div class="absolute inset-0 bg-slate-100"></div>
		{/if}
	</div>
</div>
