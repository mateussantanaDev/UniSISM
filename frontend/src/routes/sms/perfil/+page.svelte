<!-- Build 2026.04.1 -->
<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { usePerfil } from '$lib/presentation/contexts/perfilContext';
	import type { AtendentePerfil } from '$lib/api/types';

	import { formatarCargoPerfil } from '$lib/presentation/utils/usuarioUtils';

	const BUILD_VER = '2026.04.v2';
	const ctx = usePerfil();
	let p = $derived(ctx.perfil as AtendentePerfil);

	function formatarData(iso: string | null | undefined) {
		if (!iso) return 'Não informada';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return 'Não informada';
		return d.toLocaleDateString('pt-BR');
	}

	function tempoCasa(iso: string | null | undefined): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return '—';
		const hoje = new Date();
		let anos = hoje.getFullYear() - d.getFullYear();
		let meses = hoje.getMonth() - d.getMonth();
		if (meses < 0) {
			anos--;
			meses += 12;
		}
		if (anos < 0) return 'Recente';
		if (anos === 0 && meses === 0) return 'Menos de 1m';
		if (anos === 0) return `${meses}m`;
		return `${anos}a ${meses}m`;
	}
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Identidade -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Identidade" subtitle="Dados de identificação funcional" index="01" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Nome Completo
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">{p.nome}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Matrícula
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.matricula}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Admissão</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{formatarData(p.dataAdmissao)}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Tempo de Casa
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{tempoCasa(p.dataAdmissao)}</dd>
			</div>
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Cargo / Função
				</dt>
				<dd class="mt-0.5 text-sm font-semibold text-slate-900">{formatarCargoPerfil(p, 'SMS')}</dd>
				{#if p.funcao && !p.funcao.toUpperCase().includes('CEO') && !p.funcao.toUpperCase().includes('CEM')}
					<dd class="text-xs text-slate-600">{p.funcao}</dd>
				{:else}
					<dd class="text-xs text-slate-600">Regulação e Gestão da Secretaria de Saúde</dd>
				{/if}
			</div>
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Lotação</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.lotacao}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Sessão" index="02" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Status</dt>
				<dd>
					<span
						class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-bold tracking-widest text-emerald-800 uppercase"
					>
						ATIVA
					</span>
				</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Inatividade</dt>
				<dd class="font-bold text-slate-900">{p.seguranca.sessaoInatividade}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Expira em</dt>
				<dd class="font-bold text-slate-900">{p.seguranca.sessaoExpiraEm}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Dispositivos</dt>
				<dd class="font-bold text-slate-900">{p.seguranca.sessoesAtivas}</dd>
			</div>
		</dl>
	</div>

	<!-- Produção snapshot -->
	<section class="col-span-12 grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Hoje" value={p.producao.hoje} sublabel="Decisões do regulador" />
		<MetricCard label="Esta Semana" value={p.producao.semana} sublabel="Últimos 7 dias" />
		<MetricCard
			label="Este Mês"
			value={p.producao.mes}
			sublabel="{p.producao.mes} / {p.producao.metaMes} meta"
			accent="success"
		/>
		<MetricCard
			label="Ranking"
			value="{p.producao.ranking}º"
			sublabel="de {p.producao.totalAtendentes} na rede"
		/>
	</section>

	<!-- Atividade -->
	<div class="col-span-12 border border-slate-200 bg-white">
		<PanelHeader title="Atividade Recente" subtitle="Últimas ações desta sessão" index="03" />
		<ul class="divide-y divide-slate-100">
			{#each p.atividadeRecente as ev, i (i)}
				<li class="flex items-start justify-between gap-3 px-4 py-2.5">
					<div class="flex items-start gap-3">
						<span class="mt-1.5 h-1.5 w-1.5 shrink-0 bg-blue-900"></span>
						<div>
							<div class="text-xs text-slate-900">{ev.acao}</div>
							{#if ev.alvo}
								<div class="font-mono text-[11px] font-bold text-blue-900">{ev.alvo}</div>
							{/if}
						</div>
					</div>
					<span class="shrink-0 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						{ev.em}
					</span>
				</li>
			{/each}
		</ul>
	</div>
</section>
