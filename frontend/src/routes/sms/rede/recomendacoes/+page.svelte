<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Recomendacao } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * CRUD admin de recomendações por especialidade ("o que levar no dia").
	 * Mostradas pro paciente no detalhe do encaminhamento.
	 *
	 * RBAC: DEV, ADMIN, REGULADOR_SMS. Layout pai garante.
	 */

	let lista = $state<Recomendacao[]>([]);
	let carregando = $state(true);
	let erro = $state('');

	// Form state (compartilhado entre criar e editar)
	let editandoId = $state<string | null>(null);
	let formEspecialidade = $state('');
	let formItens = $state(''); // textarea — 1 item por linha
	let formAtivo = $state(true);
	let salvando = $state(false);
	let formErro = $state('');

	async function carregar() {
		erro = '';
		carregando = true;
		try {
			lista = await api.admin.listRecomendacoes();
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao carregar.';
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	function abrirNovo() {
		editandoId = null;
		formEspecialidade = '';
		formItens = '';
		formAtivo = true;
		formErro = '';
	}

	function abrirEditar(r: Recomendacao) {
		editandoId = r.id;
		formEspecialidade = r.especialidade;
		formItens = r.recomendacoes.join('\n');
		formAtivo = r.ativo;
		formErro = '';
	}

	function cancelarForm() {
		editandoId = null;
		formEspecialidade = '';
		formItens = '';
		formErro = '';
	}

	async function salvar() {
		formErro = '';
		const recs = formItens
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		if (formEspecialidade.trim().length < 3) {
			formErro = 'Especialidade deve ter ao menos 3 caracteres.';
			return;
		}
		if (recs.length === 0) {
			formErro = 'Adicione ao menos uma recomendação (uma por linha).';
			return;
		}
		if (recs.length > 10) {
			formErro = `Máximo 10 recomendações (atual: ${recs.length}).`;
			return;
		}
		salvando = true;
		try {
			if (editandoId) {
				await api.admin.updateRecomendacao(editandoId, {
					especialidade: formEspecialidade.trim(),
					recomendacoes: recs,
					ativo: formAtivo
				});
			} else {
				await api.admin.createRecomendacao({
					especialidade: formEspecialidade.trim(),
					recomendacoes: recs
				});
			}
			await carregar();
			cancelarForm();
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'ESPECIALIDADE_DUPLICADA') {
					formErro = 'Já existe recomendação para esta especialidade — use editar.';
				} else {
					formErro = e.message;
				}
			} else {
				formErro = 'Falha ao salvar.';
			}
		} finally {
			salvando = false;
		}
	}

	async function deletar(r: Recomendacao) {
		if (!confirm(`Remover recomendações para "${r.especialidade}"?`)) return;
		try {
			await api.admin.deleteRecomendacao(r.id);
			await carregar();
		} catch (e) {
			if (e instanceof ApiError) erro = e.message;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Header explicativo -->
	<section class="border border-slate-200 bg-white p-4">
		<h2 class="font-mono text-xs font-bold tracking-widest text-slate-700 uppercase">
			Recomendações por especialidade
		</h2>
		<p class="mt-1 text-sm text-slate-600">
			Mensagens "o que levar no dia" que o paciente vê no detalhe do encaminhamento.
			Cadastre uma vez por especialidade; todo paciente com encaminhamento naquela
			especialidade vê automaticamente.
		</p>
	</section>

	<!-- Form de criar/editar -->
	<section class="border border-slate-200 bg-white">
		<PanelHeader
			title={editandoId ? 'Editar recomendação' : 'Nova recomendação'}
			index="01"
		/>
		<div class="flex flex-col gap-4 p-4">
			<div class="flex flex-col">
				<label
					for="esp"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Especialidade
				</label>
				<input
					id="esp"
					type="text"
					maxlength="80"
					bind:value={formEspecialidade}
					placeholder="Ex.: Cardiologia"
					class="w-full border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
					Use o nome canônico (sem abreviação). Case-insensitive na busca.
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="recs"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Recomendações (uma por linha · máx 10)
				</label>
				<textarea
					id="recs"
					rows="6"
					bind:value={formItens}
					placeholder={`Levar ECG recente (≤ 6 meses)\nLista de medicações em uso\nNão suspender medicação habitual\nChegar com 30 minutos de antecedência`}
					class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
				<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
					Cada linha = 1 bullet no app. Frases curtas (≤ 200 chars).
				</div>
			</div>

			{#if editandoId}
				<div class="flex items-center gap-2">
					<input
						id="ativo"
						type="checkbox"
						bind:checked={formAtivo}
						class="h-4 w-4"
					/>
					<label for="ativo" class="font-mono text-xs tracking-wider text-slate-700 uppercase">
						Ativo (paciente vê)
					</label>
				</div>
			{/if}

			{#if formErro}
				<div
					class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {formErro}
				</div>
			{/if}

			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				{#if editandoId}
					<PrimaryButton label="Cancelar" variant="secondary" onclick={cancelarForm} />
				{:else}
					<PrimaryButton label="Limpar" variant="secondary" onclick={abrirNovo} />
				{/if}
				<PrimaryButton
					label={editandoId ? 'Salvar alterações' : 'Criar recomendação'}
					loading={salvando}
					onclick={salvar}
				/>
			</div>
		</div>
	</section>

	<!-- Lista de existentes -->
	<section class="border border-slate-200 bg-white">
		<PanelHeader title="Especialidades cadastradas" index="02" />
		{#if carregando}
			<div class="p-8 text-center font-mono text-xs tracking-widest text-slate-500 uppercase">
				Carregando...
			</div>
		{:else if erro}
			<div class="m-4 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase">
				⚠ {erro}
			</div>
		{:else if lista.length === 0}
			<div class="p-8 text-center font-mono text-xs tracking-widest text-slate-500 uppercase">
				Nenhuma recomendação cadastrada ainda
			</div>
		{:else}
			<div class="divide-y divide-slate-100">
				{#each lista as r (r.id)}
					<div class="p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<h3 class="font-mono text-sm font-bold text-slate-900">
										{r.especialidade}
									</h3>
									{#if !r.ativo}
										<span class="border border-slate-400 bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest text-slate-600 uppercase">
											Inativo
										</span>
									{/if}
								</div>
								<ul class="mt-2 space-y-1">
									{#each r.recomendacoes as rec (rec)}
										<li class="text-[13px] text-slate-700">
											<span class="mr-2 text-slate-400">•</span>{rec}
										</li>
									{/each}
								</ul>
								<div class="mt-2 font-mono text-[10px] tracking-wider text-slate-400 uppercase">
									{r.recomendacoes.length} {r.recomendacoes.length === 1 ? 'item' : 'itens'}
								</div>
							</div>
							<div class="flex flex-col gap-1">
								<button
									type="button"
									onclick={() => abrirEditar(r)}
									class="border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:bg-slate-50"
								>
									Editar
								</button>
								<button
									type="button"
									onclick={() => deletar(r)}
									class="border border-red-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-red-700 uppercase hover:bg-red-50"
								>
									Remover
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
