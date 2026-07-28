<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { UsuarioListado, Role, Escopo } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	// State
	let carregando = $state(true);
	let salvando = $state(false);
	let erro = $state('');
	let mensagemSucesso = $state('');

	let listaUsuarios = $state<UsuarioListado[]>([]);
	let busca = $state('');
	let filtroPerfil = $state<string>('TODOS');
	let filtroStatus = $state<'TODOS' | 'ATIVO' | 'INATIVO'>('TODOS');

	// Modals
	let modalNovoAberto = $state(false);
	let modalEditarAberto = $state(false);
	let modalResetSenhaAberto = $state(false);
	let usuarioEdicao = $state<UsuarioListado | null>(null);

	// Form State - Novo / Editar Usuario
	let formNome = $state('');
	let formCpf = $state('');
	let formEmail = $state('');
	let formMatricula = $state('');
	let formPerfil = $state<any>('MEDICO');
	let formTipoUnidade = $state<'CEO' | 'CEM' | 'UBS' | 'SMS' | 'TFD'>('CEO');
	let formEspecialidade = $state('Cardiologia');
	let formRegistroProfissional = $state('');
	let formSenha = $state('Mudar@123');

	// Reset Senha Form State
	let formNovaSenha = $state('');
	let usuarioLogado = $state<any>(null);
	let isSuperUser = $derived(usuarioLogado?.role === 'ADMIN' || usuarioLogado?.role === 'DESENVOLVEDOR');

	async function carregarUsuarios() {
		carregando = true;
		erro = '';
		try {
			// Carrega perfil autenticado para verificar escopo de permissão
			try {
				usuarioLogado = await api.auth.me();
			} catch (errMe) {
				console.info('[UniSISM] Não foi possível obter me() na tela de gestão de usuários.', errMe);
			}

			// Se não for Administrador/Desenvolvedor, filtra pela unidade do Centro de Especialidades
			const superUser = usuarioLogado?.role === 'ADMIN' || usuarioLogado?.role === 'DESENVOLVEDOR';
			const query = !superUser && usuarioLogado?.unidadeVinculadaId ? { ubsId: usuarioLogado.unidadeVinculadaId } : undefined;

			const res = await api.admin.listUsuarios(query);
			listaUsuarios = res || [];
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao carregar usuários do servidor: ${e?.message || 'Erro de conexão'}`;
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarUsuarios();
	});

	let usuariosFiltrados = $derived.by(() => {
		return listaUsuarios.filter(u => {
			// Restrição de Escopo: Gestor do Centro só vê usuários do Centro de Especialidades
			if (!isSuperUser && usuarioLogado?.unidadeVinculadaId) {
				const ubsIdDoUsuario = u.ubs?.id || (u as any).ubsId;
				if (ubsIdDoUsuario && ubsIdDoUsuario !== usuarioLogado.unidadeVinculadaId) {
					return false;
				}
			}

			const q = busca.toLowerCase().trim();
			if (q) {
				const matchNome = u.nome?.toLowerCase().includes(q);
				const matchCpf = u.cpf?.includes(q);
				const matchEmail = u.email?.toLowerCase().includes(q);
				const matchMatricula = u.matricula?.toLowerCase().includes(q);
				if (!matchNome && !matchCpf && !matchEmail && !matchMatricula) return false;
			}
			const userRole = (u as any).perfil || u.role;
			if (filtroPerfil !== 'TODOS' && userRole !== filtroPerfil) return false;
			if (filtroStatus === 'ATIVO' && !u.ativo) return false;
			if (filtroStatus === 'INATIVO' && u.ativo) return false;
			return true;
		});
	});

	function abrirNovoUsuario() {
		formNome = '';
		formCpf = '';
		formEmail = '';
		formMatricula = '';
		formPerfil = 'MEDICO';
		formTipoUnidade = 'CEO';
		formEspecialidade = 'Cardiologia';
		formRegistroProfissional = '';
		formSenha = 'Mudar@123';
		modalNovoAberto = true;
	}

	async function salvarNovoUsuario() {
		if (!formNome.trim() || !formCpf.trim() || !formEmail.trim()) {
			alert('Preencha os campos obrigatórios (Nome, CPF e E-mail).');
			return;
		}

		salvando = true;
		try {
			await api.admin.createUsuario({
				nome: formNome.trim(),
				cpf: formCpf.replace(/\D/g, ''),
				email: formEmail.trim(),
				matricula: formMatricula.trim() || undefined,
				role: formPerfil as Role,
				tipoUnidade: formTipoUnidade,
				senha: formSenha.trim()
			});

			mensagemSucesso = `✓ Usuário ${formNome} cadastrado com sucesso no servidor!`;
			modalNovoAberto = false;
			await carregarUsuarios();
			setTimeout(() => mensagemSucesso = '', 5000);
		} catch (e: any) {
			console.error(e);
			alert(`Falha ao cadastrar usuário: ${e?.message || 'Erro do servidor'}`);
		} finally {
			salvando = false;
		}
	}

	function abrirEditar(u: UsuarioListado) {
		usuarioEdicao = u;
		formNome = u.nome;
		formCpf = u.cpf || '';
		formEmail = u.email || '';
		formMatricula = u.matricula || '';
		formPerfil = ((u as any).perfil || u.role) as Role;
		formTipoUnidade = (u.tipoUnidade || 'CEO') as any;
		modalEditarAberto = true;
	}

	async function salvarEdicaoUsuario() {
		if (!usuarioEdicao) return;
		salvando = true;
		try {
			await api.admin.updateUsuario(usuarioEdicao.id, {
				nome: formNome.trim(),
				email: formEmail.trim(),
				role: formPerfil as Role,
				tipoUnidade: formTipoUnidade
			});

			mensagemSucesso = `✓ Cadastro do usuário ${formNome} atualizado com sucesso!`;
			modalEditarAberto = false;
			await carregarUsuarios();
			setTimeout(() => mensagemSucesso = '', 5000);
		} catch (e: any) {
			console.error(e);
			alert(`Falha ao atualizar usuário: ${e?.message || 'Erro do servidor'}`);
		} finally {
			salvando = false;
		}
	}

	async function toggleStatusUsuario(u: UsuarioListado) {
		const novoStatus = !u.ativo;
		const acao = novoStatus ? 'ativar' : 'inativar';
		if (confirm(`Deseja realmente ${acao} o acesso do usuário ${u.nome}?`)) {
			try {
				await api.admin.setAtivoUsuario(u.id, novoStatus);
				mensagemSucesso = `✓ Status do usuário ${u.nome} alterado para ${novoStatus ? 'ATIVO' : 'INATIVO'}.`;
				await carregarUsuarios();
				setTimeout(() => mensagemSucesso = '', 4000);
			} catch (e: any) {
				console.error(e);
				alert(`Falha ao alterar status do usuário: ${e?.message || 'Erro de permissão'}`);
			}
		}
	}

	function abrirResetSenha(u: UsuarioListado) {
		usuarioEdicao = u;
		formNovaSenha = 'UniSISM@2026';
		modalResetSenhaAberto = true;
	}

	async function executarResetSenha() {
		if (!usuarioEdicao || !formNovaSenha.trim()) return;
		salvando = true;
		try {
			await api.admin.resetarSenhaUsuario(usuarioEdicao.id, formNovaSenha.trim());
			mensagemSucesso = `✓ Senha do usuário ${usuarioEdicao.nome} redefinida com sucesso! O usuário deverá alterá-la no próximo login.`;
			modalResetSenhaAberto = false;
			setTimeout(() => mensagemSucesso = '', 5000);
		} catch (e: any) {
			console.error(e);
			alert(`Falha ao redefinir senha: ${e?.message || 'Erro do servidor'}`);
		} finally {
			salvando = false;
		}
	}

	function formatarRoleLabel(role: string): string {
		const map: Record<string, string> = {
			MEDICO: 'Médico Especialista',
			REGULADOR_SMS: 'Regulador SMS / Recepção',
			ATENDENTE_UBS: 'Atendente Recepção',
			COORDENADOR_UBS: 'Coordenador / Diretoria',
			ADMIN: 'Administrador Geral',
			DESENVOLVEDOR: 'Desenvolvedor / TI'
		};
		return map[role] || role;
	}
</script>

<svelte:head>
	<title>ERP Gestão - Equipes e Usuários | UniSISM Centro</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="ERP GESTÃO DE EQUIPES, MÉDICOS E ATENDENTES"
		subtitle="Cadastro oficial de profissionais de saúde, credenciamento de CRM/registros, gestão de perfis de acesso e controle de credenciais."
	/>

	<!-- Banner Sucesso Global -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 flex flex-col gap-1 shadow-sm whitespace-pre-wrap">
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">SUCESSO</span>
				<span>OPERAÇÃO EXECUTADA COM SUCESSO</span>
			</div>
			<div class="text-xs font-mono font-normal mt-1">{mensagemSucesso}</div>
		</div>
	{/if}

	{#if erro}
		<div class="border border-amber-600 bg-amber-50 p-4 text-amber-900 font-semibold flex items-center justify-between">
			<span>⚠ {erro}</span>
			<button onclick={carregarUsuarios} class="border border-amber-800 bg-amber-800 text-white px-3 py-1 text-xs uppercase font-bold">
				Recarregar Dados
			</button>
		</div>
	{/if}

	<!-- Indicador de Escopo de Permissão -->
	<div class="border border-slate-200 bg-white p-3 flex items-center justify-between">
		{#if isSuperUser}
			<div class="flex items-center gap-2">
				<span class="bg-indigo-900 text-white px-2 py-0.5 font-bold text-[10px]">🔓 ESCOPO GLOBAL</span>
				<span class="text-slate-700 text-[11px] font-bold">Perfil Administrador/Desenvolvedor — Exibindo todos os usuários cadastrados na rede municipal.</span>
			</div>
		{:else}
			<div class="flex items-center gap-2">
				<span class="bg-blue-900 text-white px-2 py-0.5 font-bold text-[10px]">🔒 ESCOPO DO CENTRO DE ESPECIALIDADES</span>
				<span class="text-slate-700 text-[11px] font-bold">Perfil Gestão do Centro — Exibindo exclusivamente a equipe e profissionais vinculados a esta unidade.</span>
			</div>
		{/if}
		<span class="text-[10px] text-slate-500">{usuariosFiltrados.length} usuário(s) visível(is)</span>
	</div>

	<!-- Barra Superior de Controle e Filtros -->
	<section class="border border-slate-200 bg-white p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
			<input
				type="text"
				placeholder="Buscar por nome, CPF, e-mail ou matrícula..."
				bind:value={busca}
				class="border border-slate-300 bg-slate-50 p-2 text-xs flex-1 min-w-[240px]"
			/>
			<select bind:value={filtroPerfil} class="border border-slate-300 bg-white p-2 text-xs">
				<option value="TODOS">Todos os Perfis</option>
				<option value="MEDICO">Médicos Especialistas</option>
				<option value="REGULADOR_SMS">Reguladores / Recepção</option>
				<option value="ATENDENTE_UBS">Atendentes de Balcão</option>
				<option value="COORDENADOR_UBS">Diretoria / Coordenação</option>
				<option value="ADMIN">Administradores</option>
			</select>
			<select bind:value={filtroStatus} class="border border-slate-300 bg-white p-2 text-xs">
				<option value="TODOS">Todos os Status</option>
				<option value="ATIVO">Somente Ativos</option>
				<option value="INATIVO">Somente Inativos</option>
			</select>
		</div>

		<button
			type="button"
			onclick={abrirNovoUsuario}
			class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950 flex items-center gap-1.5 shrink-0"
		>
			<span>+ Novo Profissional / Usuário</span>
		</button>
	</section>

	<!-- Tabela de Usuários do Servidor -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500 font-mono">
			Carregando profissionais cadastrados no servidor...
		</div>
	{:else}
		<section class="border border-slate-200 bg-white overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-900 text-white text-[10px] uppercase font-bold tracking-wider">
							<th class="p-3">Nome / Profissional</th>
							<th class="p-3">Perfil & Função</th>
							<th class="p-3">CPF / Matrícula</th>
							<th class="p-3">E-mail de Contato</th>
							<th class="p-3">Status</th>
							<th class="p-3 text-right">Ações ERP</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 text-xs font-mono">
						{#if usuariosFiltrados.length === 0}
							<tr>
								<td colspan="6" class="p-8 text-center text-slate-500">
									Nenhum usuário cadastrado encontrado no servidor com os filtros selecionados.
								</td>
							</tr>
						{:else}
							{#each usuariosFiltrados as u (u.id)}
								<tr class="hover:bg-slate-50">
									<td class="p-3 font-bold text-slate-900 font-sans">
										<div class="flex items-center gap-2">
											<div class="flex h-7 w-7 items-center justify-center bg-blue-900 text-[10px] font-bold text-white font-mono">
												{u.nome.substring(0, 2).toUpperCase()}
											</div>
											<div>
												<div>{u.nome}</div>
												<div class="text-[10px] text-slate-500 font-mono font-normal">ID: {u.id}</div>
											</div>
										</div>
									</td>
									<td class="p-3 font-semibold text-blue-900">
										<span class="bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-900 font-bold uppercase">
											{formatarRoleLabel((u as any).perfil || u.role)}
										</span>
									</td>
									<td class="p-3 text-slate-700">
										<div>{u.cpf || 'Não informado'}</div>
										{#if u.matricula}
											<div class="text-[10px] text-slate-500 font-normal">Matrícula: {u.matricula}</div>
										{/if}
									</td>
									<td class="p-3 text-slate-700">{u.email || 'Sem e-mail'}</td>
									<td class="p-3">
										{#if u.ativo}
											<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold">ATIVO</span>
										{:else}
											<span class="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 text-[10px] font-bold">INATIVO</span>
										{/if}
									</td>
									<td class="p-3 text-right">
										<div class="flex items-center justify-end gap-1.5">
											<button
												onclick={() => abrirEditar(u)}
												class="border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-[10px] font-bold"
												title="Editar Credenciais"
											>
												✏ Editar
											</button>
											<button
												onclick={() => abrirResetSenha(u)}
												class="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-1 text-[10px] font-bold"
												title="Resetar Senha"
											>
												🔑 Reset Senha
											</button>
											<button
												onclick={() => toggleStatusUsuario(u)}
												class="border px-2 py-1 text-[10px] font-bold {u.ativo ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'}"
											>
												{u.ativo ? '🚫 Inativar' : '✓ Ativar'}
											</button>
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<!-- Modal 1: Novo Profissional / Usuário -->
{#if modalNovoAberto}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-xl border-2 border-slate-900 bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">+ Cadastrar Novo Profissional / Usuário</div>
				<button onclick={() => modalNovoAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="usr-nome" class="font-bold text-slate-700 text-[11px]">Nome Completo *</label>
						<input id="usr-nome" type="text" bind:value={formNome} placeholder="Ex.: Dr. Fernando Souza" class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="usr-cpf" class="font-bold text-slate-700 text-[11px]">CPF *</label>
						<input id="usr-cpf" type="text" bind:value={formCpf} placeholder="000.000.000-00" class="border border-slate-300 p-2 text-xs" />
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="usr-email" class="font-bold text-slate-700 text-[11px]">E-mail Institucional *</label>
						<input id="usr-email" type="email" bind:value={formEmail} placeholder="profissional@saude.gov.br" class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="usr-mat" class="font-bold text-slate-700 text-[11px]">Matrícula / Registro Profissional</label>
						<input id="usr-mat" type="text" bind:value={formMatricula} placeholder="Ex.: MAT-4482 ou CRM 12345" class="border border-slate-300 p-2 text-xs" />
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div class="flex flex-col gap-1">
						<label for="usr-perfil" class="font-bold text-slate-700 text-[11px]">Perfil de Acesso *</label>
						<select id="usr-perfil" bind:value={formPerfil} class="border border-slate-300 p-2 text-xs bg-white font-bold">
							<option value="MEDICO">Médico Especialista</option>
							<option value="REGULADOR_SMS">Regulador SMS / Recepção</option>
							<option value="ATENDENTE_UBS">Atendente Recepção</option>
							<option value="COORDENADOR_UBS">Diretoria / Coordenação</option>
							<option value="ADMIN">Administrador Geral</option>
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<label for="usr-tipo-unidade" class="font-bold text-slate-700 text-[11px]">Unidade / Face *</label>
						<select id="usr-tipo-unidade" bind:value={formTipoUnidade} class="border border-emerald-400 bg-emerald-50 text-emerald-950 p-2 text-xs font-bold">
							<option value="CEO">Centro Odontológico (CEO)</option>
							<option value="CEM">Centro Médico (CEM)</option>
							<option value="UBS">Unidade Básica (UBS)</option>
							<option value="SMS">Secretaria de Saúde (SMS)</option>
							<option value="TFD">Logística TFD</option>
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<label for="usr-senha" class="font-bold text-slate-700 text-[11px]">Senha Temporária *</label>
						<input id="usr-senha" type="text" bind:value={formSenha} class="border border-slate-300 p-2 text-xs bg-slate-50 font-bold" />
					</div>
				</div>

				<div class="bg-emerald-50 border border-emerald-300 p-3 text-[11px] text-emerald-950 font-semibold">
					ℹ O usuário será vinculado diretamente ao <strong>{formTipoUnidade}</strong> e será redirecionado para a face correspondente ao realizar login.
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalNovoAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={salvarNovoUsuario}
					disabled={salvando}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950 disabled:opacity-50"
				>
					{salvando ? 'Salvando no Servidor...' : '✓ Salvar e Credenciar'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal 2: Editar Usuário -->
{#if modalEditarAberto && usuarioEdicao}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-lg border-2 border-slate-900 bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">Editar Cadastro: {usuarioEdicao.nome}</div>
				<button onclick={() => modalEditarAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				<div class="flex flex-col gap-1">
					<label for="ed-nome" class="font-bold text-slate-700 text-[11px]">Nome Completo</label>
					<input id="ed-nome" type="text" bind:value={formNome} class="border border-slate-300 p-2 text-xs" />
				</div>
				<div class="flex flex-col gap-1">
					<label for="ed-email" class="font-bold text-slate-700 text-[11px]">E-mail Institucional</label>
					<input id="ed-email" type="email" bind:value={formEmail} class="border border-slate-300 p-2 text-xs" />
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="ed-perfil" class="font-bold text-slate-700 text-[11px]">Perfil de Acesso</label>
						<select id="ed-perfil" bind:value={formPerfil} class="border border-slate-300 p-2 text-xs bg-white font-bold">
							<option value="MEDICO">Médico Especialista</option>
							<option value="REGULADOR_SMS">Regulador SMS / Recepção</option>
							<option value="ATENDENTE_UBS">Atendente Recepção</option>
							<option value="COORDENADOR_UBS">Diretoria / Coordenação</option>
							<option value="ADMIN">Administrador Geral</option>
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<label for="ed-tipo-unidade" class="font-bold text-slate-700 text-[11px]">Unidade / Face Vinculada</label>
						<select id="ed-tipo-unidade" bind:value={formTipoUnidade} class="border border-emerald-400 bg-emerald-50 text-emerald-950 p-2 text-xs font-bold">
							<option value="CEO">Centro Odontológico (CEO)</option>
							<option value="CEM">Centro Médico (CEM)</option>
							<option value="UBS">Unidade Básica (UBS)</option>
							<option value="SMS">Secretaria de Saúde (SMS)</option>
							<option value="TFD">Logística TFD</option>
						</select>
					</div>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalEditarAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={salvarEdicaoUsuario}
					disabled={salvando}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950 disabled:opacity-50"
				>
					{salvando ? 'Atualizando...' : '✓ Salvar Alterações'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal 3: Reset de Senha -->
{#if modalResetSenhaAberto && usuarioEdicao}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-md border-2 border-slate-900 bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-amber-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">🔑 Redefinir Senha do Usuário</div>
				<button onclick={() => modalResetSenhaAberto = false} class="text-amber-200 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				<div class="text-slate-800">
					Definir nova senha temporária para <strong>{usuarioEdicao.nome}</strong>:
				</div>
				<div class="flex flex-col gap-1">
					<label for="rst-senha" class="font-bold text-slate-700 text-[11px]">Nova Senha Temporária *</label>
					<input id="rst-senha" type="text" bind:value={formNovaSenha} class="border border-slate-300 p-2 text-xs font-bold" />
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalResetSenhaAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={executarResetSenha}
					disabled={salvando}
					class="border border-amber-900 bg-amber-900 px-5 py-2 font-bold text-white uppercase hover:bg-amber-950 disabled:opacity-50"
				>
					{salvando ? 'Enviando...' : '✓ Confirmar Reset'}
				</button>
			</div>
		</div>
	</div>
{/if}
