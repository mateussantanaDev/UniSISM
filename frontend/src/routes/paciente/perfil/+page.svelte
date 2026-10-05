<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';
	import type { UbsMinhaDto } from '$lib/api/types';

	const auth = usePacienteAuth();

	let loading = $state(true);
	let ubs = $state<UbsMinhaDto | null>(null);

	// Modal / Form Trocar Senha
	let mostrarModalSenha = $state(false);
	let senhaAtual = $state('');
	let novaSenha = $state('');
	let confirmaSenha = $state('');
	let erroSenha = $state<string | null>(null);
	let sucessoSenha = $state<string | null>(null);
	let alterandoSenha = $state(false);

	onMount(async () => {
		try {
			ubs = await api.pacienteApp.minhaUbs().catch(() => null);
		} catch (e) {
			console.error('Falha ao carregar UBS do paciente', e);
		} finally {
			loading = false;
		}
	});

	function formatarCpf(v?: string): string {
		if (!v) return '—';
		const digits = v.replace(/\D/g, '');
		if (digits.length !== 11) return v;
		return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
	}

	function formatarDataNasc(v?: string | null): string {
		if (!v) return '—';
		try {
			const d = new Date(v);
			if (isNaN(d.getTime())) return v;
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
		} catch {
			return v;
		}
	}

	async function handleSubmitTrocarSenha(e: SubmitEvent) {
		e.preventDefault();
		erroSenha = null;
		sucessoSenha = null;

		if (!senhaAtual || !novaSenha || !confirmaSenha) {
			erroSenha = 'Preencha todos os campos da senha.';
			return;
		}
		if (novaSenha.length < 6) {
			erroSenha = 'A nova senha deve ter no mínimo 6 caracteres.';
			return;
		}
		if (novaSenha !== confirmaSenha) {
			erroSenha = 'A nova senha e a confirmação não conferem.';
			return;
		}

		alterandoSenha = true;
		try {
			await api.pacienteApp.trocarSenha({ senhaAtual, novaSenha });
			sucessoSenha = 'Senha alterada com sucesso!';
			senhaAtual = '';
			novaSenha = '';
			confirmaSenha = '';
			setTimeout(() => {
				mostrarModalSenha = false;
				sucessoSenha = null;
			}, 1800);
		} catch (e: any) {
			erroSenha = e.message || 'Falha ao alterar senha. Verifique a senha atual informada.';
		} finally {
			alterandoSenha = false;
		}
	}

	async function handleLogout() {
		if (confirm('Deseja realmente sair da sua conta?')) {
			await auth.logout();
		}
	}
</script>

<svelte:head>
	<title>Meu Perfil | UniSISM Cidadão</title>
</svelte:head>

<div class="space-y-6">
	<!-- Perfil Header Card -->
	<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
		<div class="flex items-center gap-4">
			<div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center text-2xl font-black shadow-md shadow-emerald-500/20">
				{auth.me?.nome ? auth.me.nome.charAt(0).toUpperCase() : 'P'}
			</div>
			<div class="flex-1 min-w-0">
				<h1 class="text-xl font-bold text-slate-900 dark:text-white truncate">
					{auth.me?.nome || 'Paciente UniSISM'}
				</h1>
				<p class="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
					CPF: {auth.me?.cpfFormatado || formatarCpf(auth.me?.cpf)}
				</p>
				{#if auth.me?.cns}
					<p class="text-xs text-slate-500 dark:text-slate-400 font-mono">
						CNS: {auth.me.cns}
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Informações Pessoais -->
	<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
		<h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
			<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
			Dados Cadastrais
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
			<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
				<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Nome Completo</span>
				<p class="font-semibold text-slate-900 dark:text-white mt-0.5">{auth.me?.nome || '—'}</p>
			</div>

			<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
				<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Data de Nascimento</span>
				<p class="font-semibold text-slate-900 dark:text-white mt-0.5">{formatarDataNasc(auth.me?.dataNascimento)}</p>
			</div>

			<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
				<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Telefone / WhatsApp</span>
				<p class="font-semibold text-slate-900 dark:text-white mt-0.5">{auth.me?.telefone || 'Não informado'}</p>
			</div>

			<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
				<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">E-mail</span>
				<p class="font-semibold text-slate-900 dark:text-white mt-0.5">{auth.me?.email || 'Não informado'}</p>
			</div>

			<div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl sm:col-span-2">
				<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Endereço Residencial</span>
				<p class="font-semibold text-slate-900 dark:text-white mt-0.5">{auth.me?.endereco || 'Cadastrado junto à UBS'}</p>
			</div>
		</div>

		<p class="text-xs text-slate-400 dark:text-slate-500 italic">
			* Para atualizar telefone, endereço ou documentos, procure a recepção da sua Unidade Básica de Saúde.
		</p>
	</div>

	<!-- UBS de Referência -->
	{#if ubs}
		<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
			<h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
				<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
				Unidade Básica de Referência
			</h2>
			<div class="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl space-y-2">
				<h3 class="font-bold text-slate-900 dark:text-white">{ubs.nome}</h3>
				{#if ubs.endereco}
					<p class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
						<svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
						{ubs.endereco}
					</p>
				{/if}
				{#if ubs.telefone}
					<p class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
						<svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
						{ubs.telefone}
					</p>
				{/if}
				{#if ubs.horarioFuncionamento}
					<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
						Horário: {ubs.horarioFuncionamento}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Segurança & Acesso -->
	<div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
		<h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
			<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
			Segurança da Conta
		</h2>

		<div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl">
			<div>
				<p class="font-bold text-slate-900 dark:text-white text-sm">Senha de Acesso</p>
				<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Altere sua senha pessoal de acesso ao portal e aplicativo.</p>
			</div>
			<button
				type="button"
				onclick={() => (mostrarModalSenha = true)}
				class="px-4 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-xl text-xs font-bold transition shadow-sm"
			>
				Alterar Senha
			</button>
		</div>
	</div>

	<!-- Botão Sair -->
	<div class="pt-2">
		<button
			type="button"
			onclick={handleLogout}
			class="w-full py-3.5 px-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
			Encerrar Sessão (Sair)
		</button>
	</div>
</div>

<!-- Modal Alterar Senha -->
{#if mostrarModalSenha}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
		<div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-bold text-slate-900 dark:text-white">Alterar Senha</h3>
				<button
					type="button"
					onclick={() => (mostrarModalSenha = false)}
					class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 flex items-center justify-center"
				>
					✕
				</button>
			</div>

			{#if erroSenha}
				<div class="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs rounded-xl font-medium">
					{erroSenha}
				</div>
			{/if}

			{#if sucessoSenha}
				<div class="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl font-medium">
					{sucessoSenha}
				</div>
			{/if}

			<form onsubmit={handleSubmitTrocarSenha} class="space-y-3">
				<div>
					<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="senhaAtual">
						Senha Atual
					</label>
					<input
						type="password"
						id="senhaAtual"
						bind:value={senhaAtual}
						placeholder="Digite sua senha atual"
						required
						class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" for="novaSenha">
						Nova Senha
					</label>
					<input
						type="password"
						id="novaSenha"
						bind:value={novaSenha}
						placeholder="Mínimo 6 caracteres"
						required
						class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500"
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
						placeholder="Repita a nova senha"
						required
						class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500"
					/>
				</div>

				<div class="pt-2 flex gap-2">
					<button
						type="button"
						onclick={() => (mostrarModalSenha = false)}
						class="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={alterandoSenha}
						class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50"
					>
						{alterandoSenha ? 'Salvando...' : 'Atualizar'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
