<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import type { AtualizarMotoristaRequest, CategoriaCNH, Motorista } from '$lib/api/tfd-types';

	/**
	 * Modal-friendly de edição de Motorista TFD.
	 *
	 * - PATCH `/v1/tfd/motoristas/:id` (RBAC: rwGestor).
	 * - CPF NÃO é editável (identidade — backend rejeita).
	 * - Status (ativo/afastado/inativo) é alterado pelas ações de
	 *   `afastar`/`reativar`, não aqui.
	 * - Estatísticas (`totalViagens`, `totalKmRodados`) são derivadas.
	 */
	interface Props {
		motorista: Motorista;
		onCancel: () => void;
		onSaved: (atualizado: Motorista) => void;
	}

	let { motorista, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		nome: motorista.nome,
		cnh: motorista.cnh,
		categoriaCnh: motorista.categoriaCnh,
		validadeCnh: motorista.validadeCnh.slice(0, 10),
		telefone: motorista.telefone
	}));

	let nome = $state(orig.nome);
	let cnh = $state(orig.cnh);
	let categoriaCnh = $state<CategoriaCNH>(orig.categoriaCnh);
	let validadeCnh = $state(orig.validadeCnh);
	let telefone = $state(orig.telefone);

	let enviando = $state(false);
	let erro = $state('');

	const categorias: CategoriaCNH[] = ['B', 'C', 'D', 'E'];

	function diff(): AtualizarMotoristaRequest {
		const out: AtualizarMotoristaRequest = {};
		if (nome.trim() !== orig.nome) out.nome = nome.trim();
		if (cnh.trim() !== orig.cnh) out.cnh = cnh.trim();
		if (categoriaCnh !== orig.categoriaCnh) out.categoriaCnh = categoriaCnh;
		if (validadeCnh.trim() !== orig.validadeCnh) out.validadeCnh = validadeCnh.trim();
		if (telefone.trim() !== orig.telefone) out.telefone = telefone.trim();
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let nomeOk = $derived(nome.trim().length >= 3);
	let cnhOk = $derived(cnh.trim().length >= 9);
	let telefoneOk = $derived(telefone.trim().length >= 8);

	let podeSalvar = $derived(pendente > 0 && !enviando && nomeOk && cnhOk && telefoneOk);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.tfd.motoristas.update(motorista.id, patch);
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'CNH_DUPLICADA' || e.code === 'TFD_MOTORISTA_CNH_DUPLICADA') {
					erro = 'Já existe outro motorista com esta CNH nesta prefeitura.';
				} else if (e.code === 'NENHUMA_ALTERACAO') {
					erro = 'Nenhuma alteração identificada.';
				} else {
					erro = mensagemErroTfd(e);
				}
			} else {
				erro = mensagemErroTfd(e);
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<section
		class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
	>
		CPF é imutável (identidade). Status (ativo/afastado/inativo) é alterado pelas ações no detalhe.
		Atenção à validade da CNH — vencida bloqueia o motorista no app.
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Identificação</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome Completo" name="nome" span={12} bind:value={nome} />
			<FormField
				label="Telefone"
				name="telefone"
				span={4}
				mono
				bind:value={telefone}
				hint="DDD + número"
			/>
		</div>
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">CNH</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Número da CNH" name="cnh" span={5} mono bind:value={cnh} />
			<div class="col-span-3 flex flex-col">
				<label
					for="categoriaCnh"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Categoria
				</label>
				<select
					id="categoriaCnh"
					bind:value={categoriaCnh}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each categorias as c (c)}
						<option value={c}>Categoria {c}</option>
					{/each}
				</select>
			</div>
			<FormField
				label="Validade"
				name="validadeCnh"
				type="date"
				span={4}
				mono
				bind:value={validadeCnh}
			/>
		</div>
	</section>

	{#if erro}
		<div class="border border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-800">
			{erro}
		</div>
	{/if}

	<div class="flex items-center justify-between pt-2">
		<span class="font-sans text-[11px] text-slate-500">
			{pendente === 0
				? 'Nenhum campo alterado'
				: `${pendente} campo${pendente === 1 ? '' : 's'} alterado${pendente === 1 ? '' : 's'}`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} disabled={enviando} />
			<PrimaryButton
				label={enviando ? 'Salvando...' : 'Salvar alterações'}
				onclick={salvar}
				disabled={!podeSalvar}
			/>
		</div>
	</div>
</div>
