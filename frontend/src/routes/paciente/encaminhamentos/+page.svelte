<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import {
		IconCalendarEvent,
		IconSearch,
		IconFilter,
		IconCheck,
		IconClock,
		IconAlertCircle,
		IconPrinter,
		IconDownload,
		IconBuildingHospital,
		IconStethoscope,
		IconMapPin,
		IconChevronDown,
		IconChevronUp,
		IconRefresh
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
			return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
		} catch {
			return isoStr;
		}
	}

	function statusInfo(status: string) {
		switch (status) {
			case 'AGUARDANDO_REGULACAO':
				return {
					texto: 'Aguardando Regulação',
					cor: 'bg-amber-100 text-amber-900 border-amber-300',
					etapa: 1,
					descricao: 'Sua solicitação foi cadastrada pela UBS e aguarda avaliação da Central de Regulação.'
				};
			case 'PENDENTE':
				return {
					texto: 'Pendente de Documento',
					cor: 'bg-orange-100 text-orange-900 border-orange-300',
					etapa: 1,
					descricao: 'O regulador solicitou dados adicionais. Procure sua UBS para complementar o pedido.'
				};
			case 'APROVADO':
			case 'AGENDADO':
				return {
					texto: 'Consulta Agendada',
					cor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
					etapa: 2,
					descricao: 'Data e horário confirmados. Compareça ao local indicado com 20 minutos de antecedência.'
				};
			case 'ATENDIDO':
			case 'CONCLUIDO':
				return {
					texto: 'Consulta Realizada',
					cor: 'bg-blue-100 text-blue-900 border-blue-300',
					etapa: 3,
					descricao: 'Atendimento concluído. O histórico clínico foi registrado no seu prontuário.'
				};
			case 'REJEITADO':
				return {
					texto: 'Não Aprovado',
					cor: 'bg-rose-100 text-rose-900 border-rose-300',
					etapa: 0,
					descricao: 'Solicitação não autorizada pela Regulação Médica. Consulte a UBS para nova conduta.'
				};
			default:
				return {
					texto: status,
					cor: 'bg-slate-100 text-slate-800 border-slate-300',
					etapa: 1,
					descricao: 'Em processamento pelo sistema de saúde.'
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

	function imprimirComprovante(item: Encaminhamento) {
		window.print();
	}
</script>

<svelte:head>
	<title>Minhas Consultas e Encaminhamentos · UniSISM Paciente</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
	<!-- Topo da Página -->
	<div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-black text-slate-900 sm:text-2xl flex items-center gap-2">
				<IconCalendarEvent size={24} class="text-emerald-700" />
				<span>Minhas Consultas e Encaminhamentos</span>
			</h1>
			<p class="text-xs text-slate-500 mt-0.5">
				Acompanhe a fila da regulação municipal, datas de atendimento e locais de consulta
			</p>
		</div>

		<button
			onclick={carregarEncaminhamentos}
			disabled={carregando}
			class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
		>
			<IconRefresh size={14} class={carregando ? 'animate-spin' : ''} />
			<span>Atualizar</span>
		</button>
	</div>

	<!-- Filtros & Busca Mobile First -->
	<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
		<!-- Busca por texto -->
		<div class="relative flex-1">
			<IconSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
			<input
				type="text"
				placeholder="Buscar por especialidade ou protocolo..."
				bind:value={busca}
				class="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
			/>
		</div>

		<!-- Abas de Status -->
		<div class="flex overflow-x-auto gap-1 border border-slate-200 bg-white p-1 rounded-xl shadow-sm">
			<button
				type="button"
				onclick={() => (filtroStatus = 'TODOS')}
				class="rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors {filtroStatus === 'TODOS'
					? 'bg-emerald-800 text-white'
					: 'text-slate-600 hover:bg-slate-100'}"
			>
				Todos ({encaminhamentos.length})
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'AGUARDANDO_REGULACAO')}
				class="rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors {filtroStatus === 'AGUARDANDO_REGULACAO'
					? 'bg-amber-600 text-white'
					: 'text-slate-600 hover:bg-slate-100'}"
			>
				Na Fila
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'AGENDADO')}
				class="rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors {filtroStatus === 'AGENDADO'
					? 'bg-emerald-700 text-white'
					: 'text-slate-600 hover:bg-slate-100'}"
			>
				Agendados
			</button>
			<button
				type="button"
				onclick={() => (filtroStatus = 'CONCLUIDO')}
				class="rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors {filtroStatus === 'CONCLUIDO'
					? 'bg-blue-800 text-white'
					: 'text-slate-600 hover:bg-slate-100'}"
			>
				Realizados
			</button>
		</div>
	</div>

	<!-- Lista de Encaminhamentos -->
	{#if carregando}
		<div class="flex h-48 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
		</div>
	{:else if filtrados.length === 0}
		<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
			<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
				<IconCalendarEvent size={24} />
			</div>
			<h3 class="text-sm font-bold text-slate-800 mt-3">Nenhum encaminhamento encontrado</h3>
			<p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
				{busca ? 'Nenhum resultado corresponde à sua pesquisa.' : 'Você não possui encaminhamentos cadastrados nesta categoria.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtrados as item (item.id)}
				{@const st = statusInfo(item.status)}
				{@const expandido = itemExpandidoId === item.id}
				<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
					<!-- Cabeçalho do Card -->
					<div class="p-4 cursor-pointer" onclick={() => toggleDetalhe(item.id)}>
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span class="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider {st.cor}">
										{st.texto}
									</span>
									<span class="font-mono text-xs text-slate-400">
										#{item.protocolo}
									</span>
								</div>

								<h3 class="text-base font-bold text-slate-900 mt-1.5">
									{item.solicitacao?.especialidadeSolicitada || 'Consulta Especializada'}
								</h3>

								{#if item.solicitacao?.cid10}
									<div class="text-[11px] text-slate-500 mt-0.5">
										CID-10: <strong class="text-slate-700">{item.solicitacao.cid10}</strong>
									</div>
								{/if}
							</div>

							<div class="flex items-center gap-2">
								{#if item.agendamentoPrevisto}
									<div class="text-right">
										<div class="text-[9px] font-bold uppercase tracking-widest text-emerald-800">DATA MARCADA</div>
										<div class="font-mono text-xs font-black text-slate-900">
											{formatarDataHora(item.agendamentoPrevisto)}
										</div>
									</div>
								{:else}
									<div class="text-right">
										<div class="text-[9px] font-semibold uppercase tracking-widest text-slate-400">SOLICITADO EM</div>
										<div class="font-mono text-xs font-bold text-slate-600">
											{formatarData(item.criadoEm)}
										</div>
									</div>
								{/if}

								<button class="p-1 text-slate-400 hover:text-slate-700">
									{#if expandido}
										<IconChevronUp size={18} />
									{:else}
										<IconChevronDown size={18} />
									{/if}
								</button>
							</div>
						</div>

						<!-- Timeline simplificada da etapa -->
						<div class="mt-3 grid grid-cols-3 gap-1 pt-3 border-t border-slate-100">
							<div class="flex flex-col items-center text-center">
								<div class="h-1.5 w-full rounded-full bg-emerald-600"></div>
								<span class="mt-1 text-[9px] font-bold text-emerald-800">1. Solicitado</span>
							</div>
							<div class="flex flex-col items-center text-center">
								<div class="h-1.5 w-full rounded-full {st.etapa >= 2 ? 'bg-emerald-600' : st.etapa === 1 ? 'bg-amber-400' : 'bg-slate-200'}"></div>
								<span class="mt-1 text-[9px] font-bold {st.etapa >= 2 ? 'text-emerald-800' : st.etapa === 1 ? 'text-amber-800' : 'text-slate-400'}">
									2. Regulação
								</span>
							</div>
							<div class="flex flex-col items-center text-center">
								<div class="h-1.5 w-full rounded-full {st.etapa >= 3 ? 'bg-blue-600' : st.etapa === 2 ? 'bg-emerald-400' : 'bg-slate-200'}"></div>
								<span class="mt-1 text-[9px] font-bold {st.etapa >= 3 ? 'text-blue-800' : st.etapa === 2 ? 'text-emerald-800' : 'text-slate-400'}">
									3. Atendido
								</span>
							</div>
						</div>
					</div>

					<!-- Detalhes Expansíveis -->
					{#if expandido}
						<div class="border-t border-slate-100 bg-slate-50/70 p-4 text-xs">
							<div class="mb-3 text-slate-600 leading-relaxed">
								{st.descricao}
							</div>

							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 font-mono text-[11px] mb-3">
								<div class="rounded border border-slate-200 bg-white p-2">
									<span class="text-slate-400 block text-[9px]">Unidade de Origem:</span>
									<strong class="text-slate-800">{item.unidadeOrigem || 'Unidade Básica de Saúde (UBS)'}</strong>
								</div>
								<div class="rounded border border-slate-200 bg-white p-2">
									<span class="text-slate-400 block text-[9px]">Local de Atendimento:</span>
									<strong class="text-slate-800">{item.localAgendamento || 'Centro de Especialidades Médicas (CEM)'}</strong>
								</div>
								{#if item.agendamentoPrevisto}
									<div class="rounded border border-emerald-200 bg-emerald-50 p-2 sm:col-span-2">
										<span class="text-emerald-800 block text-[9px] font-bold">HORÁRIO E ORIENTAÇÕES:</span>
										<strong class="text-emerald-950 block text-xs mt-0.5">
											Comparecer em {formatarDataHora(item.agendamentoPrevisto)}
										</strong>
										<span class="text-emerald-900 text-[10px] block mt-0.5">
											Levar Cartão SUS, Documento oficial com foto e exames anteriores se houver.
										</span>
									</div>
								{/if}
							</div>

							<div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
								<button
									onclick={() => imprimirComprovante(item)}
									class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm"
								>
									<IconPrinter size={14} />
									<span>Comprovante de Agendamento</span>
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
