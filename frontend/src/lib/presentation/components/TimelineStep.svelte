<script lang="ts">
	import type { TipoEventoTimeline } from '$lib/domain/models/Encaminhamento';

	interface Props {
		tipo: TipoEventoTimeline;
		titulo: string;
		descricao: string;
		autor: string;
		autorPapel: string;
		em: string;
		isLast?: boolean;
	}

	let { tipo, titulo, descricao, autor, autorPapel, em, isLast = false }: Props = $props();

	const tipoMap: Record<TipoEventoTimeline, { dot: string; ring: string; label: string }> = {
		CRIADO: { dot: 'bg-blue-900', ring: 'ring-blue-100', label: 'CRIAÇÃO' },
		DOCUMENTO_ANEXADO: { dot: 'bg-slate-700', ring: 'ring-slate-100', label: 'ANEXO' },
		ENVIADO_REGULACAO: { dot: 'bg-blue-900', ring: 'ring-blue-100', label: 'TRANSMISSÃO' },
		PENDENCIA_REGISTRADA: { dot: 'bg-amber-600', ring: 'ring-amber-100', label: 'PENDÊNCIA' },
		APROVADO: { dot: 'bg-emerald-700', ring: 'ring-emerald-100', label: 'APROVAÇÃO' },
		REJEITADO: { dot: 'bg-red-700', ring: 'ring-red-100', label: 'REJEIÇÃO' },
		AGENDADO: { dot: 'bg-emerald-700', ring: 'ring-emerald-100', label: 'AGENDAMENTO' },
		OBSERVACAO: { dot: 'bg-slate-500', ring: 'ring-slate-100', label: 'OBSERVAÇÃO' },
		EDITADO: { dot: 'bg-blue-700', ring: 'ring-blue-100', label: 'EDIÇÃO' },
		RESPOSTA_SUS_RECEBIDA: {
			dot: 'bg-purple-700',
			ring: 'ring-purple-100',
			label: 'RESPOSTA SUS'
		}
	};

	const cfg = $derived(tipoMap[tipo]);

	function formatar(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<li class="relative flex gap-4 pb-5">
	{#if !isLast}
		<span aria-hidden="true" class="absolute top-5 left-[7px] h-full w-px bg-slate-200"></span>
	{/if}

	<span class="relative mt-1.5 h-[14px] w-[14px] shrink-0 {cfg.dot} ring-4 {cfg.ring}"></span>

	<div class="flex-1 border border-slate-200 bg-white">
		<div
			class="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5"
		>
			<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				{cfg.label} · {titulo}
			</span>
			<span class="font-mono text-[10px] text-slate-500">{formatar(em)}</span>
		</div>
		<div class="px-3 py-2">
			<p class="text-xs text-slate-700">{descricao}</p>
			<div
				class="mt-1.5 flex items-center gap-2 font-mono text-[10px] tracking-wider text-slate-500 uppercase"
			>
				<span class="font-bold text-slate-700">{autor}</span>
				<span>·</span>
				<span>{autorPapel}</span>
			</div>
		</div>
	</div>
</li>
