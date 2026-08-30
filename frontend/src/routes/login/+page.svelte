<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';

	let usuario = $state('');
	let senha = $state('');
	let lembrar = $state(true);
	let entrando = $state(false);
	let erro = $state('');

	async function entrar() {
		erro = '';
		entrando = true;
		try {
			await api.auth.login({ login: usuario, senha, lembrar });
			const me = await api.auth.me();
			// Rotear pra Face correta com base na role autenticada.
			// ATENDENTE_UBS / COORDENADOR_UBS → /ubs
			// REGULADOR_SMS / ADMIN / DESENVOLVEDOR → /sms
			goto(rbac.faceDestinoPadrao(me.role, me), { replaceState: true });
		} catch (e: any) {
			console.error('[Login] Falha na autenticação:', e);
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

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		entrar();
	}
</script>

<div class="border border-slate-200 bg-white">
	<!-- Cabeçalho do form -->
	<div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
		<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
			AUTENTICAÇÃO
		</div>
		<h2 class="mt-1 font-mono text-lg font-bold text-slate-900">Acessar Terminal</h2>
		<p class="mt-1 text-[11px] text-slate-600">
			Use sua matrícula ou email corporativo da Secretaria de Saúde.
		</p>
	</div>

	<form onsubmit={onSubmit} class="flex flex-col gap-4 p-6">
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
			<a
				href="/login/esqueci-senha"
				class="font-mono text-[11px] font-bold tracking-widest text-blue-900 uppercase hover:underline"
			>
				Esqueci a senha →
			</a>
		</div>

		<PrimaryButton type="submit" label="Entrar" loading={entrando} fullWidth shortcut="↵" />

		<div class="border-t border-slate-100 pt-3 text-center">
			<p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Acesso restrito a servidores da Secretaria Municipal de Saúde.
			</p>
		</div>
	</form>

	<!-- Rodapé com suporte -->
	
</div>
