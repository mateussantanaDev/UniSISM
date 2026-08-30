<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import type { TipoAtendimento } from '$lib/api/types';

	import { separarDataHora } from '$lib/presentation/utils/stringUtils';

	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);

	const tipoLabel: Record<TipoAtendimento, string> = {
		CONSULTA_MEDICA: 'Consulta Médica',
		ENFERMAGEM: 'Enfermagem',
		VACINACAO: 'Vacinação',
		CURATIVO: 'Curativo',
		ODONTOLOGICO: 'Odontológico',
		PROCEDIMENTO: 'Procedimento',
		ACOLHIMENTO: 'Acolhimento'
	};

	const tipoTone: Record<TipoAtendimento, string> = {
		CONSULTA_MEDICA: 'border-blue-700 bg-blue-50 text-blue-900',
		ENFERMAGEM: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		VACINACAO: 'border-purple-700 bg-purple-50 text-purple-800',
		CURATIVO: 'border-amber-600 bg-amber-50 text-amber-800',
		ODONTOLOGICO: 'border-sky-700 bg-sky-50 text-sky-800',
		PROCEDIMENTO: 'border-slate-600 bg-slate-50 text-slate-700',
		ACOLHIMENTO: 'border-orange-600 bg-orange-50 text-orange-800'
	};

	function formatarDataHoraPartes(iso?: string | null) {
		if (!iso) return { data: '—', hora: 'Nunca' };
		const str = new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		return separarDataHora(str);
	}

	let consultasMedicas = $derived(
		p.atendimentos.filter((a) => a.tipo === 'CONSULTA_MEDICA').length
	);
	let totalAno = $derived(
		p.atendimentos.filter(
			(a) => new Date(a.data).getFullYear() === new Date().getFullYear()
		).length
	);
	let ultimoAtendimentoFmt = $derived(formatarDataHoraPartes(p.ultimoAtendimento));
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Total de Atendimentos" value={p.atendimentos.length} sublabel="Histórico completo" />
		<MetricCard label="Consultas Médicas" value={consultasMedicas} sublabel="Médicos da rede" />
		<MetricCard label="No Ano" value={totalAno} sublabel={String(new Date().getFullYear())} />
		<MetricCard
			label="Último Atendimento"
			value={ultimoAtendimentoFmt.data}
			sublabel={ultimoAtendimentoFmt.hora}
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Histórico de Atendimentos"
			subtitle="Registros clínicos na rede municipal"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{p.atendimentos.length} REGISTROS
			</span>
		</PanelHeader>
		<ul class="divide-y divide-slate-100">
			{#if p.atendimentos.length === 0}
				<li class="px-4 py-8 text-center font-mono text-xs text-slate-500">
					Nenhum atendimento registrado.
				</li>
			{:else}
				{#each p.atendimentos as a (a.id)}
					{@const dtHora = formatarDataHoraPartes(a.data)}
					<li class="px-4 py-3">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-start gap-3">
								<div class="text-right font-mono">
									<div class="text-[11px] font-bold text-slate-900">
										{dtHora.data}
									</div>
									<div class="text-[10px] text-slate-500">
										{dtHora.hora}
									</div>
								</div>
								<div class="min-w-0">
									<div class="flex items-center gap-2">
										<span
											class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {tipoTone[
												a.tipo
											]}"
										>
											{tipoLabel[a.tipo]}
										</span>
										<span class="font-mono text-[10px] font-bold text-blue-900">
											{a.cid10}
										</span>
									</div>
									<div class="mt-1 text-sm font-bold text-slate-900">
										{a.diagnostico}
									</div>
									<div class="mt-0.5 text-xs text-slate-700">
										<span class="font-semibold">Queixa:</span> {a.queixaPrincipal}
									</div>
									<div class="mt-1 text-xs text-slate-800">
										<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
											Conduta:
										</span>
										{a.conduta}
									</div>
								</div>
							</div>
							<div class="shrink-0 text-right font-mono text-[11px]">
								<div class="font-bold text-slate-900">{a.profissional}</div>
								<div class="text-slate-600">{a.registroProfissional}</div>
								<div class="text-slate-500">{a.especialidade}</div>
								<div class="text-slate-400">{a.unidade}</div>
							</div>
						</div>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
</div>
