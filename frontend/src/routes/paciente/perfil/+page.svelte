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
		IconPhone,
		IconMapPin,
		IconChevronRight
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
	<title>Meu Perfil · UniSISM</title>
</svelte:head>

<div class="space-y-4">
	<!-- Perfil Card do Aplicativo -->
	<div class="border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex items-center gap-3.5">
			<div class="h-14 w-14 shrink-0 bg-blue-900 font-mono text-xl font-bold text-white flex items-center justify-center">
				{auth.me?.nome ? auth.me.nome.charAt(0).toUpperCase() : 'P'}
			</div>
			<div class="flex-1 min-w-0">
				<h2 class="font-mono text-base font-bold text-slate-900 uppercase truncate">
					{auth.me?.nome || 'Paciente'}
				</h2>
				<div class="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-600">
					<span>CPF: <strong>{auth.me?.cpfFormatado || formatarCpf(auth.me?.cpf)}</strong></span>
					<span class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-800 uppercase">
						CADASTRO ATIVO
					</span>
				</div>
				{#if auth.me?.cns}
					<div class="mt-0.5 font-mono text-[11px] text-slate-500">
						CNS: {auth.me.cns}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Meus Dados Cadastrais -->
	<div class="border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-slate-900 uppercase flex items-center gap-2">
			<IconUser size={16} class="text-blue-900" />
			<span>Meus Dados</span>
		</div>

		<div class="divide-y divide-slate-100 text-xs font-mono">
			<div class="p-3 flex items-center justify-between">
				<span class="text-slate-500 uppercase">Nome</span>
				<span class="font-bold text-slate-900 text-right">{auth.me?.nome || '—'}</span>
			</div>
			<div class="p-3 flex items-center justify-between">
				<span class="text-slate-500 uppercase">Nascimento</span>
				<span class="font-bold text-slate-900 text-right">{formatarDataNasc(auth.me?.dataNascimento)}</span>
			</div>
			<div class="p-3 flex items-center justify-between">
				<span class="text-slate-500 uppercase">Telefone</span>
				<span class="font-bold text-slate-900 text-right">{auth.me?.telefone || 'Não informado'}</span>
			</div>
			<div class="p-3 flex items-center justify-between">
				<span class="text-slate-500 uppercase">E-mail</span>
				<span class="font-bold text-slate-900 text-right">{auth.me?.email || 'Não informado'}</span>
			</div>
			<div class="p-3 flex flex-col gap-1">
				<span class="text-slate-500 uppercase">Endereço</span>
				<span class="font-bold text-slate-900">{auth.me?.endereco || 'Cadastrado na UBS de referência'}</span>
			</div>
		</div>
	</div>

	<!-- Minha UBS de Referência -->
	{#if ubs}
		<div class="border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-slate-900 uppercase flex items-center gap-2">
				<IconBuildingHospital size={16} class="text-blue-900" />
				<span>Minha UBS de Referência</span>
			</div>
			<div class="p-4 space-y-3 font-mono text-xs">
				<div>
					<h3 class="font-bold text-slate-900 uppercase">{ubs.nome}</h3>
					{#if ubs.endereco}
						<p class="text-slate-600 flex items-center gap-1.5 mt-1">
							<IconMapPin size={14} class="text-slate-400 shrink-0" />
							<span>{ubs.endereco} {ubs.bairro ? `· ${ubs.bairro}` : ''}</span>
						</p>
					{/if}
					{#if ubs.horarioFuncionamento}
						<p class="text-slate-500 text-[11px] mt-0.5">
							{ubs.horarioFuncionamento}
						</p>
					{/if}
				</div>

				{#if ubs.telefone || ubs.whatsapp}
					<div class="flex items-center gap-2 pt-2 border-t border-slate-100">
						{#if ubs.telefone}
							<a
								href="tel:{ubs.telefone.replace(/\D/g, '')}"
								class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 uppercase hover:bg-slate-50"
							>
								<IconPhone size={14} />
								<span>Ligar</span>
							</a>
						{/if}
						{#if ubs.whatsapp}
							<a
								href="https://wa.me/55{ubs.whatsapp.replace(/\D/g, '')}"
								target="_blank"
								rel="noreferrer"
								class="inline-flex items-center gap-1.5 border border-emerald-700 bg-emerald-700 px-3 py-1.5 font-mono text-xs font-bold text-white uppercase hover:bg-emerald-800"
							>
								<span>WhatsApp</span>
							</a>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Opções de Conta -->
	<div class="border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 font-mono text-xs">
		<button
			type="button"
			onclick={() => (mostrarModalSenha = true)}
			class="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
		>
			<div class="flex items-center gap-2.5">
				<IconLock size={16} class="text-blue-900" />
				<div>
					<div class="font-bold text-slate-900 uppercase">Alterar Senha</div>
					<div class="text-[11px] text-slate-500 font-sans">Atualize sua senha de acesso ao aplicativo</div>
				</div>
			</div>
			<IconChevronRight size={16} class="text-slate-400" />
		</button>

		<button
			type="button"
			onclick={handleLogout}
			class="w-full p-4 flex items-center justify-between text-left hover:bg-red-50 transition-colors text-red-800"
		>
			<div class="flex items-center gap-2.5">
				<IconLogout size={16} class="text-red-700" />
				<div>
					<div class="font-bold uppercase">Sair da Conta</div>
					<div class="text-[11px] text-red-600 font-sans">Encerrar sessão neste dispositivo</div>
				</div>
			</div>
			<IconChevronRight size={16} class="text-red-400" />
		</button>
	</div>
</div>

<!-- Modal Alterar Senha -->
{#if mostrarModalSenha}
	<Modal
		isOpen={mostrarModalSenha}
		onClose={() => (mostrarModalSenha = false)}
		title="ALTERAR SENHA"
		subtitle="Defina uma nova senha para acessar o aplicativo"
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
						label="Salvar"
						type="submit"
						loading={alterandoSenha}
					/>
				</div>
			</form>
		</div>
	</Modal>
{/if}
