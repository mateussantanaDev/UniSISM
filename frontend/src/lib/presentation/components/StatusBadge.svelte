<script lang="ts">
	import type { StatusEncaminhamento, PrioridadeClinica } from '$lib/domain/models/Encaminhamento';

	interface Props {
		status?: StatusEncaminhamento;
		prioridade?: PrioridadeClinica;
	}

	let { status, prioridade }: Props = $props();

	const statusMap: Record<StatusEncaminhamento, { label: string; classes: string }> = {
		RASCUNHO: { label: 'RASCUNHO', classes: 'border-slate-400 text-slate-700 bg-slate-100' },
		AGUARDANDO_REGULACAO: {
			label: 'AGUARDANDO',
			classes: 'border-blue-700 text-blue-800 bg-blue-100'
		},
		PENDENCIA_DOCUMENTO: {
			label: 'PENDÊNCIA',
			classes: 'border-amber-600 text-amber-800 bg-amber-100'
		},
		APROVADO: {
			label: 'APROVADO',
			classes: 'border-emerald-700 text-emerald-800 bg-emerald-100'
		},
		REJEITADO: { label: 'REJEITADO', classes: 'border-red-700 text-red-800 bg-red-100' }
	};

	const prioridadeMap: Record<PrioridadeClinica, { label: string; classes: string }> = {
		ELETIVA: { label: 'ELETIVA', classes: 'border-slate-400 text-slate-700 bg-slate-100' },
		PRIORITARIA: {
			label: 'PRIORITÁRIA',
			classes: 'border-amber-600 text-amber-800 bg-amber-100'
		},
		URGENTE: { label: 'URGENTE', classes: 'border-red-700 text-red-800 bg-red-100' },
		EMERGENCIA: { label: 'EMERGÊNCIA', classes: 'border-red-900 text-white bg-red-900' }
	};

	const config = $derived(
		status ? statusMap[status] : prioridade ? prioridadeMap[prioridade] : null
	);
</script>

{#if config}
	<span
		class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider {config.classes}"
	>
		{config.label}
	</span>
{/if}
