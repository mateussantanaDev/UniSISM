<script lang="ts">
	import IngestoesBreadcrumb from './IngestoesBreadcrumb.svelte';
	import PanelHeader from './PanelHeader.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { mensagemErroSms } from '$lib/api/erros-sms';
	import type {
		ArvoreAnoNode,
		ArvoreDiaNode,
		ArvoreMesNode,
		ArvoreUbsNode,
		Encaminhamento,
		ListEncaminhamentosQuery
	} from '$lib/api/types';

	/**
	 * Explorador hierárquico no estilo file-manager.
	 *
	 * v0.9.1 — usa o endpoint agregado `/v1/encaminhamentos/arvore`
	 * (com filtros `respostaSUS` e `excluirRascunho`). Cada nível desce
	 * apenas o necessário, em vez de baixar a lista completa.
	 *
	 * Níveis (controlados por query string):
	 *   1. ?              → grid de UBSs.
	 *   2. ?ubsId=        → grid de Anos.
	 *   3. ?ubsId&ano=    → grid de Meses.
	 *   4. ?ubsId&ano&mes=→ grid de Dias.
	 *   5. ?ubsId&ano&mes&dia=→ tabela final de encaminhamentos do dia
	 *      (chama /encaminhamentos com janela `desde`/`ate`).
	 */

	interface Props {
		basePath: string;
		titulo: string;
		subtitulo?: string;
		emojiVazio?: string;
		mensagemVazio?: string;
		/** Filtro `respostaSUS` enviado para a árvore e a listagem do dia. */
		respostaSUS?: boolean;
		/** Quando true, exclui RASCUNHO da árvore e da listagem do dia. */
		excluirRascunho?: boolean;
		/** Caminho-base para o detalhe ao clicar numa linha. */
		detalheBasePath?: string;
		/**
		 * Query string opcional acrescentada ao link de detalhe.
		 * Ex.: `?aba=anexos` para abrir o explorador de Respostas SUS já na
		 * aba certa em vez da ficha do paciente.
		 */
		detalheQuery?: string;
		dica?: string;
		/** Custom view routing filter for SMS Command Center */
		tipoFiltro?: 'solicitacoes' | 'enviados' | 'respostas';
	}

	let {
		basePath,
		titulo,
		subtitulo = 'UBS · Ano · Mês · Dia',
		emojiVazio = '📭',
		mensagemVazio = 'Nada para listar.',
		respostaSUS,
		excluirRascunho = true,
		detalheBasePath = '/sms/encaminhamentos',
		detalheQuery = '',
		dica = 'Navegação: UBS → Ano → Mês → Dia → Encaminhamentos.',
		tipoFiltro
	}: Props = $props();

	// ────────── Leitura da query atual ──────────
	let ubsId = $derived(page.url.searchParams.get('ubsId'));
	let ubsNome = $derived(page.url.searchParams.get('ubs')); // só p/ exibição no breadcrumb
	let ano = $derived.by(() => {
		const v = page.url.searchParams.get('ano');
		return v ? Number(v) : null;
	});
	let mes = $derived.by(() => {
		const v = page.url.searchParams.get('mes');
		return v ? Number(v) : null;
	});
	let dia = $derived.by(() => {
		const v = page.url.searchParams.get('dia');
		return v ? Number(v) : null;
	});

	// ────────── Estado dos níveis ──────────
	let ubsNodes = $state<ArvoreUbsNode[]>([]);
	let anoNodes = $state<ArvoreAnoNode[]>([]);
	let mesNodes = $state<ArvoreMesNode[]>([]);
	let diaNodes = $state<ArvoreDiaNode[]>([]);
	let encsDoDia = $state<Encaminhamento[]>([]);

	let carregando = $state(true);
	let erro = $state<string | null>(null);

	let nivel = $derived.by<'ubs' | 'ano' | 'mes' | 'dia' | 'lista'>(() => {
		if (!ubsId) return 'ubs';
		if (!ano) return 'ano';
		if (!mes) return 'mes';
		if (!dia) return 'dia';
		return 'lista';
	});

	function flagsArvore(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		if (typeof respostaSUS === 'boolean') out.respostaSUS = respostaSUS;
		if (excluirRascunho) out.excluirRascunho = true;
		return out;
	}

	async function carregarNivel() {
		carregando = true;
		erro = null;
		try {
			const getQuery = (extra: any) => {
				const q = { ...flagsArvore(), ...extra };
				if (tipoFiltro === 'enviados') q.respostaSUS = false;
				if (tipoFiltro === 'respostas') q.respostaSUS = true;
				return q;
			};

			if (nivel === 'ubs') {
				const nodes = (await api.encaminhamentos.arvore(getQuery({}))) as ArvoreUbsNode[];
				if (tipoFiltro === 'solicitacoes') {
					ubsNodes = nodes
						.filter((u) => u.statusContagem.aguardando > 0 || u.statusContagem.pendencia > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aguardando + u.statusContagem.pendencia
						}));
				} else if (tipoFiltro === 'enviados' || tipoFiltro === 'respostas') {
					ubsNodes = nodes
						.filter((u) => u.statusContagem.aprovado > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aprovado
						}));
				} else {
					ubsNodes = nodes;
				}
			} else if (nivel === 'ano') {
				const nodes = (await api.encaminhamentos.arvore(getQuery({ ubsId: ubsId! }))) as ArvoreAnoNode[];
				if (tipoFiltro === 'solicitacoes') {
					anoNodes = nodes
						.filter((u) => u.statusContagem.aguardando > 0 || u.statusContagem.pendencia > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aguardando + u.statusContagem.pendencia
						}));
				} else if (tipoFiltro === 'enviados' || tipoFiltro === 'respostas') {
					anoNodes = nodes
						.filter((u) => u.statusContagem.aprovado > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aprovado
						}));
				} else {
					anoNodes = nodes;
				}
			} else if (nivel === 'mes') {
				const nodes = (await api.encaminhamentos.arvore(getQuery({ ubsId: ubsId!, ano: ano! }))) as ArvoreMesNode[];
				if (tipoFiltro === 'solicitacoes') {
					mesNodes = nodes
						.filter((u) => u.statusContagem.aguardando > 0 || u.statusContagem.pendencia > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aguardando + u.statusContagem.pendencia
						}));
				} else if (tipoFiltro === 'enviados' || tipoFiltro === 'respostas') {
					mesNodes = nodes
						.filter((u) => u.statusContagem.aprovado > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aprovado
						}));
				} else {
					mesNodes = nodes;
				}
			} else if (nivel === 'dia') {
				const nodes = (await api.encaminhamentos.arvore(getQuery({ ubsId: ubsId!, ano: ano!, mes: mes! }))) as ArvoreDiaNode[];
				if (tipoFiltro === 'solicitacoes') {
					diaNodes = nodes
						.filter((u) => u.statusContagem.aguardando > 0 || u.statusContagem.pendencia > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aguardando + u.statusContagem.pendencia
						}));
				} else if (tipoFiltro === 'enviados' || tipoFiltro === 'respostas') {
					diaNodes = nodes
						.filter((u) => u.statusContagem.aprovado > 0)
						.map((u) => ({
							...u,
							totalEncaminhamentos: u.statusContagem.aprovado
						}));
				} else {
					diaNodes = nodes;
				}
			} else {
				// lista do dia
				const desde = new Date(ano!, mes! - 1, dia!).toISOString().slice(0, 10);
				const ate = desde;
				const q: ListEncaminhamentosQuery = {
					desde,
					ate,
					limit: 500
				};
				if (tipoFiltro === 'enviados') q.respostaSUS = false;
				if (tipoFiltro === 'respostas') q.respostaSUS = true;
				if (typeof respostaSUS === 'boolean') q.respostaSUS = respostaSUS;

				const lista = await api.encaminhamentos.list(q);
				encsDoDia = lista.filter((e) =>
					excluirRascunho ? e.status !== 'RASCUNHO' : true
				);
				if (ubsId) {
					encsDoDia = encsDoDia.filter((e) =>
						e.unidadeOrigem?.length ? true : true
					);
				}

				// Apply client-side filters based on tipoFiltro
				if (tipoFiltro === 'solicitacoes') {
					encsDoDia = encsDoDia.filter(
						(e) => e.status === 'AGUARDANDO_REGULACAO' || e.status === 'PENDENCIA_DOCUMENTO'
					);
				} else if (tipoFiltro === 'enviados') {
					encsDoDia = encsDoDia.filter(
						(e) => e.status === 'APROVADO' && !e.respostaSUS
					);
				} else if (tipoFiltro === 'respostas') {
					encsDoDia = encsDoDia.filter(
						(e) => e.status === 'APROVADO' && !!e.respostaSUS
					);
				}
			}
		} catch (e) {
			erro = mensagemErroSms(e);
		} finally {
			carregando = false;
		}
	}

	// Recarrega sempre que a URL muda (cliques nos níveis).
	$effect(() => {
		// dependências: nivel + parâmetros
		void nivel;
		void ubsId;
		void ano;
		void mes;
		void dia;
		void respostaSUS;
		void excluirRascunho;
		carregarNivel();
	});

	function navegar(extra: Record<string, string | number | null>) {
		const url = new URL(basePath, window.location.origin);
		for (const [k, v] of Object.entries(extra)) {
			if (v !== null && v !== '') url.searchParams.set(k, String(v));
		}
		goto(url.pathname + url.search);
	}

	function comQuery(extra: Record<string, string | number | null>): string {
		const url = new URL(basePath, window.location.origin);
		for (const [k, v] of Object.entries(extra)) {
			if (v !== null && v !== '') url.searchParams.set(k, String(v));
		}
		return url.pathname + url.search;
	}

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const NOMES_MES = [
		'JAN',
		'FEV',
		'MAR',
		'ABR',
		'MAI',
		'JUN',
		'JUL',
		'AGO',
		'SET',
		'OUT',
		'NOV',
		'DEZ'
	];

	function nomeMes(n: number): string {
		return NOMES_MES[n - 1] ?? String(n).padStart(2, '0');
	}

	function totaisDeNo(c: { aguardando: number; pendencia: number; aprovado: number; rejeitado: number } | undefined) {
		return c ?? { aguardando: 0, pendencia: 0, aprovado: 0, rejeitado: 0 };
	}

	let crumbs = $derived.by(() => {
		const items: Array<{ label: string; href?: string }> = [
			{ label: titulo, href: basePath }
		];
		if (ubsId) {
			items.push({
				label: ubsNome ?? 'UBS',
				href: comQuery({ ubsId, ubs: ubsNome ?? '' })
			});
		}
		if (ano) {
			items.push({
				label: String(ano),
				href: comQuery({ ubsId: ubsId!, ubs: ubsNome ?? '', ano })
			});
		}
		if (mes) {
			items.push({
				label: nomeMes(mes),
				href: comQuery({ ubsId: ubsId!, ubs: ubsNome ?? '', ano: ano!, mes })
			});
		}
		if (dia) {
			items.push({ label: String(dia).padStart(2, '0') });
		}
		return items;
	});
</script>

<div class="flex flex-col gap-4">
	<IngestoesBreadcrumb items={crumbs} />

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title={dia
				? `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
				: mes
					? `${nomeMes(mes)}/${ano}`
					: ano
						? String(ano)
						: ubsNome
							? ubsNome
							: titulo}
			subtitle={subtitulo}
			index="01"
		/>

		{#if erro}
			<div class="border-b border-red-700 bg-red-50 px-4 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase">
				⚠ {erro}
			</div>
		{/if}

		{#if carregando}
			<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
				{#each Array(6) as _, i (i)}
					<div class="bg-white p-4">
						<div class="h-20 w-full animate-pulse bg-slate-100"></div>
					</div>
				{/each}
			</div>
		{:else if nivel === 'ubs'}
			<!-- Nível 1: UBSs -->
			{#if ubsNodes.length === 0}
				<div class="flex flex-col items-center gap-2 px-6 py-16 text-center font-sans text-slate-500">
					<div class="text-3xl">{emojiVazio}</div>
					<div class="font-mono text-xs tracking-widest uppercase">{mensagemVazio}</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
					{#each ubsNodes as u (u.ubsId)}
						{@const c = totaisDeNo(u.statusContagem)}
						<button
							type="button"
							onclick={() => navegar({ ubsId: u.ubsId, ubs: u.nome })}
							class="group flex items-start gap-3 bg-white px-4 py-4 text-left transition-colors hover:bg-slate-50"
						>
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-300 bg-slate-50 transition-colors group-hover:border-blue-900 group-hover:bg-blue-50"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-6 w-6 text-slate-600 group-hover:text-blue-900"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
									/>
								</svg>
							</div>
							<div class="flex-1 leading-tight">
								<div class="font-mono text-xs font-bold tracking-wider text-slate-900 uppercase">
									{u.nome}
								</div>
								<div class="mt-1 flex items-baseline gap-2">
									<span class="font-mono text-2xl font-bold text-slate-900">
										{u.totalEncaminhamentos}
									</span>
									<span class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
										{u.totalEncaminhamentos === 1 ? 'registro' : 'registros'}
									</span>
								</div>
								<div class="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
									{#if c.aguardando > 0}
										<span
											class="border border-blue-700 bg-blue-50 px-1 py-px font-bold text-blue-900"
										>
											⏱ {c.aguardando}
										</span>
									{/if}
									{#if c.pendencia > 0}
										<span
											class="border border-amber-600 bg-amber-50 px-1 py-px font-bold text-amber-800"
										>
											⚠ {c.pendencia}
										</span>
									{/if}
									{#if c.aprovado > 0}
										<span
											class="border border-emerald-700 bg-emerald-50 px-1 py-px font-bold text-emerald-800"
										>
											✓ {c.aprovado}
										</span>
									{/if}
									{#if c.rejeitado > 0}
										<span
											class="border border-red-700 bg-red-50 px-1 py-px font-bold text-red-800"
										>
											✗ {c.rejeitado}
										</span>
									{/if}
								</div>
								<div class="mt-1 font-mono text-[10px] tracking-wider text-slate-500 uppercase">
									{u.anoMaisRecente ? `mais recente · ${u.anoMaisRecente}` : '—'}
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else if nivel === 'ano'}
			<!-- Nível 2: Anos -->
			{#if anoNodes.length === 0}
				<div class="px-6 py-16 text-center font-sans text-sm text-slate-500">
					Nenhum ano com registros para esta UBS.
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-4 xl:grid-cols-6">
					{#each anoNodes as a (a.ano)}
						<button
							type="button"
							onclick={() =>
								navegar({ ubsId: ubsId!, ubs: ubsNome ?? '', ano: a.ano })}
							class="group flex flex-col items-center gap-2 bg-white px-3 py-5 text-center transition-colors hover:bg-slate-50"
						>
							<div class="font-mono text-3xl font-bold text-slate-900 group-hover:text-blue-900">
								{a.ano}
							</div>
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								{a.totalEncaminhamentos}
								{a.totalEncaminhamentos === 1 ? 'registro' : 'registros'}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else if nivel === 'mes'}
			<!-- Nível 3: Meses -->
			{#if mesNodes.length === 0}
				<div class="px-6 py-16 text-center font-sans text-sm text-slate-500">
					Nenhum mês com registros em {ano}.
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-px bg-slate-200 md:grid-cols-4 xl:grid-cols-6">
					{#each mesNodes as m (m.mes)}
						<button
							type="button"
							onclick={() =>
								navegar({
									ubsId: ubsId!,
									ubs: ubsNome ?? '',
									ano: ano!,
									mes: m.mes
								})}
							class="group flex flex-col items-center gap-2 bg-white px-3 py-5 text-center transition-colors hover:bg-slate-50"
						>
							<div class="font-mono text-2xl font-bold text-slate-900 group-hover:text-blue-900">
								{nomeMes(m.mes)}
							</div>
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								{m.totalEncaminhamentos}
								{m.totalEncaminhamentos === 1 ? 'registro' : 'registros'}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else if nivel === 'dia'}
			<!-- Nível 4: Dias -->
			{#if diaNodes.length === 0}
				<div class="px-6 py-16 text-center font-sans text-sm text-slate-500">
					Nenhum dia com registros em {nomeMes(mes ?? 0)}/{ano}.
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-px bg-slate-200 md:grid-cols-5 xl:grid-cols-7">
					{#each diaNodes as d (d.dia)}
						<button
							type="button"
							onclick={() =>
								navegar({
									ubsId: ubsId!,
									ubs: ubsNome ?? '',
									ano: ano!,
									mes: mes!,
									dia: d.dia
								})}
							class="group flex flex-col items-center gap-1 bg-white px-3 py-4 text-center transition-colors hover:bg-slate-50"
						>
							<div class="font-mono text-2xl font-bold text-slate-900 group-hover:text-blue-900">
								{String(d.dia).padStart(2, '0')}
							</div>
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								{nomeMes(mes ?? 0)}
							</div>
							<div class="font-mono text-[10px] font-bold text-slate-700">
								{d.totalEncaminhamentos}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- Nível 5: Encaminhamentos do dia -->
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">Hora</th>
							<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
							<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
							<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2">Status</th>
							<th class="px-3 py-2">Ação</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if encsDoDia.length === 0}
							<tr>
								<td colspan="6" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
									Nenhum registro neste dia.
								</td>
							</tr>
						{:else}
							{#each encsDoDia as e (e.id)}
								<tr
									class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
									onclick={() => goto(`${detalheBasePath}/${e.id}${detalheQuery}`)}
								>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
										{formatarData(e.criadoEm)}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
									>
										{e.protocolo}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
										{e.paciente.nome}
										<div class="text-[10px] text-slate-500">{e.paciente.cpf}</div>
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
										{e.solicitacao.especialidadeSolicitada}
										<div class="text-[10px] text-slate-500">CID {e.solicitacao.cid10}</div>
									</td>
									<td class="border-r border-slate-100 px-3 py-2">
										<StatusBadge status={e.status} />
									</td>
									<td class="px-3 py-2" onclick={(ev) => ev.stopPropagation()}>
										<button
											type="button"
											onclick={() => goto(`${detalheBasePath}/${e.id}${detalheQuery}`)}
											class="border border-blue-900 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:bg-blue-100"
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
		{/if}
	</div>

	<div class="border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[11px] text-slate-600">
		<span class="font-bold tracking-widest text-slate-700 uppercase">Dica:</span>
		{dica}
	</div>
</div>
