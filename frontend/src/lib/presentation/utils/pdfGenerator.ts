/**
 * Utility para conversão de HTML para PDF e download direto no navegador.
 * Utiliza html2pdf.js com higienizador de cores para converter automaticamente
 * qualquer valor oklch de CSS (Tailwind v4) em valores hexadecimais nativos antes do html2canvas.
 */

// @ts-ignore
import html2pdf from 'html2pdf.js';

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

				// Higieniza todos os elementos clonados convertendo oklch para hex/rgb
				const elements = clonedDoc.querySelectorAll('*');
				elements.forEach((el) => {
					const htmlEl = el as HTMLElement;
					if (!htmlEl || !htmlEl.style) return;

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
				});
			}
		},
		jsPDF: {
			unit: 'mm',
			format: 'a4',
			orientation: 'portrait' as const
		}
	};

	try {
		await html2pdf().set(opt).from(element).save();
	} catch (err) {
		console.error('[UniSISM] Erro ao gerar e baixar PDF:', err);
	}
}
