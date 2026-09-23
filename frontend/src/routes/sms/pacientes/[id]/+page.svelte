<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { page } from '$app/state';

	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function diasDesde(iso?: string): number {
		if (!iso) return Infinity;
		return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	}

	let base = $derived(`/sms/pacientes/${page.params.id}`);
	let cronicasAtivas = $derived(p.condicoesCronicas.filter((c) => c.ativo));
	let medsAtivos = $derived(p.medicamentosEmUso.filter((m) => m.ativo));
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Alerta crítico -->
	{#if p.alergias.length > 0}
		<div class="col-span-12 border-2 border-red-700 bg-red-50 px-4 py-3">
			<div class="flex items-center justify-between">
				<div>
					<div class="font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase">
						⚠ ALERGIAS
					</div>
					<div class="mt-1 flex flex-wrap gap-1.5">
						{#each p.alergias as a (a.substancia)}
							<span
								class="border border-red-700 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-red-800"
							>
								{a.substancia} · {a.gravidade}
							</span>
						{/each}
					</div>
				</div>
				<a
					href={`${base}/quadro-clinico`}
					class="border border-red-700 bg-red-700 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-white uppercase hover:bg-red-800"
				>
					QUADRO CLÍNICO →
				</a>
			</div>
		</div>
	{/if}

	<!-- Identidade -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
		<PanelHeader title="Identidade Médica" index="01" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Grupo Sanguíneo</dt>
				<dd class="text-lg font-bold text-red-800">{p.grupoSanguineo}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">UBS</dt>
				<dd class="truncate pl-2 text-slate-900">{p.unidadeVinculada}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Equipe ESF</dt>
				<dd class="truncate pl-2 text-slate-900">{p.equipeSaudeFamilia ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">ACS</dt>
				<dd class="text-slate-900">{p.agenteComunitario ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cadastro</dt>
				<dd class="text-slate-900">{formatarData(p.cadastradoEm)}</dd>
			</div>
		</dl>
	</div>

	<!-- Snapshot numérico com atalhos -->
	<div class="col-span-12 grid grid-cols-2 gap-3 md:col-span-8 md:grid-cols-4">
		<a
			href={`${base}/atendimentos`}
			class="relative border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-900"
		>
			<span class="absolute top-0 left-0 h-full w-1 bg-blue-900"></span>
			<div class="pl-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Atendimentos
			</div>
			<div class="pl-2 font-mono text-2xl font-bold text-slate-900">
				{p.atendimentos.length}
			</div>
			<div class="pl-2 font-mono text-[10px] text-slate-500">
				último há {diasDesde(p.ultimoAtendimento)} dias
			</div>
		</a>
		<a
			href={`${base}/encaminhamentos`}
			class="relative border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-900"
		>
			<span
				class="absolute top-0 left-0 h-full w-1 {p.encaminhamentosAtivos > 0
					? 'bg-amber-600'
					: 'bg-slate-400'}"
			></span>
			<div class="pl-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Encaminhamentos
			</div>
			<div class="pl-2 font-mono text-2xl font-bold text-slate-900">
				{p.encaminhamentosIds.length}
			</div>
			<div class="pl-2 font-mono text-[10px] text-slate-500">
				{p.encaminhamentosAtivos} ativo(s)
			</div>
		</a>
		<a
			href={`${base}/viagens`}
			class="relative border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-900"
		>
			<span class="absolute top-0 left-0 h-full w-1 bg-slate-400"></span>
			<div class="pl-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Viagens TFD
			</div>
			<div class="pl-2 font-mono text-2xl font-bold text-slate-900">
				{p.viagensTFD.length}
			</div>
			<div class="pl-2 font-mono text-[10px] text-slate-500">
				{p.viagensTFD.filter((v) => v.status === 'REALIZADA').length} realizada(s)
			</div>
		</a>
		<a
			href={`${base}/exames`}
			class="relative border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-900"
		>
			<span class="absolute top-0 left-0 h-full w-1 bg-slate-400"></span>
			<div class="pl-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">Exames</div>
			<div class="pl-2 font-mono text-2xl font-bold text-slate-900">{p.exames.length}</div>
			<div class="pl-2 font-mono text-[10px] text-slate-500">
				{p.exames.filter((e) => e.resultado === 'ALTERADO').length} alterado(s)
			</div>
		</a>
	</div>

	<!-- Condições + Medicamentos -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-6">
		<PanelHeader title="Condições Ativas" index="02">
			<a
				href={`${base}/quadro-clinico`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver todas →
			</a>
		</PanelHeader>
		<ul class="divide-y divide-slate-100">
			{#if cronicasAtivas.length === 0}
				<li class="px-4 py-4 text-center font-mono text-xs text-slate-500">
					Nenhuma condição crônica ativa.
				</li>
			{:else}
				{#each cronicasAtivas.slice(0, 4) as c (c.cid10)}
					<li class="px-4 py-2.5">
						<div class="flex items-center gap-2">
							<span class="font-mono text-[11px] font-bold text-blue-900">{c.cid10}</span>
							<span class="truncate text-xs font-semibold text-slate-900">{c.descricao}</span>
						</div>
					</li>
				{/each}
			{/if}
		</ul>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white md:col-span-6">
		<PanelHeader title="Medicamentos em Uso" index="03">
			<a
				href={`${base}/quadro-clinico`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver todos →
			</a>
		</PanelHeader>
		<ul class="divide-y divide-slate-100">
			{#if medsAtivos.length === 0}
				<li class="px-4 py-4 text-center font-mono text-xs text-slate-500">
					Nenhum medicamento em uso.
				</li>
			{:else}
				{#each medsAtivos.slice(0, 4) as m (m.nome)}
					<li class="px-4 py-2.5">
						<div class="flex items-baseline justify-between gap-2">
							<span class="truncate text-xs font-bold text-slate-900">{m.nome}</span>
							<span class="shrink-0 font-mono text-[11px] text-slate-700">{m.dosagem}</span>
						</div>
						<div class="font-mono text-[10px] text-slate-500">{m.frequencia}</div>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
</section>
