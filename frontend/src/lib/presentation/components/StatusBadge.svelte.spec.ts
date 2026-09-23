import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PrimaryButton from './PrimaryButton.svelte';
import ScanBadge from './ScanBadge.svelte';
import StatusBadge from './StatusBadge.svelte';

describe('componentes visuais compartilhados', () => {
	it('renderiza status de encaminhamento com o texto operacional correto', async () => {
		const screen = await render(StatusBadge, { status: 'APROVADO' });

		await expect.element(screen.getByText('APROVADO')).toBeVisible();
	});

	it('renderiza selo de scan com estado e acessibilidade por titulo', async () => {
		const screen = await render(ScanBadge, { status: 'LIMPO' });

		await expect.element(screen.getByTitle(/download liberado/i)).toBeVisible();
		await expect.element(screen.getByText('LIMPO')).toBeVisible();
	});

	it('executa acao do botao primario quando habilitado', async () => {
		const onclick = vi.fn();
		const screen = await render(PrimaryButton, { label: 'Salvar', onclick });

		await screen.getByRole('button', { name: 'Salvar' }).click();

		expect(onclick).toHaveBeenCalledTimes(1);
	});
});
