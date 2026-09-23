<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import HistoricoTable from '$lib/presentation/components/HistoricoTable.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento, MetricasDashboard } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	/**
	 * Visão Geral da Secretaria · Dashboard de Regulação.
	 *
	 * Duas variantes:
	 *  - REGULADOR_SMS "puro" → quatro cards diretos (chegaram hoje,
	 *    pendentes, enviados, respondidos), sem KPIs analíticos.
	 *  - ADMIN/DESENVOLVEDOR → painel completo com fila e SLA.
	 */

	const auth = useAuth();
	// REGULADOR_SMS sempre cai no modo simples (a role é exclusiva — não
	// se mistura com ADMIN/DEV). `ehAdminGlobalOuPrefeitura` não pode ser
	// usado aqui porque também é true pro REGULADOR (escopo PREFEITURA).
	let modoSimples = $derived(!!auth.ehReguladorSimples);

	let metricas = $state<MetricasDashboard | null>(null);
	let fila = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			// v0.9.1 — `enviadosAguardandoResposta` e `respondidosTotal` agora vêm
			// direto em /dashboard/metrics. No modo simples só precisamos disso.
			// O modo completo ainda usa a fila para a tabela "Fila de Análise".
			if (modoSimples) {
				metricas = await api.dashboard.metrics();
			} else {
				const [m, f] = await Promise.all([
					api.dashboard.metrics(),
					api.encaminhamentos.list({ status: 'AGUARDANDO_REGULACAO', limit: 100 })
				]);
				metricas = m;
				fila = f;
			}
		} finally {
			carregando = false;
		}
	});

	let enviadosAguardando = $derived(metricas?.enviadosAguardandoResposta ?? 0);
	let respondidos = $derived(metricas?.respondidosTotal ?? 0);

	let taxaAprovacao = $derived.by(() => {
		if (!metricas) return '—';
		const decididos = metricas.aprovadosHoje;
		const total = metricas.aprovadosHoje + metricas.pendenciasDocumento;
		if (total === 0) return '—';
		return `${Math.round((decididos / total) * 100)}%`;
	});

	function formatarTempoMedio(segundos: number): string {
		const min = Math.floor(segundos / 60);
		const s = segundos % 60;
		return `${min}m ${s.toString().padStart(2, '0')}s`;
	}
</script>

{#if modoSimples}
	<!-- ─────────── Modo Simples (REGULADOR_SMS) ─────────── -->
	<div class="flex flex-col gap-5">
		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-4 py-3 font-sans text-[13px] text-blue-900"
		>
			<strong class="font-mono tracking-widest uppercase"
				>Bom dia, {auth.me?.nome ?? 'Atendente'}.</strong
			>
			Aqui está o resumo de hoje. Use o menu à esquerda para abrir as
			<strong>Solicitações</strong> recebidas das UBSs ou as <strong>Respostas</strong> oficiais devolvidas
			pelo SUS.
		</div>

		<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<button
				type="button"
				onclick={() => goto('/sms/solicitacoes')}
				class="group relative cursor-pointer border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-blue-900 hover:bg-blue-50"
			>
				<span class="absolute top-0 left-0 h-full w-1 bg-blue-900"></span>
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Chegaram Hoje
				</div>
				<div class="mt-2 font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : (metricas?.encaminhamentosHoje ?? 0)}
				</div>
				<div class="mt-1 font-sans text-[12px] text-slate-600">
					Encaminhamentos novos enviados pelas UBSs
				</div>
			</button>

			<button
				type="button"
				onclick={() => goto('/sms/solicitacoes')}
				class="group relative cursor-pointer border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-amber-600 hover:bg-amber-50"
			>
				<span class="absolute top-0 left-0 h-full w-1 bg-amber-600"></span>
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Pendentes</div>
				<div class="mt-2 font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : (metricas?.aguardandoRegulacao ?? 0)}
				</div>
				<div class="mt-1 font-sans text-[12px] text-slate-600">
					Aguardando análise / aprovação aqui na SMS
				</div>
			</button>

			<button
				type="button"
				onclick={() => goto('/sms/solicitacoes')}
				class="group relative cursor-pointer border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-blue-700 hover:bg-blue-50"
			>
				<span class="absolute top-0 left-0 h-full w-1 bg-blue-700"></span>
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Enviados</div>
				<div class="mt-2 font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : enviadosAguardando}
				</div>
				<div class="mt-1 font-sans text-[12px] text-slate-600">
					Aprovados, aguardando resposta do SUS
				</div>
			</button>

			<button
				type="button"
				onclick={() => goto('/sms/respostas')}
				class="group relative cursor-pointer border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-emerald-700 hover:bg-emerald-50"
			>
				<span class="absolute top-0 left-0 h-full w-1 bg-emerald-700"></span>
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Respondidos
				</div>
				<div class="mt-2 font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : respondidos}
				</div>
				<div class="mt-1 font-sans text-[12px] text-slate-600">
					Resposta oficial do SUS já recebida
				</div>
			</button>
		</section>

		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<button
				type="button"
				onclick={() => goto('/sms/solicitacoes')}
				class="flex items-center justify-between gap-3 border border-slate-200 bg-white px-5 py-5 text-left transition-colors hover:border-blue-900 hover:bg-blue-50"
			>
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Solicitações Recebidas
					</div>
					<div class="mt-1 font-sans text-base font-bold text-slate-900">
						Abrir explorador da rede UBS
					</div>
					<div class="mt-1 font-sans text-[12px] text-slate-600">
						Navegue por UBS · Ano · Mês · Dia
					</div>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-6 w-6 text-slate-400"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
				</svg>
			</button>

			<button
				type="button"
				onclick={() => goto('/sms/respostas')}
				class="flex items-center justify-between gap-3 border border-slate-200 bg-white px-5 py-5 text-left transition-colors hover:border-emerald-700 hover:bg-emerald-50"
			>
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Respostas do SUS
					</div>
					<div class="mt-1 font-sans text-base font-bold text-slate-900">
						Abrir explorador de retornos oficiais
					</div>
					<div class="mt-1 font-sans text-[12px] text-slate-600">
						Visualizar · baixar · imprimir · compartilhar
					</div>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-6 w-6 text-slate-400"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
				</svg>
			</button>
		</div>
	</div>
{:else}
	<!-- ─────────── Modo Completo (ADMIN / DEV) ─────────── -->
	<div class="flex flex-col gap-4">
		<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<MetricCard
				label="Fila de Análise"
				value={metricas?.aguardandoRegulacao ?? '—'}
				sublabel="Aguardando decisão do regulador"
				accent="warning"
			/>
			<MetricCard
				label="Pendências Ativas"
				value={metricas?.pendenciasDocumento ?? '—'}
				sublabel="Aguardando readequação da UBS"
				accent="critical"
			/>
			<MetricCard
				label="Aprovados Hoje"
				value={metricas?.aprovadosHoje ?? '—'}
				sublabel="Encaminhados à rede especializada"
				accent="success"
			/>
			<MetricCard
				label="Taxa de Aprovação"
				value={taxaAprovacao}
				sublabel="Decididos hoje · SLA {metricas
					? formatarTempoMedio(metricas.tempoMedioConsolidacaoSegundos)
					: '—'}"
			/>
		</section>

		<HistoricoTable
			titulo="Fila de Análise"
			subtitulo="Encaminhamentos aguardando decisão — ordenados por prioridade clínica e tempo em fila"
			lista={fila}
			{carregando}
			mostrarStatus={false}
			detalheBasePath="/sms/encaminhamento"
		/>
	</div>
{/if}
