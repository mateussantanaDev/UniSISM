<script lang="ts">
	import { api } from '$lib/api';

	let cpf = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let successMsg = $state<string | null>(null);

	function formatarCpf(v: string): string {
		const digits = v.replace(/\D/g, '').slice(0, 11);
		if (digits.length <= 3) return digits;
		if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
		if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
		return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
	}

	function handleCpfInput(e: Event) {
		const target = e.target as HTMLInputElement;
		target.value = formatarCpf(target.value);
		cpf = target.value;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		successMsg = null;

		const digits = cpf.replace(/\D/g, '');
		if (digits.length !== 11) {
			error = 'Por favor, informe um CPF válido com 11 dígitos.';
			return;
		}

		loading = true;
		try {
			await api.pacienteApp.esqueciSenhaPaciente(digits);
			successMsg = 'Instruções para redefinição de acesso enviadas para seus dados de contato cadastrados.';
		} catch (e: any) {
			error = e.message || 'Não foi possível solicitar a recuperação. Verifique se o CPF está cadastrado ou procure sua UBS de referência.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Recuperar Senha | UniSISM Cidadão</title>
</svelte:head>

<div class="min-h-[80vh] flex flex-col justify-center max-w-md mx-auto py-8 px-4">
	<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl space-y-6">
		<div class="text-center space-y-2">
			<div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
				<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
			</div>
			<h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Recuperar Acesso</h1>
			<p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
				Informe seu CPF para receber instruções de redefinição de senha ou orientações da sua UBS.
			</p>
		</div>

		{#if error}
			<div class="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold">
				{error}
			</div>
		{/if}

		{#if successMsg}
			<div class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-emerald-800 dark:text-emerald-200 text-xs space-y-2">
				<p class="font-bold text-sm">Solicitação Registrada!</p>
				<p>{successMsg}</p>
				<p class="text-[11px] opacity-80 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60">
					Se você não receber uma mensagem em instantes, dirija-se à recepção da sua UBS portando documento com foto para redefinição presencial.
				</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="cpf">
						CPF do Paciente
					</label>
					<input
						type="text"
						id="cpf"
						inputmode="numeric"
						value={cpf}
						oninput={handleCpfInput}
						placeholder="000.000.000-00"
						required
						class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-emerald-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
				>
					{loading ? 'Consultando...' : 'Recuperar Minha Senha'}
				</button>
			</form>
		{/if}

		<div class="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
			<a href="/login?aba=paciente" class="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
				← Voltar para a tela de Login
			</a>
		</div>
	</div>
</div>
