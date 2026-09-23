<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Prefeitura } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	const auth = useAuth();

	let prefeituras = $state<Prefeitura[]>([]);
	let nome = $state('');
	let municipio = $state('');
	let uf = $state('BA');
	let prefeituraId = $state('');
	let endereco = $state('');
	let cnes = $state('');

	let enviando = $state(false);
	let erro = $state('');
	let sucesso = $state(false);

	onMount(async () => {
		try {
			prefeituras = await api.admin.listPrefeituras();
			// Se ADMIN, pré-seleciona a própria prefeitura (só há 1 retornado).
			if (prefeituras.length === 1) {
				prefeituraId = prefeituras[0].id;
				if (!municipio) municipio = prefeituras[0].municipio;
				if (!uf) uf = prefeituras[0].uf;
			}
		} catch {
			erro = 'Falha ao carregar prefeituras disponíveis.';
		}
	});

	async function enviar() {
		erro = '';
		if (!nome.trim() || !municipio.trim() || !uf.trim() || !prefeituraId) {
			erro = 'Preencha nome, município, UF e prefeitura.';
			return;
		}
		enviando = true;
		try {
			await api.admin.createUbs({
				nome: nome.trim(),
				municipio: municipio.trim(),
				uf: uf.trim().toUpperCase(),
				prefeituraId,
				endereco: endereco.trim() || undefined,
				cnes: cnes.trim() || undefined
			});
			sucesso = true;
			setTimeout(() => goto('/sms/rede/ubs'), 1200);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'UBS_DUPLICADA':
						erro = 'Já existe uma UBS com esse CNES cadastrado.';
						break;
					case 'PREFEITURA_NAO_ENCONTRADA':
						erro = 'Prefeitura inválida ou fora do seu escopo.';
						break;
					case 'FORA_DO_ESCOPO':
						erro = 'Você não pode criar UBS nessa prefeitura.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Permissão insuficiente para criar UBS.';
						break;
					default:
						erro = e.message || 'Falha ao criar UBS.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		enviar();
	}
</script>

{#if !auth.podeCriarUbs}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">
			Apenas ADMIN da prefeitura ou DESENVOLVEDOR podem criar UBSs.
		</p>
	</div>
{:else if sucesso}
	<div class="border-2 border-emerald-700 bg-emerald-50 p-6">
		<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
			✓ UBS CRIADA COM SUCESSO
		</div>
		<div class="mt-2 text-xs text-emerald-900">Redirecionando para a lista...</div>
	</div>
{:else}
	<form onsubmit={onSubmit} class="border border-slate-200 bg-white">
		<PanelHeader
			title="Nova UBS"
			subtitle="Cadastro de unidade básica de saúde na rede"
			index="01"
		/>

		<div class="grid grid-cols-12 gap-3 p-4">
			<FormField label="Nome da UBS" name="nome" span={12} bind:value={nome} />

			<div class="col-span-6 flex flex-col">
				<label
					for="prefeituraId"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Prefeitura
				</label>
				<select
					id="prefeituraId"
					bind:value={prefeituraId}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="">— Selecione —</option>
					{#each prefeituras as p (p.id)}
						<option value={p.id}>{p.nome}</option>
					{/each}
				</select>
			</div>
			<FormField label="CNES" name="cnes" span={3} mono bind:value={cnes} />
			<FormField label="Município" name="municipio" span={3} bind:value={municipio} />
			<FormField label="UF" name="uf" span={1} mono bind:value={uf} />
			<FormField label="Endereço (opcional)" name="endereco" span={11} bind:value={endereco} />
		</div>

		{#if erro}
			<div
				class="mx-4 mb-3 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => goto('/sms/rede/ubs')} />
			<PrimaryButton label="Cadastrar UBS" type="submit" loading={enviando} />
		</div>
	</form>
{/if}
