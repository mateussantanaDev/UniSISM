<script lang="ts">
	import type { PassageiroViagem } from '$lib/api/tfd-types';

	interface Props {
		/** Capacidade total do veículo (1..N). */
		capacidade: number;
		/** Passageiros já alocados (assentos ocupados). */
		passageiros: PassageiroViagem[];
		/** Assento selecionado pelo usuário no momento (1..capacidade). */
		selecionado?: number | null;
		/** Callback quando o usuário escolhe um assento livre. */
		onSelecionar?: (numero: number) => void;
		/** Tamanho dos assentos: compact em listas, normal em modal. */
		tamanho?: 'compact' | 'normal';
		/** Modo somente leitura — sem clique. */
		readonly?: boolean;
	}

	let {
		capacidade,
		passageiros,
		selecionado = null,
		onSelecionar,
		tamanho = 'normal',
		readonly = false
	}: Props = $props();

	const passageirosComAssento = $derived(
		passageiros.filter((p) => p.numeroAssento !== null) as Array<
			PassageiroViagem & { numeroAssento: number }
		>
	);

	const assentos = $derived(
		Array.from({ length: capacidade }, (_, i) => {
			const numero = i + 1;
			const ocupante = passageirosComAssento.find((p) => p.numeroAssento === numero);
			return { numero, ocupante };
		})
	);

	function handleClick(numero: number) {
		if (readonly) return;
		const ocupado = passageirosComAssento.some((p) => p.numeroAssento === numero);
		if (ocupado) return;
		onSelecionar?.(numero);
	}

	function classeAssento(numero: number, ocupado: boolean, isSelecionado: boolean): string {
		const base = tamanho === 'compact' ? 'h-8 w-8 text-[10px]' : 'h-12 w-12 text-xs';
		const cursor =
			readonly || ocupado ? 'cursor-not-allowed' : 'cursor-pointer hover:border-blue-900';
		if (ocupado) {
			return `${base} ${cursor} border border-slate-400 bg-slate-200 text-slate-700`;
		}
		if (isSelecionado) {
			return `${base} ${cursor} border-2 border-blue-900 bg-blue-900 text-white shadow-[2px_2px_0_rgba(15,23,42,0.2)]`;
		}
		return `${base} ${cursor} border border-emerald-700 bg-emerald-50 text-emerald-800`;
	}

	const colsClass = $derived(
		capacidade <= 8
			? 'grid-cols-4'
			: capacidade <= 16
				? 'grid-cols-4 md:grid-cols-5'
				: capacidade <= 24
					? 'grid-cols-5 md:grid-cols-6'
					: 'grid-cols-5 md:grid-cols-8'
	);
</script>

<div class="flex flex-col gap-3">
	<!-- Legenda -->
	<div
		class="flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-wider text-slate-600 uppercase"
	>
		<div class="flex items-center gap-1.5">
			<span class="h-3 w-3 border border-emerald-700 bg-emerald-50"></span>
			<span>Livre</span>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="h-3 w-3 border border-slate-400 bg-slate-200"></span>
			<span>Ocupado</span>
		</div>
		{#if !readonly}
			<div class="flex items-center gap-1.5">
				<span class="h-3 w-3 border-2 border-blue-900 bg-blue-900"></span>
				<span>Sua escolha</span>
			</div>
		{/if}
		<span class="ml-auto font-bold text-slate-900">
			{passageirosComAssento.length}/{capacidade} ASSENTOS
		</span>
	</div>

	<!-- Indicador de "frente" do veículo (volante) -->
	<div class="flex items-center justify-center gap-2 border-b border-slate-300 pb-2">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="h-4 w-4 text-slate-500"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
			/>
		</svg>
		<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
			Frente do veículo
		</span>
	</div>

	<!-- Grid de assentos -->
	<div class="grid {colsClass} justify-items-center gap-2">
		{#each assentos as a (a.numero)}
			{@const ocupado = !!a.ocupante}
			{@const isSel = selecionado === a.numero}
			<button
				type="button"
				disabled={readonly || ocupado}
				onclick={() => handleClick(a.numero)}
				title={ocupado
					? `${a.numero} · ocupado por ${a.ocupante?.pacienteNome ?? 'paciente'}`
					: `Assento ${a.numero} · disponível`}
				class="flex items-center justify-center font-mono font-bold transition-all
					{classeAssento(a.numero, ocupado, isSel)}"
				aria-label={ocupado ? `Assento ${a.numero} ocupado` : `Selecionar assento ${a.numero}`}
				aria-pressed={isSel}
			>
				{a.numero}
			</button>
		{/each}
	</div>

	<!-- Lista de ocupantes (se houver) -->
	{#if passageirosComAssento.length > 0}
		<div class="border-t border-slate-200 pt-2">
			<div class="mb-1.5 font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				Ocupantes Atuais
			</div>
			<ul class="grid grid-cols-1 gap-1 text-[11px] text-slate-700 md:grid-cols-2">
				{#each passageirosComAssento as p (p.id)}
					<li class="flex items-center gap-2">
						<span
							class="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-slate-400 bg-slate-100 font-mono text-[10px] font-bold text-slate-700"
						>
							{p.numeroAssento}
						</span>
						<span class="truncate font-sans">
							{p.pacienteNome ?? '—'}{#if p.acompanhante}<span class="ml-1 text-amber-700">
									+ acomp.</span
								>{/if}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
