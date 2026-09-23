<script lang="ts">
	import Dropzone from './Dropzone.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError, type AnexoUpload } from '$lib/api';
	import type { Encaminhamento, TipoAnexo } from '$lib/api/types';

	interface Props {
		encaminhamento: Encaminhamento;
		onCancel: () => void;
		onResolved: (atualizado: Encaminhamento) => void;
	}

	let { encaminhamento, onCancel, onResolved }: Props = $props();

	let novosArquivos = $state<File[]>([]);
	let tipo = $state<TipoAnexo>('LAUDO');
	let nota = $state('');
	let enviando = $state(false);
	let erro = $state('');

	const tiposOpcoes: { valor: TipoAnexo; label: string }[] = [
		{ valor: 'LAUDO', label: 'Laudo Médico' },
		{ valor: 'EXAME', label: 'Exame Laboratorial' },
		{ valor: 'RG', label: 'Documento de Identidade' },
		{ valor: 'CARTAO_SUS', label: 'Cartão SUS' },
		{ valor: 'CPF', label: 'CPF' },
		{ valor: 'SOLICITACAO', label: 'Solicitação Médica (nova versão)' },
		{ valor: 'OUTRO', label: 'Outro Documento' }
	];

	function handleArquivos(files: File[]) {
		novosArquivos = [...novosArquivos, ...files];
	}

	function removerArquivo(index: number) {
		novosArquivos = novosArquivos.filter((_, i) => i !== index);
	}

	async function enviar() {
		erro = '';
		if (novosArquivos.length === 0 && !nota.trim()) {
			erro = 'Anexe pelo menos um documento ou descreva a correção feita.';
			return;
		}

		enviando = true;
		try {
			const anexos: AnexoUpload[] = novosArquivos.map((f) => ({
				arquivo: f,
				nome: f.name,
				tipo
			}));
			const atualizado = await api.encaminhamentos.resolverPendencia(
				encaminhamento.id,
				nota.trim(),
				anexos
			);
			onResolved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'ENCAMINHAMENTO_NAO_EM_PENDENCIA':
						erro = 'Este encaminhamento não está mais em pendência.';
						break;
					case 'NENHUMA_ACAO_FORNECIDA':
						erro = 'Anexe pelo menos um documento ou descreva a correção feita.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para resolver pendências.';
						break;
					default:
						erro = e.message || 'Falha ao reenviar à Regulação.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}

	let observacao = $derived(
		encaminhamento.observacoesRegulacao ||
			'A Regulação solicitou correção ou documentação complementar.'
	);
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<!-- Observação da Regulação -->
	<section>
		<div class="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Observação da Regulação
			</h3>
			<span
				class="border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-800 uppercase"
			>
				PENDÊNCIA ATIVA
			</span>
		</div>
		<div class="border-l-4 border-amber-600 bg-amber-50 px-4 py-3">
			<p class="text-xs leading-relaxed text-amber-900">{observacao}</p>
			<div class="mt-1.5 text-[10px] tracking-widest text-amber-700 uppercase">
				Protocolo · {encaminhamento.protocolo} ·
				{encaminhamento.paciente.nome}
			</div>
		</div>
	</section>

	<!-- Tipo do anexo + Dropzone -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Anexar Documentos da Readequação
			</h3>
		</div>

		<div class="mb-3 flex items-end gap-3">
			<div class="flex flex-col">
				<label
					for="tipo"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Tipo do Documento
				</label>
				<select
					id="tipo"
					bind:value={tipo}
					class="w-64 border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each tiposOpcoes as opt (opt.valor)}
						<option value={opt.valor}>{opt.label}</option>
					{/each}
				</select>
			</div>
			<div class="text-[11px] text-slate-600">
				Selecione o tipo antes de arrastar. Você pode trocar e anexar outros tipos em seguida.
			</div>
		</div>

		<Dropzone
			label="ARRASTE O DOCUMENTO CORRIGIDO"
			sublabel="PDF, JPG ou PNG. Múltiplos arquivos permitidos. Tipo selecionado será aplicado a todos neste upload."
			acceptTypes="application/pdf,image/jpeg,image/png"
			multiple
			mode="simple"
			variant="secondary"
			files={[]}
			onFiles={handleArquivos}
		/>

		{#if novosArquivos.length > 0}
			<ul class="mt-3 divide-y divide-slate-100 border border-slate-200 bg-white">
				{#each novosArquivos as f, i (f.name + i)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 font-mono text-[11px]">
						<div class="flex items-center gap-2">
							<span
								class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-700 uppercase"
							>
								{tiposOpcoes.find((o) => o.valor === tipo)?.label ?? tipo}
							</span>
							<span class="text-slate-800">{f.name}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-slate-500">{(f.size / 1024).toFixed(1)} KB</span>
							<button
								type="button"
								onclick={() => removerArquivo(i)}
								class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
							>
								REMOVER
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Nota de correção -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Nota de Correção ao Regulador
			</h3>
		</div>
		<textarea
			rows="4"
			bind:value={nota}
			placeholder="Descreva o que foi corrigido/complementado. Ex.: Anexado novo laudo do cardiologista com data de 12/04/2026 conforme solicitado."
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
		></textarea>
	</section>

	<!-- Resumo do que acontecerá -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase">
			O que acontece ao enviar
		</div>
		<ul class="space-y-1 text-[11px] text-slate-700">
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>
					{novosArquivos.length} novo{novosArquivos.length === 1 ? '' : 's'} documento{novosArquivos.length ===
					1
						? ''
						: 's'}
					{novosArquivos.length === 1 ? 'será vinculado' : 'serão vinculados'} ao protocolo
					{encaminhamento.protocolo}
				</span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span
					>Status será atualizado de <strong>PENDÊNCIA</strong> para
					<strong>AGUARDANDO REGULAÇÃO</strong></span
				>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>3 eventos serão adicionados à linha do tempo (observação, anexos, reenvio)</span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>Regulação será notificada automaticamente para nova análise</span>
			</li>
		</ul>
	</section>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			{erro}
		</div>
	{/if}

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
		<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
		<PrimaryButton
			label="Reenviar à Regulação"
			onclick={enviar}
			loading={enviando}
			disabled={novosArquivos.length === 0 && !nota.trim()}
		/>
	</div>
</div>
