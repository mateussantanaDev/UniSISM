<script lang="ts">
	/**
	 * Tela pública de "esqueci minha senha" para PACIENTE (Face 3).
	 *
	 * Útil quando o paciente perdeu o link enviado por email e quer pedir um novo
	 * a partir do navegador (em vez do app). Mesmo fluxo: backend SEMPRE responde
	 * 204 (anti-enumeration); UI sempre mostra mensagem genérica de sucesso.
	 *
	 * Rate-limited no backend (5 req/15min/IP + 3 req/1h/CPF).
	 */
	import { api, ApiError } from '$lib/api';
	import { goto } from '$app/navigation';
	import { dev } from '$app/environment';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';

	/** Em DEV o Vite injeta scripts inline para HMR — script-src estrito quebra. */
	const cspContent = dev
		? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:3333 ws://localhost:5173; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
		: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

	let cpf = $state('');
	let processando = $state(false);
	let erro = $state('');
	let enviado = $state(false);

	function mascararCpf(v: string): string {
		const d = v.replace(/\D/g, '').slice(0, 11);
		if (d.length <= 3) return d;
		if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
		if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
		return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
	}

	async function enviar() {
		erro = '';
		const digits = cpf.replace(/\D/g, '');
		if (digits.length !== 11) {
			erro = 'CPF deve ter 11 dígitos.';
			return;
		}
		processando = true;
		try {
			await api.pacienteApp.esqueciSenhaPaciente(digits);
			enviado = true;
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'RATE_LIMIT_EXCEDIDO') {
					erro = e.message || 'Muitas solicitações. Aguarde alguns minutos.';
				} else {
					erro = e.message || 'Falha ao enviar solicitação.';
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
	<title>Recuperar senha · UNISISM</title>
	<meta name="robots" content="noindex,nofollow" />
	<!--
		CSP defesa em profundidade — vide /redefinir/+page.svelte.
		`referrer: no-referrer` evita vazamento do CPF (em query? não, é POST) via header.
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
				{enviado ? 'Verifique seu email' : 'Recuperar senha'}
			</h1>
		</header>

		{#if enviado}
			<div class="space-y-4 text-sm text-slate-700">
				<div class="border-l-4 border-blue-900 bg-blue-50 px-4 py-3">
					<div class="font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase">
						✓ Solicitação enviada
					</div>
					<p class="mt-1 text-blue-950">
						Se houver uma conta com este CPF e email cadastrado, você receberá um
						link de redefinição em <strong>até 5 minutos</strong>.
					</p>
				</div>
				<p class="text-slate-600">
					O link é válido por <strong>30 minutos</strong>. Verifique também a caixa de spam.
				</p>
				<p class="text-[11px] text-slate-500">
					Por segurança, não confirmamos se o CPF tem conta cadastrada.
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
					Informe seu CPF. Se houver uma conta vinculada com email cadastrado,
					enviaremos um link para criar uma nova senha.
				</p>

				<div class="flex flex-col">
					<label
						for="cpf"
						class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						CPF
					</label>
					<input
						id="cpf"
						type="text"
						bind:value={cpf}
						oninput={(e) => (cpf = mascararCpf((e.target as HTMLInputElement).value))}
						maxlength="14"
						inputmode="numeric"
						autocomplete="username"
						placeholder="000.000.000-00"
						class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wider text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
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
						label={processando ? 'Enviando…' : 'Enviar link'}
						loading={processando}
						onclick={enviar}
					/>
				</div>

				<p class="text-center text-[11px] text-slate-500">
					<button
						type="button"
						onclick={() => goto('/login')}
						class="text-blue-900 underline">Voltar ao login</button
					>
				</p>
			</form>
		{/if}
	</div>
</main>
