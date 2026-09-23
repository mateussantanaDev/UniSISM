<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import TimelineStep from '$lib/presentation/components/TimelineStep.svelte';
	import { useEncaminhamento } from '$lib/presentation/contexts/encaminhamentoContext';
	import { page } from '$app/state';

	const ctx = useEncaminhamento();
	let enc = $derived(ctx.encaminhamento!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function calcularIdade(dataNasc: string): number {
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
	}

	let base = $derived(`/ubs/encaminhamento/${page.params.id}`);
	let ultimosEventos = $derived(enc.timeline?.slice(-3).reverse() ?? []);
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Status principal -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Situação Atual" index="01" />
		<div class="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Status</div>
				<div class="mt-1.5">
					<StatusBadge status={enc.status} />
				</div>
			</div>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Prioridade</div>
				<div class="mt-1.5">
					<StatusBadge prioridade={enc.solicitacao.prioridade} />
				</div>
			</div>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Criado em</div>
				<div class="mt-1 font-mono text-xs font-semibold text-slate-900">
					{formatarData(enc.criadoEm)}
				</div>
			</div>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Atualizado em
				</div>
				<div class="mt-1 font-mono text-xs font-semibold text-slate-900">
					{formatarData(enc.atualizadoEm)}
				</div>
			</div>
		</div>

		{#if enc.agendamentoPrevisto}
			<div class="mx-4 mb-3 border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2">
				<div class="font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
					Agendamento previsto
				</div>
				<div class="mt-0.5 font-mono text-sm font-bold text-emerald-900">
					{formatarData(enc.agendamentoPrevisto)}
				</div>
			</div>
		{/if}

		{#if enc.observacoesRegulacao}
			<div class="mx-4 mb-4 border-l-4 border-amber-600 bg-amber-50 px-3 py-2">
				<div class="font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase">
					Observações da Regulação
				</div>
				<div class="mt-0.5 text-xs text-amber-900">{enc.observacoesRegulacao}</div>
			</div>
		{/if}
	</div>

	<!-- Responsável -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Responsável UBS" index="02" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2">
				<dt class="tracking-widest text-slate-500 uppercase">Atendente</dt>
				<dd class="font-bold text-slate-900">{enc.atendenteResponsavel}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2">
				<dt class="tracking-widest text-slate-500 uppercase">Unidade</dt>
				<dd class="truncate text-slate-900">{enc.unidadeOrigem}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2">
				<dt class="tracking-widest text-slate-500 uppercase">Protocolo</dt>
				<dd class="font-bold text-blue-900">{enc.protocolo}</dd>
			</div>
		</dl>
	</div>

	<!-- Resumo Paciente -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-6">
		<PanelHeader title="Paciente" subtitle="Identificação resumida" index="03">
			<a
				href={`${base}/paciente`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver completo →
			</a>
		</PanelHeader>
		<div class="px-4 py-4">
			<div class="text-sm font-bold text-slate-900">{enc.paciente.nome}</div>
			<div class="mt-0.5 font-mono text-[11px] text-slate-600">
				{calcularIdade(enc.paciente.dataNascimento)} anos ·
				{enc.paciente.sexo === 'F' ? 'Feminino' : enc.paciente.sexo === 'M' ? 'Masculino' : 'Outro'}
			</div>
			<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
				<div>
					<dt class="tracking-widest text-slate-500 uppercase">CPF</dt>
					<dd class="text-slate-900">{enc.paciente.cpf}</dd>
				</div>
				<div>
					<dt class="tracking-widest text-slate-500 uppercase">Cartão SUS</dt>
					<dd class="text-slate-900">{enc.paciente.cartaoSus}</dd>
				</div>
				<div>
					<dt class="tracking-widest text-slate-500 uppercase">Telefone</dt>
					<dd class="text-slate-900">{enc.paciente.telefone}</dd>
				</div>
			</dl>
		</div>
	</div>

	<!-- Resumo Solicitação -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-6">
		<PanelHeader title="Solicitação" subtitle="Clínica resumida" index="04">
			<a
				href={`${base}/clinico`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver completo →
			</a>
		</PanelHeader>
		<div class="px-4 py-4">
			<div class="text-sm font-bold text-slate-900">
				{enc.solicitacao.especialidadeSolicitada}
			</div>
			<div class="mt-0.5 font-mono text-[11px] text-slate-600">
				CID-10 · {enc.solicitacao.cid10}
			</div>
			<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
				<div>
					<dt class="tracking-widest text-slate-500 uppercase">Médico</dt>
					<dd class="truncate font-sans text-slate-900">
						{enc.solicitacao.medicoSolicitante}
					</dd>
				</div>
				<div>
					<dt class="tracking-widest text-slate-500 uppercase">CRM</dt>
					<dd class="text-slate-900">{enc.solicitacao.crm}</dd>
				</div>
				<div class="col-span-2">
					<dt class="tracking-widest text-slate-500 uppercase">Descrição CID</dt>
					<dd class="truncate font-sans text-slate-900">{enc.solicitacao.cidDescricao}</dd>
				</div>
			</dl>
		</div>
	</div>

	<!-- Resumo Anexos -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Anexos" index="05">
			<a
				href={`${base}/anexos`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Gerenciar →
			</a>
		</PanelHeader>
		<div class="flex items-center justify-between px-4 py-4">
			<div>
				<div class="font-mono text-3xl font-bold text-slate-900">
					{enc.anexos.length}
				</div>
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					documento{enc.anexos.length === 1 ? '' : 's'} vinculado{enc.anexos.length === 1
						? ''
						: 's'}
				</div>
			</div>
			<div class="flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-6 w-6 text-slate-500"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
					/>
				</svg>
			</div>
		</div>
	</div>

	<!-- Últimos eventos da timeline -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Últimos Eventos" subtitle="3 mais recentes" index="06">
			<a
				href={`${base}/historico`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver linha do tempo →
			</a>
		</PanelHeader>
		<div class="px-4 py-4">
			{#if ultimosEventos.length === 0}
				<p class="font-mono text-xs text-slate-500">Nenhum evento registrado.</p>
			{:else}
				<ol>
					{#each ultimosEventos as ev, i (ev.id)}
						<TimelineStep
							tipo={ev.tipo}
							titulo={ev.titulo}
							descricao={ev.descricao}
							autor={ev.autor}
							autorPapel={ev.autorPapel}
							em={ev.em}
							isLast={i === ultimosEventos.length - 1}
						/>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
</section>
