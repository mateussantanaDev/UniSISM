<script lang="ts">
	/**
	 * Tela web pública de redefinição de senha do PACIENTE (Face 3).
	 *
	 * Acessada via link enviado por email pelo backend
	 * (`POST /v1/paciente-app/auth/esqueci-senha`):
	 *
	 *   https://app.unisism.aguasbelas.pe.gov.br/redefinir?t=<token-64-hex>
	 *
	 * Fluxo:
	 *   1. Lê `?t=` da URL
	 *   2. Valida formato local (64 hex)
	 *   3. Pede nova senha + confirmação
	 *   4. POST /v1/paciente-app/auth/redefinir-senha {token, novaSenha}
	 *   5. Sucesso → mostra tela de confirmação com botão para login
	 *
	 * Erros mapeados (toast vermelho na UI):
	 *   - 404 TOKEN_INVALIDO       → "Link inválido. Solicite um novo."
	 *   - 409 TOKEN_JA_USADO       → "Este link já foi usado."
	 *   - 401 TOKEN_EXPIRADO       → "O link expirou (válido 30min)."
	 *   - 422 SENHA_FRACA          → mensagem do backend
	 *   - 422 SENHA_IGUAL_ATUAL    → "A nova senha deve ser diferente."
	 *   - 429 RATE_LIMIT_EXCEDIDO  → "Muitas tentativas. Aguarde."
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { dev } from '$app/environment';
	import { api, ApiError } from '$lib/api';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';

	/**
	 * CSP renderizada via Svelte para permitir relaxar em DEV.
	 *
	 * Produção: `script-src 'self'` — bloqueia totalmente XSS via inline.
	 * DEV: precisa 'unsafe-inline' + 'unsafe-eval' + ws://localhost para o
	 *      Vite HMR funcionar. Em prod o bundle é externo, não há inline.
	 *
	 * `connect-src` em prod usa `https:` curinga genérico (white-label) —
	 * cada tenant aponta seu domínio. Em DEV precisa de localhost:3333 +
	 * ws://localhost:5173 (HMR).
	 */
	const cspContent = dev
		? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:3333 ws://localhost:5173; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
		: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

	let token = $state('');
	let novaSenha = $state('');
	let confirmacao = $state('');
	let mostrarSenha = $state(false);
	let processando = $state(false);
	let erro = $state('');
	let concluido = $state(false);

	onMount(() => {
		const t = page.url.searchParams.get('t') ?? '';
		token = t.trim();
		if (!token) {
			erro = 'Link inválido — token ausente.';
		} else if (!/^[a-f0-9]{32,128}$/i.test(token)) {
			erro = 'Link inválido — formato incorreto.';
		}
	});

	// Validação client-side (espelha backend `validarSenhaForte`).
	function validarLocal(): string | null {
		if (!novaSenha) return 'Informe a nova senha.';
		if (novaSenha.length < 8) return 'Senha muito curta — mínimo 8 caracteres.';
		if (novaSenha.length > 128) return 'Senha muito longa.';
		if (/^\d+$/.test(novaSenha)) return 'Senha não pode ser apenas números.';
		if (/^(.)\1{7,}$/.test(novaSenha)) return 'Senha muito fraca — evite repetir o mesmo caractere.';
		const comuns = ['12345678', '87654321', '01234567', 'password', 'senha123', '11111111'];
		if (comuns.includes(novaSenha.toLowerCase())) {
			return 'Senha muito comum — escolha uma diferente.';
		}
		if (novaSenha !== confirmacao) return 'As senhas não conferem.';
		return null;
	}

	async function enviar() {
		erro = '';
		const motivo = validarLocal();
		if (motivo) {
			erro = motivo;
			return;
		}
		if (!token) {
			erro = 'Token ausente — solicite um novo link.';
			return;
		}
		processando = true;
		try {
			await api.pacienteApp.redefinirSenhaPaciente(token, novaSenha);
			concluido = true;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'TOKEN_INVALIDO':
						erro = 'Link inválido. Solicite um novo na tela de recuperação.';
						break;
					case 'TOKEN_JA_USADO':
						erro = 'Este link já foi usado — você pode logar com a nova senha.';
						break;
					case 'TOKEN_EXPIRADO':
						erro = 'O link expirou (válido 30 minutos). Solicite um novo.';
						break;
					case 'SENHA_FRACA':
						erro = e.message;
						break;
					case 'SENHA_IGUAL_ATUAL':
						erro = 'A nova senha deve ser diferente da senha atual.';
						break;
					case 'RATE_LIMIT_EXCEDIDO':
						erro = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
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
</script>

<svelte:head>
	<title>Redefinir senha · UNISISM</title>
	<meta name="robots" content="noindex,nofollow" />
	<!--
		CSP defesa em profundidade. Em prod o Caddy aplica CSP global; em DEV
		(sem proxy reverso) essa meta é a única camada. Bloqueia:
		- scripts inline/eval (`script-src 'self'`)
		- envio de dados pra terceiros (`form-action 'self'` + `connect-src 'self'`)
		- iframe externo (`frame-ancestors 'none'`)
	-->
	<meta http-equiv="content-security-policy" content={cspContent} />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
	<div class="w-full max-w-md border border-slate-200 bg-white p-6 shadow-sm">
		<header class="mb-5 border-b border-slate-200 pb-4">
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				UNISISM · Secretaria Municipal de Saúde
			</div>
			<h1 class="mt-1 font-serif text-xl text-slate-900">
				{concluido ? 'Senha redefinida' : 'Redefinir senha'}
			</h1>
		</header>

		{#if concluido}
			<div class="space-y-4 text-sm text-slate-700">
				<div class="border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3">
					<div class="font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
						✓ Pronto
					</div>
					<p class="mt-1 text-emerald-900">
						Sua senha foi atualizada com sucesso. Todas as sessões ativas em outros
						dispositivos foram encerradas por segurança.
					</p>
				</div>
				<p class="text-slate-600">
					Abra o app UNISISM no seu celular e faça login com a nova senha.
				</p>
			</div>
		{:else}
			<form
				class="space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					void enviar();
				}}
			>
				<p class="text-sm text-slate-600">
					Crie uma nova senha para sua conta UNISISM. Use ao menos 8 caracteres,
					misturando letras e números.
				</p>

				<div class="flex flex-col">
					<label
						for="novaSenha"
						class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Nova senha
					</label>
					<div class="relative">
						<input
							id="novaSenha"
							type={mostrarSenha ? 'text' : 'password'}
							bind:value={novaSenha}
							maxlength="128"
							autocomplete="new-password"
							placeholder="Mínimo 8 caracteres"
							class="w-full border border-slate-300 bg-white px-3 py-2 pr-10 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						/>
						<button
							type="button"
							aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
							onclick={() => (mostrarSenha = !mostrarSenha)}
							class="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-500 hover:text-blue-900"
						>
							{mostrarSenha ? 'OCULTAR' : 'MOSTRAR'}
						</button>
					</div>
				</div>

				<div class="flex flex-col">
					<label
						for="confirmacao"
						class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Confirmar senha
					</label>
					<input
						id="confirmacao"
						type={mostrarSenha ? 'text' : 'password'}
						bind:value={confirmacao}
						maxlength="128"
						autocomplete="new-password"
						placeholder="Digite a senha novamente"
						class="w-full border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
				</div>

				{#if erro}
					<div
						class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
					>
						⚠ {erro}
					</div>
				{/if}

				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
					<PrimaryButton
						label={processando ? 'Salvando…' : 'Confirmar nova senha'}
						loading={processando}
						onclick={enviar}
					/>
				</div>

				<p class="text-center text-[11px] text-slate-500">
					Link expirado? <button
						type="button"
						onclick={() => goto('/recuperar-senha-paciente')}
						class="text-blue-900 underline">Solicitar novo</button
					>
				</p>
			</form>
		{/if}
	</div>
</main>
