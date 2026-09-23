<script lang="ts">
	import Modal from './Modal.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api } from '$lib/api';
	import { mensagemErroSms } from '$lib/api/erros-sms';
	import type { AnexoDocumento } from '$lib/api/types';

	/**
	 * Trinca de ações universais para qualquer anexo de encaminhamento.
	 *
	 * - Visualizar → abre um modal com `<iframe>` apontando para o blob
	 *   carregado em memória (motor PDF nativo do navegador). Para imagens
	 *   usa `<img>`. Texto/outros formatos abrem direto na nova aba.
	 *
	 * - Baixar → abre uma nova aba com o arquivo. O Chrome/Firefox/Edge
	 *   modernos exibem o PDF no visualizador nativo, com botões de
	 *   imprimir/baixar/zoom — exatamente o "PDF tab" pedido.
	 *
	 * - Compartilhar → quando disponível, usa Web Share API para enviar
	 *   o arquivo (mobile / Edge / Safari). Fallback: copia para a área
	 *   de transferência o protocolo + nome do anexo (não vaza link com
	 *   token de auth).
	 *
	 * Todos respeitam `scanStatus`: enquanto não estiver `LIMPO`, as ações
	 * ficam desabilitadas com tooltip explicando.
	 */

	interface Props {
		anexo: AnexoDocumento;
		/** Protocolo do encaminhamento para nomear o arquivo no compartilhar. */
		protocoloEncaminhamento?: string;
		/** Tamanho do botão (compacto para tabelas). */
		size?: 'sm' | 'md';
		/** Quando o usuário pede compartilhar via fallback (clipboard) — para feedback. */
		onMensagem?: (tipo: 'ok' | 'erro', texto: string) => void;
	}

	let { anexo, protocoloEncaminhamento, size = 'md', onMensagem }: Props = $props();

	let visualizarAberto = $state(false);
	let visualUrl = $state<string | null>(null);
	let baixandoVisual = $state(false);
	let erroVisual = $state<string | null>(null);

	let processando = $state(false);

	const ehLimpo = $derived(anexo.scanStatus === 'LIMPO');
	const tooltipScan = $derived.by(() => {
		switch (anexo.scanStatus) {
			case 'LIMPO':
				return '';
			case 'PENDENTE':
				return 'Aguardando verificação de antivírus.';
			case 'INFECTADO':
				return 'Arquivo bloqueado pelo scan de segurança.';
			default:
				return 'Arquivo indisponível.';
		}
	});

	const ehPdf = $derived.by(() => {
		const n = (anexo.nome ?? '').toLowerCase();
		return n.endsWith('.pdf');
	});
	const ehImagem = $derived.by(() => {
		const n = (anexo.nome ?? '').toLowerCase();
		return /\.(png|jpe?g|webp|gif|bmp)$/i.test(n);
	});

	function nomeFinal(fallback?: string): string {
		if (anexo.nome) return anexo.nome;
		const proto = protocoloEncaminhamento ? `-${protocoloEncaminhamento}` : '';
		return fallback ?? `anexo${proto}.pdf`;
	}

	async function carregarBlob(): Promise<{ blob: Blob; filename: string } | null> {
		try {
			return await api.encaminhamentos.downloadAnexo(anexo.id);
		} catch (e) {
			onMensagem?.('erro', mensagemErroSms(e));
			return null;
		}
	}

	async function abrirVisualizar() {
		if (!ehLimpo) return;
		visualizarAberto = true;
		erroVisual = null;
		if (visualUrl) return; // já carregado
		baixandoVisual = true;
		try {
			const r = await carregarBlob();
			if (!r) {
				erroVisual = 'Não foi possível abrir o documento.';
				return;
			}
			visualUrl = URL.createObjectURL(r.blob);
		} finally {
			baixandoVisual = false;
		}
	}

	function fecharVisualizar() {
		visualizarAberto = false;
		// Mantém o URL em memória até o usuário sair da página — assim
		// reabrir o modal é instantâneo. Cleanup é feito por GC nativo.
	}

	async function baixar() {
		if (!ehLimpo || processando) return;
		processando = true;
		try {
			const r = await carregarBlob();
			if (!r) return;
			// Abre numa nova aba — o navegador usa seu próprio visualizador PDF,
			// que já oferece "baixar" e "imprimir" no chrome/cabeçalho da aba.
			const url = URL.createObjectURL(r.blob);
			const w = window.open(url, '_blank', 'noopener');
			if (!w) {
				// pop-up bloqueado: faz fallback para download direto
				const a = document.createElement('a');
				a.href = url;
				a.download = nomeFinal(r.filename);
				document.body.appendChild(a);
				a.click();
				a.remove();
				onMensagem?.(
					'ok',
					'Pop-up bloqueado — fizemos download direto. Para abrir em nova aba, libere pop-ups deste site.'
				);
			}
			// Revoga depois de tempo suficiente para o navegador renderizar
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} finally {
			processando = false;
		}
	}

	async function compartilhar() {
		if (!ehLimpo || processando) return;
		processando = true;
		try {
			const r = await carregarBlob();
			if (!r) return;
			const filename = nomeFinal(r.filename);
			const file = new File([r.blob], filename, {
				type: r.blob.type || (ehPdf ? 'application/pdf' : 'application/octet-stream')
			});

			// 1) Web Share API com arquivo (Android/iOS/Edge)
			const nav = navigator as Navigator & {
				canShare?: (data?: ShareData) => boolean;
				share?: (data?: ShareData) => Promise<void>;
			};
			if (nav.share && nav.canShare?.({ files: [file] })) {
				try {
					await nav.share({
						files: [file],
						title: protocoloEncaminhamento
							? `Anexo · ${protocoloEncaminhamento}`
							: 'Anexo do encaminhamento',
						text: protocoloEncaminhamento
							? `Encaminhamento ${protocoloEncaminhamento} · ${filename}`
							: filename
					});
					onMensagem?.('ok', 'Documento compartilhado.');
					return;
				} catch (e) {
					// Usuário cancelou ou compartilhamento falhou — cair pro fallback.
					if ((e as DOMException).name === 'AbortError') return;
				}
			}

			// 2) Web Share API só com texto (alguns browsers)
			if (nav.share) {
				try {
					await nav.share({
						title: protocoloEncaminhamento
							? `Anexo · ${protocoloEncaminhamento}`
							: 'Anexo do encaminhamento',
						text: protocoloEncaminhamento
							? `Encaminhamento ${protocoloEncaminhamento} · ${filename}`
							: filename
					});
					onMensagem?.('ok', 'Referência compartilhada.');
					return;
				} catch {
					// fallback abaixo
				}
			}

			// 3) Fallback: copia o protocolo + nome do anexo no clipboard
			const texto = protocoloEncaminhamento
				? `Encaminhamento ${protocoloEncaminhamento} · anexo: ${filename}`
				: `Anexo: ${filename}`;
			try {
				await navigator.clipboard.writeText(texto);
				onMensagem?.(
					'ok',
					'Compartilhamento direto não suportado neste navegador — referência copiada.'
				);
			} catch {
				onMensagem?.(
					'erro',
					'Compartilhamento direto não suportado neste navegador. Use "Baixar" e envie o arquivo manualmente.'
				);
			}
		} finally {
			processando = false;
		}
	}

	const btnBase = $derived(
		size === 'sm'
			? 'border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase'
			: 'border px-3 py-1 font-mono text-[11px] font-bold tracking-widest uppercase'
	);
</script>

<div class="flex flex-wrap items-center gap-1.5">
	<button
		type="button"
		onclick={abrirVisualizar}
		disabled={!ehLimpo}
		title={ehLimpo ? 'Visualizar no navegador' : tooltipScan}
		class="{btnBase}
			{ehLimpo
			? 'border-blue-900 bg-blue-50 text-blue-900 hover:bg-blue-100'
			: 'cursor-not-allowed border-slate-300 bg-slate-50 text-slate-400'}"
	>
		Visualizar
	</button>
	<button
		type="button"
		onclick={baixar}
		disabled={!ehLimpo || processando}
		title={ehLimpo ? 'Abrir em nova aba (visualizador PDF nativo)' : tooltipScan}
		class="{btnBase}
			{ehLimpo
			? 'border-slate-400 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'
			: 'cursor-not-allowed border-slate-300 bg-slate-50 text-slate-400'}"
	>
		{processando ? 'Abrindo…' : 'Baixar'}
	</button>
	<button
		type="button"
		onclick={compartilhar}
		disabled={!ehLimpo || processando}
		title={ehLimpo ? 'Compartilhar (Web Share API ou clipboard)' : tooltipScan}
		class="{btnBase}
			{ehLimpo
			? 'border-slate-400 bg-white text-slate-700 hover:border-emerald-700 hover:text-emerald-800'
			: 'cursor-not-allowed border-slate-300 bg-slate-50 text-slate-400'}"
	>
		Compartilhar
	</button>
</div>

<!-- Modal de visualização interna (iframe + motor PDF nativo) -->
<Modal
	isOpen={visualizarAberto}
	onClose={fecharVisualizar}
	title={anexo.nome}
	subtitle="Visualização · motor PDF nativo do navegador"
	maxWidth="xl"
>
	<div class="flex h-[78vh] w-full flex-col bg-slate-100">
		{#if baixandoVisual}
			<div class="flex flex-1 flex-col items-center justify-center text-slate-500">
				<div
					class="mb-3 h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
				></div>
				<span class="font-mono text-xs tracking-widest uppercase">Carregando documento…</span>
			</div>
		{:else if erroVisual}
			<div class="flex flex-1 items-center justify-center px-6 text-center">
				<div
					class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {erroVisual}
				</div>
			</div>
		{:else if visualUrl && ehPdf}
			<iframe title={anexo.nome} src={visualUrl} class="h-full w-full border-0 bg-white"></iframe>
		{:else if visualUrl && ehImagem}
			<div class="flex flex-1 items-center justify-center overflow-auto p-3">
				<img src={visualUrl} alt={anexo.nome} class="max-h-full max-w-full object-contain" />
			</div>
		{:else if visualUrl}
			<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<div class="font-mono text-xs tracking-widest text-slate-600 uppercase">
					Pré-visualização não suportada para este formato.
				</div>
				<PrimaryButton label="Abrir em nova aba" onclick={baixar} />
			</div>
		{/if}
	</div>
</Modal>
