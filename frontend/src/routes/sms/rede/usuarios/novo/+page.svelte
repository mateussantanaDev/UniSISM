<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Prefeitura, Role, Ubs } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatarCargoPerfil } from '$lib/presentation/utils/usuarioUtils';

	const auth = useAuth();

	let prefeituras = $state<Prefeitura[]>([]);
	let ubsList = $state<Ubs[]>([]);

	let nome = $state('');
	let email = $state('');
	let matricula = $state('');
	let cpf = $state('');
	let telefone = $state('');
	let senha = $state('');
	let senhaConfirmar = $state('');
	let cargo = $state('');
	let role = $state<Role>('ATENDENTE_UBS');
	let tipoUnidade = $state<'CEO' | 'CEM' | 'UBS' | 'SMS' | 'TFD'>('SMS');
	let prefeituraId = $state('');
	let ubsId = $state('');

	let enviando = $state(false);
	let erro = $state('');
	let sucesso = $state(false);

	onMount(async () => {
		try {
			const [prefs, ubs] = await Promise.all([api.admin.listPrefeituras(), api.admin.listUbs()]);
			prefeituras = prefs;
			ubsList = ubs;
			if (prefs.length === 1) prefeituraId = prefs[0].id;
		} catch {
			// silencioso — erro ao cadastrar já cobre o caso
		}
	});

	/** Roles que o usuário atual pode criar (DEV pode tudo, ADMIN não pode criar DEV). */
	let rolesPermitidas = $derived.by<Role[]>(() => {
		const todas: Role[] = [
			'COORDENADOR_UBS',
			'ADMIN',
			'ATENDENTE_UBS',
			'ATENDENTE_CENTRO',
			'ENFERMEIRO',
			'REGULADOR_SMS',
			'MEDICO',
			'MEDICO_ESPECIALISTA',
			'GESTOR_TFD',
			'REGULADOR_TFD',
			'ATENDENTE_TFD',
			'DESENVOLVEDOR'
		];
		if (auth.me?.role === 'DESENVOLVEDOR') return todas;
		if (auth.me?.role === 'ADMIN') return todas.filter((r) => r !== 'DESENVOLVEDOR');
		return [];
	});

	let exigePrefeitura = $derived(
		role === 'ADMIN' ||
			role === 'REGULADOR_SMS' ||
			role === 'ENFERMEIRO' ||
			role === 'GESTOR_TFD' ||
			role === 'REGULADOR_TFD' ||
			role === 'ATENDENTE_TFD' ||
			role === 'MEDICO' ||
			role === 'MEDICO_ESPECIALISTA' ||
			role === 'ATENDENTE_CENTRO' ||
			(role === 'COORDENADOR_UBS' && (tipoUnidade === 'CEO' || tipoUnidade === 'CEM'))
	);
	let exigeUbs = $derived(
		(role === 'ATENDENTE_UBS' || role === 'COORDENADOR_UBS') && tipoUnidade === 'UBS'
	);

	let ubsDaPrefeitura = $derived(
		prefeituraId ? ubsList.filter((u) => u.prefeituraId === prefeituraId) : ubsList
	);

	async function enviar() {
		erro = '';
		if (!nome.trim() || !email.trim() || !cpf.trim() || !senha) {
			erro = 'Preencha nome, email, CPF e senha.';
			return;
		}
		if (senha.length < 8) {
			erro = 'A senha deve ter ao menos 8 caracteres.';
			return;
		}
		if (senha !== senhaConfirmar) {
			erro = 'A confirmação de senha não confere.';
			return;
		}
		if (exigePrefeitura && !prefeituraId) {
			erro = 'Selecione a prefeitura para esta role.';
			return;
		}
		if (exigeUbs && !ubsId) {
			erro = 'Selecione a UBS para esta role.';
			return;
		}

		enviando = true;
		try {
			await api.admin.createUsuario({
				nome: nome.trim(),
				email: email.trim(),
				matricula: matricula.trim() || undefined,
				cpf: cpf.trim(),
				senha,
				role,
				tipoUnidade,
				ubsId: exigeUbs ? ubsId : undefined,
				prefeituraId: exigePrefeitura ? prefeituraId : undefined,
				telefone: telefone.trim() || undefined,
				cargo: cargo.trim() || undefined
			});
			sucesso = true;
			setTimeout(() => goto('/sms/rede/usuarios'), 1200);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'USUARIO_DUPLICADO':
						erro = 'Já existe usuário com este email, matrícula ou CPF.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não pode criar um usuário com essa role.';
						break;
					case 'FORA_DO_ESCOPO':
						erro = 'Prefeitura/UBS escolhida está fora do seu escopo.';
						break;
					case 'PREFEITURA_OBRIGATORIA':
						erro = 'Esta role exige uma prefeitura.';
						break;
					case 'UBS_OBRIGATORIA':
						erro = 'Esta role exige uma UBS.';
						break;
					case 'SENHA_FRACA':
						erro = 'Senha muito fraca. Use ao menos 8 caracteres.';
						break;
					default:
						erro = e.message || 'Falha ao criar usuário.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		enviar();
	}
</script>

{#if !auth.podeCriarUsuario}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">Apenas ADMIN ou DESENVOLVEDOR podem criar usuários.</p>
	</div>
{:else if sucesso}
	<div class="border-2 border-emerald-700 bg-emerald-50 p-6">
		<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
			✓ USUÁRIO CRIADO COM SUCESSO
		</div>
		<div class="mt-2 text-xs text-emerald-900">Redirecionando para a lista...</div>
	</div>
{:else}
	<form onsubmit={onSubmit} class="border border-slate-200 bg-white">
		<PanelHeader
			title="Novo Usuário"
			subtitle="Cadastro de servidor com acesso ao sistema"
			index="01"
		/>

		<!-- Identificação -->
		<div class="p-4">
			<div class="mb-3 border-b border-slate-200 pb-1.5">
				<h3 class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Identificação
				</h3>
			</div>
			<div class="grid grid-cols-12 gap-3">
				<FormField label="Nome Completo" name="nome" span={8} bind:value={nome} />
				<FormField
					label="Matrícula (opcional)"
					name="matricula"
					span={4}
					mono
					bind:value={matricula}
				/>
				<FormField label="CPF" name="cpf" span={4} mono bind:value={cpf} />
				<FormField
					label="Email Corporativo"
					name="email"
					type="email"
					span={5}
					mono
					bind:value={email}
				/>
				<FormField
					label="Telefone (opcional)"
					name="telefone"
					span={3}
					mono
					bind:value={telefone}
				/>
				<FormField label="Cargo (opcional)" name="cargo" span={12} bind:value={cargo} />
			</div>

			<!-- Credenciais -->
			<div class="mt-5 mb-3 border-b border-slate-200 pb-1.5">
				<h3 class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Credenciais iniciais
				</h3>
			</div>
			<div class="grid grid-cols-12 gap-3">
				<FormField
					label="Senha (mín. 8 caracteres)"
					name="senha"
					type="password"
					span={6}
					bind:value={senha}
				/>
				<FormField
					label="Confirmar Senha"
					name="senhaConfirmar"
					type="password"
					span={6}
					bind:value={senhaConfirmar}
				/>
				<div
					class="col-span-12 border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[10px] tracking-wider text-slate-600 uppercase"
				>
					O usuário será solicitado a trocar esta senha no primeiro login.
				</div>
			</div>

			<!-- Permissões -->
			<div class="mt-5 mb-3 border-b border-slate-200 pb-1.5">
				<h3 class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Perfil e vínculo
				</h3>
			</div>
			<div class="grid grid-cols-12 gap-3">
				<div class="col-span-6 flex flex-col">
					<label
						for="role"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Perfil de Acesso
					</label>
					<select
						id="role"
						bind:value={role}
						onchange={() => {
							if (!cargo.trim()) cargo = formatarCargoPerfil({ role, tipoUnidade });
						}}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						{#each rolesPermitidas as r (r)}
							<option value={r}>{formatarCargoPerfil({ role: r, tipoUnidade })} ({r})</option>
						{/each}
					</select>
				</div>

				<div class="col-span-6 flex flex-col">
					<label
						for="tipoUnidade"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Unidade / Face
					</label>
					<select
						id="tipoUnidade"
						bind:value={tipoUnidade}
						onchange={() => {
							if (!cargo.trim()) cargo = formatarCargoPerfil({ role, tipoUnidade });
						}}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						<option value="CEO">CEO · Centro Odontológico</option>
						<option value="CEM">CEM · Centro Médico</option>
						<option value="UBS">UBS · Unidade Básica</option>
						<option value="SMS">SMS · Secretaria de Saúde</option>
						<option value="TFD">TFD · Logística</option>
					</select>
				</div>

				{#if exigePrefeitura}
					<div class="col-span-6 flex flex-col">
						<label
							for="prefeituraId"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Prefeitura
						</label>
						<select
							id="prefeituraId"
							bind:value={prefeituraId}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							<option value="">— Selecione —</option>
							{#each prefeituras as p (p.id)}
								<option value={p.id}>{p.nome}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if exigeUbs}
					<div class="col-span-6 flex flex-col">
						<label
							for="prefeituraIdUbs"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Prefeitura (filtro de UBS)
						</label>
						<select
							id="prefeituraIdUbs"
							bind:value={prefeituraId}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							<option value="">Todas</option>
							{#each prefeituras as p (p.id)}
								<option value={p.id}>{p.nome}</option>
							{/each}
						</select>
					</div>
					<div class="col-span-6 flex flex-col">
						<label
							for="ubsId"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							UBS
						</label>
						<select
							id="ubsId"
							bind:value={ubsId}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							<option value="">— Selecione —</option>
							{#each ubsDaPrefeitura as u (u.id)}
								<option value={u.id}>{u.nome}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if !exigePrefeitura && !exigeUbs}
					<div
						class="col-span-12 border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[10px] tracking-wider text-slate-600 uppercase"
					>
						⚠ Role com acesso <strong>GLOBAL</strong> — cria usuário sem prefeitura nem UBS vinculada.
					</div>
				{/if}
			</div>
		</div>

		{#if erro}
			<div
				class="mx-4 mb-3 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => goto('/sms/rede/usuarios')}
			/>
			<PrimaryButton label="Cadastrar Usuário" type="submit" loading={enviando} />
		</div>
	</form>
{/if}
