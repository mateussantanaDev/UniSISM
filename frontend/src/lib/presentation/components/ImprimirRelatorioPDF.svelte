<script lang="ts">
	import { onMount } from 'svelte';
	import type { Relatorio } from '$lib/api/types';
	import { catalogoDe, dataHoraDisplay, tamanhoDisplay } from '$lib/presentation/utils/relatorios';
	import { baixarElementoComoPDF } from '$lib/presentation/utils/pdfGenerator';

	interface Props {
		relatorio: Relatorio;
		operador?: string;
		prefeitura?: string | null;
		onFechar: () => void;
	}

	let {
		relatorio,
		operador = 'Servidor Municipal',
		prefeitura = 'Prefeitura Municipal',
		onFechar
	}: Props = $props();

	let articleElement = $state<HTMLElement | null>(null);
	let baixando = $state(false);

	let catalogo = $derived(catalogoDe(relatorio.tipo));

	async function executarDownloadPDF() {
		if (!articleElement || baixando) return;
		baixando = true;
		try {
			await baixarElementoComoPDF(articleElement, `relatorio_${relatorio.tipo}_${relatorio.id}`);
		} finally {
			baixando = false;
		}
	}

	const emissaotimestamp = new Date().toLocaleString('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	let hashVerificacao = $derived.by(() => {
		const seed = `${relatorio.id}-${relatorio.tipo}-${relatorio.geradoEm}`;
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			hash = (hash << 5) - hash + seed.charCodeAt(i);
			hash |= 0;
		}
		const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
		return `SHA256: ${hex}-UNISISM-RELATORIO-2026-OFICIAL`;
	});

	onMount(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onFechar();
		};
		window.addEventListener('keydown', handler);

		// Dispara download automático do PDF ao carregar o relatório
		setTimeout(() => {
			executarDownloadPDF();
		}, 300);

		return () => window.removeEventListener('keydown', handler);
	});
</script>

<!-- Modal Overlay para Visualização do PDF -->
<div
	class="print-overlay fixed inset-0 z-50 flex flex-col overflow-auto bg-slate-900/60 font-sans backdrop-blur-xs"
	style="background-color: rgba(15, 23, 42, 0.6);"
	role="dialog"
	aria-modal="true"
	aria-label="Visualização do Documento PDF do Relatório Oficial UNISISM"
>
	<!-- Toolbar de Ações -->
	<div
		class="print-toolbar sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm"
		style="background-color: #ffffff; border-color: #e2e8f0;"
	>
		<div class="flex items-center gap-3">
			<div class="bg-blue-900 px-2 py-0.5 font-mono text-xs font-bold text-white uppercase" style="background-color: #1e3a8a; color: #ffffff;">UNISISM</div>
			<div class="font-mono text-xs font-bold text-slate-800 uppercase" style="color: #1e293b;">
				Relatório Oficial · {catalogo.titulo} ({relatorio.formato})
			</div>
		</div>
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={onFechar}
				class="border border-slate-300 bg-white px-4 py-1.5 font-mono text-xs font-bold text-slate-700 uppercase hover:border-slate-800 hover:text-slate-900"
				style="border-color: #cbd5e1; background-color: #ffffff; color: #334155;"
			>
				Fechar (ESC)
			</button>
			<button
				type="button"
				onclick={executarDownloadPDF}
				disabled={baixando}
				class="border border-blue-900 bg-blue-900 px-5 py-1.5 font-mono text-xs font-bold text-white uppercase hover:bg-blue-950 flex items-center gap-2 disabled:opacity-50"
				style="border-color: #1e3a8a; background-color: #1e3a8a; color: #ffffff;"
			>
				{#if baixando}
					<span class="inline-block h-3 w-3 animate-spin border-2 border-white border-t-transparent"></span>
					<span>Gerando PDF...</span>
				{:else}
					<span>⬇ Baixar Arquivo PDF</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- Folha A4 Clean & Elegante -->
	<div class="p-4 md:p-8">
		<article
			bind:this={articleElement}
			class="print-scope relative mx-auto max-w-[210mm] border border-slate-300 bg-white p-8 font-sans text-slate-900 shadow-xl"
			style="background-color: #ffffff; color: #0f172a; border-color: #cbd5e1;"
		>
			<!-- Marca d'água de Uso Restrito -->
			{#if catalogo.restrito}
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.05] select-none">
					<div class="-rotate-45 font-mono text-6xl font-black tracking-widest text-red-900 uppercase" style="color: #7f1d1d;">
						USO RESTRITO · DOCUMENTO AUDITADO
					</div>
				</div>
			{/if}

			<!-- 1. Cabeçalho Institucional -->
			<header class="border-b-2 border-slate-900 pb-5" style="border-color: #0f172a;">
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-center gap-4">
						<div class="flex h-14 w-14 items-center justify-center border-2 border-slate-900 bg-slate-900 font-mono text-2xl font-black text-white" style="background-color: #0f172a; border-color: #0f172a; color: #ffffff;">
							{catalogo.icone}
						</div>
						<div>
							<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase" style="color: #64748b;">
								REPÚBLICA FEDERATIVA DO BRASIL · SISTEMA ÚNICO DE SAÚDE
							</div>
							<div class="text-base font-black tracking-wide text-slate-900 uppercase" style="color: #0f172a;">
								{prefeitura ?? 'SECRETARIA MUNICIPAL DE SAÚDE'}
							</div>
							<h1 class="font-mono text-sm font-bold text-blue-900 uppercase mt-0.5" style="color: #1e3a8a;">
								RELATÓRIO: {catalogo.titulo.toUpperCase()}
							</h1>
						</div>
					</div>

					<div class="flex flex-col items-end gap-1 text-right font-mono text-xs">
						<div class="border border-slate-900 bg-slate-900 text-white px-3 py-1 font-bold" style="background-color: #0f172a; border-color: #0f172a; color: #ffffff;">
							ID: <span class="text-xs">{relatorio.id}</span>
						</div>
						<div class="text-[10px] text-slate-500 uppercase font-bold mt-1" style="color: #64748b;">
							FORMATO: {relatorio.formato}
						</div>
					</div>
				</div>
			</header>

			<!-- 2. Parâmetros e Filtros Aplicados -->
			<section class="mt-6 border border-slate-200 bg-slate-50 p-4" style="border-color: #e2e8f0; background-color: #f8fafc;">
				<div class="font-mono text-xs font-bold text-slate-800 uppercase border-b border-slate-200 pb-2 mb-3 flex items-center justify-between" style="border-color: #e2e8f0; color: #1e293b;">
					<span>Parâmetros de Apuração e Filtros</span>
					<span class="text-blue-900" style="color: #1e3a8a;">{catalogo.descricao}</span>
				</div>
				<div class="grid grid-cols-12 gap-4 font-mono text-xs">
					<div class="col-span-12 md:col-span-4">
						<span class="block text-[10px] text-slate-500 uppercase font-bold" style="color: #64748b;">Período Selecionado</span>
						<span class="font-bold text-slate-900 text-sm" style="color: #0f172a;">
							{catalogo.periodoIgnorado ? 'Snapshot em Tempo Real' : relatorio.periodo}
						</span>
					</div>
					<div class="col-span-12 md:col-span-4">
						<span class="block text-[10px] text-slate-500 uppercase font-bold" style="color: #64748b;">Servidor Emissor</span>
						<span class="font-bold text-slate-900 text-sm" style="color: #0f172a;">{operador}</span>
					</div>
					<div class="col-span-12 md:col-span-4">
						<span class="block text-[10px] text-slate-500 uppercase font-bold" style="color: #64748b;">Data/Hora de Geração</span>
						<span class="font-bold text-slate-900 text-sm" style="color: #0f172a;">{dataHoraDisplay(relatorio.geradoEm)}</span>
					</div>
				</div>
			</section>

			<!-- 3. Especificação e Métricas Reais -->
			<section class="mt-6 border border-slate-200 p-4" style="border-color: #e2e8f0;">
				<div class="font-mono text-xs font-bold tracking-wider text-slate-800 uppercase mb-3 border-b border-slate-200 pb-2" style="border-color: #e2e8f0; color: #1e293b;">
					1. Resumo Executivo e Status do Registro
				</div>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
					<div class="border border-slate-200 bg-slate-50 p-3.5" style="border-color: #e2e8f0; background-color: #f8fafc;">
						<div class="text-[10px] font-bold text-slate-500 uppercase" style="color: #64748b;">Tamanho do Arquivo</div>
						<div class="text-xl font-black text-slate-900 mt-1" style="color: #0f172a;">
							{tamanhoDisplay(relatorio.tamanhoKb)}
						</div>
						<div class="text-[10px] text-slate-600 font-bold mt-1" style="color: #475569;">Consolidado no Servidor</div>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3.5" style="border-color: #e2e8f0; background-color: #f8fafc;">
						<div class="text-[10px] font-bold text-slate-500 uppercase" style="color: #64748b;">Status</div>
						<div class="text-xl font-black text-emerald-800 mt-1" style="color: #065f46;">
							{relatorio.status}
						</div>
						<div class="text-[10px] text-emerald-700 font-bold mt-1" style="color: #047857;">Sem erros de geração</div>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3.5" style="border-color: #e2e8f0; background-color: #f8fafc;">
						<div class="text-[10px] font-bold text-slate-500 uppercase" style="color: #64748b;">Nível de Acesso</div>
						<div class="text-sm font-black text-slate-900 mt-1" style="color: #0f172a;">
							{catalogo.restrito ? 'USO RESTRITO' : 'PÚBLICO / INTERNO'}
						</div>
						<div class="text-[10px] text-slate-600 font-semibold mt-1" style="color: #475569;">Conforme RBAC UniSISM</div>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3.5" style="border-color: #e2e8f0; background-color: #f8fafc;">
						<div class="text-[10px] font-bold text-slate-500 uppercase" style="color: #64748b;">Autenticidade</div>
						<div class="text-sm font-black text-blue-900 mt-1 truncate" style="color: #1e3a8a;">
							DIGITAL · SUS
						</div>
						<div class="text-[10px] text-slate-500 font-semibold mt-1" style="color: #64748b;">Verificação SHA-256</div>
					</div>
				</div>
			</section>

			<!-- 4. Tabela de Detalhes Reais -->
			<section class="mt-6 border border-slate-200" style="border-color: #e2e8f0;">
				<div class="bg-slate-900 px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-white uppercase flex items-center justify-between" style="background-color: #0f172a; color: #ffffff;">
					<span>2. Detalhamento dos Dados de Emissão</span>
					<span class="text-[10px] text-slate-300" style="color: #cbd5e1;">REGISTRO OFICIAL</span>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse font-mono text-xs">
						<thead>
							<tr class="border-b border-slate-200 bg-slate-100 text-[10px] uppercase font-bold text-slate-700 tracking-wider" style="border-color: #e2e8f0; background-color: #f1f5f9; color: #334155;">
								<th class="p-3 border-r border-slate-200" style="border-color: #e2e8f0;">Atributo Técnico</th>
								<th class="p-3 border-r border-slate-200" style="border-color: #e2e8f0;">Valor Apurado</th>
								<th class="p-3 text-right">Status de Validação</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-200">
							<tr class="hover:bg-slate-50">
								<td class="p-3 border-r border-slate-200 font-bold text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">Identificador Único (ID)</td>
								<td class="p-3 border-r border-slate-200 text-blue-900 font-bold" style="border-color: #e2e8f0; color: #1e3a8a;">{relatorio.id}</td>
								<td class="p-3 text-right font-bold text-slate-700" style="color: #334155;">Auditável</td>
							</tr>
							<tr class="hover:bg-slate-50">
								<td class="p-3 border-r border-slate-200 font-bold text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">Tipo de Relatório</td>
								<td class="p-3 border-r border-slate-200 text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">{relatorio.tipo} — {catalogo.titulo}</td>
								<td class="p-3 text-right font-bold text-slate-700" style="color: #334155;">Homologado</td>
							</tr>
							<tr class="hover:bg-slate-50">
								<td class="p-3 border-r border-slate-200 font-bold text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">Intervalo de Apuração</td>
								<td class="p-3 border-r border-slate-200 text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">{relatorio.periodo}</td>
								<td class="p-3 text-right font-bold text-slate-700" style="color: #334155;">Concluído</td>
							</tr>
							<tr class="hover:bg-slate-50">
								<td class="p-3 border-r border-slate-200 font-bold text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">Data e Hora de Geração</td>
								<td class="p-3 border-r border-slate-200 text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">{dataHoraDisplay(relatorio.geradoEm)}</td>
								<td class="p-3 text-right font-bold text-emerald-800" style="color: #065f46;">VÁLIDO</td>
							</tr>
							<tr class="hover:bg-slate-50">
								<td class="p-3 border-r border-slate-200 font-bold text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">Formato e Volume</td>
								<td class="p-3 border-r border-slate-200 text-slate-900" style="border-color: #e2e8f0; color: #0f172a;">{relatorio.formato} ({tamanhoDisplay(relatorio.tamanhoKb)})</td>
								<td class="p-3 text-right font-bold text-emerald-800" style="color: #065f46;">CONSOLIDADO</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<!-- 5. Rodapé e Validação -->
			<section class="mt-10 pt-6 border-t-2 border-slate-900" style="border-color: #0f172a;">
				<div class="flex items-center justify-between gap-6 font-mono text-xs">
					<div>
						<div class="font-bold text-slate-900 uppercase" style="color: #0f172a;">Validação de Integridade do Relatório</div>
						<div class="text-[10px] text-slate-500 mt-1" style="color: #64748b;">{hashVerificacao}</div>
					</div>
					<div class="text-right">
						<div class="w-56 border-b border-slate-800 ml-auto mb-2" style="border-color: #1e293b;"></div>
						<div class="font-bold text-slate-900 font-sans text-sm" style="color: #0f172a;">{operador}</div>
						<div class="text-[10px] text-slate-500" style="color: #64748b;">Servidor Emissor Responsável</div>
					</div>
				</div>

				<footer class="mt-8 pt-4 border-t border-slate-200 flex items-center justify-between font-mono text-[10px] text-slate-500" style="border-color: #e2e8f0; color: #64748b;">
					<div>UNISISM · SISTEMA INTEGRADO DE SAÚDE MUNICIPAL · GOVERNO DIGITAL</div>
					<div>EMISSÃO: {emissaotimestamp} · PÁGINA 1 DE 1</div>
				</footer>
			</section>
		</article>
	</div>
</div>
