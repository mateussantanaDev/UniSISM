<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();
	const me = $derived(auth.me);
</script>

<div class="flex flex-col gap-4">
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Perfil do Operador" subtitle="Sessão ativa · Face 4 / TFD" index="01">
			<PrimaryButton label="Encerrar Sessão" variant="danger" onclick={auth.logout} />
		</PanelHeader>
		{#if me}
			<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4 text-xs">
				<div class="col-span-12 flex items-center gap-3">
					<div
						class="flex h-12 w-12 items-center justify-center border border-slate-300 bg-blue-900 font-mono text-base font-bold text-white"
					>
						{me.iniciais}
					</div>
					<div class="leading-tight">
						<div class="font-sans text-base font-bold text-slate-900">{me.nome}</div>
						<div class="font-mono text-[11px] text-slate-600">
							{me.matricula} · {me.role} · escopo {me.escopo}
						</div>
					</div>
				</div>
				<div class="col-span-6">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Cargo</dt>
					<dd class="mt-0.5 text-slate-900">{me.cargo || '—'}</dd>
				</div>
				<div class="col-span-6">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Prefeitura
					</dt>
					<dd class="mt-0.5 text-slate-900">{me.prefeitura ?? '—'}</dd>
				</div>
				<div class="col-span-6">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Unidade
					</dt>
					<dd class="mt-0.5 text-slate-900">{me.unidade ?? '—'}</dd>
				</div>
			</dl>
		{/if}
	</div>

	<div class="border-l-4 border-blue-900 bg-blue-50 px-4 py-2 font-sans text-[12px] text-blue-900">
		Para alterar dados cadastrais, troca de senha ou histórico de sessões, peça ao administrador que
		use o módulo de
		<a href="/sms/rede/usuarios" class="font-bold underline">/sms/rede/usuarios</a>.
	</div>
</div>
