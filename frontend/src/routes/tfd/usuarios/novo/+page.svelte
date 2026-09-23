<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Prefeitura, Role } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let bloqueado = $derived(!auth.podeCadastrarUsuarioTFD);

	let prefeituras = $state<Prefeitura[]>([]);

	let nome = $state('');
	let email = $state('');
	let matricula = $state('');
	let cpf = $state('');
	let telefone = $state('');
	let senha = $state('');
	let senhaConfirmar = $state('');
	let cargo = $state('');
	let role = $state<Role>('REGULADOR_TFD');
	let prefeituraId = $state('');

	let enviando = $state(false);
	let erro = $state('');
	let sucesso = $state(false);

	onMount(async () => {
		try {
			prefeituras = await api.admin.listPrefeituras();
			if (prefeituras.length === 1) prefeituraId = prefeituras[0].id;
		} catch {
			// silencioso — backend já cobre erro
		}
	});

	/**
	 * Roles permitidas para o operador atual:
	 *  - GESTOR_TFD: pode criar apenas REGULADOR_TFD (sua equipe direta).
	 *  - ADMIN: pode criar GESTOR_TFD e REGULADOR_TFD.
	 *  - DESENVOLVEDOR: idem ADMIN dentro do TFD.
	 */
	let rolesPermitidas = $derived.by<Role[]>(() => {
		if (auth.me?.role === 'GESTOR_TFD') return ['REGULADOR_TFD'];
		if (auth.me?.role === 'ADMIN' || auth.me?.role === 'DESENVOLVEDOR')
			return ['GESTOR_TFD', 'REGULADOR_TFD'];
		return [];
	});

	async function enviar() {
		erro = '';
		if (!nome.trim() || !email.trim() || !cpf.trim() || !senha) {
			erro = 'Preencha nome, e-mail, CPF e senha.';
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
		if (!prefeituraId) {
			erro = 'Selecione a prefeitura para esta role.';
			return;
		}
		enviando = true;
		try {
			await api.admin.createUsuario({
				nome: nome.trim(),
				email: email.trim(),
				matricula: matricula.trim() || undefined,
				cpf: cpf.replace(/\D/g, ''),
				senha,
				role,
				prefeituraId,
				telefone: telefone.trim() || undefined,
				cargo: cargo.trim() || undefined
			});
			sucesso = true;
			setTimeout(() => goto('/tfd/usuarios'), 1200);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'USUARIO_DUPLICADO':
						erro = 'Já existe usuário com este e-mail, matrícula ou CPF.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não pode criar um usuário com essa role.';
						break;
					case 'FORA_DO_ESCOPO':
						erro = 'Prefeitura escolhida está fora do seu escopo.';
						break;
					case 'PREFEITURA_OBRIGATORIA':
						erro = 'Esta role exige uma prefeitura.';
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

{#if bloqueado}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">
			Apenas GESTOR_TFD, ADMIN ou DESENVOLVEDOR podem criar usuários TFD.
		</p>
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
			title="Novo Usuário TFD"
			subtitle="Cadastro de membro da equipe — gestor ou regulador"
			index="01"
		/>

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
					label="E-mail Corporativo"
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
						Role
					</label>
					<select
						id="role"
						bind:value={role}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						{#each rolesPermitidas as r (r)}
							<option value={r}>
								{r === 'REGULADOR_TFD'
									? 'REGULADOR_TFD · cadastra solicitações'
									: 'GESTOR_TFD · gerencia frota e regulação'}
							</option>
						{/each}
					</select>
				</div>

				<div class="col-span-6 flex flex-col">
					<label
						for="pref"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Prefeitura
					</label>
					<select
						id="pref"
						bind:value={prefeituraId}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						<option value="">— Selecione —</option>
						{#each prefeituras as p (p.id)}
							<option value={p.id}>{p.nome}</option>
						{/each}
					</select>
				</div>
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
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => goto('/tfd/usuarios')} />
			<PrimaryButton label="Cadastrar Usuário" type="submit" loading={enviando} />
		</div>
	</form>
{/if}
