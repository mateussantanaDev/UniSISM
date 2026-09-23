<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { AtualizarPrefeituraRequest, Prefeitura } from '$lib/api/types';

	interface Props {
		prefeitura: Prefeitura;
		onCancel: () => void;
		onSaved: (atualizada: Prefeitura) => void;
	}

	let { prefeitura, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		nome: prefeitura.nome,
		municipio: prefeitura.municipio,
		uf: prefeitura.uf,
		cnpj: prefeitura.cnpj ?? ''
	}));

	let nome = $state(orig.nome);
	let municipio = $state(orig.municipio);
	let uf = $state(orig.uf);
	let cnpj = $state(orig.cnpj);

	let enviando = $state(false);
	let erro = $state('');

	function diff(): AtualizarPrefeituraRequest {
		const out: AtualizarPrefeituraRequest = {};
		if (nome.trim() !== orig.nome) out.nome = nome.trim();
		if (municipio.trim() !== orig.municipio) out.municipio = municipio.trim();
		if (uf.trim().toUpperCase() !== orig.uf.toUpperCase()) out.uf = uf.trim().toUpperCase();
		if (cnpj.trim() !== orig.cnpj) out.cnpj = cnpj.trim() || null;
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let podeSalvar = $derived(pendente > 0 && !enviando && nome.trim().length > 0);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		enviando = true;
		try {
			const atualizada = await api.admin.updatePrefeitura(prefeitura.id, patch);
			onSaved(atualizada);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'NENHUMA_ALTERACAO':
						erro = 'Nenhuma alteração identificada.';
						break;
					case 'CNPJ_EM_USO':
						erro = 'Este CNPJ já está vinculado a outra prefeitura.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Somente DESENVOLVEDOR pode editar prefeituras.';
						break;
					default:
						erro = e.message || 'Falha ao salvar alterações.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
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
		Dados da Prefeitura. Alterações afetam todos os usuários e UBSs vinculados. Auditado.
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Identificação</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome" name="nome" span={12} bind:value={nome} />
			<FormField label="Município" name="municipio" span={7} bind:value={municipio} />
			<FormField label="UF" name="uf" span={2} mono bind:value={uf} />
			<FormField
				label="CNPJ (opcional)"
				name="cnpj"
				span={3}
				mono
				placeholder="00.000.000/0000-00"
				bind:value={cnpj}
			/>
		</div>
	</section>

	<section class="border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
		<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">ID</div>
		<div class="font-mono font-bold">{prefeitura.id}</div>
	</section>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-between gap-2 border-t border-slate-200 pt-4">
		<span class="self-center font-mono text-[10px] tracking-widest text-slate-500 uppercase">
			{pendente === 0 ? 'Sem alterações' : `${pendente} campo(s) pendente(s)`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
			<PrimaryButton
				label="Salvar Alterações"
				onclick={salvar}
				loading={enviando}
				disabled={!podeSalvar}
			/>
		</div>
	</div>
</div>
