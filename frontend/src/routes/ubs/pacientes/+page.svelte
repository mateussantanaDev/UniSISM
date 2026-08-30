<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { PacienteResumo } from '$lib/domain/models/Paciente';
	import type { FiltroPacienteEspecial } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();
	let lista = $state<PacienteResumo[]>([]);
	let carregando = $state(true);
	let busca = $state('');

	type FiltroEspecial = 'TODOS' | FiltroPacienteEspecial;
	let filtro = $state<FiltroEspecial>('TODOS');

	onMount(async () => {
		try {
			lista = await api.pacientes.list();
		} finally {
			carregando = false;
		}
	});

	function idade(iso: string): number {
		const hoje = new Date();
		const nasc = new Date(iso);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return a;
	}

	function diasDesde(iso?: string): number {
		if (!iso) return Infinity;
		return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
	}

	function formatarUltimo(iso?: string): string {
		if (!iso) return 'Nunca atendido';
		const dias = diasDesde(iso);
		if (dias === 0) return 'Hoje';
		if (dias === 1) return 'Ontem';
		if (dias < 30) return `Há ${dias} dias`;
		if (dias < 365) return `Há ${Math.floor(dias / 30)} meses`;
		return `Há ${Math.floor(dias / 365)} anos`;
	}

	let filtrada = $derived.by(() => {
		let base = lista;

		if (filtro === 'COM_CRONICAS') {
			base = base.filter((p) => p.condicoesCronicasAtivas > 0);
		} else if (filtro === 'COM_ENCAMINHAMENTOS') {
			base = base.filter((p) => p.encaminhamentosAtivos > 0);
		} else if (filtro === 'SEM_ATENDIMENTO_90D') {
			base = base.filter((p) => diasDesde(p.ultimoAtendimento) > 90);
		}

		if (busca) {
			const q = busca.toLowerCase();
			base = base.filter(
				(p) =>
					p.nome.toLowerCase().includes(q) ||
					p.cpf.includes(busca) ||
					p.cartaoSus.includes(busca) ||
					(p.equipeSaudeFamilia ?? '').toLowerCase().includes(q)
			);
		}

		return base;
	});

	let totalCronicos = $derived(lista.filter((p) => p.condicoesCronicasAtivas > 0).length);
	let totalEncAtivos = $derived(
		lista.reduce((acc, p) => acc + p.encaminhamentosAtivos, 0)
	);
	let totalAbandono = $derived(
		lista.filter((p) => diasDesde(p.ultimoAtendimento) > 90).length
	);

	const filtros: { valor: FiltroEspecial; label: string; tone: string }[] = [
		{ valor: 'TODOS', label: 'Todos', tone: 'border-slate-300' },
		{ valor: 'COM_CRONICAS', label: 'Com Condições Crônicas', tone: 'border-amber-600' },
		{ valor: 'COM_ENCAMINHAMENTOS', label: 'Com Encaminhamentos', tone: 'border-blue-900' },
		{ valor: 'SEM_ATENDIMENTO_90D', label: 'Sem Atendimento >90d', tone: 'border-red-700' }
	];
</script>

<div class="flex flex-col gap-4">
	<!-- Métricas -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Pacientes Cadastrados"
			value={lista.length}
			sublabel={auth.me?.unidade ? `Vinculados à ${auth.me.unidade}` : 'Rede municipal'}
		/>
		<MetricCard
			label="Com Condições Crônicas"
			value={totalCronicos}
			sublabel="HiperDia · Diabéticos · outros"
			accent="warning"
		/>
		<MetricCard
			label="Encaminhamentos Ativos"
			value={totalEncAtivos}
			sublabel="Aguardando ou com pendência"
			accent="default"
		/>
		<MetricCard
			label="Sem Atendimento >90d"
			value={totalAbandono}
			sublabel="Busca ativa recomendada"
			accent="critical"
		/>
	</section>

	<!-- Lista -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Pacientes do Posto"
			subtitle="Prontuário Eletrônico do Cidadão — vinculados à UBS CENTRAL"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {lista.length} REGISTROS
			</span>
		</PanelHeader>

		<div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<div class="flex flex-1 items-center gap-2">
				<label
					for="busca"
					class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					Buscar
				</label>
				<input
					id="busca"
					type="text"
					bind:value={busca}
					placeholder="Nome, CPF, Cartão SUS, equipe..."
					class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="flex items-center gap-1">
				{#each filtros as f (f.valor)}
					<button
						type="button"
						onclick={() => (filtro = f.valor)}
						class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
							{filtro === f.valor
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
					>
						{f.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">CPF</th>
						<th class="border-r border-slate-200 px-3 py-2">Cartão SUS</th>
						<th class="border-r border-slate-200 px-3 py-2">Idade</th>
						<th class="border-r border-slate-200 px-3 py-2">Equipe ESF</th>
						<th class="border-r border-slate-200 px-3 py-2">Crônicas</th>
						<th class="border-r border-slate-200 px-3 py-2">Enc. Ativos</th>
						<th class="border-r border-slate-200 px-3 py-2">Último Atendimento</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(6) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="9" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="9" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum paciente encontrado com os filtros aplicados.
							</td>
						</tr>
					{:else}
						{#each filtrada as p (p.id)}
							{@const abandono = diasDesde(p.ultimoAtendimento) > 90}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => goto(`/ubs/pacientes/${p.id}`)}
							>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									{p.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{p.cpf}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{p.cartaoSus}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{idade(p.dataNascimento)}a · {p.sexo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{p.equipeSaudeFamilia ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center">
									{#if p.condicoesCronicasAtivas > 0}
										<span
											class="border border-amber-600 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
										>
											{p.condicoesCronicasAtivas}
										</span>
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center">
									{#if p.encaminhamentosAtivos > 0}
										<span
											class="border border-blue-900 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-900"
										>
											{p.encaminhamentosAtivos}
										</span>
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 {abandono
										? 'font-bold text-red-700'
										: 'text-slate-700'}"
								>
									{formatarUltimo(p.ultimoAtendimento)}
								</td>
								<td class="px-3 py-2" onclick={(ev) => ev.stopPropagation()}>
									<PrimaryButton
										label="Abrir PEC"
										variant="secondary"
										onclick={() => goto(`/ubs/pacientes/${p.id}`)}
									/>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
