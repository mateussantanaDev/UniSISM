<script lang="ts">
	import { onMount } from 'svelte';
	import { detectarLocalizacao, type LocationInfo } from '$lib/presentation/utils/geolocation';

	let { children } = $props();

	let now = $state(new Date());
	$effect(() => {
		const interval = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(interval);
	});

	let relogio = $derived(
		now.toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
	);

	/**
	 * Detecta o município do acesso via Geolocation API + Nominatim.
	 * O valor é cache em sessionStorage. Se falhar, `localizacao` fica `null`
	 * e exibimos o rótulo institucional neutro.
	 */
	let localizacao = $state<LocationInfo | null>(null);
	let detectando = $state(true);

	onMount(async () => {
		try {
			localizacao = await detectarLocalizacao();
		} finally {
			detectando = false;
		}
	});
</script>

<div class="flex min-h-screen bg-slate-50 text-slate-900">
	<!-- Painel institucional -->
	<aside
		class="relative hidden w-[420px] shrink-0 flex-col justify-between bg-blue-900 text-white md:flex"
	>
		<div class="px-10 pt-10">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center border-2 border-white bg-blue-900 font-mono text-sm font-bold"
				>
					U
				</div>
				<div class="leading-tight">
					<div class="font-mono text-sm font-bold tracking-widest">UNISISM</div>
					<div class="font-mono text-[10px] tracking-widest text-blue-200">
						SISTEMA UNIFICADO DE SAÚDE
					</div>
				</div>
			</div>

			<h1 class="mt-16 font-mono text-xs font-bold tracking-widest text-blue-200 uppercase">
				SISTEMA UNIFICADO DE SAÚDE · MUNICIPAL
			</h1>
			<p class="mt-3 text-3xl leading-tight font-bold">
				Terminal<br />
				institucional<br />
				de regulação.
			</p>
			<p class="mt-4 max-w-sm text-sm leading-relaxed text-blue-100">
				Plataforma unificando Unidades Básicas de Saúde e a Secretaria Municipal — ingestão de
				encaminhamentos, regulação e rastreabilidade de todo o fluxo.
			</p>

			<ul class="mt-10 space-y-2 font-mono text-[11px] tracking-wider text-blue-100 uppercase">
				<li class="flex items-center gap-2">
					<span class="inline-block h-1.5 w-1.5 bg-emerald-400"></span>
					API · OPERACIONAL
				</li>
				<li class="flex items-center gap-2">
					<span class="inline-block h-1.5 w-1.5 bg-emerald-400"></span>
					OCR · OPERACIONAL
				</li>
				<li class="flex items-center gap-2">
					<span class="inline-block h-1.5 w-1.5 bg-emerald-400"></span>
					CANAL SECRETARIA · OK
				</li>
			</ul>
		</div>

		<div
			class="border-t border-blue-800 px-10 py-5 font-mono text-[10px] tracking-widest text-blue-200 uppercase"
		>
			<div class="flex items-center justify-between">
				<span>UNISISM v0.1.0</span>
				<span>{relogio}</span>
			</div>
			<div class="mt-1 flex items-center gap-1.5">
				{#if detectando}
					<span class="inline-block h-1.5 w-1.5 animate-pulse bg-blue-300"></span>
					<span>DETECTANDO LOCALIZAÇÃO...</span>
				{:else if localizacao}
					<span class="inline-block h-1.5 w-1.5 bg-emerald-400"></span>
					<span>ACESSO DE · Águas Belas</span>
				{:else}
					<span class="inline-block h-1.5 w-1.5 bg-slate-400"></span>
					<span>PLATAFORMA MUNICIPAL DE SAÚDE</span>
				{/if}
			</div>
		</div>

		<!-- Faixa decorativa brutalista -->
		<div class="absolute top-0 right-0 h-full w-1 bg-blue-950"></div>
	</aside>

	<!-- Conteúdo: form -->
	<main class="flex flex-1 items-center justify-center px-6 py-10">
		<div class="w-full max-w-md">
			{@render children()}
		</div>
	</main>
</div>
