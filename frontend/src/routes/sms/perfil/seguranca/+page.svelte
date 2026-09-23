<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { usePerfil } from '$lib/presentation/contexts/perfilContext';
	import { api, ApiError } from '$lib/api';

	const ctx = usePerfil();
	let p = $derived(ctx.perfil!);

	let showPasswordChange = $state(false);
	let oldPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let changedPassword = $state(false);
	let errorMsg = $state('');
	let submitting = $state(false);

	let revogando = $state(false);
	let sessoesEncerradas = $state<number | null>(null);

	function cancelar() {
		showPasswordChange = false;
		oldPassword = '';
		newPassword = '';
		confirmPassword = '';
		errorMsg = '';
	}

	async function alterar() {
		errorMsg = '';
		if (!oldPassword) {
			errorMsg = 'Informe a senha atual.';
			return;
		}
		if (newPassword.length < 8) {
			errorMsg = 'A nova senha deve ter pelo menos 8 caracteres.';
			return;
		}
		if (newPassword !== confirmPassword) {
			errorMsg = 'A confirmação não confere com a nova senha.';
			return;
		}
		submitting = true;
		try {
			await api.perfil.changePassword({ senhaAtual: oldPassword, novaSenha: newPassword });
			changedPassword = true;
			setTimeout(() => {
				cancelar();
				changedPassword = false;
			}, 2500);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'SENHA_ATUAL_INCORRETA':
						errorMsg = 'Senha atual incorreta.';
						break;
					case 'SENHA_FRACA':
						errorMsg = 'Senha não atende à política.';
						break;
					default:
						errorMsg = e.message || 'Falha ao alterar senha.';
				}
			} else {
				errorMsg = 'Falha de conexão com o servidor.';
			}
		} finally {
			submitting = false;
		}
	}

	async function revogarOutras() {
		revogando = true;
		try {
			const r = await api.perfil.revokeOtherSessions();
			sessoesEncerradas = r.encerradas;
			setTimeout(() => (sessoesEncerradas = null), 4000);
		} finally {
			revogando = false;
		}
	}

	function diasDesde(iso: string): number {
		return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	}
</script>

<section class="grid grid-cols-12 gap-4">
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Senha de Acesso" subtitle="Política institucional" index="01">
			{#if !showPasswordChange && !changedPassword}
				<PrimaryButton label="Alterar Senha" onclick={() => (showPasswordChange = true)} />
			{/if}
		</PanelHeader>
		{#if changedPassword}
			<div class="m-4 border-2 border-emerald-700 bg-emerald-50 p-4">
				<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
					✓ Senha alterada com sucesso
				</div>
			</div>
		{:else if showPasswordChange}
			<div class="space-y-3 p-4">
				<div class="grid grid-cols-12 gap-3">
					<FormField
						label="Senha Atual"
						name="oldPassword"
						type="password"
						span={12}
						bind:value={oldPassword}
					/>
					<FormField
						label="Nova Senha"
						name="newPassword"
						type="password"
						span={6}
						bind:value={newPassword}
					/>
					<FormField
						label="Confirmar Nova Senha"
						name="confirmPassword"
						type="password"
						span={6}
						bind:value={confirmPassword}
					/>
				</div>
				{#if errorMsg}
					<div
						class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
					>
						⚠ {errorMsg}
					</div>
				{/if}
				<div class="flex justify-end gap-2 pt-1">
					<PrimaryButton label="Cancelar" variant="secondary" onclick={cancelar} />
					<PrimaryButton label="Confirmar" onclick={alterar} loading={submitting} />
				</div>
			</div>
		{:else}
			<dl class="divide-y divide-slate-100 font-mono text-[11px]">
				<div class="flex items-center justify-between px-4 py-2.5">
					<dt class="tracking-widest text-slate-500 uppercase">Última Alteração</dt>
					<dd class="font-bold text-slate-900">
						{new Date(p.seguranca.senhaAlteradaEm).toLocaleDateString('pt-BR')} · há {diasDesde(
							p.seguranca.senhaAlteradaEm
						)} dias
					</dd>
				</div>
				<div class="flex items-center justify-between px-4 py-2.5">
					<dt class="tracking-widest text-slate-500 uppercase">Política</dt>
					<dd class="text-slate-900">Mín. 8 caracteres · renovar a cada 180d</dd>
				</div>
				<div class="flex items-center justify-between px-4 py-2.5">
					<dt class="tracking-widest text-slate-500 uppercase">Tentativas Falhas</dt>
					<dd class="text-slate-900">{p.seguranca.tentativasFalhasSemana} (última semana)</dd>
				</div>
			</dl>
		{/if}
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Autenticação 2FA" index="02" />
		<div class="flex flex-col gap-3 px-4 py-4">
			<span
				class="self-start border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
			>
				{p.seguranca.twoFAAtivo ? '✓ ATIVA' : '⚠ INATIVA'}
			</span>
			<div class="font-mono text-[11px] text-slate-700">{p.seguranca.metodoTwoFA}</div>
			<PrimaryButton label="Gerenciar 2FA" variant="secondary" fullWidth />
		</div>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
		<PanelHeader title="Último Acesso" subtitle="Registro de auditoria" index="03" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Data / Hora
				</dt>
				<dd class="mt-0.5 font-mono text-sm font-bold text-slate-900">
					{p.seguranca.ultimoAcesso}
				</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">IP</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.seguranca.ipUltimoAcesso}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Dispositivo
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.seguranca.dispositivo}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Localização
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.seguranca.localUltimoAcesso}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
		<PanelHeader title="Sessão Atual" index="04" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Dispositivos Conectados</dt>
				<dd class="text-lg font-bold text-slate-900">{p.seguranca.sessoesAtivas}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Inatividade</dt>
				<dd class="font-bold text-slate-900">{p.seguranca.sessaoInatividade}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Expira em</dt>
				<dd class="font-bold text-amber-800">{p.seguranca.sessaoExpiraEm}</dd>
			</div>
		</dl>
		<div class="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
			{#if sessoesEncerradas !== null}
				<div
					class="border-2 border-emerald-700 bg-emerald-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-emerald-800 uppercase"
				>
					✓ {sessoesEncerradas} sessão{sessoesEncerradas === 1 ? '' : 'ões'} encerrada{sessoesEncerradas ===
					1
						? ''
						: 's'}
				</div>
			{/if}
			<PrimaryButton
				label="Encerrar Outras Sessões"
				variant="secondary"
				fullWidth
				loading={revogando}
				onclick={revogarOutras}
			/>
		</div>
	</div>
</section>
