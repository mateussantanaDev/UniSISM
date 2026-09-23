<script lang="ts">
	import Dropzone from '$lib/presentation/components/Dropzone.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import { useNovoEncaminhamento } from '$lib/presentation/contexts/novoEncaminhamentoContext';
	import { goto } from '$app/navigation';

	const ctx = useNovoEncaminhamento();
	let s = $derived(ctx.state);

	async function handleSolicitacao(files: File[]) {
		await ctx.extrairPdf(files[0]);
	}

	function avancar() {
		if (s.preenchido) goto('/ubs/novo-encaminhamento/revisao');
	}
</script>

<div class="grid grid-cols-12 gap-4">
	<section class="col-span-12 xl:col-span-8">
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Solicitação Médica (PDF)"
				subtitle="Arraste o PDF original da solicitação. O sistema fará a extração automática via OCR."
				index="01"
			>
				{#if s.preenchido && !s.extraindo}
					<span
						class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800"
					>
						EXTRAÍDO · {(s.confianca * 100).toFixed(0)}%
					</span>
				{/if}
			</PanelHeader>
			<div class="p-4">
				<Dropzone
					label="ARRASTE O PDF DA SOLICITAÇÃO MÉDICA"
					sublabel="Formato aceito: PDF nativo (texto selecionável ou escaneado). O sistema executará OCR + extração estruturada de CPF, CID-10 e especialidade."
					acceptTypes="application/pdf"
					loading={s.extraindo}
					loadingLabel="LENDO DOCUMENTO ORIGINAL..."
					mode="ocr"
					files={s.solicitacaoFile}
					onFiles={handleSolicitacao}
				/>
			</div>
		</div>
	</section>

	<aside class="col-span-12 flex flex-col gap-4 xl:col-span-4">
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Status da Extração" index="02" />
			<ul class="divide-y divide-slate-100 font-mono text-[11px]">
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="tracking-wider text-slate-600 uppercase">Arquivo carregado</span>
					<span
						class="font-bold {s.solicitacaoFile.length ? 'text-emerald-700' : 'text-slate-400'}"
					>
						{s.solicitacaoFile.length ? '✓ SIM' : '◐ NÃO'}
					</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="tracking-wider text-slate-600 uppercase">OCR Processado</span>
					<span
						class="font-bold {s.preenchido
							? 'text-emerald-700'
							: s.extraindo
								? 'text-blue-900'
								: 'text-slate-400'}"
					>
						{s.extraindo ? '⋯ EM CURSO' : s.preenchido ? '✓ COMPLETO' : '◐ PENDENTE'}
					</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="tracking-wider text-slate-600 uppercase">Confiança</span>
					<span class="font-bold text-slate-900">
						{s.preenchido ? (s.confianca * 100).toFixed(0) + '%' : '—'}
					</span>
				</li>
				{#if s.preenchido}
					<li class="flex items-center justify-between px-4 py-2.5">
						<span class="tracking-wider text-slate-600 uppercase">Prioridade Detectada</span>
						<StatusBadge prioridade={s.prioridade} />
					</li>
				{/if}
			</ul>
		</div>

		{#if s.preenchido}
			<div class="border-2 border-emerald-700 bg-emerald-50">
				<div class="px-4 py-3">
					<div class="font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
						Pré-visualização
					</div>
					<div class="mt-1 text-sm font-bold text-slate-900">{s.nomePaciente}</div>
					<div class="font-mono text-[11px] text-slate-700">CPF · {s.cpf}</div>
					<div class="mt-1 text-xs text-slate-900">{s.especialidade}</div>
					<div class="font-mono text-[11px] text-slate-700">CID-10 · {s.cid10}</div>
				</div>
			</div>
		{/if}

		<div class="flex justify-end">
			<PrimaryButton
				label="Avançar para Revisão"
				onclick={avancar}
				disabled={!s.preenchido}
				shortcut="→"
			/>
		</div>
	</aside>
</div>
