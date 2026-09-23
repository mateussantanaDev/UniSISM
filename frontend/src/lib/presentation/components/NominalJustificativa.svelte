<script lang="ts">
	import PrimaryButton from './PrimaryButton.svelte';

	interface Props {
		/** Callback chamado com a justificativa já validada (≥ 30 chars). */
		onConfirmar: (justificativa: string) => void;
		onCancelar: () => void;
		/** Gerando = true → desabilita botões (request em voo). */
		gerando?: boolean;
	}

	let { onConfirmar, onCancelar, gerando = false }: Props = $props();

	const MIN = 30;
	let texto = $state('');
	let erro = $state('');

	let caracteres = $derived(texto.trim().length);
	let valido = $derived(caracteres >= MIN);

	function confirmar() {
		erro = '';
		const t = texto.trim();
		if (t.length < MIN) {
			erro = `A justificativa precisa ter pelo menos ${MIN} caracteres (tem ${t.length}).`;
			return;
		}
		onConfirmar(t);
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<!-- Aviso de uso restrito -->
	<div class="border-2 border-amber-600 bg-amber-50 px-3 py-3 font-sans text-[12px] text-amber-900">
		<div class="mb-1 font-mono text-[11px] font-bold tracking-widest uppercase">
			⚠ Relatório Nominal · Uso Restrito
		</div>
		<p>
			Ao confirmar, o relatório de busca ativa incluirá <strong>nomes dos pacientes</strong> com CPF
			e Cartão SUS <strong>mascarados</strong>. O arquivo será marcado como
			<strong>CONFIDENCIAL</strong> e sua justificativa ficará gravada em auditoria por 5 anos, conforme
			LGPD (Art. 37).
		</p>
	</div>

	<!-- Textarea de justificativa -->
	<div class="flex flex-col">
		<label
			for="justificativa"
			class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
		>
			Justificativa (mínimo {MIN} caracteres)
		</label>
		<textarea
			id="justificativa"
			bind:value={texto}
			rows="5"
			placeholder="Ex.: Lista nominal solicitada para campanha de busca ativa de hipertensos no PSF 7, em parceria com a equipe ACS..."
			disabled={gerando}
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50"
		></textarea>
		<div class="mt-1 flex items-center justify-between text-[10px] tracking-wider uppercase">
			<span class="text-slate-500">Registrado em auditoria · LGPD</span>
			<span
				class="font-bold
					{valido ? 'text-emerald-700' : caracteres > 0 ? 'text-amber-700' : 'text-slate-500'}"
			>
				{caracteres}/{MIN}
				{valido ? '✓' : ''}
			</span>
		</div>
	</div>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
		<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancelar} disabled={gerando} />
		<PrimaryButton
			label="Confirmar e Gerar"
			variant="danger"
			onclick={confirmar}
			loading={gerando}
			disabled={!valido}
		/>
	</div>
</div>
