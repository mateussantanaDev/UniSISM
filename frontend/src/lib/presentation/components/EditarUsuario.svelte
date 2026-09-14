<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { AtualizarUsuarioRequest, UsuarioListado, Role } from '$lib/api/types';
	import { formatarCargoPerfil } from '$lib/presentation/utils/usuarioUtils';

	interface Props {
		usuario: UsuarioListado;
		onCancel: () => void;
		onSaved: (atualizado: UsuarioListado) => void;
	}

	let { usuario, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		nome: usuario.nome,
		email: usuario.email,
		cargo: usuario.cargo || '',
		funcao: usuario.funcao || '',
		tipoUnidade: usuario.tipoUnidade || 'UBS',
		role: usuario.role
	}));

	let nome = $state(orig.nome);
	let email = $state(orig.email);
	let telefone = $state('');
	let cargo = $state(orig.cargo);
	let funcao = $state(orig.funcao);
	let tipoUnidade = $state(orig.tipoUnidade);
	let role = $state<Role>(orig.role);

	let enviando = $state(false);
	let erro = $state('');

	function aoMudarTipoOuRole() {
		cargo = formatarCargoPerfil({ role, tipoUnidade });
	}

	function diff(): AtualizarUsuarioRequest {
		const out: AtualizarUsuarioRequest = {};
		if (nome.trim() !== orig.nome) out.nome = nome.trim();
		if (email.trim().toLowerCase() !== orig.email.toLowerCase()) out.email = email.trim();
		if (telefone.trim()) out.telefone = telefone.trim();
		if (cargo.trim() !== orig.cargo) out.cargo = cargo.trim();
		if (funcao.trim() !== orig.funcao) out.funcao = funcao.trim();
		if (tipoUnidade !== orig.tipoUnidade) out.tipoUnidade = tipoUnidade as any;
		if (role !== orig.role) out.role = role;
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let podeSalvar = $derived(pendente > 0 && !enviando && nome.trim().length > 0);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		if (!nome.trim()) {
			erro = 'O nome não pode ficar em branco.';
			return;
		}

		enviando = true;
		try {
			const r = await api.admin.updateUsuario(usuario.id, patch);
			// Backend responde com subset de campos atualizados. Mesclamos no listado.
			const atualizado: UsuarioListado = {
				...usuario,
				nome: r.nome ?? usuario.nome,
				email: r.email ?? usuario.email,
				matricula: r.matricula ?? usuario.matricula,
				role: r.role ?? usuario.role,
				cargo: r.cargo ?? cargo,
				funcao: r.funcao ?? funcao,
				tipoUnidade: (r as any).tipoUnidade ?? tipoUnidade as any
			};
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'NENHUMA_ALTERACAO':
						erro = 'Nenhuma alteração identificada.';
						break;
					case 'EMAIL_EM_USO':
						erro = 'Este email já está vinculado a outra matrícula.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para editar este usuário.';
						break;
					default:
						erro = e.message || 'Falha ao salvar alterações.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<section
		class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
	>
		Dados administrativos e vínculo institucional do servidor na rede municipal.
	</section>

	<!-- Identidade -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Identificação
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome Completo" name="nome" span={12} bind:value={nome} />
			<FormField
				label="Email Corporativo"
				name="email"
				span={8}
				mono
				type="email"
				bind:value={email}
			/>
			<FormField
				label="Telefone"
				name="telefone"
				span={4}
				mono
				placeholder="Opcional"
				bind:value={telefone}
			/>
		</div>
	</section>

	<!-- Lotação & Cargo -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Lotação, Perfil & Cargo
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<div class="col-span-6 flex flex-col">
				<label for="ed-tipo" class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
					Unidade / Face
				</label>
				<select
					id="ed-tipo"
					bind:value={tipoUnidade}
					onchange={aoMudarTipoOuRole}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 font-bold"
				>
					<option value="CEO">CEO · Centro Odontológico</option>
					<option value="CEM">CEM · Centro Médico</option>
					<option value="UBS">UBS · Unidade Básica</option>
					<option value="SMS">SMS · Secretaria de Saúde</option>
					<option value="TFD">TFD · Logística & Viagens</option>
				</select>
			</div>

			<div class="col-span-6 flex flex-col">
				<label for="ed-role" class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
					Perfil de Acesso (Role)
				</label>
				<select
					id="ed-role"
					bind:value={role}
					onchange={aoMudarTipoOuRole}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 font-bold"
				>
					{#if tipoUnidade === 'CEO'}
						<option value="COORDENADOR_UBS">Coordenador(a) do CEO</option>
						<option value="ADMIN">Diretor(a) / Gestor Geral do CEO</option>
						<option value="MEDICO">Cirurgião-Dentista Especialista</option>
						<option value="MEDICO_ESPECIALISTA">Cirurgião-Dentista Plantonista</option>
						<option value="ATENDENTE_CENTRO">Atendente / Recepção CEO</option>
						<option value="REGULADOR_SMS">Regulador(a) do CEO</option>
					{:else if tipoUnidade === 'CEM'}
						<option value="COORDENADOR_UBS">Coordenador(a) do CEM</option>
						<option value="ADMIN">Diretor(a) / Gestor Geral do CEM</option>
						<option value="MEDICO">Médico(a) Especialista</option>
						<option value="MEDICO_ESPECIALISTA">Médico(a) Plantonista</option>
						<option value="ATENDENTE_CENTRO">Atendente / Recepção CEM</option>
						<option value="REGULADOR_SMS">Regulador(a) do CEM</option>
					{:else}
						<option value="COORDENADOR_UBS">Coordenador(a) de UBS</option>
						<option value="ATENDENTE_UBS">Atendente de UBS</option>
						<option value="MEDICO">Médico(a) Clínico</option>
						<option value="REGULADOR_SMS">Regulador(a) SMS</option>
						<option value="ADMIN">Administrador(a) Geral</option>
						<option value="DESENVOLVEDOR">Desenvolvedor(a) / TI</option>
						<option value="GESTOR_TFD">Gestor(a) TFD</option>
						<option value="REGULADOR_TFD">Regulador(a) TFD</option>
						<option value="ATENDENTE_TFD">Atendente TFD</option>
						<option value="MOTORISTA_TFD">Motorista TFD</option>
					{/if}
				</select>
			</div>

			<FormField
				label="Cargo Exibido (ex: Coordenadora do CEO)"
				name="cargo"
				span={6}
				bind:value={cargo}
			/>
			<FormField
				label="Função (ex: Coordenação e Gestão do CEO)"
				name="funcao"
				span={6}
				bind:value={funcao}
			/>
		</div>
	</section>

	<!-- Identificação Fixa -->
	<section
		class="grid grid-cols-3 gap-3 border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700"
	>
		<div>
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Matrícula</div>
			<div class="font-mono font-bold">{usuario.matricula}</div>
		</div>
		<div>
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">CPF</div>
			<div class="font-mono font-bold">{usuario.cpf}</div>
		</div>
		<div>
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Perfil Atual</div>
			<div class="font-mono font-bold text-blue-900">{formatarCargoPerfil(usuario)}</div>
		</div>
	</section>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-between gap-2 border-t border-slate-200 pt-4">
		<span class="self-center font-mono text-[10px] tracking-widest text-slate-500 uppercase">
			{pendente === 0 ? 'Sem alterações' : `${pendente} campo(s) pendente(s)`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
			<PrimaryButton
				label="Salvar Alterações"
				onclick={salvar}
				loading={enviando}
				disabled={!podeSalvar}
			/>
		</div>
	</div>
</div>
