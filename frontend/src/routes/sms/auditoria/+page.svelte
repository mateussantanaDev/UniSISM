<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { EventoTimeline } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	/**
	 * Trilha de auditoria — eventos de timeline de todos os encaminhamentos
	 * da prefeitura, exibidos como log cronológico.
	 *
	 * Quando o backend expuser endpoint dedicado (`GET /audit`), substituir
	 * pela fonte oficial.
	 */

	interface EventoAuditoria extends EventoTimeline {
		encaminhamentoId: string;
		protocolo: string;
		paciente: string;
	}

	let eventos = $state<EventoAuditoria[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroTipo = $state<'TODOS' | EventoTimeline['tipo']>('TODOS');

	onMount(async () => {
		try {
			// Carrega lista + detalhe de cada pra obter timeline completa.
			const lista = await api.encaminhamentos.list({ limit: 500 });
			const detalhes = await Promise.all(
				lista.slice(0, 50).map((e) => api.encaminhamentos.byId(e.id).catch(() => null))
			);
			const eventosTodos: EventoAuditoria[] = [];
			for (const d of detalhes) {
				if (!d) continue;
				for (const t of d.timeline ?? []) {
					eventosTodos.push({
						...t,
						encaminhamentoId: d.id,
						protocolo: d.protocolo,
						paciente: d.paciente.nome
					});
				}
			}
			// Ordena do mais recente ao mais antigo
			eventosTodos.sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime());
			eventos = eventosTodos.slice(0, 200);
		} finally {
			carregando = false;
		}
	});

	let filtrada = $derived.by(() => {
		let base = eventos;
		if (filtroTipo !== 'TODOS') base = base.filter((e) => e.tipo === filtroTipo);
		if (busca) {
			const q = busca.toLowerCase();
			base = base.filter(
				(e) =>
					e.autor.toLowerCase().includes(q) ||
					e.protocolo.toLowerCase().includes(q) ||
					e.paciente.toLowerCase().includes(q) ||
					e.descricao.toLowerCase().includes(q)
			);
		}
		return base;
	});

	let hoje = $derived(
		eventos.filter((e) => {
			const d = new Date(e.em);
			const agora = new Date();
			return (
				d.getFullYear() === agora.getFullYear() &&
				d.getMonth() === agora.getMonth() &&
				d.getDate() === agora.getDate()
			);
		}).length
	);

	let ultimasDecisoes = $derived(
		eventos.filter((e) => e.tipo === 'APROVADO' || e.tipo === 'REJEITADO').length
	);

	let pendenciasCriadas = $derived(eventos.filter((e) => e.tipo === 'PENDENCIA_REGISTRADA').length);

	function formatarDataHora(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	const tipoTone: Record<EventoTimeline['tipo'], string> = {
		CRIADO: 'border-blue-700 bg-blue-50 text-blue-900',
		DOCUMENTO_ANEXADO: 'border-slate-700 bg-slate-50 text-slate-700',
		ENVIADO_REGULACAO: 'border-blue-700 bg-blue-50 text-blue-900',
		PENDENCIA_REGISTRADA: 'border-amber-600 bg-amber-50 text-amber-800',
		APROVADO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		REJEITADO: 'border-red-700 bg-red-50 text-red-800',
		AGENDADO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		OBSERVACAO: 'border-slate-500 bg-slate-50 text-slate-700',
		EDITADO: 'border-blue-700 bg-blue-50 text-blue-900',
		RESPOSTA_SUS_RECEBIDA: 'border-purple-700 bg-purple-50 text-purple-800'
	};

	const tiposFiltro: Array<'TODOS' | EventoTimeline['tipo']> = [
		'TODOS',
		'CRIADO',
		'ENVIADO_REGULACAO',
		'PENDENCIA_REGISTRADA',
		'APROVADO',
		'REJEITADO'
	];
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Eventos Registrados"
			value={carregando ? '—' : eventos.length}
			sublabel="Amostra recente (top 200)"
		/>
		<MetricCard
			label="Ações Hoje"
			value={carregando ? '—' : hoje}
			sublabel="Registros de hoje"
			accent="default"
		/>
		<MetricCard
			label="Decisões"
			value={carregando ? '—' : ultimasDecisoes}
			sublabel="Aprovações + rejeições"
			accent="success"
		/>
		<MetricCard
			label="Pendências Criadas"
			value={carregando ? '—' : pendenciasCriadas}
			sublabel="Solicitações de correção"
			accent="warning"
		/>
	</section>

	<!-- Trilha -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Trilha de Auditoria"
			subtitle="Log cronológico de eventos dos encaminhamentos da prefeitura"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {eventos.length} EVENTOS
			</span>
		</PanelHeader>

		<div
			class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
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
					placeholder="Autor, protocolo, paciente, descrição..."
					class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="flex items-center gap-1">
				{#each tiposFiltro as t (t)}
					<button
						type="button"
						onclick={() => (filtroTipo = t)}
						class="border px-2 py-1 font-mono text-[10px] font-bold tracking-widest uppercase
							{filtroTipo === t
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
					>
						{t === 'TODOS' ? 'TODOS' : t.replace(/_/g, ' ')}
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
						<th class="border-r border-slate-200 px-3 py-2">Data / Hora</th>
						<th class="border-r border-slate-200 px-3 py-2">Tipo</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Autor</th>
						<th class="border-r border-slate-200 px-3 py-2">Descrição</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(8) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum evento encontrado.
							</td>
						</tr>
					{:else}
						{#each filtrada as e (e.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarDataHora(e.em)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase {tipoTone[
											e.tipo
										]}"
									>
										{e.tipo.replace(/_/g, ' ')}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{e.protocolo}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900"
								>
									{e.paciente}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									<div class="font-bold">{e.autor}</div>
									<div class="text-[10px] text-slate-500">{e.autorPapel}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-800">
									{e.descricao}
								</td>
								<td class="px-3 py-2">
									<button
										type="button"
										onclick={() => goto(`/sms/encaminhamento/${e.encaminhamentoId}`)}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
									>
										Abrir
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<div class="border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[11px] text-slate-600">
		<span class="font-bold tracking-widest text-slate-700 uppercase">Nota técnica:</span> Trilha
		derivada de <code class="bg-white px-1">GET /encaminhamentos/:id.timeline</code> dos últimos 50
		encaminhamentos. Quando o backend expuser <code class="bg-white px-1">GET /audit</code>, migrar
		pra fonte dedicada com paginação e retenção legal.
	</div>
</div>
