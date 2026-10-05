<script lang="ts">
	import { onMount } from 'svelte';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import { api } from '$lib/api';
	import type { UbsMinhaDto } from '$lib/api/types';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import {
		IconUser,
		IconBuildingHospital,
		IconLock,
		IconLogout,
		IconAlertCircle,
		IconCheck,
		IconPhone,
		IconMapPin
	} from '@tabler/icons-svelte';

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
	<title>Meu Perfil · UniSISM Águas Belas</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-6">
	<!-- Top Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
		<div>
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				CADASTRO MUNICIPAL DO USUÁRIO DO SUS
			</div>
			<h1 class="font-mono text-lg font-bold tracking-wide text-slate-900 sm:text-xl uppercase flex items-center gap-2">
				<IconUser size={20} class="text-blue-900" />
				<span>Perfil do Cidadão</span>
			</h1>
			<p class="text-xs text-slate-600 mt-0.5">
				Dados cadastrais, identificação no Cartão SUS e segurança de acesso ao portal.
			</p>
		</div>

		<button
			type="button"
			onclick={handleLogout}
			class="inline-flex items-center gap-1.5 border border-red-700 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-red-800 uppercase hover:bg-red-50 transition-colors"
		>
			<IconLogout size={14} />
			<span>Encerrar Sessão</span>
		</button>
	</div>

	<!-- Perfil Header Card -->
	<div class="border border-slate-200 bg-white p-5 shadow-sm">
		<div class="flex items-center gap-4">
			<div class="h-14 w-14 shrink-0 bg-blue-900 font-mono text-xl font-bold text-white flex items-center justify-center">
				{auth.me?.nome ? auth.me.nome.charAt(0).toUpperCase() : 'P'}
			</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h2 class="font-mono text-base font-bold text-slate-900 uppercase truncate">
						{auth.me?.nome || 'PACIENTE UNISISM'}
					</h2>
					<span class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 uppercase">
						ATIVO NO SUS
					</span>
				</div>
				<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-600">
					<span>CPF: <strong>{auth.me?.cpfFormatado || formatarCpf(auth.me?.cpf)}</strong></span>
					{#if auth.me?.cns}
						<span>CNS: <strong>{auth.me.cns}</strong></span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Informações Pessoais -->
	<div class="border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
			Dados Cadastrais
		</div>

		<div class="p-5 space-y-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
				<div class="border border-slate-200 bg-slate-50 p-3">
					<span class="text-[10px] font-bold text-slate-500 uppercase">Nome Completo</span>
					<p class="font-bold text-slate-900 mt-0.5">{auth.me?.nome || '—'}</p>
				</div>

				<div class="border border-slate-200 bg-slate-50 p-3">
					<span class="text-[10px] font-bold text-slate-500 uppercase">Data de Nascimento</span>
					<p class="font-bold text-slate-900 mt-0.5">{formatarDataNasc(auth.me?.dataNascimento)}</p>
				</div>

				<div class="border border-slate-200 bg-slate-50 p-3">
					<span class="text-[10px] font-bold text-slate-500 uppercase">Telefone / WhatsApp</span>
					<p class="font-bold text-slate-900 mt-0.5">{auth.me?.telefone || 'Não informado'}</p>
				</div>

				<div class="border border-slate-200 bg-slate-50 p-3">
					<span class="text-[10px] font-bold text-slate-500 uppercase">E-mail Cadastrado</span>
					<p class="font-bold text-slate-900 mt-0.5">{auth.me?.email || 'Não informado'}</p>
				</div>

				<div class="border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
					<span class="text-[10px] font-bold text-slate-500 uppercase">Endereço Residencial</span>
					<p class="font-bold text-slate-900 mt-0.5">{auth.me?.endereco || 'Cadastrado junto à UBS de referência'}</p>
				</div>
			</div>

			<p class="font-mono text-[11px] text-slate-500">
				* Para atualizar seu número de telefone, endereço ou documentos civis, compareça à recepção da sua Unidade Básica de Saúde.
			</p>
		</div>
	</div>

	<!-- UBS de Referência -->
	{#if ubs}
		<div class="border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase flex items-center gap-2">
				<IconBuildingHospital size={16} class="text-blue-900" />
				<span>Unidade Básica de Referência</span>
			</div>
			<div class="p-5 font-mono text-xs space-y-2">
				<h3 class="font-bold text-slate-900 text-sm uppercase">{ubs.nome}</h3>
				{#if ubs.endereco}
					<p class="text-slate-600 flex items-center gap-1.5">
						<IconMapPin size={14} class="text-slate-400 shrink-0" />
						<span>{ubs.endereco} {ubs.bairro ? `· ${ubs.bairro}` : ''}</span>
					</p>
				{/if}
				{#if ubs.telefone}
					<p class="text-slate-600 flex items-center gap-1.5">
						<IconPhone size={14} class="text-slate-400 shrink-0" />
						<span>{ubs.telefone}</span>
					</p>
				{/if}
				{#if ubs.horarioFuncionamento}
					<p class="text-slate-500 mt-1">
						HORÁRIO: {ubs.horarioFuncionamento}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Segurança & Acesso -->
	<div class="border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase flex items-center gap-2">
			<IconLock size={16} class="text-blue-900" />
			<span>Segurança da Conta</span>
		</div>

		<div class="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
			<div>
				<p class="font-bold text-slate-900 uppercase">Senha de Acesso ao Portal</p>
				<p class="text-slate-500 text-[11px] font-sans mt-0.5">Altere sua senha pessoal de acesso ao portal web e aplicativo do cidadão.</p>
			</div>
			<button
				type="button"
				onclick={() => (mostrarModalSenha = true)}
				class="border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 transition-colors shrink-0"
			>
				Alterar Senha
			</button>
		</div>
	</div>
</div>

<!-- Modal Alterar Senha -->
{#if mostrarModalSenha}
	<Modal
		isOpen={mostrarModalSenha}
		onClose={() => (mostrarModalSenha = false)}
		title="ALTERAR SENHA DE ACESSO"
		subtitle="Defina uma nova credencial para acesso ao portal"
		maxWidth="sm"
	>
		<div class="space-y-4 p-1">
			{#if erroSenha}
				<div class="p-2.5 bg-red-50 border border-red-700 font-mono text-xs text-red-800 font-bold">
					⚠ {erroSenha}
				</div>
			{/if}

			{#if sucessoSenha}
				<div class="p-2.5 bg-emerald-50 border border-emerald-700 font-mono text-xs text-emerald-800 font-bold">
					✓ {sucessoSenha}
				</div>
			{/if}

			<form onsubmit={handleSubmitTrocarSenha} class="space-y-3 font-mono text-xs">
				<div>
					<label class="block font-bold text-slate-700 mb-1" for="senhaAtual">
						Senha Atual *
					</label>
					<input
						type="password"
						id="senhaAtual"
						bind:value={senhaAtual}
						placeholder="Digite sua senha atual"
						required
						class="w-full border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-900 focus:outline-none"
					/>
				</div>

				<div>
					<label class="block font-bold text-slate-700 mb-1" for="novaSenha">
						Nova Senha * (mínimo 6 caracteres)
					</label>
					<input
						type="password"
						id="novaSenha"
						bind:value={novaSenha}
						placeholder="Mínimo 6 caracteres"
						required
						class="w-full border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-900 focus:outline-none"
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
						placeholder="Repita a nova senha"
						required
						class="w-full border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-900 focus:outline-none"
					/>
				</div>

				<div class="pt-3 flex justify-end gap-2 border-t border-slate-200">
					<button
						type="button"
						onclick={() => (mostrarModalSenha = false)}
						class="border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
					>
						Cancelar
					</button>
					<PrimaryButton
						label="Atualizar Senha"
						type="submit"
						loading={alterandoSenha}
					/>
				</div>
			</form>
		</div>
	</Modal>
{/if}
