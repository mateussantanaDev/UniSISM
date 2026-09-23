<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import ScanBadge from '$lib/presentation/components/ScanBadge.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';

	let encaminhamento = $state<Encaminhamento | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	let pdfUrl = $state<string | null>(null);
	let carregandoPdf = $state(false);
	let erroPdf = $state<string | null>(null);
	let pdfBlob: Blob | null = null;

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function calcularIdade(dataNasc: string): number {
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
	}

	let anexoResposta = $derived.by(() => {
		if (!encaminhamento?.respostaSUS) return null;
		return encaminhamento.anexos.find((a) => a.id === encaminhamento!.respostaSUS!.anexoId) ?? null;
	});

	async function carregar() {
		const id = page.params.id;
		if (!id) {
			erro = 'ID do encaminhamento ausente na URL.';
			carregando = false;
			return;
		}
		carregando = true;
		erro = null;
		try {
			const e = await api.encaminhamentos.byId(id);
			if (!e.respostaSUS) {
				erro = 'Este encaminhamento ainda não tem resposta do SUS registrada.';
			}
			encaminhamento = e;
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao carregar encaminhamento.';
		} finally {
			carregando = false;
		}
	}

	async function carregarPdf() {
		if (!encaminhamento?.respostaSUS) return;
		const anx = anexoResposta;
		if (!anx) {
			erroPdf = 'Anexo não localizado.';
			return;
		}
		if (anx.scanStatus !== 'LIMPO') {
			erroPdf =
				anx.scanStatus === 'PENDENTE'
					? 'Anexo em verificação de antivírus. Aguarde alguns instantes e recarregue.'
					: 'Anexo bloqueado pelo scan de segurança.';
			return;
		}
		carregandoPdf = true;
		erroPdf = null;
		try {
			const { blob } = await api.encaminhamentos.downloadAnexo(encaminhamento.respostaSUS.anexoId);
			pdfBlob = blob;
			pdfUrl = URL.createObjectURL(blob);
		} catch (e) {
			erroPdf =
				e instanceof ApiError
					? e.code === 'ANEXO_NAO_LIBERADO'
						? 'Anexo ainda em verificação. Tente novamente em instantes.'
						: e.message
					: 'Falha ao carregar PDF.';
		} finally {
			carregandoPdf = false;
		}
	}

	onMount(async () => {
		await carregar();
		await carregarPdf();
	});

	onDestroy(() => {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
	});

	async function baixar() {
		if (!encaminhamento?.respostaSUS) return;
		try {
			let blob = pdfBlob;
			let nome = `resposta-sus-${encaminhamento.protocolo}.pdf`;
			if (!blob) {
				const r = await api.encaminhamentos.downloadAnexo(encaminhamento.respostaSUS.anexoId);
				blob = r.blob;
				if (r.filename) nome = r.filename;
			} else if (anexoResposta?.nome) {
				nome = anexoResposta.nome;
			}
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = nome;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 5_000);
			notificar('ok', 'Download iniciado.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao baixar.');
		}
	}

	function imprimir() {
		if (!pdfUrl) {
			notificar('erro', 'Aguarde o PDF carregar para imprimir.');
			return;
		}
		// Abre em nova aba e dispara o diálogo de impressão.
		const w = window.open(pdfUrl, '_blank');
		if (!w) {
			notificar('erro', 'Pop-up bloqueado. Permita pop-ups para imprimir.');
			return;
		}
		w.addEventListener('load', () => {
			try {
				w.focus();
				w.print();
			} catch {
				// browsers podem precisar de delay extra; o PDF já está visível
			}
		});
	}
</script>

<div class="flex flex-col gap-4">
	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-900'
				: 'border-red-700 bg-red-50 text-red-900'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'}
			{mensagem.texto}
		</div>
	{/if}

	{#if carregando}
		<div
			class="border border-slate-200 bg-white px-6 py-12 text-center font-sans text-sm text-slate-500"
		>
			<div
				class="mx-auto mb-3 h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			Carregando resposta...
		</div>
	{:else if erro}
		<div
			class="border border-red-700 bg-red-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
		<button
			type="button"
			onclick={() => goto('/ubs/respostas-sms')}
			class="self-start border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
		>
			← Voltar para a lista
		</button>
	{:else if encaminhamento}
		<!-- Cabeçalho com ações -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Resposta Oficial do SUS"
				subtitle="Documento devolvido pela regulação federal · paciente notificado"
				index="01"
			>
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onclick={() => goto('/ubs/respostas-sms')}
						class="border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
					>
						← Lista
					</button>
					<PrimaryButton label="Imprimir" variant="secondary" onclick={imprimir} />
					<PrimaryButton label="Baixar PDF" onclick={baixar} />
				</div>
			</PanelHeader>

			<div class="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
				<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Protocolo
					</div>
					<div class="mt-1 font-mono text-sm font-bold text-blue-900">
						{encaminhamento.protocolo}
					</div>
				</div>
				<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Status</div>
					<div class="mt-1.5">
						<StatusBadge status={encaminhamento.status} />
					</div>
				</div>
				<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Recebida em
					</div>
					<div class="mt-1 font-mono text-xs font-bold text-slate-900">
						{encaminhamento.respostaSUS
							? formatarData(encaminhamento.respostaSUS.registradoEm)
							: '—'}
					</div>
				</div>
				<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Registrado por
					</div>
					<div class="mt-1 font-sans text-xs font-semibold text-slate-900">
						{encaminhamento.respostaSUS?.registradoPor.nome ?? '—'}
					</div>
					<div class="font-mono text-[10px] text-slate-500">
						{encaminhamento.respostaSUS?.registradoPor.matricula ?? ''}
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-12 gap-4">
			<!-- Coluna esquerda: paciente + observação -->
			<div class="col-span-12 flex flex-col gap-4 xl:col-span-5">
				<!-- Paciente -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Paciente" index="02" />
					<div class="space-y-1.5 p-4 font-sans text-sm text-slate-900">
						<div class="text-base font-bold">{encaminhamento.paciente.nome}</div>
						<div class="font-mono text-xs text-slate-700">
							CPF · {encaminhamento.paciente.cpf}
						</div>
						<div class="font-mono text-xs text-slate-700">
							{calcularIdade(encaminhamento.paciente.dataNascimento)} anos · nasc.
							{new Date(encaminhamento.paciente.dataNascimento).toLocaleDateString('pt-BR')}
						</div>
						{#if encaminhamento.paciente.telefone}
							<div class="font-mono text-xs text-slate-700">
								Telefone · {encaminhamento.paciente.telefone}
							</div>
						{/if}
					</div>
				</div>

				<!-- Solicitação clínica -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Solicitação Original" index="03" />
					<div class="space-y-1.5 p-4 font-sans text-sm text-slate-900">
						<div>
							<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								Especialidade
							</span>
							<div class="font-semibold">
								{encaminhamento.solicitacao.especialidadeSolicitada}
							</div>
						</div>
						<div>
							<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								CID-10
							</span>
							<div class="font-mono text-sm">
								{encaminhamento.solicitacao.cid10} ·
								<span class="font-sans text-slate-700">
									{encaminhamento.solicitacao.cidDescricao}
								</span>
							</div>
						</div>
						<div>
							<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								Médico Solicitante
							</span>
							<div class="text-slate-900">
								{encaminhamento.solicitacao.medicoSolicitante} · CRM
								{encaminhamento.solicitacao.crm}
							</div>
						</div>
					</div>
				</div>

				<!-- Resumo / observação -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Resumo da Resposta" index="04" />
					<div class="p-4">
						<div
							class="border-l-4 border-purple-700 bg-purple-50 px-3 py-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-purple-900"
						>
							{encaminhamento.respostaSUS?.observacao ?? '—'}
						</div>

						{#if encaminhamento.agendamentoPrevisto}
							<div
								class="mt-3 border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[13px] text-emerald-900"
							>
								Agendamento previsto:
								<strong>
									{new Date(encaminhamento.agendamentoPrevisto).toLocaleDateString('pt-BR')}
								</strong>
							</div>
						{/if}

						{#if anexoResposta}
							<div
								class="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 font-mono text-[11px] text-slate-700"
							>
								<div>
									<span class="text-slate-500">Arquivo:</span>
									<span class="font-bold text-slate-900">{anexoResposta.nome}</span>
								</div>
								<div>
									<span class="text-slate-500">Tamanho:</span>
									{(anexoResposta.tamanhoKb / 1024).toFixed(2)} MB
								</div>
								<div>
									<span class="text-slate-500">Enviado:</span>
									{formatarData(anexoResposta.uploadEm)}
								</div>
								<div class="flex items-center gap-1.5">
									<span class="text-slate-500">Scan:</span>
									<ScanBadge status={anexoResposta.scanStatus} />
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Coluna direita: visualizador de PDF -->
			<div class="col-span-12 xl:col-span-7">
				<div class="border border-slate-200 bg-white">
					<PanelHeader
						title="Documento Oficial · PDF"
						subtitle="Pré-visualização · use Imprimir para enviar à impressora"
						index="05"
					/>

					{#if carregandoPdf}
						<div
							class="flex flex-col items-center justify-center px-6 py-16 font-sans text-sm text-slate-500"
						>
							<div
								class="mb-3 h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
							></div>
							Carregando PDF...
						</div>
					{:else if erroPdf}
						<div
							class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center font-sans text-sm"
						>
							<div
								class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
							>
								⚠ {erroPdf}
							</div>
							<button
								type="button"
								onclick={carregarPdf}
								class="border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
							>
								Tentar novamente
							</button>
						</div>
					{:else if pdfUrl}
						<div class="bg-slate-100 p-2">
							<iframe
								title="Resposta oficial do SUS · {encaminhamento.protocolo}"
								src={pdfUrl}
								class="h-[78vh] w-full border border-slate-300 bg-white"
							></iframe>
						</div>
					{:else}
						<div class="px-6 py-16 text-center font-sans text-sm text-slate-500">
							PDF indisponível.
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
