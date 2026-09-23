<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { AtualizarUbsRequest, Ubs } from '$lib/api/types';

	interface Props {
		ubs: Ubs;
		onCancel: () => void;
		onSaved: (atualizada: Ubs) => void;
	}

	let { ubs, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		nome: ubs.nome,
		municipio: ubs.municipio,
		uf: ubs.uf,
		endereco: ubs.endereco ?? '',
		cnes: ubs.cnes ?? ''
	}));

	let nome = $state(orig.nome);
	let municipio = $state(orig.municipio);
	let uf = $state(orig.uf);
	let endereco = $state(orig.endereco);
	let cnes = $state(orig.cnes);

	let enviando = $state(false);
	let erro = $state('');

	function diff(): AtualizarUbsRequest {
		const out: AtualizarUbsRequest = {};
		if (nome.trim() !== orig.nome) out.nome = nome.trim();
		if (municipio.trim() !== orig.municipio) out.municipio = municipio.trim();
		if (uf.trim().toUpperCase() !== orig.uf.toUpperCase()) out.uf = uf.trim().toUpperCase();
		if (endereco.trim() !== orig.endereco) out.endereco = endereco.trim() || null;
		if (cnes.trim() !== orig.cnes) out.cnes = cnes.trim() || null;
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
			const atualizada = await api.admin.updateUbs(ubs.id, patch);
			onSaved(atualizada);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'NENHUMA_ALTERACAO':
						erro = 'Nenhuma alteração identificada.';
						break;
					case 'CNES_EM_USO':
						erro = 'Este CNES já está vinculado a outra UBS.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para editar esta UBS.';
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
		Alterações são auditadas. A prefeitura associada não pode ser alterada por aqui — exige migração
		deliberada pelo DESENVOLVEDOR.
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Identificação</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome da Unidade" name="nome" span={12} bind:value={nome} />
			<FormField
				label="CNES (7 dígitos)"
				name="cnes"
				span={4}
				mono
				placeholder="Opcional"
				bind:value={cnes}
			/>
			<FormField label="Município" name="municipio" span={6} bind:value={municipio} />
			<FormField label="UF" name="uf" span={2} mono bind:value={uf} />
			<FormField
				label="Endereço"
				name="endereco"
				span={12}
				placeholder="Opcional"
				bind:value={endereco}
			/>
		</div>
	</section>

	<section
		class="grid grid-cols-2 gap-3 border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700"
	>
		<div>
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Prefeitura</div>
			<div class="font-mono font-bold">{ubs.prefeitura?.nome ?? ubs.prefeituraId}</div>
		</div>
		<div>
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Status</div>
			<div class="font-mono font-bold">{ubs.ativa ? 'ATIVA' : 'INATIVA'}</div>
		</div>
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
