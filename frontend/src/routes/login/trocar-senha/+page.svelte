<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	let senhaAtual = $state('');
	let novaSenha = $state('');
	let confirmacao = $state('');
	let erro = $state('');
	let salvando = $state(false);
	let concluido = $state(false);
	let pronto = $state(false);
	onMount(() => {
		pronto = true;
		if (!api.tokens.get()) goto('/login', { replaceState: true });
	});
	async function salvar(event: SubmitEvent) {
		event.preventDefault();
		erro = '';
		if (novaSenha.length < 8) { erro = 'A nova senha deve ter ao menos 8 caracteres.'; return; }
		if (novaSenha !== confirmacao) { erro = 'A confirmação não corresponde à nova senha.'; return; }
		if (novaSenha === senhaAtual) { erro = 'Escolha uma senha diferente da senha provisória.'; return; }
		salvando = true;
		try {
			await api.perfil.changePassword({ senhaAtual, novaSenha });
			api.tokens.set(null);
			senhaAtual = novaSenha = confirmacao = '';
			concluido = true;
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Não foi possível alterar a senha. Tente novamente.';
		} finally { salvando = false; }
	}
</script>

<svelte:head><title>Definir nova senha · UniSISM</title></svelte:head>
<div class="border border-slate-200 bg-white p-6">
	<h2 class="text-lg font-bold text-slate-900">Definir nova senha</h2>
	{#if concluido}
		<p class="my-4 text-sm" role="status">Senha alterada. Entre novamente com sua nova senha.</p>
		<a class="font-bold text-blue-900 underline" href="/login">Voltar para o login</a>
	{:else}
		<p class="my-4 text-sm text-slate-600">Sua senha foi redefinida pela administração. Escolha uma nova senha para acessar o terminal.</p>
		<form method="post" onsubmit={salvar} class="flex flex-col gap-4">
			<noscript>Ative o JavaScript para alterar sua senha com segurança.</noscript>
			<FormField label="Senha provisória" name="senhaAtual" type="password" bind:value={senhaAtual} />
			<FormField label="Nova senha" name="novaSenha" type="password" bind:value={novaSenha} />
			<FormField label="Confirmar nova senha" name="confirmacao" type="password" bind:value={confirmacao} />
			{#if erro}<p role="alert" class="text-sm text-red-800">{erro}</p>{/if}
			<PrimaryButton type="submit" label="Salvar nova senha" disabled={!pronto} loading={salvando} fullWidth />
		</form>
	{/if}
</div>
