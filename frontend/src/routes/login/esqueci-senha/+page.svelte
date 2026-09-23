<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { goto } from '$app/navigation';

	type Passo = 1 | 2 | 3 | 4;

	let passo = $state<Passo>(1);
	let login = $state('');
	let codigo = $state('');
	let resetToken = $state('');
	let novaSenha = $state('');
	let confirmar = $state('');

	let processando = $state(false);
	let erro = $state('');

	async function enviarCodigo() {
		erro = '';
		if (!login) {
			erro = 'Informe matrícula ou email corporativo.';
			return;
		}
		processando = true;
		try {
			await api.auth.forgotPassword({ login });
			passo = 2;
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao solicitar redefinição.';
		} finally {
			processando = false;
		}
	}

	async function validarCodigo() {
		erro = '';
		if (codigo.length !== 6) {
			erro = 'O código deve ter 6 dígitos.';
			return;
		}
		processando = true;
		try {
			const r = await api.auth.verifyCode({ login, codigo });
			if (r.valido && r.resetToken) {
				resetToken = r.resetToken;
				passo = 3;
			} else {
				erro = 'Código inválido ou expirado.';
			}
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao verificar código.';
		} finally {
			processando = false;
		}
	}

	async function confirmarNovaSenha() {
		erro = '';
		if (novaSenha.length < 8) {
			erro = 'A nova senha deve ter pelo menos 8 caracteres.';
			return;
		}
		if (novaSenha !== confirmar) {
			erro = 'A confirmação não confere com a nova senha.';
			return;
		}
		processando = true;
		try {
			await api.auth.resetPassword({ resetToken, novaSenha });
			passo = 4;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'SENHA_FRACA':
						erro = 'Senha não atende à política. Use ao menos 8 caracteres.';
						break;
					case 'TOKEN_EXPIRADO':
						erro = 'O código expirou. Reinicie o fluxo.';
						break;
					case 'TOKEN_INVALIDO':
						erro = 'Token inválido. Reinicie o fluxo.';
						break;
					default:
						erro = e.message || 'Falha ao redefinir senha.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			processando = false;
		}
	}

	function reiniciar() {
		codigo = '';
		resetToken = '';
		erro = '';
		passo = 1;
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (passo === 1) enviarCodigo();
		else if (passo === 2) validarCodigo();
		else if (passo === 3) confirmarNovaSenha();
	}

	const passosLabel = {
		1: { titulo: 'Recuperar Senha', sub: 'Informe sua matrícula ou email corporativo' },
		2: { titulo: 'Verificar Código', sub: 'Digite o código de 6 dígitos enviado ao seu email' },
		3: { titulo: 'Nova Senha', sub: 'Defina uma nova senha de acesso' },
		4: { titulo: 'Senha Redefinida', sub: 'Sua senha foi atualizada com sucesso' }
	} as const;
</script>

<div class="border border-slate-200 bg-white">
	<!-- Cabeçalho -->
	<div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
		<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
			RECUPERAÇÃO DE ACESSO · PASSO {passo === 4 ? 3 : passo} DE 3
		</div>
		<h2 class="mt-1 font-mono text-lg font-bold text-slate-900">
			{passosLabel[passo].titulo}
		</h2>
		<p class="mt-1 text-[11px] text-slate-600">{passosLabel[passo].sub}</p>
	</div>

	<!-- Stepper compacto -->
	<div class="flex items-stretch border-b border-slate-200 bg-white">
		{#each [1, 2, 3] as n (n)}
			{@const atual = passo === n || (passo === 4 && n === 3)}
			{@const concluido = (passo > n && passo <= 4) || (passo === 4 && n < 3)}
			<div
				class="flex flex-1 items-center gap-2 border-r border-slate-200 px-3 py-2 last:border-r-0"
			>
				<span
					class="flex h-6 w-6 items-center justify-center border font-mono text-[11px] font-bold
						{concluido || (passo === 4 && n === 3)
						? 'border-emerald-700 bg-emerald-700 text-white'
						: atual
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-400'}"
				>
					{concluido || (passo === 4 && n === 3) ? '✓' : n}
				</span>
				<span
					class="font-mono text-[10px] font-bold tracking-widest uppercase
						{atual
						? 'text-blue-900'
						: concluido || (passo === 4 && n === 3)
							? 'text-slate-900'
							: 'text-slate-400'}"
				>
					{n === 1 ? 'Identificar' : n === 2 ? 'Verificar' : 'Redefinir'}
				</span>
			</div>
		{/each}
	</div>

	<form onsubmit={onSubmit} class="flex flex-col gap-4 p-6">
		{#if passo === 1}
			<FormField
				label="Matrícula ou Email Corporativo"
				name="login"
				placeholder="Ex.: SMS-047291 ou email@saude.gov.br"
				span={12}
				mono
				bind:value={login}
			/>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
				Um código de 6 dígitos será enviado ao email cadastrado no RH da Secretaria. O código expira
				em 10 minutos.
			</div>
		{:else if passo === 2}
			<FormField
				label="Código de Verificação (6 dígitos)"
				name="codigo"
				placeholder="000000"
				span={12}
				mono
				bind:value={codigo}
			/>
			<div class="flex items-center justify-between text-[11px] text-slate-600">
				<span>
					Código enviado para <strong class="font-mono">{login}</strong>
				</span>
				<button
					type="button"
					onclick={reiniciar}
					class="font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:underline"
				>
					← Reenviar
				</button>
			</div>
		{:else if passo === 3}
			<div class="grid grid-cols-12 gap-3">
				<FormField
					label="Nova Senha (mín. 8 caracteres)"
					name="novaSenha"
					type="password"
					span={12}
					bind:value={novaSenha}
				/>
				<FormField
					label="Confirmar Nova Senha"
					name="confirmar"
					type="password"
					span={12}
					bind:value={confirmar}
				/>
			</div>
			<div
				class="border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[10px] tracking-wider text-slate-600 uppercase"
			>
				A senha deve ter no mínimo 8 caracteres. Sessões ativas em outros dispositivos serão
				encerradas.
			</div>
		{:else if passo === 4}
			<div class="border-2 border-emerald-700 bg-emerald-50 px-4 py-5 text-center">
				<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
					✓ SENHA REDEFINIDA COM SUCESSO
				</div>
				<p class="mt-2 text-xs text-emerald-800">
					Sua senha foi atualizada. Volte à tela de login para acessar o sistema com a nova
					credencial.
				</p>
			</div>
		{/if}

		{#if erro && passo !== 4}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex justify-between gap-2">
			{#if passo === 4}
				<div></div>
				<PrimaryButton label="Voltar ao Login" onclick={() => goto('/login')} fullWidth />
			{:else}
				<PrimaryButton label="Cancelar" variant="secondary" onclick={() => goto('/login')} />
				<PrimaryButton
					type="submit"
					label={passo === 1 ? 'Enviar Código' : passo === 2 ? 'Verificar' : 'Redefinir Senha'}
					loading={processando}
					shortcut="↵"
				/>
			{/if}
		</div>
	</form>

	<!-- Rodapé -->
	<div
		class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
	>
		<a href="/login" class="hover:text-blue-900">← VOLTAR AO LOGIN</a>
		<span>SUPORTE · Secretaria Municipal de Saúde</span>
	</div>
</div>
