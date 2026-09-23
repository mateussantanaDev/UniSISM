<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { page } from '$app/state';

	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function formatarDataHora(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function diasDesde(iso?: string): number {
		if (!iso) return Infinity;
		return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
	}

	let base = $derived(`/ubs/pacientes/${page.params.id}`);

	let ultimos3Atd = $derived(p.atendimentos.slice(0, 3));
	let ultimos2Exm = $derived(p.exames.slice(0, 2));
	let proximaViagem = $derived(
		p.viagensTFD.find((v) => v.status === 'AGENDADA' || v.status === 'EM_ANDAMENTO')
	);
	let cronicasAtivas = $derived(p.condicoesCronicas.filter((c) => c.ativo));
	let medsAtivos = $derived(p.medicamentosEmUso.filter((m) => m.ativo));
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Alertas críticos — se houver -->
	{#if p.alergias.length > 0}
		<div class="col-span-12 border-2 border-red-700 bg-red-50 px-4 py-3">
			<div class="flex items-center justify-between">
				<div>
					<div class="font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase">
						⚠ ALERTA CRÍTICO · ALERGIAS
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
					VER QUADRO CLÍNICO →
				</a>
			</div>
		</div>
	{/if}

	<!-- Identidade médica -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
		<PanelHeader title="Identidade Médica" index="01" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Grupo Sanguíneo</dt>
				<dd class="text-lg font-bold text-red-800">{p.grupoSanguineo}</dd>
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
				<dt class="tracking-widest text-slate-500 uppercase">Microárea</dt>
				<dd class="text-slate-900">{p.microarea ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cadastrado em</dt>
				<dd class="text-slate-900">{formatarData(p.cadastradoEm)}</dd>
			</div>
		</dl>
	</div>

	<!-- Snapshot numérico -->
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
				{p.encaminhamentosAtivos} ativo{p.encaminhamentosAtivos === 1 ? '' : 's'}
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
				{p.viagensTFD.filter((v) => v.status === 'REALIZADA').length} realizada{p.viagensTFD.filter(
					(v) => v.status === 'REALIZADA'
				).length === 1
					? ''
					: 's'}
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
				{p.exames.filter((e) => e.resultado === 'ALTERADO').length} alterado{p.exames.filter(
					(e) => e.resultado === 'ALTERADO'
				).length === 1
					? ''
					: 's'}
			</div>
		</a>
	</div>

	<!-- Condições ativas (top 3) -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
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
				{#each cronicasAtivas.slice(0, 3) as c (c.cid10)}
					<li class="px-4 py-2.5">
						<div class="flex items-center gap-2">
							<span class="font-mono text-[11px] font-bold text-blue-900">{c.cid10}</span>
							<span class="truncate text-xs font-semibold text-slate-900">{c.descricao}</span>
						</div>
						<div class="mt-0.5 font-mono text-[10px] tracking-wider text-slate-500 uppercase">
							Desde {formatarData(c.desde)}
						</div>
					</li>
				{/each}
				{#if cronicasAtivas.length > 3}
					<li
						class="px-4 py-1.5 text-center font-mono text-[10px] tracking-wider text-slate-500 uppercase"
					>
						+ {cronicasAtivas.length - 3} outra{cronicasAtivas.length - 3 === 1 ? '' : 's'}
					</li>
				{/if}
			{/if}
		</ul>
	</div>

	<!-- Medicamentos em uso (top 3) -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
		<PanelHeader title="Em Uso Contínuo" index="03">
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
				{#each medsAtivos.slice(0, 3) as m (m.nome)}
					<li class="px-4 py-2.5">
						<div class="flex items-baseline justify-between gap-2">
							<span class="truncate text-xs font-bold text-slate-900">{m.nome}</span>
							<span class="shrink-0 font-mono text-[11px] text-slate-700">{m.dosagem}</span>
						</div>
						<div class="font-mono text-[10px] text-slate-500">{m.frequencia}</div>
					</li>
				{/each}
				{#if medsAtivos.length > 3}
					<li
						class="px-4 py-1.5 text-center font-mono text-[10px] tracking-wider text-slate-500 uppercase"
					>
						+ {medsAtivos.length - 3} outro{medsAtivos.length - 3 === 1 ? '' : 's'}
					</li>
				{/if}
			{/if}
		</ul>
	</div>

	<!-- Próxima viagem TFD -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
		<PanelHeader title="Próxima Viagem TFD" index="04">
			<a
				href={`${base}/viagens`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver todas →
			</a>
		</PanelHeader>
		<div class="px-4 py-4">
			{#if proximaViagem}
				<div class="font-mono text-xs font-bold text-blue-900">
					{proximaViagem.protocolo}
				</div>
				<div class="mt-1 text-sm font-bold text-slate-900">{proximaViagem.destino}</div>
				<div class="font-mono text-[11px] text-slate-600">
					{proximaViagem.unidadeDestino}
				</div>
				<div class="mt-2 font-mono text-[11px] text-slate-800">
					{proximaViagem.especialidade} · {formatarData(proximaViagem.dataIda)}
				</div>
			{:else}
				<p class="font-mono text-xs text-slate-500">Nenhuma viagem agendada.</p>
			{/if}
		</div>
	</div>

	<!-- Últimos atendimentos -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-7">
		<PanelHeader title="Últimos Atendimentos" subtitle="3 mais recentes" index="05">
			<a
				href={`${base}/atendimentos`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver todos →
			</a>
		</PanelHeader>
		<ul class="divide-y divide-slate-100">
			{#if ultimos3Atd.length === 0}
				<li class="px-4 py-4 text-center font-mono text-xs text-slate-500">
					Nenhum atendimento registrado.
				</li>
			{:else}
				{#each ultimos3Atd as a (a.id)}
					<li class="flex items-start justify-between gap-3 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-mono text-[10px] font-bold text-blue-900">{a.cid10}</span>
								<span class="truncate text-xs font-semibold text-slate-900">
									{a.diagnostico}
								</span>
							</div>
							<div class="mt-0.5 truncate font-mono text-[11px] text-slate-600">
								{a.profissional} · {a.especialidade}
							</div>
						</div>
						<span class="shrink-0 font-mono text-[10px] tracking-wider text-slate-500 uppercase">
							{formatarDataHora(a.data)}
						</span>
					</li>
				{/each}
			{/if}
		</ul>
	</div>

	<!-- Últimos exames -->
	<div class="col-span-12 border border-slate-200 bg-white md:col-span-5">
		<PanelHeader title="Últimos Exames" subtitle="2 mais recentes" index="06">
			<a
				href={`${base}/exames`}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
			>
				Ver todos →
			</a>
		</PanelHeader>
		<ul class="divide-y divide-slate-100">
			{#if ultimos2Exm.length === 0}
				<li class="px-4 py-4 text-center font-mono text-xs text-slate-500">
					Nenhum exame registrado.
				</li>
			{:else}
				{#each ultimos2Exm as e (e.id)}
					<li class="flex items-start justify-between gap-3 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="truncate text-xs font-semibold text-slate-900">{e.tipo}</div>
							<div class="font-mono text-[11px] text-slate-600">{formatarData(e.data)}</div>
						</div>
						<span
							class="shrink-0 border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase
								{e.resultado === 'NORMAL'
								? 'border-emerald-700 bg-emerald-50 text-emerald-800'
								: e.resultado === 'ALTERADO'
									? 'border-amber-600 bg-amber-50 text-amber-800'
									: e.resultado === 'CRITICO'
										? 'border-red-700 bg-red-50 text-red-800'
										: 'border-slate-400 bg-slate-50 text-slate-700'}"
						>
							{e.resultado}
						</span>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
</section>
