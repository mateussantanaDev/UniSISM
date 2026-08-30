<script lang="ts">
	interface Props {
		label: string;
		sublabel: string;
		acceptTypes?: string;
		multiple?: boolean;
		loading?: boolean;
		loadingLabel?: string;
		files?: File[];
		onFiles?: (files: File[]) => void;
		variant?: 'primary' | 'secondary';
		mode?: 'ocr' | 'simple';
		processingHint?: string;
	}

	let {
		label,
		sublabel,
		acceptTypes = 'application/pdf',
		multiple = false,
		loading = false,
		loadingLabel = 'PROCESSANDO DOCUMENTO...',
		files = [],
		onFiles,
		variant = 'primary',
		mode = 'simple',
		processingHint = ''
	}: Props = $props();

	let isDragging = $state(false);
	let inputEl: HTMLInputElement;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (loading) return;
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (loading) return;
		const dropped = Array.from(e.dataTransfer?.files ?? []);
		if (dropped.length > 0 && onFiles) onFiles(dropped);
	}

	function handleInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const selected = Array.from(target.files ?? []);
		if (selected.length > 0 && onFiles) onFiles(selected);
		target.value = '';
	}

	function openPicker() {
		if (loading) return;
		inputEl?.click();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openPicker();
		}
	}

	let baseClasses = $derived(
		variant === 'primary'
			? 'min-h-[240px] border-2 border-dashed'
			: 'min-h-[140px] border border-dashed'
	);
</script>

<div
	role="button"
	tabindex="0"
	aria-busy={loading}
	class="relative flex flex-col items-center justify-center px-6 text-center transition-colors
		{baseClasses}
		{isDragging
		? 'border-blue-900 bg-blue-50'
		: loading
			? 'border-slate-400 bg-slate-100'
			: 'border-slate-400 bg-white hover:border-blue-900 hover:bg-slate-50'}
		{loading ? 'cursor-wait' : 'cursor-pointer'}"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={openPicker}
	onkeydown={handleKey}
>
	<input
		bind:this={inputEl}
		type="file"
		class="hidden"
		accept={acceptTypes}
		{multiple}
		onchange={handleInputChange}
	/>

	{#if loading}
		<div class="flex flex-col items-center gap-3">
			<div
				class="inline-block h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-xs font-bold tracking-widest text-blue-900 uppercase">
				{loadingLabel}
			</div>
			{#if mode === 'ocr'}
				<div class="text-[11px] leading-relaxed text-slate-600">
					OCR + EXTRAÇÃO ESTRUTURADA EM ANDAMENTO
				</div>
			{:else if processingHint}
				<div class="text-[11px] leading-relaxed text-slate-600">{processingHint}</div>
			{/if}
		</div>
	{:else if files.length > 0}
		<div class="flex w-full flex-col items-center gap-2">
			<div class="text-[10px] font-bold tracking-widest text-emerald-700 uppercase">
				{files.length} ARQUIVO{files.length > 1 ? 'S' : ''} CARREGADO{files.length > 1 ? 'S' : ''}
			</div>
			<ul class="w-full space-y-1">
				{#each files as f, i (f.name + i)}
					<li
						class="flex items-center justify-between border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11px] text-slate-700"
					>
						<span class="truncate">{f.name}</span>
						<span class="text-slate-500">{(f.size / 1024).toFixed(1)} KB</span>
					</li>
				{/each}
			</ul>
			<div class="text-[10px] tracking-wider text-slate-500 uppercase">
				CLIQUE OU ARRASTE PARA SUBSTITUIR
			</div>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-3">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="h-10 w-10 text-slate-500"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
				/>
			</svg>
			<div class="font-mono text-sm font-bold tracking-wider text-slate-900 uppercase">
				{label}
			</div>
			<div class="max-w-md text-xs text-slate-600">{sublabel}</div>
			<div class="mt-2 flex items-center gap-2 text-[10px] tracking-widest text-slate-500">
				<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono">ARRASTAR</span>
				<span>OU</span>
				<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono">CLIQUE</span>
			</div>
		</div>
	{/if}
</div>
