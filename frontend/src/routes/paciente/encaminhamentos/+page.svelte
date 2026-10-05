<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import {
		IconCalendarEvent,
		IconSearch,
		IconClock,
		IconPrinter,
		IconChevronDown,
		IconChevronUp,
		IconRefresh,
		IconBuildingHospital
	} from '@tabler/icons-svelte';

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let filtroStatus = $state<'TODOS' | 'AGUARDANDO_REGULACAO' | 'AGENDADO' | 'CONCLUIDO'>('TODOS');
	let busca = $state('');
	let itemExpandidoId = $state<string | null>(null);

	function formatarData(isoStr?: string | null) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
		} catch {
			return isoStr;
		}
	}

	function formatarDataHora(isoStr?: string | null) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
		} catch {
			return isoStr;
		}
	}

	function statusInfo(status: string) {
		switch (status) {
			case 'AGUARDANDO_REGULACAO':
				return {
					texto: 'AGUARDANDO REGULAÇÃO',
					classes: 'border-amber-600 text-amber-800 bg-amber-50',
					etapa: 1,
					descricao: 'Sua solicitação foi cadastrada pela UBS de origem e está aguardando a avaliação da equipe técnica da Central de Regulação Médica.'
				};
			case 'PENDENTE':
			case 'PENDENCIA_DOCUMENTO':
				return {
					texto: 'PENDÊNCIA DE DOCUMENTO',
					classes: 'border-amber-600 text-amber-800 bg-amber-50',
					etapa: 1,
					descricao: 'O médico regulador solicitou complementação de exames ou justificativa clínica. Compareça à sua UBS para atualizar.'
				};
			case 'APROVADO':
			case 'AGENDADO':
				return {
					texto: 'CONSULTA AGENDADA',
					classes: 'border-emerald-700 text-emerald-800 bg-emerald-50',
					etapa: 2,
					descricao: 'A vaga foi autorizada com dia, horário e especialista definidos. Imprima ou guarde seu comprovante digital.'
				};
			case 'ATENDIDO':
			case 'CONCLUIDO':
				return {
					texto: 'CONSULTA REALIZADA',
					classes: 'border-blue-700 text-blue-800 bg-blue-50',
					etapa: 3,
					descricao: 'Atendimento concluído. O histórico e evolução clínica estão consolidados no seu prontuário digital.'
				};
			case 'REJEITADO':
				return {
					texto: 'NÃO AUTORIZADO',
					classes: 'border-red-700 text-red-800 bg-red-50',
					etapa: 0,
					descricao: 'Solicitação não autorizada pela Regulação Médica. Consulte o médico da sua UBS para reavaliação de conduta.'
				};
			default:
				return {
					texto: status,
					classes: 'border-slate-400 text-slate-700 bg-slate-100',
					etapa: 1,
					descricao: 'Em processamento pelo sistema de regulação.'
				};
		}
	}

	async function carregarEncaminhamentos() {
		carregando = true;
		try {
			const res = await api.pacienteApp.meusEncaminhamentos();
			encaminhamentos = Array.isArray(res) ? res : [];
		} catch (err) {
			console.error('[UniSISM Paciente] Erro ao carregar encaminhamentos:', err);
			encaminhamentos = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarEncaminhamentos();
	});

	let filtrados = $derived.by(() => {
		return encaminhamentos.filter((item) => {
			if (filtroStatus === 'AGUARDANDO_REGULACAO' && item.status !== 'AGUARDANDO_REGULACAO') return false;
			if (filtroStatus === 'AGENDADO' && item.status !== 'APROVADO') return false;
			if (filtroStatus === 'CONCLUIDO' && !item.atendimentoConcluidoEm && (item.status as string) !== 'CONCLUIDO') return false;

			if (busca.trim()) {
				const q = busca.toLowerCase();
				const proto = (item.protocolo || '').toLowerCase();
				const esp = (item.solicitacao?.especialidadeSolicitada || '').toLowerCase();
				const cid = (item.solicitacao?.cid10 || '').toLowerCase();
				return proto.includes(q) || esp.includes(q) || cid.includes(q);
			}
			return true;
		});
	});

	function toggleDetalhe(id: string) {
		itemExpandidoId = itemExpandidoId === id ? null : id;
	}

	function imprimirComprovante() {
		window.print();
	}
</script>

<svelte:head>
	<title>Consultas e Encaminhamentos · UniSISM Águas Belas</title>
</svelte:head>

<div class="space-y-4">
	<!-- Topo da Página Mobile -->
	<div class="flex items-center justify-between border-b border-slate-200 pb-3">
		<h1 class="font-mono text-base font-bold text-slate-900 uppercase flex items-center gap-2">
			<IconCalendarEvent size={18} class="text-blue-900" />
			<span>Minhas Consultas</span>
		</h1>

		<button
			onclick={carregarEncaminhamentos}
			disabled={carregando}
			class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-800 uppercase hover:bg-slate-50 disabled:opacity-50"
		>
			<IconRefresh size={13} class={carregando ? 'animate-spin' : ''} />
			<span>Atualizar</span>
		</button>
	</div>

	<!-- Filtros & Busca B2G -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<!-- Busca por texto -->
		<div class="relative flex-1">
			<IconSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
			<input
				type="text"
				placeholder="BUSCAR POR PROTOCOLO, ESPECIALIDADE OU CID-10..."
				bind:value={busca}
				class="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
			/>
		</div>

		<!-- Abas de Status -->
		<div class="flex overflow-x-auto gap-1 border border-slate-200 bg-slate-100 p-1">
			<button
				type="button"
				onclick={() => (filtroStatus = 'TODOS')}
				class="px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-colors {filtroStatus === 'TODOS'
					? 'bg-blue-900 text-white'
					: 'text-slate-700 hover:bg-white'}"
			>
				TODOS ({encaminhamentos.length})
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'AGUARDANDO_REGULACAO')}
				class="px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-colors {filtroStatus === 'AGUARDANDO_REGULACAO'
					? 'bg-amber-600 text-white'
					: 'text-slate-700 hover:bg-white'}"
			>
				NA FILA
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'AGENDADO')}
				class="px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-colors {filtroStatus === 'AGENDADO'
					? 'bg-emerald-700 text-white'
					: 'text-slate-700 hover:bg-white'}"
			>
				AGENDADOS
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'CONCLUIDO')}
				class="px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-colors {filtroStatus === 'CONCLUIDO'
					? 'bg-blue-900 text-white'
					: 'text-slate-700 hover:bg-white'}"
			>
				REALIZADOS
			</button>
		</div>
	</div>

	<!-- Lista de Encaminhamentos -->
	{#if carregando}
		<div class="flex h-48 items-center justify-center">
			<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
		</div>
	{:else if filtrados.length === 0}
		<div class="border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
			<div class="font-mono text-xs font-bold text-slate-700 uppercase">
				Nenhum encaminhamento localizado
			</div>
			<p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
				{busca ? 'Nenhum resultado corresponde aos termos da sua pesquisa.' : 'Você não possui encaminhamentos cadastrados nesta categoria de filtragem.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtrados as item (item.id)}
				{@const st = statusInfo(item.status)}
				{@const expandido = itemExpandidoId === item.id}
				<div class="border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-400">
					<!-- Cabeçalho do Card -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="p-4 cursor-pointer" onclick={() => toggleDetalhe(item.id)}>
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span
										class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider {st.classes}"
									>
										{st.texto}
									</span>
									<span class="font-mono text-xs text-slate-500">
										PROTOCOLO: <strong>{item.protocolo}</strong>
									</span>
								</div>

								<h3 class="font-mono text-base font-bold text-slate-900 mt-2 uppercase">
									{item.solicitacao?.especialidadeSolicitada || 'CONSULTA ESPECIALIZADA'}
								</h3>

								{#if item.solicitacao?.cid10}
									<div class="font-mono text-xs text-slate-600 mt-0.5">
										CID-10: <strong>{item.solicitacao.cid10}</strong>
									</div>
								{/if}
							</div>

							<div class="flex items-center gap-3">
								{#if item.agendamentoPrevisto}
									<div class="text-right font-mono text-xs">
										<div class="text-[9px] font-bold uppercase tracking-widest text-emerald-800">DATA MARCADA</div>
										<div class="font-black text-slate-900 mt-0.5">
											{formatarDataHora(item.agendamentoPrevisto)}
										</div>
									</div>
								{:else}
									<div class="text-right font-mono text-xs">
										<div class="text-[9px] font-bold uppercase tracking-widest text-slate-500">SOLICITADO EM</div>
										<div class="font-bold text-slate-700 mt-0.5">
											{formatarData(item.criadoEm)}
										</div>
									</div>
								{/if}

								<button class="p-1 text-slate-500 hover:text-slate-900">
									{#if expandido}
										<IconChevronUp size={18} />
									{:else}
										<IconChevronDown size={18} />
									{/if}
								</button>
							</div>
						</div>

						<!-- Timeline simplificada B2G -->
						<div class="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 font-mono text-[10px] uppercase">
							<div>
								<div class="h-1 w-full bg-blue-900"></div>
								<span class="mt-1 block font-bold text-blue-900">1. Solicitado</span>
							</div>
							<div>
								<div class="h-1 w-full {st.etapa >= 2 ? 'bg-blue-900' : st.etapa === 1 ? 'bg-amber-500' : 'bg-slate-200'}"></div>
								<span class="mt-1 block font-bold {st.etapa >= 2 ? 'text-blue-900' : st.etapa === 1 ? 'text-amber-800' : 'text-slate-400'}">
									2. Regulação
								</span>
							</div>
							<div>
								<div class="h-1 w-full {st.etapa >= 3 ? 'bg-blue-900' : st.etapa === 2 ? 'bg-emerald-600' : 'bg-slate-200'}"></div>
								<span class="mt-1 block font-bold {st.etapa >= 3 ? 'text-blue-900' : st.etapa === 2 ? 'text-emerald-800' : 'text-slate-400'}">
									3. Atendido
								</span>
							</div>
						</div>
					</div>

					<!-- Detalhes Expansíveis -->
					{#if expandido}
						<div class="border-t border-slate-200 bg-slate-50 p-4 text-xs">
							<div class="mb-3 text-slate-700 leading-relaxed font-mono text-xs">
								{st.descricao}
							</div>

							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 font-mono text-xs mb-3">
								<div class="border border-slate-200 bg-white p-2.5">
									<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">Unidade de Origem:</span>
									<strong class="text-slate-900 mt-0.5 block">{item.unidadeOrigem || 'Unidade Básica de Saúde (UBS)'}</strong>
								</div>
								<div class="border border-slate-200 bg-white p-2.5">
									<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">Local de Atendimento:</span>
									<strong class="text-slate-900 mt-0.5 block">{item.localAgendamento || 'Centro de Especialidades Médicas (CEM)'}</strong>
								</div>
								{#if item.agendamentoPrevisto}
									<div class="border border-emerald-300 bg-emerald-50/80 p-3 sm:col-span-2">
										<span class="text-emerald-900 block text-[10px] font-bold tracking-widest uppercase">HORÁRIO E ORIENTAÇÕES OFICIAIS</span>
										<strong class="text-emerald-950 block text-xs mt-1">
											Comparecer em {formatarDataHora(item.agendamentoPrevisto)}
										</strong>
										<span class="text-emerald-900 text-[11px] block mt-1">
											Apresentar Documento oficial com foto e exames/laudos anteriores se houver.
										</span>
									</div>
								{/if}
							</div>

							<div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
								<button
									onclick={imprimirComprovante}
									class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-100 transition-colors"
								>
									<IconPrinter size={14} />
									<span>Imprimir Comprovante</span>
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
