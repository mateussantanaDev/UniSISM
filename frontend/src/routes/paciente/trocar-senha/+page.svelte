<script lang="ts">
	import { goto } from '$app/navigation';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { IconLock, IconShieldCheck, IconAlertCircle } from '@tabler/icons-svelte';

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
	<title>Definir Nova Senha · UniSISM Águas Belas</title>
</svelte:head>

<div class="min-h-[70vh] flex flex-col justify-center max-w-md mx-auto py-8 px-4">
	<div class="border border-slate-200 bg-white shadow-sm">
		<!-- Header -->
		<div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
			<div class="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase">
				<span class="inline-block h-2 w-2 bg-blue-900"></span>
				SEGURANÇA DA CONTA · CIDADÃO
			</div>
			<h1 class="mt-1 font-mono text-lg font-bold text-slate-900 uppercase">
				Definir Nova Senha
			</h1>
			<p class="mt-1 text-[11px] text-slate-600">
				Por segurança, altere sua senha de acesso antes de continuar navegando no portal.
			</p>
		</div>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4 p-6 font-mono text-xs">
			{#if error}
				<div class="border border-red-700 bg-red-50 p-2.5 font-bold text-red-800">
					⚠ {error}
				</div>
			{/if}

			{#if success}
				<div class="border border-emerald-700 bg-emerald-50 p-2.5 font-bold text-emerald-800">
					✓ {success}
				</div>
			{/if}

			<div>
				<label class="block font-bold text-slate-700 mb-1" for="senhaAtual">
					Senha Atual ou Provisória *
				</label>
				<input
					type="password"
					id="senhaAtual"
					bind:value={senhaAtual}
					placeholder="••••••••"
					required
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
				/>
			</div>

			<div>
				<label class="block font-bold text-slate-700 mb-1" for="novaSenha">
					Nova Senha Segura * (mínimo 6 caracteres)
				</label>
				<input
					type="password"
					id="novaSenha"
					bind:value={novaSenha}
					placeholder="••••••••"
					required
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
				/>
			</div>

			<div>
				<label class="block font-bold text-slate-700 mb-1" for="confirmaSenha">
					Confirmar Nova Senha *
				</label>
				<input
					type="password"
					id="confirmaSenha"
					bind:value={confirmaSenha}
					placeholder="••••••••"
					required
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
				/>
			</div>

			<PrimaryButton
				type="submit"
				label="Salvar Nova Senha"
				loading={loading}
				fullWidth
			/>

			<div class="border-t border-slate-100 pt-3 text-center">
				<a href="/paciente" class="font-mono text-[11px] font-bold tracking-wider text-slate-600 hover:text-slate-900 uppercase hover:underline">
					Cancelar e voltar ao painel
				</a>
			</div>
		</form>
	</div>
</div>
