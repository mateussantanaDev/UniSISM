<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import { useEncaminhamento } from '$lib/presentation/contexts/encaminhamentoContext';

	const ctx = useEncaminhamento();
	let enc = $derived(ctx.encaminhamento!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Dados do pedido -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader
			title="Solicitação Clínica"
			subtitle="Informações da solicitação médica original"
			index="01"
		>
			<StatusBadge prioridade={enc.solicitacao.prioridade} />
		</PanelHeader>
		<dl class="grid grid-cols-12 gap-x-4 gap-y-4 px-4 py-4">
			<div class="col-span-8">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Médico Solicitante
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">
					{enc.solicitacao.medicoSolicitante}
				</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CRM</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{enc.solicitacao.crm}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Especialidade Solicitada
				</dt>
				<dd class="mt-0.5 text-sm font-bold text-slate-900">
					{enc.solicitacao.especialidadeSolicitada}
				</dd>
			</div>
			<div class="col-span-3">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CID-10</dt>
				<dd class="mt-0.5 font-mono text-sm font-bold text-blue-900">
					{enc.solicitacao.cid10}
				</dd>
			</div>
			<div class="col-span-3">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Data da Solicitação
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{formatarData(enc.solicitacao.dataSolicitacao)}
				</dd>
			</div>
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Descrição CID-10
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{enc.solicitacao.cidDescricao}</dd>
			</div>
		</dl>
	</div>

	<!-- Classificação -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Classificação" index="02" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Prioridade</dt>
				<dd><StatusBadge prioridade={enc.solicitacao.prioridade} /></dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Status Atual</dt>
				<dd><StatusBadge status={enc.status} /></dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Categoria</dt>
				<dd class="text-slate-900">Ambulatorial</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Via</dt>
				<dd class="text-slate-900">Regulação SMS</dd>
			</div>
		</dl>
	</div>

	<!-- Justificativa (texto livre — principal fonte de decisão) -->
	<div class="col-span-12 border border-slate-200 bg-white">
		<PanelHeader
			title="Justificativa Clínica"
			subtitle="Texto conforme extraído do documento original da UBS"
			index="03"
		/>
		<div class="p-4">
			<div
				class="border-l-4 border-blue-900 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800"
			>
				{enc.solicitacao.justificativaClinica}
			</div>
		</div>
	</div>
</section>
