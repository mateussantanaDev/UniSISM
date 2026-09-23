<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { Ubs } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	const auth = useAuth();

	let lista = $state<Ubs[]>([]);
	let carregando = $state(true);
	let busca = $state('');

	onMount(async () => {
		try {
			lista = await api.admin.listUbs();
		} finally {
			carregando = false;
		}
	});

	let filtrada = $derived.by(() => {
		if (!busca) return lista;
		const q = busca.toLowerCase();
		return lista.filter(
			(u) =>
				u.nome.toLowerCase().includes(q) ||
				u.municipio.toLowerCase().includes(q) ||
				(u.cnes ?? '').includes(busca)
		);
	});

	let ativas = $derived(lista.filter((u) => u.ativa).length);
	let inativas = $derived(lista.filter((u) => !u.ativa).length);
	let comCnes = $derived(lista.filter((u) => !!u.cnes).length);

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR');
	}
</script>

<div class="flex flex-col gap-4">
	<!-- KPIs -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="UBSs Cadastradas"
			value={carregando ? '—' : lista.length}
			sublabel="Total na rede"
		/>
		<MetricCard
			label="Ativas"
			value={carregando ? '—' : ativas}
			sublabel="Operacionais"
			accent="success"
		/>
		<MetricCard
			label="Inativas"
			value={carregando ? '—' : inativas}
			sublabel="Desabilitadas"
			accent="critical"
		/>
		<MetricCard label="Com CNES" value={carregando ? '—' : comCnes} sublabel="Registro nacional" />
	</section>

	<!-- Lista -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Unidades Básicas de Saúde"
			subtitle="Gestão das UBSs vinculadas à Secretaria"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {lista.length}
			</span>
			{#if auth.podeCriarUbs}
				<PrimaryButton label="+ Nova UBS" shortcut="N" onclick={() => goto('/sms/rede/ubs/nova')} />
			{/if}
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
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
				placeholder="Nome da UBS, município, CNES..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">Município</th>
						<th class="border-r border-slate-200 px-3 py-2">UF</th>
						<th class="border-r border-slate-200 px-3 py-2">CNES</th>
						<th class="border-r border-slate-200 px-3 py-2">Prefeitura</th>
						<th class="border-r border-slate-200 px-3 py-2">Criada em</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="8" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhuma UBS encontrada.
							</td>
						</tr>
					{:else}
						{#each filtrada as u (u.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{u.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{u.municipio}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{u.uf}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{u.cnes ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{u.prefeitura?.nome ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(u.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									{#if u.ativa}
										<span
											class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
										>
											ATIVA
										</span>
									{:else}
										<span
											class="border border-red-700 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-red-800 uppercase"
										>
											INATIVA
										</span>
									{/if}
								</td>
								<td class="flex gap-1.5 px-3 py-2">
									<button
										type="button"
										onclick={() => goto(`/sms/rede/ubs/${u.id}`)}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
									>
										Detalhe
									</button>
									{#if auth.ehAdminOuDev}
										<button
											type="button"
											onclick={() => goto(`/sms/rede/ubs/${u.id}?edit=1`)}
											title="Abrir detalhe com edição"
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											Editar
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
