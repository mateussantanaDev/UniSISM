<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import EditarUsuario from '$lib/presentation/components/EditarUsuario.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api, ApiError } from '$lib/api';
	import type { UsuarioListado } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { obterIniciais } from '$lib/presentation/utils/stringUtils';
	import {
		formatarCargoPerfil,
		formatarVinculoUsuario
	} from '$lib/presentation/utils/usuarioUtils';

	const auth = useAuth();

	let usuario = $state<UsuarioListado | null>(null);
	let carregando = $state(true);
	let erro = $state(false);

	let editarAberto = $state(false);
	let resetAberto = $state(false);
	let confirmarAcaoAberto = $state(false);

	// Ações com confirmação.
	let acaoEmCurso = $state<'desativar' | 'ativar' | 'excluir' | null>(null);
	let processando = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	// Reset de senha.
	let novaSenha = $state('');
	let confirmarSenha = $state('');
	let resetEnviando = $state(false);
	let resetErro = $state('');

	onMount(async () => {
		const id = page.params.id;
		try {
			const todos = await api.admin.listUsuarios();
			usuario = todos.find((u) => u.id === id) ?? null;
			if (!usuario) erro = true;
			// Atalho da lista: /sms/rede/usuarios/:id?edit=1 → já abre modal
			if (auth.ehAdminOuDev && page.url.searchParams.get('edit') === '1' && usuario) {
				editarAberto = true;
			}
		} catch {
			erro = true;
		} finally {
			carregando = false;
		}
	});

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function handleSalvo(atualizado: UsuarioListado) {
		usuario = atualizado;
		editarAberto = false;
		notificar('ok', 'Dados do usuário atualizados.');
	}

	function abrirConfirmacao(acao: 'desativar' | 'ativar' | 'excluir') {
		acaoEmCurso = acao;
		confirmarAcaoAberto = true;
	}

	async function executarAcao() {
		if (!usuario || !acaoEmCurso) return;
		processando = true;
		try {
			if (acaoEmCurso === 'ativar' || acaoEmCurso === 'desativar') {
				const ativo = acaoEmCurso === 'ativar';
				await api.admin.setAtivoUsuario(usuario.id, ativo);
				usuario = { ...usuario, ativo };
				notificar('ok', ativo ? 'Usuário reativado.' : 'Usuário desativado.');
			} else if (acaoEmCurso === 'excluir') {
				await api.admin.deleteUsuario(usuario.id);
				notificar('ok', 'Usuário excluído — redirecionando...');
				setTimeout(() => goto('/sms/rede/usuarios'), 1200);
			}
			confirmarAcaoAberto = false;
			acaoEmCurso = null;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'AUTO_EXCLUSAO_PROIBIDA':
						notificar('erro', 'Você não pode excluir sua própria conta.');
						break;
					case 'AUTO_DESATIVACAO_PROIBIDA':
						notificar('erro', 'Você não pode desativar sua própria conta.');
						break;
					case 'USUARIO_NAO_ENCONTRADO':
						notificar('erro', 'Usuário não encontrado.');
						break;
					case 'PERMISSAO_INSUFICIENTE':
						notificar('erro', 'Sem permissão para esta ação.');
						break;
					default:
						notificar('erro', e.message || 'Falha ao executar ação.');
				}
			} else {
				notificar('erro', 'Falha de conexão com o servidor.');
			}
			confirmarAcaoAberto = false;
		} finally {
			processando = false;
		}
	}

	async function resetarSenha() {
		resetErro = '';
		if (novaSenha.length < 8) {
			resetErro = 'A senha deve ter pelo menos 8 caracteres.';
			return;
		}
		if (novaSenha !== confirmarSenha) {
			resetErro = 'Confirmação não confere.';
			return;
		}
		if (!usuario) return;
		resetEnviando = true;
		try {
			await api.admin.resetarSenhaUsuario(usuario.id, novaSenha);
			novaSenha = '';
			confirmarSenha = '';
			resetAberto = false;
			notificar('ok', 'Senha redefinida. Usuário será forçado a trocar no próximo login.');
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'SENHA_FRACA':
						resetErro = 'Senha não atende à política (mín. 8 caracteres).';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						resetErro = 'Sem permissão para redefinir senha.';
						break;
					default:
						resetErro = e.message || 'Falha ao redefinir senha.';
				}
			} else {
				resetErro = 'Falha de conexão com o servidor.';
			}
		} finally {
			resetEnviando = false;
		}
	}

	let usuarioAtualMesmaConta = $derived(!!usuario && auth.me?.id === usuario.id);
</script>

{#if carregando}
	<div class="border border-slate-200 bg-white p-10 text-center">
		<div
			class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
		></div>
		<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
			Carregando usuário...
		</div>
	</div>
{:else if erro || !usuario}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Usuário não encontrado
		</div>
		<div class="mt-4">
			<PrimaryButton
				label="Voltar à Lista"
				variant="secondary"
				onclick={() => goto('/sms/rede/usuarios')}
			/>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		{#if mensagem}
			<div
				class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
					{mensagem.tipo === 'ok'
					? 'border-emerald-700 bg-emerald-50 text-emerald-900'
					: 'border-red-700 bg-red-50 text-red-900'}"
			>
				{mensagem.tipo === 'ok' ? '✓' : '⚠'}
				{mensagem.texto}
			</div>
		{/if}

		<!-- Header -->
		<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-blue-900 font-mono text-sm font-bold text-white"
				>
					{obterIniciais(usuario.nome)}
				</div>
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
						USUÁRIO · {usuario.ativo ? 'ATIVO' : 'INATIVO'}
					</div>
					<div class="text-sm font-bold text-slate-900">{usuario.nome}</div>
					<div class="font-mono text-[11px] text-slate-600">
						{usuario.matricula} ·
						<strong class="font-bold text-blue-950">{formatarCargoPerfil(usuario)}</strong>
					</div>
				</div>
			</div>
			<PrimaryButton
				label="← Voltar"
				variant="secondary"
				onclick={() => goto('/sms/rede/usuarios')}
			/>
		</div>

		<section class="grid grid-cols-12 gap-4">
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
				<PanelHeader title="Dados do Usuário" index="01">
					<PrimaryButton label="Editar" variant="secondary" onclick={() => (editarAberto = true)} />
				</PanelHeader>
				<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
					<div class="col-span-12">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Nome Completo
						</dt>
						<dd class="mt-0.5 text-sm font-bold text-slate-900">{usuario.nome}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Matrícula
						</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">{usuario.matricula}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">{usuario.cpf}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Criado em
						</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">
							{formatarData(usuario.criadoEm)}
						</dd>
					</div>
					<div class="col-span-12">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Email Corporativo
						</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">{usuario.email}</dd>
					</div>
				</dl>
			</div>

			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
				<PanelHeader title="Perfil & Vínculo" index="02" />
				<dl class="divide-y divide-slate-100 font-mono text-[11px]">
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Cargo / Perfil</dt>
						<dd>
							<span
								class="border border-blue-900 bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-950 uppercase"
							>
								{formatarCargoPerfil(usuario)}
							</span>
						</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Unidade / Face</dt>
						<dd class="truncate pl-2 font-bold text-slate-900">
							{usuario.tipoUnidade
								? `${usuario.tipoUnidade} — ${formatarVinculoUsuario(usuario)}`
								: formatarVinculoUsuario(usuario)}
						</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Role Sistema</dt>
						<dd>
							<span
								class="border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase"
							>
								{usuario.role}
							</span>
						</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Município</dt>
						<dd class="truncate pl-2 text-slate-900">
							{usuario.prefeitura?.nome ?? usuario.ubs?.prefeitura?.nome ?? 'Global'}
						</dd>
					</div>
					{#if usuario.ubs}
						<div class="flex items-center justify-between px-4 py-2.5">
							<dt class="tracking-widest text-slate-500 uppercase">UBS Vinculada</dt>
							<dd class="truncate pl-2 text-slate-900">
								{usuario.ubs.nome}
							</dd>
						</div>
					{/if}
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Status</dt>
						<dd>
							{#if usuario.ativo}
								<span
									class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-bold tracking-widest text-emerald-800 uppercase"
								>
									ATIVO
								</span>
							{:else}
								<span
									class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-bold tracking-widest text-slate-600 uppercase"
								>
									INATIVO
								</span>
							{/if}
						</dd>
					</div>
				</dl>
			</div>

			<!-- Ações administrativas -->
			<div class="col-span-12 border border-slate-200 bg-white">
				<PanelHeader
					title="Ações Administrativas"
					subtitle="Mudanças registradas em auditoria · algumas não podem ser desfeitas"
					index="03"
				/>
				<div class="flex flex-wrap items-center gap-2 p-4">
					<PrimaryButton
						label="Resetar Senha"
						variant="secondary"
						onclick={() => (resetAberto = true)}
					/>

					{#if usuario.ativo}
						<PrimaryButton
							label="Desativar Usuário"
							variant="danger"
							disabled={usuarioAtualMesmaConta}
							onclick={() => abrirConfirmacao('desativar')}
						/>
					{:else}
						<PrimaryButton
							label="Reativar Usuário"
							variant="primary"
							onclick={() => abrirConfirmacao('ativar')}
						/>
					{/if}

					<PrimaryButton
						label="Excluir Usuário"
						variant="danger"
						disabled={usuarioAtualMesmaConta}
						onclick={() => abrirConfirmacao('excluir')}
					/>

					{#if usuarioAtualMesmaConta}
						<div
							class="ml-auto border border-amber-300 bg-amber-50 px-3 py-1 font-mono text-[10px] tracking-wider text-amber-800 uppercase"
						>
							⚠ Você não pode desativar/excluir sua própria conta
						</div>
					{/if}
				</div>
			</div>
		</section>
	</div>

	<!-- Modal Editar -->
	<Modal
		isOpen={editarAberto}
		onClose={() => (editarAberto = false)}
		title="Editar Usuário"
		subtitle="Atualizar dados cadastrais"
		maxWidth="lg"
	>
		<EditarUsuario {usuario} onCancel={() => (editarAberto = false)} onSaved={handleSalvo} />
	</Modal>

	<!-- Modal Reset Senha -->
	<Modal
		isOpen={resetAberto}
		onClose={() => {
			resetAberto = false;
			resetErro = '';
			novaSenha = '';
			confirmarSenha = '';
		}}
		title="Resetar Senha do Usuário"
		subtitle="Ação administrativa auditada"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			<div
				class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
			>
				A senha atual do usuário será invalidada. Ele receberá a senha provisória pelos canais
				oficiais e será forçado a trocar no próximo login. Todas as sessões ativas serão encerradas.
			</div>
			<div class="grid grid-cols-12 gap-3">
				<FormField
					label="Nova Senha Provisória"
					name="novaSenha"
					type="password"
					span={6}
					bind:value={novaSenha}
				/>
				<FormField
					label="Confirmar Senha"
					name="confirmarSenha"
					type="password"
					span={6}
					bind:value={confirmarSenha}
				/>
			</div>
			{#if resetErro}
				<div
					class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {resetErro}
				</div>
			{/if}
			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (resetAberto = false)} />
				<PrimaryButton
					label="Redefinir Senha"
					variant="danger"
					loading={resetEnviando}
					onclick={resetarSenha}
				/>
			</div>
		</div>
	</Modal>

	<!-- Modal Confirmação de Ação Destrutiva -->
	<Modal
		isOpen={confirmarAcaoAberto}
		onClose={() => {
			confirmarAcaoAberto = false;
			acaoEmCurso = null;
		}}
		title={acaoEmCurso === 'excluir'
			? 'Confirmar Exclusão'
			: acaoEmCurso === 'desativar'
				? 'Confirmar Desativação'
				: 'Confirmar Reativação'}
		subtitle={acaoEmCurso === 'excluir'
			? 'Ação irreversível — auditada'
			: 'Alterar status do usuário'}
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			{#if acaoEmCurso === 'excluir'}
				<div class="border-2 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900">
					<strong>Atenção:</strong> excluir <strong>{usuario.nome}</strong> ({usuario.matricula}) é
					uma operação permanente. O registro ficará arquivado apenas para fins de auditoria e o
					usuário não poderá mais acessar o sistema.
				</div>
			{:else if acaoEmCurso === 'desativar'}
				<div
					class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
				>
					<strong>{usuario.nome}</strong> ficará sem acesso ao sistema. Sessões ativas serão encerradas.
					O usuário pode ser reativado a qualquer momento.
				</div>
			{:else}
				<div
					class="border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[12px] text-emerald-900"
				>
					<strong>{usuario.nome}</strong> voltará a ter acesso ao sistema com as mesmas credenciais anteriores.
				</div>
			{/if}
			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => {
						confirmarAcaoAberto = false;
						acaoEmCurso = null;
					}}
				/>
				<PrimaryButton
					label={acaoEmCurso === 'excluir'
						? 'Sim, Excluir'
						: acaoEmCurso === 'desativar'
							? 'Sim, Desativar'
							: 'Sim, Reativar'}
					variant={acaoEmCurso === 'ativar' ? 'primary' : 'danger'}
					loading={processando}
					onclick={executarAcao}
				/>
			</div>
		</div>
	</Modal>
{/if}
