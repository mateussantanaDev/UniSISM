/**
 * Utility para conversão de HTML para PDF e download direto no navegador.
 * Utiliza html2pdf.js com higienizador de cores para converter automaticamente
 * qualquer valor oklch de CSS (Tailwind v4) em valores hexadecimais nativos antes do html2canvas.
 */

function converterColorParaRgb(colorStr: string, ctx: CanvasRenderingContext2D | null): string {
	if (!colorStr || !colorStr.includes('oklch') || !ctx) return colorStr;
	try {
		ctx.fillStyle = colorStr;
		return ctx.fillStyle;
	} catch {
		return '#0f172a';
	}
}

export async function baixarElementoComoPDF(element: HTMLElement, filename: string): Promise<void> {
	if (!element) return;
	const nomeFinal = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

	const opt = {
		margin: [8, 8, 8, 8] as [number, number, number, number],
		filename: nomeFinal,
		image: { type: 'jpeg' as const, quality: 0.98 },
		html2canvas: {
			scale: 2,
			useCORS: true,
			logging: false,
			letterRendering: true,
			onclone: (clonedDoc: Document) => {
				const canvas = clonedDoc.createElement('canvas');
				canvas.width = 1;
				canvas.height = 1;
				const ctx = canvas.getContext('2d');

				// Higieniza elementos convertendo oklch para hex/rgb de forma eficiente
				const elements = clonedDoc.querySelectorAll('*');
				for (let i = 0; i < elements.length; i++) {
					const htmlEl = elements[i] as HTMLElement;
					if (!htmlEl || !htmlEl.style) continue;

					try {
						const computed = window.getComputedStyle(htmlEl);
						const corTexto = computed.color;
						const corFundo = computed.backgroundColor;
						const corBorda = computed.borderColor;

						if (corTexto && corTexto.includes('oklch')) {
							htmlEl.style.color = converterColorParaRgb(corTexto, ctx);
						}
						if (corFundo && corFundo.includes('oklch')) {
							htmlEl.style.backgroundColor = converterColorParaRgb(corFundo, ctx);
						}
						if (corBorda && corBorda.includes('oklch')) {
							htmlEl.style.borderColor = converterColorParaRgb(corBorda, ctx);
						}
					} catch {
						/* ignora elementos sem estilo computado */
					}
				}

				// Descarta o canvas temporário para liberação imediata de memória
				canvas.width = 0;
				canvas.height = 0;
			}
		},
		jsPDF: {
			unit: 'mm',
			format: 'a4',
			orientation: 'portrait' as const
		}
	};

	try {
		// Lazy-load html2pdf.js sob demanda para não onerar o bundle inicial da aplicação
		// @ts-ignore
		const html2pdfModule = await import('html2pdf.js');
		const html2pdf = html2pdfModule.default || html2pdfModule;
		await html2pdf().set(opt).from(element).save();
	} catch (err) {
		console.error('[UniSISM] Erro ao gerar e baixar PDF:', err);
	}
}
