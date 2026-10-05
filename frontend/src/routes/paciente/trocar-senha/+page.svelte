<script lang="ts">
	import { goto } from '$app/navigation';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';

	const auth = usePacienteAuth();

	let senhaAtual = $state('');
	let novaSenha = $state('');
	let confirmaSenha = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		success = null;

		if (!senhaAtual || !novaSenha || !confirmaSenha) {
			error = 'Preencha todos os campos para continuar.';
			return;
		}

		if (novaSenha.length < 6) {
			error = 'A nova senha deve possuir pelo menos 6 caracteres.';
			return;
		}

		if (novaSenha !== confirmaSenha) {
			error = 'A confirmação de senha não confere com a nova senha.';
			return;
		}

		loading = true;
		try {
			await api.pacienteApp.trocarSenha({ senhaAtual, novaSenha });
			success = 'Senha redefinida com sucesso! Redirecionando para o portal...';
			await auth.refresh();
			setTimeout(() => {
				goto('/paciente');
			}, 1500);
		} catch (e: any) {
			error = e.message || 'Falha ao redefinir a senha. Verifique a senha atual informada.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Definir Nova Senha | UniSISM Cidadão</title>
</svelte:head>

<div class="min-h-[80vh] flex flex-col justify-center max-w-md mx-auto py-8 px-4">
	<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl space-y-6">
		<!-- Header -->
		<div class="text-center space-y-2">
			<div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
				<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
			</div>
			<h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Definir Nova Senha</h1>
			<p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
				Por segurança, altere sua senha de acesso antes de continuar navegando.
			</p>
		</div>

		{#if error}
			<div class="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
				{success}
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="senhaAtual">
					Senha Atual / Temporária
				</label>
				<input
					type="password"
					id="senhaAtual"
					bind:value={senhaAtual}
					placeholder="Sua senha atual ou provisória"
					required
					class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500"
				/>
			</div>

			<div>
				<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="novaSenha">
					Nova Senha Segura
				</label>
				<input
					type="password"
					id="novaSenha"
					bind:value={novaSenha}
					placeholder="Mínimo de 6 dígitos"
					required
					class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500"
				/>
			</div>

			<div>
				<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="confirmaSenha">
					Confirmar Nova Senha
				</label>
				<input
					type="password"
					id="confirmaSenha"
					bind:value={confirmaSenha}
					placeholder="Digite a mesma senha novamente"
					required
					class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
			>
				{loading ? 'Salvando...' : 'Salvar Nova Senha'}
			</button>
		</form>
	</div>
</div>
