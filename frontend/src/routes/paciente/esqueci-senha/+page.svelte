<script lang="ts">
	import { api } from '$lib/api';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { IconLock, IconAlertCircle, IconCheck } from '@tabler/icons-svelte';

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
			successMsg = 'Instruções para redefinição de acesso enviadas para seus dados de contato cadastrados junto à Secretaria de Saúde.';
		} catch (e: any) {
			error = e.message || 'Não foi possível solicitar a recuperação. Verifique se o CPF está cadastrado ou procure sua UBS de referência.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Recuperar Senha · UniSISM Águas Belas</title>
</svelte:head>

<div class="min-h-[70vh] flex flex-col justify-center max-w-md mx-auto py-8 px-4">
	<div class="border border-slate-200 bg-white shadow-sm">
		<!-- Header -->
		<div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
			<div class="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase">
				<span class="inline-block h-2 w-2 bg-blue-900"></span>
				RECUPERAÇÃO DE ACESSO · CIDADÃO
			</div>
			<h1 class="mt-1 font-mono text-lg font-bold text-slate-900 uppercase">
				Recuperar Senha
			</h1>
			<p class="mt-1 text-[11px] text-slate-600">
				Informe seu CPF para receber instruções de redefinição de acesso do portal.
			</p>
		</div>

		<div class="p-6">
			{#if error}
				<div class="mb-4 border border-red-700 bg-red-50 p-2.5 font-mono text-xs font-bold text-red-800">
					⚠ {error}
				</div>
			{/if}

			{#if successMsg}
				<div class="border border-emerald-700 bg-emerald-50 p-4 font-mono text-xs text-emerald-900 space-y-2">
					<p class="font-bold text-sm uppercase">✓ Solicitação Registrada</p>
					<p>{successMsg}</p>
					<p class="text-[11px] text-emerald-800 pt-2 border-t border-emerald-200">
						Caso não receba a mensagem ou não tenha telefone atualizado, dirija-se à recepção da sua UBS portando documento com foto para redefinição presencial.
					</p>
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="flex flex-col gap-4 font-mono text-xs">
					<div>
						<label class="block font-bold text-slate-700 mb-1" for="cpf">
							CPF do Paciente *
						</label>
						<input
							type="text"
							id="cpf"
							inputmode="numeric"
							value={cpf}
							oninput={handleCpfInput}
							placeholder="000.000.000-00"
							required
							class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wide text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
						/>
					</div>

					<PrimaryButton
						type="submit"
						label="Consultar Cadastro"
						loading={loading}
						fullWidth
					/>
				</form>
			{/if}

			<div class="pt-4 border-t border-slate-100 text-center mt-4">
				<a href="/login?aba=paciente" class="font-mono text-[11px] font-bold tracking-widest text-blue-900 uppercase hover:underline">
					← Voltar para a tela de Login
				</a>
			</div>
		</div>
	</div>
</div>
