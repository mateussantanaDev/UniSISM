<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';

	onMount(async () => {
		// Sem token: sempre /login
		if (!api.tokens.get()) {
			goto('/login', { replaceState: true });
			return;
		}
		// Com token: decide a Face pela role. Se o token estiver inválido,
		// api.auth.me() dispara 401 → onUnauthorized já redireciona pra /login.
		try {
			const me = await api.auth.me();
			goto(rbac.faceDestinoPadrao(me.role, me), { replaceState: true });
		} catch {
			api.tokens.set(null);
			goto('/login', { replaceState: true });
		}
	});
</script>

<div class="flex h-screen items-center justify-center bg-slate-50">
	<div class="flex flex-col items-center gap-3">
		<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
		<div class="font-mono text-xs tracking-widest text-slate-500 uppercase">
			Redirecionando...
		</div>
	</div>
</div>
