<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { IconUser, IconBuildingHospital, IconAlertCircle } from '@tabler/icons-svelte';

	let pronto = $state(false);
	let abaAtiva = $state<'equipe' | 'paciente'>('equipe');

	onMount(() => {
		pronto = true;
		const tipo = page.url.searchParams.get('tipo') || page.url.searchParams.get('aba');
		if (tipo === 'paciente') {
			abaAtiva = 'paciente';
		}
	});

	// Campos Servidor / Equipe
	let usuario = $state('');
	let senha = $state('');
	let lembrar = $state(true);

	// Campos Paciente / Cidadão
	let pacienteCpf = $state('');
	let pacienteSenha = $state('');

	let entrando = $state(false);
	let erro = $state('');

	function formatarCpf(val: string) {
		const nums = val.replace(/\D/g, '').slice(0, 11);
		if (nums.length <= 3) return nums;
		if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`;
		if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`;
		return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`;
	}

	function handleCpfInput(e: Event) {
		const target = e.target as HTMLInputElement;
		pacienteCpf = formatarCpf(target.value);
	}

	async function entrarEquipe() {
		erro = '';
		entrando = true;
		try {
			const login = await api.auth.login({ login: usuario, senha, lembrar });
			if (login.trocaSenhaObrigatoria) {
				await goto('/login/trocar-senha', { replaceState: true });
				return;
			}
			const me = await api.auth.me();
			goto(rbac.faceDestinoPadrao(me.role, me), { replaceState: true });
		} catch (e: any) {
			console.error('[Login] Falha na autenticação da equipe:', e);
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'CREDENCIAIS_INVALIDAS':
						erro = 'Login ou senha inválidos.';
						break;
					case 'USUARIO_BLOQUEADO':
						erro = 'Usuário bloqueado por excesso de tentativas. Tente em 30 minutos.';
						break;
					case 'USUARIO_INATIVO':
						erro = 'Usuário desativado. Contate o RH da Secretaria.';
						break;
					case 'SENHA_EXPIRADA':
						erro = 'Sua senha expirou — redirecionando para redefinição...';
						setTimeout(() => goto('/login/esqueci-senha'), 1200);
						break;
					default:
						erro = e.message || 'Falha ao autenticar.';
				}
			} else {
				erro = e?.message ? `Erro: ${e.message}` : 'Falha de conexão com o servidor.';
			}
		} finally {
			entrando = false;
		}
	}

	async function entrarPaciente() {
		erro = '';
		const cpfDigits = pacienteCpf.replace(/\D/g, '');
		if (cpfDigits.length !== 11) {
			erro = 'Informe um CPF válido com 11 dígitos.';
			return;
		}
		if (!pacienteSenha.trim()) {
			erro = 'Informe sua senha de acesso.';
			return;
		}

		entrando = true;
		try {
			const res = await api.pacienteApp.login({
				cpf: cpfDigits,
				senha: pacienteSenha
			});

			if (res.paciente?.senhaProvisoria) {
				await goto('/paciente/trocar-senha', { replaceState: true });
				return;
			}

			await goto('/paciente', { replaceState: true });
		} catch (e: any) {
			console.error('[Login Paciente] Falha na autenticação:', e);
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'CREDENCIAIS_INVALIDAS':
						erro = 'CPF ou senha incorretos. Primeiro acesso? Tente usar os números do seu CPF como senha.';
						break;
					case 'USUARIO_BLOQUEADO':
						erro = 'Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.';
						break;
					case 'PACIENTE_SEM_CONTA':
						erro = 'Conta de paciente não localizada. Procure sua UBS para cadastramento.';
						break;
					default:
						erro = e.message || 'Não foi possível entrar no portal do paciente.';
				}
			} else {
				erro = e?.message ? `Erro: ${e.message}` : 'Falha de conexão com o servidor.';
			}
		} finally {
			entrando = false;
		}
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (abaAtiva === 'paciente') {
			entrarPaciente();
		} else {
			entrarEquipe();
		}
	}
</script>

<svelte:head>
	<title>{abaAtiva === 'paciente' ? 'Portal do Paciente · UniSISM' : 'Acessar Terminal · UniSISM'}</title>
</svelte:head>

<div class="border border-slate-200 bg-white shadow-sm">
	<!-- Seletor de Abas -->
	<div class="grid grid-cols-2 border-b border-slate-200 bg-slate-100/70 font-mono text-xs font-bold">
		<button
			type="button"
			onclick={() => { abaAtiva = 'equipe'; erro = ''; }}
			class="flex items-center justify-center gap-2 border-r border-slate-200 py-3.5 px-4 transition-all {abaAtiva === 'equipe'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}"
		>
			<IconBuildingHospital size={16} />
			<span>Profissional / Equipe</span>
		</button>
		<button
			type="button"
			onclick={() => { abaAtiva = 'paciente'; erro = ''; }}
			class="flex items-center justify-center gap-2 py-3.5 px-4 transition-all {abaAtiva === 'paciente'
				? 'border-b-2 border-b-blue-900 bg-white text-blue-950 font-black'
				: 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}"
		>
			<IconUser size={16} class={abaAtiva === 'paciente' ? 'text-blue-900' : ''} />
			<span>Sou Paciente / Cidadão</span>
		</button>
	</div>

	<!-- Cabeçalho do form -->
	<div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
		{#if abaAtiva === 'paciente'}
			<div class="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase">
				<span class="inline-block h-2 w-2 bg-blue-900"></span>
				ACESSO DO CIDADÃO · ÁGUAS BELAS - PE
			</div>
			<h2 class="mt-1 font-mono text-lg font-bold text-slate-900">Portal do Paciente</h2>
			<p class="mt-1 text-[11px] text-slate-600">
				Acompanhe encaminhamentos, solicite viagens TFD e consulte seu prontuário digital.
			</p>
		{:else}
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				AUTENTICAÇÃO SERVIDOR
			</div>
			<h2 class="mt-1 font-mono text-lg font-bold text-slate-900">Acessar Terminal</h2>
			<p class="mt-1 text-[11px] text-slate-600">
				Use sua matrícula ou email corporativo da Secretaria de Saúde.
			</p>
		{/if}
	</div>

	<form method="post" onsubmit={onSubmit} class="flex flex-col gap-4 p-6">
		<noscript>Ative o JavaScript para acessar o terminal com segurança.</noscript>

		{#if abaAtiva === 'paciente'}
			<!-- Formulário do Paciente -->
			<div class="flex flex-col gap-3">
				<div>
					<label for="cpf-paciente" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
						CPF do Paciente
					</label>
					<input
						id="cpf-paciente"
						type="text"
						inputmode="numeric"
						placeholder="000.000.000-00"
						value={pacienteCpf}
						oninput={handleCpfInput}
						class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wide text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
					/>
				</div>

				<div>
					<label for="senha-paciente" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
						Senha
					</label>
					<input
						id="senha-paciente"
						type="password"
						placeholder="••••••••"
						bind:value={pacienteSenha}
						class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-none"
					/>
				</div>

				<div class="border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-950 flex items-start gap-2">
					<IconAlertCircle size={16} class="shrink-0 text-blue-900 mt-0.5" />
					<div>
						<strong>Primeiro acesso?</strong> Digite os 11 números do seu CPF no campo de senha para ativar seu acesso.
					</div>
				</div>
			</div>
		{:else}
			<!-- Formulário da Equipe -->
			<div class="grid grid-cols-12 gap-3">
				<FormField
					label="Matrícula ou Email Corporativo"
					name="usuario"
					placeholder="Ex.: SMS-047291 ou email@saude.gov.br"
					span={12}
					mono
					bind:value={usuario}
				/>
				<FormField
					label="Senha"
					name="senha"
					type="password"
					placeholder="••••••••"
					span={12}
					bind:value={senha}
				/>
			</div>
		{/if}

		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex items-center justify-between text-xs">
			<label
				class="flex items-center gap-2 font-mono text-[11px] tracking-wider text-slate-700 uppercase"
			>
				<input
					type="checkbox"
					bind:checked={lembrar}
					class="h-3.5 w-3.5 border-slate-300 text-blue-900 focus:ring-blue-900"
				/>
				Lembrar neste dispositivo
			</label>
			{#if abaAtiva === 'paciente'}
				<a
					href="/paciente/esqueci-senha"
					class="font-mono text-[11px] font-bold tracking-widest text-blue-900 uppercase hover:underline"
				>
					Esqueci a senha →
				</a>
			{:else}
				<a
					href="/login/esqueci-senha"
					class="font-mono text-[11px] font-bold tracking-widest text-blue-900 uppercase hover:underline"
				>
					Esqueci a senha →
				</a>
			{/if}
		</div>

		<PrimaryButton
			type="submit"
			label={abaAtiva === 'paciente' ? 'Acessar Portal do Paciente' : 'Entrar no Terminal'}
			disabled={!pronto}
			loading={entrando}
			fullWidth
			shortcut="↵"
		/>

		<div class="border-t border-slate-100 pt-3 text-center">
			{#if abaAtiva === 'paciente'}
				<p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Ambiente seguro para cidadãos do município de Águas Belas - PE.
				</p>
			{:else}
				<p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Acesso restrito a servidores da Secretaria Municipal de Saúde.
				</p>
			{/if}
		</div>
	</form>
</div>
