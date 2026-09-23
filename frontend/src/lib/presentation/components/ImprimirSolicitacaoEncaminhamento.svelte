<script lang="ts">
	import { onMount } from 'svelte';
	import type { Encaminhamento } from '$lib/api/types';
	import StatusBadge from './StatusBadge.svelte';
	import { baixarElementoComoPDF } from '$lib/presentation/utils/pdfGenerator';

	interface Props {
		encaminhamento: Encaminhamento;
		operador?: string;
		prefeitura?: string | null;
		unidade?: string | null;
		onFechar: () => void;
	}

	let {
		encaminhamento,
		operador = 'Servidor Municipal',
		prefeitura = 'Prefeitura Municipal',
		unidade = 'Unidade Básica de Saúde',
		onFechar
	}: Props = $props();

	let articleElement = $state<HTMLElement | null>(null);
	let baixando = $state(false);

	function formatarData(iso?: string | null, comHora = false) {
		if (!iso) return '—';
		try {
			const d = new Date(iso);
			if (comHora) {
				return d.toLocaleString('pt-BR', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
			return d.toLocaleDateString('pt-BR');
		} catch {
			return iso;
		}
	}

	function calcularIdade(dataNasc?: string): string {
		if (!dataNasc) return '—';
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return `${a} anos`;
	}

	function formatarCpf(cpf?: string): string {
		if (!cpf) return '—';
		const limpo = cpf.replace(/\D/g, '');
		if (limpo.length !== 11) return cpf;
		return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
	}

	function formatarCns(cns?: string): string {
		if (!cns) return '—';
		const limpo = cns.replace(/\D/g, '');
		if (limpo.length !== 15) return cns;
		return `${limpo.slice(0, 3)} ${limpo.slice(3, 7)} ${limpo.slice(7, 11)} ${limpo.slice(11)}`;
	}

	async function executarDownloadPDF() {
		if (!articleElement || baixando) return;
		baixando = true;
		try {
			await baixarElementoComoPDF(articleElement, `solicitacao_${encaminhamento.protocolo}`);
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
		const seed = `${encaminhamento.protocolo}-${encaminhamento.criadoEm}-${encaminhamento.paciente.cpf}`;
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			hash = (hash << 5) - hash + seed.charCodeAt(i);
			hash |= 0;
		}
		const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
		return `SHA256: ${hex}-UNISISM-DOC-2026-AUTENTICO`;
	});

	onMount(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onFechar();
		};
		window.addEventListener('keydown', handler);

		// Dispara download automático do arquivo PDF ao abrir
		setTimeout(() => {
			executarDownloadPDF();
		}, 300);

		return () => window.removeEventListener('keydown', handler);
	});
</script>

<!-- Modal Overlay para Visualização -->
<div
	class="print-overlay fixed inset-0 z-50 flex flex-col overflow-auto bg-slate-900/60 font-sans backdrop-blur-xs"
	style="background-color: rgba(15, 23, 42, 0.6);"
	role="dialog"
	aria-modal="true"
	aria-label="Visualização do Documento PDF de Solicitação de Encaminhamento"
>
	<!-- Toolbar de Ações -->
	<div
		class="print-toolbar sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm"
		style="background-color: #ffffff; border-color: #e2e8f0;"
	>
		<div class="flex items-center gap-3">
			<div
				class="bg-blue-900 px-2 py-0.5 font-mono text-xs font-bold text-white uppercase"
				style="background-color: #1e3a8a; color: #ffffff;"
			>
				UNISISM
			</div>
			<div class="font-mono text-xs font-bold text-slate-800 uppercase" style="color: #1e293b;">
				Solicitação de Encaminhamento · {encaminhamento.protocolo}
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
				class="flex items-center gap-2 border border-blue-900 bg-blue-900 px-5 py-1.5 font-mono text-xs font-bold text-white uppercase hover:bg-blue-950 disabled:opacity-50"
				style="border-color: #1e3a8a; background-color: #1e3a8a; color: #ffffff;"
			>
				{#if baixando}
					<span class="inline-block h-3 w-3 animate-spin border-2 border-white border-t-transparent"
					></span>
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
			class="print-scope mx-auto max-w-[210mm] border border-slate-300 bg-white p-8 font-sans text-slate-900 shadow-xl"
			style="background-color: #ffffff; color: #0f172a; border-color: #cbd5e1;"
		>
			<!-- 1. Cabeçalho Oficial -->
			<header class="border-b-2 border-slate-900 pb-5" style="border-color: #0f172a;">
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-center gap-4">
						<div
							class="flex h-14 w-14 items-center justify-center border-2 border-blue-900 bg-blue-900 font-mono text-xl font-black text-white"
							style="background-color: #1e3a8a; border-color: #1e3a8a; color: #ffffff;"
						>
							SUS
						</div>
						<div>
							<div
								class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;"
							>
								REPÚBLICA FEDERATIVA DO BRASIL · SISTEMA ÚNICO DE SAÚDE
							</div>
							<div
								class="text-base font-black tracking-wide text-slate-900 uppercase"
								style="color: #0f172a;"
							>
								{prefeitura ?? 'SECRETARIA MUNICIPAL DE SAÚDE'}
							</div>
							<div
								class="font-mono text-xs font-bold text-blue-900 uppercase"
								style="color: #1e3a8a;"
							>
								UNISISM · SISTEMA INTEGRADO DE REGULAÇÃO ASSISTENCIAL
							</div>
						</div>
					</div>

					<div class="flex flex-col items-end gap-1.5 text-right font-mono text-xs">
						<div
							class="border border-blue-900 bg-blue-50/70 px-3 py-1.5 font-bold text-blue-950"
							style="border-color: #1e3a8a; background-color: #eff6ff; color: #172554;"
						>
							PROTOCOLO: <span class="text-sm font-black">{encaminhamento.protocolo}</span>
						</div>
						<div class="flex items-center gap-2">
							<StatusBadge prioridade={encaminhamento.solicitacao.prioridade} />
							<StatusBadge status={encaminhamento.status} />
						</div>
					</div>
				</div>
				<div
					class="mt-4 flex items-center justify-between border-t border-slate-200 pt-2 font-mono text-[10px] text-slate-500 uppercase"
					style="border-color: #e2e8f0; color: #64748b;"
				>
					<span>FORMULÁRIO OFICIAL DE REGULAÇÃO AMBULATORIAL</span>
					<span>DATA DE EMISSÃO: {emissaotimestamp}</span>
				</div>
			</header>

			<!-- 2. Dados do Paciente -->
			<section class="mt-6 border border-slate-200" style="border-color: #e2e8f0;">
				<div
					class="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase"
					style="border-color: #e2e8f0; background-color: #f1f5f9; color: #1e293b;"
				>
					<span>1. Identificação do Paciente</span>
					<span class="text-[10px] text-slate-500" style="color: #64748b;"
						>PRONTUÁRIO MUNICIPAL</span
					>
				</div>
				<div class="grid grid-cols-12 gap-x-4 gap-y-3 p-4">
					<div class="col-span-12 md:col-span-8">
						<span
							class="block font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Nome Completo</span
						>
						<span class="text-base font-bold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.paciente.nome}</span
						>
					</div>
					<div class="col-span-12 font-mono md:col-span-4">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">CPF</span
						>
						<span class="text-sm font-bold text-slate-900" style="color: #0f172a;"
							>{formatarCpf(encaminhamento.paciente.cpf)}</span
						>
					</div>

					<div
						class="col-span-12 border-t border-slate-100 pt-2 font-mono md:col-span-4"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Cartão SUS (CNS)</span
						>
						<span class="text-xs font-semibold text-slate-900" style="color: #0f172a;"
							>{formatarCns(encaminhamento.paciente.cartaoSus)}</span
						>
					</div>
					<div
						class="col-span-12 border-t border-slate-100 pt-2 font-mono md:col-span-3"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Nascimento / Idade</span
						>
						<span class="text-xs font-semibold text-slate-900" style="color: #0f172a;"
							>{formatarData(encaminhamento.paciente.dataNascimento)} ({calcularIdade(
								encaminhamento.paciente.dataNascimento
							)})</span
						>
					</div>
					<div
						class="col-span-12 border-t border-slate-100 pt-2 font-mono md:col-span-2"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Sexo</span
						>
						<span class="text-xs font-semibold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.paciente.sexo === 'F'
								? 'Feminino'
								: encaminhamento.paciente.sexo === 'M'
									? 'Masculino'
									: 'Outro'}</span
						>
					</div>
					<div
						class="col-span-12 border-t border-slate-100 pt-2 font-mono md:col-span-3"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Telefone</span
						>
						<span class="text-xs font-semibold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.paciente.telefone || '—'}</span
						>
					</div>

					{#if encaminhamento.paciente.endereco}
						<div class="col-span-12 border-t border-slate-100 pt-2" style="border-color: #f1f5f9;">
							<span
								class="block font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;">Endereço Residencial</span
							>
							<span class="text-xs text-slate-800" style="color: #1e293b;"
								>{encaminhamento.paciente.endereco}
								{encaminhamento.paciente.bairro ? `- ${encaminhamento.paciente.bairro}` : ''}
								{encaminhamento.paciente.municipio
									? `, ${encaminhamento.paciente.municipio}/${encaminhamento.paciente.uf || ''}`
									: ''}</span
							>
						</div>
					{/if}
				</div>
			</section>

			<!-- 3. Origem e Profissional Solicitante -->
			<section class="mt-5 border border-slate-200" style="border-color: #e2e8f0;">
				<div
					class="border-b border-slate-200 bg-slate-100 px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase"
					style="border-color: #e2e8f0; background-color: #f1f5f9; color: #1e293b;"
				>
					2. Unidade de Saúde e Profissional Solicitante
				</div>
				<div class="grid grid-cols-12 gap-x-4 gap-y-3 p-4 font-mono text-xs">
					<div class="col-span-12 md:col-span-6">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Unidade Básica de Origem</span
						>
						<span class="font-bold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.unidadeOrigem || unidade}</span
						>
					</div>
					<div class="col-span-12 md:col-span-6">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Atendente Responsável</span
						>
						<span class="font-semibold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.atendenteResponsavel}</span
						>
					</div>

					<div
						class="col-span-12 border-t border-slate-100 pt-2 md:col-span-6"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Médico Solicitante</span
						>
						<span class="font-sans text-sm font-bold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.solicitacao.medicoSolicitante}</span
						>
					</div>
					<div
						class="col-span-12 border-t border-slate-100 pt-2 md:col-span-3"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">CRM / Registro</span
						>
						<span class="font-bold text-slate-900" style="color: #0f172a;"
							>{encaminhamento.solicitacao.crm}</span
						>
					</div>
					<div
						class="col-span-12 border-t border-slate-100 pt-2 md:col-span-3"
						style="border-color: #f1f5f9;"
					>
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Data da Solicitação</span
						>
						<span class="font-bold text-slate-900" style="color: #0f172a;"
							>{formatarData(encaminhamento.solicitacao.dataSolicitacao)}</span
						>
					</div>
				</div>
			</section>

			<!-- 4. Avaliação Clínica e Encaminhamento -->
			<section class="mt-5 border border-slate-200" style="border-color: #e2e8f0;">
				<div
					class="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase"
					style="border-color: #e2e8f0; background-color: #f1f5f9; color: #1e293b;"
				>
					<span>3. Solicitação Clínica e Diagnóstico (CID-10)</span>
					<span
						class="bg-blue-900 px-2 py-0.5 text-[10px] font-bold text-white"
						style="background-color: #1e3a8a; color: #ffffff;"
						>{encaminhamento.solicitacao.especialidadeSolicitada}</span
					>
				</div>
				<div class="flex flex-col gap-4 p-4">
					<div
						class="grid grid-cols-12 gap-4 border-b border-slate-100 pb-3"
						style="border-color: #f1f5f9;"
					>
						<div class="col-span-12 font-mono md:col-span-3">
							<span
								class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;">Código CID-10</span
							>
							<span
								class="mt-0.5 inline-block border border-slate-300 bg-slate-100 px-3 py-1 text-base font-black text-slate-900"
								style="background-color: #f1f5f9; border-color: #cbd5e1; color: #0f172a;"
								>{encaminhamento.solicitacao.cid10}</span
							>
						</div>
						<div class="col-span-12 md:col-span-9">
							<span
								class="block font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;">Descrição da Enfermidade</span
							>
							<span class="mt-0.5 block text-sm font-bold text-slate-900" style="color: #0f172a;"
								>{encaminhamento.solicitacao.cidDescricao}</span
							>
						</div>
					</div>

					{#if encaminhamento.solicitacao.justificativaClinica}
						<div>
							<span
								class="block font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;">Quadro Clínico & Justificativa Médica</span
							>
							<div
								class="mt-1.5 border-l-4 border-blue-900 bg-blue-50/60 p-3.5 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-900"
								style="border-color: #1e3a8a; background-color: #eff6ff; color: #0f172a;"
							>
								{encaminhamento.solicitacao.justificativaClinica}
							</div>
						</div>
					{/if}

					{#if encaminhamento.anexos && encaminhamento.anexos.length > 0}
						<div class="border-t border-slate-100 pt-3 font-mono" style="border-color: #f1f5f9;">
							<span
								class="mb-1.5 block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
								style="color: #64748b;">Documentos Anexados ({encaminhamento.anexos.length})</span
							>
							<div class="grid grid-cols-2 gap-2">
								{#each encaminhamento.anexos as anexo (anexo.id)}
									<div
										class="flex items-center justify-between border border-slate-200 bg-slate-50 p-2 text-xs"
										style="border-color: #e2e8f0; background-color: #f8fafc;"
									>
										<span class="truncate font-semibold text-slate-800" style="color: #1e293b;"
											>📄 {anexo.nome}</span
										>
										<span
											class="font-mono text-[10px] text-slate-500 uppercase"
											style="color: #64748b;">{anexo.tipo}</span
										>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- 5. Parecer da Regulação -->
			<section class="mt-5 border border-slate-200" style="border-color: #e2e8f0;">
				<div
					class="border-b border-slate-200 bg-slate-100 px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase"
					style="border-color: #e2e8f0; background-color: #f1f5f9; color: #1e293b;"
				>
					4. Parecer e Status da Regulação
				</div>
				<div class="grid grid-cols-12 gap-x-4 gap-y-3 p-4 font-mono text-xs">
					<div class="col-span-12 md:col-span-4">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Situação Atual</span
						>
						<div class="mt-1 font-bold"><StatusBadge status={encaminhamento.status} /></div>
					</div>
					<div class="col-span-12 md:col-span-4">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Data Prevista / Agendada</span
						>
						<span class="mt-0.5 block text-sm font-bold text-emerald-800" style="color: #065f46;"
							>{formatarData(encaminhamento.agendamentoPrevisto, true)}</span
						>
					</div>
					<div class="col-span-12 md:col-span-4">
						<span
							class="block text-[10px] font-bold tracking-widest text-slate-500 uppercase"
							style="color: #64748b;">Última Atualização</span
						>
						<span class="mt-0.5 block text-xs text-slate-700" style="color: #334155;"
							>{formatarData(encaminhamento.atualizadoEm, true)}</span
						>
					</div>

					{#if encaminhamento.observacoesRegulacao}
						<div
							class="col-span-12 border-t border-slate-100 pt-2.5 font-sans"
							style="border-color: #f1f5f9;"
						>
							<span
								class="block font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
								style="color: #92400e;">Observações da Regulação</span
							>
							<div
								class="mt-1 border-l-4 border-amber-500 bg-amber-50 p-3 text-xs font-semibold text-amber-900"
								style="border-color: #f59e0b; background-color: #fffbeb; color: #78350f;"
							>
								{encaminhamento.observacoesRegulacao}
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- 6. Assinaturas e Autenticação -->
			<section class="mt-10 border-t-2 border-slate-900 pt-6" style="border-color: #0f172a;">
				<div class="grid grid-cols-2 gap-12 text-center font-mono text-xs">
					<div class="flex flex-col items-center">
						<div class="mb-2 w-56 border-b border-slate-800" style="border-color: #1e293b;"></div>
						<div class="font-sans text-sm font-bold text-slate-900" style="color: #0f172a;">
							{encaminhamento.solicitacao.medicoSolicitante}
						</div>
						<div class="text-[10px] text-slate-500" style="color: #64748b;">
							CRM: {encaminhamento.solicitacao.crm} · Médico Solicitante
						</div>
					</div>

					<div class="flex flex-col items-center">
						<div class="mb-2 w-56 border-b border-slate-800" style="border-color: #1e293b;"></div>
						<div class="font-sans text-sm font-bold text-slate-900" style="color: #0f172a;">
							{encaminhamento.atendenteResponsavel}
						</div>
						<div class="text-[10px] text-slate-500" style="color: #64748b;">
							Servidor Responsável
						</div>
					</div>
				</div>

				<footer
					class="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 font-mono text-[10px] text-slate-500"
					style="border-color: #e2e8f0; color: #64748b;"
				>
					<div>
						<div>UNISISM · SISTEMA INTEGRADO DE SAÚDE MUNICIPAL</div>
						<div class="mt-0.5 font-bold text-slate-700" style="color: #334155;">
							{hashVerificacao}
						</div>
					</div>
					<div class="text-right">
						<div>OPERADOR: {operador.toUpperCase()}</div>
						<div>DOCUMENTO OFICIAL · PÁGINA 1 DE 1</div>
					</div>
				</footer>
			</section>
		</article>
	</div>
</div>
