<script lang="ts">
	import PrimaryButton from '../PrimaryButton.svelte';

	interface Props {
		mensagem: string;
		detalhe?: string;
		labelConfirmar?: string;
		processando?: boolean;
		onConfirmar: () => void;
		onCancelar: () => void;
	}

	let {
		mensagem,
		detalhe = '',
		labelConfirmar = 'Sim, Remover',
		processando = false,
		onConfirmar,
		onCancelar
	}: Props = $props();
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div class="border-2 border-red-700 bg-red-50 px-3 py-3 font-sans text-[12px] text-red-900">
		<strong class="font-mono tracking-wider uppercase">Atenção</strong>
		<p class="mt-1">{mensagem}</p>
		{#if detalhe}
			<p class="mt-1 font-mono text-[11px] text-red-800">{detalhe}</p>
		{/if}
	</div>

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
		<PrimaryButton
			label="Cancelar"
			variant="secondary"
			onclick={onCancelar}
			disabled={processando}
		/>
		<PrimaryButton
			label={labelConfirmar}
			variant="danger"
			onclick={onConfirmar}
			loading={processando}
		/>
	</div>
</div>
