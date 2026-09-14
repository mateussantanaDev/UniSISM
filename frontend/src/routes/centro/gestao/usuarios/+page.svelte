<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type {
		UsuarioListado,
		Role,
		EscalaMedicoCentro,
		EspecialidadeSigtapCentro,
		SalaConsultorioCentro,
		Prefeitura
	} from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconKey,
		IconEdit,
		IconUserPlus,
		IconShield,
		IconRefresh,
		IconStethoscope,
		IconDental,
		IconCalendar,
		IconClock,
		IconPlus,
		IconTrash,
		IconX,
		IconBuildingHospital,
		IconBuildingCommunity
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived<'CEM' | 'CEO'>(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');

	const DIAS_SEMANA = [
		{ sigla: 'SEG', label: 'Segunda-feira' },
		{ sigla: 'TER', label: 'Terça-feira' },
		{ sigla: 'QUA', label: 'Quarta-feira' },
		{ sigla: 'QUI', label: 'Quinta-feira' },
		{ sigla: 'SEX', label: 'Sexta-feira' },
		{ sigla: 'SAB', label: 'Sábado' }
	];

	// State
	let carregando = $state(true);
	let salvando = $state(false);
	let erro = $state('');
	let mensagemSucesso = $state('');

	let listaUsuarios = $state<UsuarioListado[]>([]);
	let listaEscalas = $state<EscalaMedicoCentro[]>([]);
	let especialidadesCatalogo = $state<EspecialidadeSigtapCentro[]>([]);
	let salasDisponiveis = $state<SalaConsultorioCentro[]>([]);
	let prefeiturasDisponiveis = $state<Prefeitura[]>([]);
	let prefeituraConectada = $state<Prefeitura | null>(null);

	let busca = $state('');
	let filtroPerfil = $state<string>('TODOS');
	let filtroStatus = $state<'TODOS' | 'ATIVO' | 'INATIVO'>('TODOS');

	// Modals
	let modalNovoAberto = $state(false);
	let modalEditarAberto = $state(false);
	let modalResetSenhaAberto = $state(false);
	let modalAtribuicoesAberto = $state(false);

	let usuarioEdicao = $state<UsuarioListado | null>(null);
	let usuarioAtribuicao = $state<UsuarioListado | null>(null);

	// Form State - Novo / Editar Usuario
	let formNome = $state('');
	let formCpf = $state('');
	let formEmail = $state('');
	let formMatricula = $state('');
	let formPerfil = $state<any>('MEDICO');
	let formTipoUnidade = $state<'CEO' | 'CEM' | 'UBS' | 'SMS' | 'TFD'>('CEM');
	let formEspecialidade = $state('Cardiologia');
	let formRegistroProfissional = $state('');
	let formSenha = $state('Mudar@123');
	let formPrefeituraId = $state<string>('');

	// Reset Senha Form State
	let formNovaSenha = $state('');
	let usuarioLogado = $state<any>(null);
	let isSuperUser = $derived(usuarioLogado?.role === 'ADMIN' || usuarioLogado?.role === 'DESENVOLVEDOR');
	let isDev = $derived(usuarioLogado?.role === 'DESENVOLVEDOR');

	// Form State - Atribuição de Serviço & Atendimento ao Médico
	let atriEspecialidadeId = $state('');
	let atriEspecialidadeNome = $state('');
	let atriTipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let atriDias = $state<string[]>(['SEG', 'QUA']);
	let atriHorarioInicio = $state('08:00');
	let atriHorarioFim = $state('12:00');
	let atriDuracaoMinutos = $state(20);
	let atriVagasPorTurno = $state(12);
	let erroModalAtribuicao = $state('');
	let salvandoAtribuicao = $state(false);

	async function carregarDados() {
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

			const [resUsers, resEscalas, resEsp, resSalas, resPrefs] = await Promise.all([
				api.admin.listUsuarios(query).catch(e => {
					console.error('Erro ao listar usuários:', e);
					return [] as UsuarioListado[];
				}),
				api.centroGestao.listEscalas({ centro: siglaOrgao }).catch(e => {
					console.error('Erro ao listar escalas:', e);
					return [] as EscalaMedicoCentro[];
				}),
				api.centroGestao.listEspecialidades({ centro: siglaOrgao }).catch(e => {
					console.error('Erro ao listar especialidades:', e);
					return [] as EspecialidadeSigtapCentro[];
				}),
				api.centroGestao.listSalas({ centro: siglaOrgao }).catch(e => {
					console.error('Erro ao listar salas:', e);
					return [] as SalaConsultorioCentro[];
				}),
				api.admin.listPrefeituras().catch(e => {
					console.error('Erro ao listar prefeituras:', e);
					return [] as Prefeitura[];
				})
			]);

			listaUsuarios = resUsers || [];
			listaEscalas = resEscalas || [];
			especialidadesCatalogo = resEsp || [];
			salasDisponiveis = resSalas || [];
			prefeiturasDisponiveis = resPrefs || [];

			// Resolução da Prefeitura Conectada
			if (usuarioLogado?.prefeituraId) {
				prefeituraConectada = prefeiturasDisponiveis.find(p => p.id === usuarioLogado.prefeituraId) || null;
			}
			if (!prefeituraConectada && prefeiturasDisponiveis.length > 0) {
				prefeituraConectada = prefeiturasDisponiveis.find(p => p.ativa) || prefeiturasDisponiveis[0];
			}
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao carregar dados do servidor: ${e?.message || 'Erro de conexão'}`;
		} finally {
			carregando = false;
		}
	}

	const carregarUsuarios = carregarDados;

	onMount(() => {
		carregarDados();
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

	let erroModalUsuario = $state('');

	function abrirNovoUsuario() {
		erroModalUsuario = '';
		formNome = '';
		formCpf = '';
		formEmail = '';
		formMatricula = '';
		formPerfil = 'MEDICO';
		formTipoUnidade = siglaOrgao;
		formEspecialidade = ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada';
		formRegistroProfissional = '';
		formSenha = 'Mudar@123';
		formPrefeituraId = prefeituraConectada?.id || (prefeiturasDisponiveis[0]?.id ?? '');
		modalNovoAberto = true;
	}

	async function salvarNovoUsuario() {
		if (!formNome.trim() || !formCpf.trim() || !formEmail.trim()) {
			erroModalUsuario = 'Preencha os campos obrigatórios (Nome, CPF e E-mail).';
			return;
		}
		if (isDev && !formPrefeituraId && prefeiturasDisponiveis.length > 0) {
			erroModalUsuario = 'Selecione a Prefeitura vinculada ao usuário.';
			return;
		}

		erroModalUsuario = '';
		salvando = true;
		try {
			await api.admin.createUsuario({
				nome: formNome.trim(),
				cpf: formCpf.replace(/\D/g, ''),
				email: formEmail.trim(),
				matricula: formMatricula.trim() || undefined,
				role: formPerfil as Role,
				tipoUnidade: siglaOrgao,
				prefeituraId: formPrefeituraId || prefeituraConectada?.id || usuarioLogado?.prefeituraId || undefined,
				senha: formSenha.trim()
			});

			mensagemSucesso = `✓ Usuário ${formNome} cadastrado com sucesso no ${siglaOrgao}!`;
			modalNovoAberto = false;
			await carregarUsuarios();
			setTimeout(() => (mensagemSucesso = ''), 5000);
		} catch (e: any) {
			console.error(e);
			erroModalUsuario = `Falha ao cadastrar usuário: ${e?.message || 'Erro do servidor'}`;
		} finally {
			salvando = false;
		}
	}

	function abrirEditar(u: UsuarioListado) {
		erroModalUsuario = '';
		usuarioEdicao = u;
		formNome = u.nome;
		formCpf = u.cpf || '';
		formEmail = u.email || '';
		formMatricula = u.matricula || '';
		formPerfil = ((u as any).perfil || u.role) as Role;
		formTipoUnidade = (u.tipoUnidade || siglaOrgao) as any;
		formPrefeituraId = u.prefeitura?.id || (u as any).prefeituraId || u.ubs?.prefeitura?.id || prefeituraConectada?.id || '';
		modalEditarAberto = true;
	}

	async function salvarEdicaoUsuario() {
		if (!usuarioEdicao) return;
		if (isDev && !formPrefeituraId && prefeiturasDisponiveis.length > 0) {
			erroModalUsuario = 'Selecione a Prefeitura vinculada ao usuário.';
			return;
		}

		erroModalUsuario = '';
		salvando = true;
		try {
			await api.admin.updateUsuario(usuarioEdicao.id, {
				nome: formNome.trim(),
				email: formEmail.trim(),
				role: formPerfil as Role,
				tipoUnidade: usuarioEdicao.tipoUnidade || siglaOrgao,
				prefeituraId: formPrefeituraId || prefeituraConectada?.id || (usuarioEdicao as any).prefeituraId || undefined
			});

			mensagemSucesso = `✓ Cadastro do usuário ${formNome} atualizado com sucesso!`;
			modalEditarAberto = false;
			await carregarUsuarios();
			setTimeout(() => (mensagemSucesso = ''), 5000);
		} catch (e: any) {
			console.error(e);
			erroModalUsuario = `Falha ao atualizar usuário: ${e?.message || 'Erro do servidor'}`;
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
				setTimeout(() => (mensagemSucesso = ''), 4000);
			} catch (e: any) {
				console.error(e);
				erro = `Falha ao alterar status do usuário: ${e?.message || 'Erro de permissão'}`;
			}
		}
	}

	function abrirResetSenha(u: UsuarioListado) {
		erroModalUsuario = '';
		usuarioEdicao = u;
		formNovaSenha = 'UniSISM@2026';
		modalResetSenhaAberto = true;
	}

	async function executarResetSenha() {
		if (!usuarioEdicao || !formNovaSenha.trim()) return;
		erroModalUsuario = '';
		salvando = true;
		try {
			await api.admin.resetarSenhaUsuario(usuarioEdicao.id, formNovaSenha.trim());
			mensagemSucesso = `✓ Senha do usuário ${usuarioEdicao.nome} redefinida com sucesso! O usuário deverá alterá-la no próximo login.`;
			modalResetSenhaAberto = false;
			setTimeout(() => (mensagemSucesso = ''), 5000);
		} catch (e: any) {
			console.error(e);
			erroModalUsuario = `Falha ao redefinir senha: ${e?.message || 'Erro do servidor'}`;
		} finally {
			salvando = false;
		}
	}

	function formatarRoleLabel(role: string): string {
		const map: Record<string, string> = {
			MEDICO: ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista',
			MEDICO_ESPECIALISTA: ehCeo ? 'Cirurgião-Dentista Plantonista' : 'Médico Plantonista',
			ATENDENTE_CENTRO: `Atendente Recepção ${siglaOrgao}`,
			ATENDENTE_UBS: `Atendente Recepção ${siglaOrgao}`,
			REGULADOR_SMS: `Regulador ${siglaOrgao}`,
			COORDENADOR_UBS: `Coordenação / Supervisão ${siglaOrgao}`,
			ADMIN: `Gestor Geral / Diretor ${siglaOrgao}`,
			DESENVOLVEDOR: 'Desenvolvedor / TI'
		};
		return map[role] || role;
	}

	function isProfissional(u: UsuarioListado): boolean {
		const role = ((u as any).perfil || u.role || '').toUpperCase();
		const nome = (u.nome || '').toLowerCase();
		return (
			role.includes('MEDICO') ||
			role.includes('DENTISTA') ||
			role.includes('ESPECIALISTA') ||
			nome.startsWith('dr.') ||
			nome.startsWith('dra.')
		);
	}

	function getEscalasDoUsuario(u: UsuarioListado): EscalaMedicoCentro[] {
		return listaEscalas.filter(escala => {
			if (escala.medicoId && escala.medicoId === u.id) return true;
			if (escala.medicoNome && escala.medicoNome.toLowerCase() === u.nome.toLowerCase()) return true;
			if (u.matricula && escala.crm && escala.crm.toLowerCase().includes(u.matricula.toLowerCase())) return true;
			return false;
		});
	}

	let escalasDoUsuarioAtual = $derived.by(() => {
		if (!usuarioAtribuicao) return [];
		return getEscalasDoUsuario(usuarioAtribuicao);
	});

	function abrirAtribuicoes(u: UsuarioListado) {
		usuarioAtribuicao = u;
		erroModalAtribuicao = '';
		salvandoAtribuicao = false;
		if (especialidadesCatalogo.length > 0) {
			const primeira = especialidadesCatalogo[0];
			atriEspecialidadeId = primeira.id;
			atriEspecialidadeNome = primeira.nome;
			atriTipoServico = primeira.tipoServico || 'CONSULTA';
			atriDuracaoMinutos = primeira.tempoPadraoMinutos || 20;
		} else {
			atriEspecialidadeId = '';
			atriEspecialidadeNome = '';
			atriTipoServico = 'CONSULTA';
			atriDuracaoMinutos = 20;
		}
		atriDias = ['SEG', 'QUA'];
		atriHorarioInicio = '08:00';
		atriHorarioFim = '12:00';
		atriVagasPorTurno = 12;
		modalAtribuicoesAberto = true;
	}

	function aoSelecionarEspecialidade(idOuNome: string) {
		const esp = especialidadesCatalogo.find(e => e.id === idOuNome || e.nome === idOuNome);
		if (esp) {
			atriEspecialidadeId = esp.id;
			atriEspecialidadeNome = esp.nome;
			atriTipoServico = esp.tipoServico || 'CONSULTA';
			atriDuracaoMinutos = esp.tempoPadraoMinutos || 20;
		} else {
			atriEspecialidadeNome = idOuNome;
		}
	}

	function toggleAtriDia(sigla: string) {
		if (atriDias.includes(sigla)) {
			if (atriDias.length > 1) {
				atriDias = atriDias.filter(d => d !== sigla);
			}
		} else {
			atriDias = [...atriDias, sigla];
		}
	}

	async function salvarAtribuicao() {
		if (!usuarioAtribuicao) return;
		if (!atriEspecialidadeNome.trim()) {
			erroModalAtribuicao = 'Selecione a especialidade / serviço a ser atribuído.';
			return;
		}
		if (atriDias.length === 0) {
			erroModalAtribuicao = 'Selecione pelo menos um dia da semana para o atendimento.';
			return;
		}

		erroModalAtribuicao = '';
		salvandoAtribuicao = true;
		try {
			const regProf = usuarioAtribuicao.matricula || (ehCeo ? 'CRO-PE' : 'CRM-PE');
			await api.centroGestao.criarEscala({
				medicoId: usuarioAtribuicao.id,
				medicoNome: usuarioAtribuicao.nome,
				crm: regProf,
				especialidade: atriEspecialidadeNome.trim(),
				tipoServico: atriTipoServico,
				procedimentoId: atriEspecialidadeId || undefined,
				diasSemana: atriDias,
				horarioInicio: atriHorarioInicio,
				horarioFim: atriHorarioFim,
				duracaoMinutos: Number(atriDuracaoMinutos) || 20,
				vagasPorTurno: Number(atriVagasPorTurno) || 12,
				status: 'ATIVA',
				ativo: true
			});

			listaEscalas = await api.centroGestao.listEscalas({ centro: siglaOrgao });
			mensagemSucesso = `✓ Atendimento "${atriEspecialidadeNome}" atribuído com sucesso a ${usuarioAtribuicao.nome}!`;
			setTimeout(() => (mensagemSucesso = ''), 5000);
		} catch (e: any) {
			console.error(e);
			erroModalAtribuicao = `Falha ao atribuir serviço: ${e?.message || 'Erro do servidor'}`;
		} finally {
			salvandoAtribuicao = false;
		}
	}

	async function removerAtribuicao(escala: EscalaMedicoCentro) {
		if (!escala.id) return;
		if (!confirm(`Deseja realmente remover a atribuição de "${escala.especialidade}" do profissional ${escala.medicoNome}?`)) {
			return;
		}

		try {
			await api.centroGestao.excluirEscala(escala.id);
			listaEscalas = await api.centroGestao.listEscalas({ centro: siglaOrgao });
			mensagemSucesso = `✓ Atribuição de "${escala.especialidade}" removida com sucesso!`;
			setTimeout(() => (mensagemSucesso = ''), 4000);
		} catch (e: any) {
			console.error(e);
			erroModalAtribuicao = `Falha ao remover atribuição: ${e?.message || 'Erro do servidor'}`;
		}
	}
</script>

<svelte:head>
	<title>ERP Gestão - Equipes e Usuários · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="GESTÃO DE EQUIPES, PROFISSIONAIS & ACESSOS — {nomeOrgao.toUpperCase()}"
		subtitle="Cadastro oficial de profissionais de saúde, credenciamento de {rotuloRegistro}, gestão de perfis de acesso e controle de credenciais do {nomeOrgao}."
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
			<span class="flex items-center gap-1.5">
				<IconAlertTriangle size={15} class="text-amber-700 shrink-0" />
				<span>{erro}</span>
			</span>
			<button onclick={carregarUsuarios} class="border border-amber-800 bg-amber-800 text-white px-3 py-1 text-xs uppercase font-bold">
				Recarregar Dados
			</button>
		</div>
	{/if}

	<!-- Indicador de Escopo de Permissão -->
	<div class="border border-slate-200 bg-white p-3 flex items-center justify-between">
		{#if isSuperUser}
			<div class="flex items-center gap-2">
				<span class="bg-indigo-900 text-white px-2 py-0.5 font-bold text-[10px]">ESCOPO GLOBAL</span>
				<span class="text-slate-700 text-[11px] font-bold">Perfil Administrador/Desenvolvedor — Exibindo todos os usuários cadastrados na rede municipal.</span>
			</div>
		{:else}
			<div class="flex items-center gap-2">
				<span class="bg-blue-900 text-white px-2 py-0.5 font-bold text-[10px]">ESCOPO DO CENTRO</span>
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
				<option value="MEDICO">{ehCeo ? 'Cirurgiões-Dentistas' : 'Médicos Especialistas'}</option>
				<option value="MEDICO_ESPECIALISTA">{ehCeo ? 'Dentistas Plantonistas' : 'Médicos Plantonistas'}</option>
				<option value="ATENDENTE_CENTRO">Atendentes / Recepção</option>
				<option value="REGULADOR_SMS">Reguladores / Recepção</option>
				<option value="COORDENADOR_UBS">Coordenação / Supervisão</option>
				<option value="ADMIN">Gestor Geral / Diretor</option>
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
							<th class="p-3">Serviços & Atendimentos Atribuídos</th>
							<th class="p-3">CPF / Matrícula</th>
							<th class="p-3">E-mail de Contato</th>
							<th class="p-3">Status</th>
							<th class="p-3 text-right">Ações ERP</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 text-xs font-mono">
						{#if usuariosFiltrados.length === 0}
							<tr>
								<td colspan="7" class="p-8 text-center text-slate-500">
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
									<td class="p-3 text-slate-800">
										{#if isProfissional(u)}
											{@const escalasProf = getEscalasDoUsuario(u)}
											{#if escalasProf.length > 0}
												<div class="flex flex-col gap-1 max-w-[280px]">
													<div class="flex items-center gap-1">
														<span class="bg-indigo-900 text-white px-1.5 py-0.2 text-[9px] font-bold">
															{escalasProf.length} SERVIÇO(S) ATRIBUÍDO(S)
														</span>
													</div>
													<div class="flex flex-wrap gap-1">
														{#each escalasProf as esc}
															<span class="bg-slate-100 border border-slate-300 text-slate-800 px-1.5 py-0.5 text-[9px] font-semibold" title="{esc.especialidade} ({esc.diasSemana?.join(', ')})">
																<strong class="text-blue-900">{esc.especialidade}</strong>
																<span class="text-slate-500 font-mono">({esc.diasSemana?.join(', ') || 'Sem dias'})</span>
															</span>
														{/each}
													</div>
												</div>
											{:else}
												<span class="bg-amber-50 border border-amber-300 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
													Nenhum serviço atribuído
												</span>
											{/if}
										{:else}
											<span class="text-slate-400 text-[11px]">—</span>
										{/if}
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
											{#if isProfissional(u)}
												<button
													onclick={() => abrirAtribuicoes(u)}
													class="border border-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 px-2 py-1 text-[10px] font-bold flex items-center gap-1 shrink-0"
													title="Atribuir Atendimentos, Especialidades e Dias da Agenda"
												>
													{#if ehCeo}
														<IconDental size={12} class="text-indigo-700" />
													{:else}
														<IconStethoscope size={12} class="text-indigo-700" />
													{/if}
													<span>Atribuições</span>
												</button>
											{/if}
											<button
												onclick={() => abrirEditar(u)}
												class="border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-[10px] font-bold flex items-center gap-1"
												title="Editar Credenciais"
											>
												<IconEdit size={12} />
												<span>Editar</span>
											</button>
											<button
												onclick={() => abrirResetSenha(u)}
												class="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-1 text-[10px] font-bold flex items-center gap-1"
												title="Resetar Senha"
											>
												<IconKey size={12} />
												<span>Reset</span>
											</button>
											<button
												onclick={() => toggleStatusUsuario(u)}
												class="border px-2 py-1 text-[10px] font-bold {u.ativo ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'}"
											>
												{u.ativo ? 'Inativar' : 'Ativar'}
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
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs">
		<div class="w-full max-w-xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">+ Cadastrar Novo Gestor / Profissional / Usuário</div>
				<button onclick={() => modalNovoAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroModalUsuario}
					<div class="border border-rose-200 bg-rose-50 p-2.5 text-rose-900 font-bold flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="text-rose-700 shrink-0" />
						<span>{erroModalUsuario}</span>
					</div>
				{/if}

				<!-- Prefeitura Vinculada: Dropdown manual quando Desenvolvedor, Card informativo para os demais -->
				{#if isDev}
					<div class="border-2 border-indigo-600 bg-indigo-50/70 p-3 flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="bg-indigo-700 text-white p-1 flex items-center justify-center">
									<IconBuildingCommunity size={16} />
								</div>
								<label for="usr-pref" class="text-[11px] font-bold uppercase text-indigo-950 tracking-wider">
									Prefeitura / Município Vinculado *
								</label>
							</div>
							<span class="bg-indigo-700 text-white text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
								Modo Desenvolvedor
							</span>
						</div>

						<select
							id="usr-pref"
							bind:value={formPrefeituraId}
							class="border border-indigo-400 bg-white p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
						>
							<option value="">-- Selecione a Prefeitura --</option>
							{#each prefeiturasDisponiveis as pref}
								<option value={pref.id}>
									{pref.nome} {pref.cnpj ? `(CNPJ: ${pref.cnpj})` : ''} {pref.ativa ? '• ATIVA' : ''}
								</option>
							{/each}
						</select>
						<span class="text-[10px] text-indigo-900 font-semibold">
							Como Desenvolvedor, você pode selecionar manualmente qual prefeitura receberá o cadastro deste usuário.
						</span>
					</div>
				{:else if prefeituraConectada}
					<div class="border-2 border-emerald-600 bg-emerald-50/80 p-3 flex items-center justify-between">
						<div class="flex items-center gap-2.5">
							<div class="bg-emerald-700 text-white p-1.5 flex items-center justify-center">
								<IconBuildingCommunity size={18} />
							</div>
							<div>
								<span class="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Prefeitura Conectada ao Sistema</span>
								<div class="text-xs font-bold text-emerald-950">{prefeituraConectada.nome}</div>
							</div>
						</div>
						<span class="border border-emerald-700 bg-emerald-100 text-emerald-900 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
							{prefeituraConectada.cnpj ? `CNPJ: ${prefeituraConectada.cnpj}` : 'Município Ativo'}
						</span>
					</div>
				{/if}

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
							<option value="ADMIN">Gestor Geral / Diretor do {siglaOrgao} (Administrador)</option>
							<option value="COORDENADOR_UBS">Coordenação / Supervisão do {siglaOrgao}</option>
							{#if ehCeo}
								<option value="MEDICO">Cirurgião-Dentista Especialista</option>
								<option value="MEDICO_ESPECIALISTA">Cirurgião-Dentista Plantonista</option>
								<option value="ATENDENTE_CENTRO">Atendente / Recepção CEO</option>
								<option value="REGULADOR_SMS">Regulador do CEO</option>
							{:else}
								<option value="MEDICO">Médico Especialista</option>
								<option value="MEDICO_ESPECIALISTA">Médico Plantonista / Clínico</option>
								<option value="ATENDENTE_CENTRO">Atendente / Recepção CEM</option>
								<option value="REGULADOR_SMS">Regulador do CEM</option>
							{/if}
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<span class="font-bold text-slate-700 text-[11px]">Unidade / Face Vinculada</span>
						<div class="border border-blue-900 bg-blue-50 text-blue-950 p-2 text-xs font-bold font-mono flex items-center justify-between">
							<span>{siglaOrgao} — {nomeOrgao}</span>
							<span class="bg-blue-900 text-white text-[9px] px-2 py-0.5 uppercase">Automático</span>
						</div>
					</div>
					<div class="flex flex-col gap-1">
						<label for="usr-senha" class="font-bold text-slate-700 text-[11px]">Senha Temporária *</label>
						<input id="usr-senha" type="text" bind:value={formSenha} class="border border-slate-300 p-2 text-xs bg-slate-50 font-bold" />
					</div>
				</div>

				<div class="bg-blue-50 border border-blue-300 p-3 text-[11px] text-blue-950 font-semibold flex items-center gap-2">
					<IconShield size={16} class="text-blue-900 shrink-0" />
					<span>O usuário será vinculado à <strong>{prefeituraConectada?.nome || 'Prefeitura Conectada'}</strong> com credenciais de acesso ao <strong>{nomeOrgao} ({siglaOrgao})</strong>.</span>
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
					{salvando ? 'Cadastrando...' : 'Cadastrar Usuário'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal 2: Editar Usuário -->
{#if modalEditarAberto && usuarioEdicao}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs">
		<div class="w-full max-w-lg border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">Editar Cadastro: {usuarioEdicao.nome}</div>
				<button onclick={() => modalEditarAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroModalUsuario}
					<div class="border border-rose-200 bg-rose-50 p-2.5 text-rose-900 font-bold flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="text-rose-700 shrink-0" />
						<span>{erroModalUsuario}</span>
					</div>
				{/if}

				<!-- Prefeitura Vinculada: Dropdown manual quando Desenvolvedor, Card informativo para os demais -->
				{#if isDev}
					<div class="border-2 border-indigo-600 bg-indigo-50/70 p-3 flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="bg-indigo-700 text-white p-1 flex items-center justify-center">
									<IconBuildingCommunity size={16} />
								</div>
								<label for="ed-pref" class="text-[11px] font-bold uppercase text-indigo-950 tracking-wider">
									Prefeitura / Município Vinculado *
								</label>
							</div>
							<span class="bg-indigo-700 text-white text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
								Modo Desenvolvedor
							</span>
						</div>

						<select
							id="ed-pref"
							bind:value={formPrefeituraId}
							class="border border-indigo-400 bg-white p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
						>
							<option value="">-- Selecione a Prefeitura --</option>
							{#each prefeiturasDisponiveis as pref}
								<option value={pref.id}>
									{pref.nome} {pref.cnpj ? `(CNPJ: ${pref.cnpj})` : ''} {pref.ativa ? '• ATIVA' : ''}
								</option>
							{/each}
						</select>
						<span class="text-[10px] text-indigo-900 font-semibold">
							Como Desenvolvedor, você pode alterar manualmente o município de lotação deste usuário.
						</span>
					</div>
				{:else if prefeituraConectada}
					<div class="border border-emerald-300 bg-emerald-50 p-2.5 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<IconBuildingCommunity size={16} class="text-emerald-800 shrink-0" />
							<div>
								<span class="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Prefeitura Conectada</span>
								<div class="text-xs font-bold text-emerald-950">{prefeituraConectada.nome}</div>
							</div>
						</div>
						<span class="border border-emerald-600 bg-emerald-100 text-emerald-900 text-[9px] font-bold px-2 py-0.5 uppercase">
							{prefeituraConectada.cnpj ? `CNPJ: ${prefeituraConectada.cnpj}` : 'Ativa'}
						</span>
					</div>
				{/if}

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
							<option value="ADMIN">Gestor Geral / Diretor do {siglaOrgao} (Administrador)</option>
							<option value="COORDENADOR_UBS">Coordenação / Supervisão do {siglaOrgao}</option>
							{#if ehCeo}
								<option value="MEDICO">Cirurgião-Dentista Especialista</option>
								<option value="MEDICO_ESPECIALISTA">Cirurgião-Dentista Plantonista</option>
								<option value="ATENDENTE_CENTRO">Atendente / Recepção CEO</option>
								<option value="REGULADOR_SMS">Regulador do CEO</option>
							{:else}
								<option value="MEDICO">Médico Especialista</option>
								<option value="MEDICO_ESPECIALISTA">Médico Plantonista / Clínico</option>
								<option value="ATENDENTE_CENTRO">Atendente / Recepção CEM</option>
								<option value="REGULADOR_SMS">Regulador do CEM</option>
							{/if}
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<span class="font-bold text-slate-700 text-[11px]">Unidade / Face Vinculada</span>
						<div class="border border-slate-300 bg-slate-100 text-slate-800 p-2 text-xs font-bold font-mono flex items-center justify-between">
							<span>{usuarioEdicao.tipoUnidade || siglaOrgao} — {usuarioEdicao.tipoUnidade === 'CEO' ? 'Centro Odontológico' : usuarioEdicao.tipoUnidade === 'CEM' ? 'Centro Médico' : siglaOrgao}</span>
							<span class="bg-slate-700 text-white text-[9px] px-2 py-0.5 uppercase">Fixo</span>
						</div>
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
					{salvando ? 'Atualizando...' : 'Salvar Alterações'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal 3: Reset de Senha -->
{#if modalResetSenhaAberto && usuarioEdicao}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs">
		<div class="w-full max-w-md border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-amber-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">Redefinir Senha do Usuário</div>
				<button onclick={() => modalResetSenhaAberto = false} class="text-amber-200 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroModalUsuario}
					<div class="border border-rose-200 bg-rose-50 p-2.5 text-rose-900 font-bold flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="text-rose-700 shrink-0" />
						<span>{erroModalUsuario}</span>
					</div>
				{/if}
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
					{salvando ? 'Enviando...' : 'Confirmar Reset'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal 4: Atribuições Clínicas, Serviços Especializados & Agenda de Atendimento -->
{#if modalAtribuicoesAberto && usuarioAtribuicao}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs overflow-y-auto">
		<div class="w-full max-w-3xl border-2 border-slate-900 bg-white shadow-[10px_10px_0_rgba(15,23,42,0.15)] my-8">
			<!-- Header Modal -->
			<div class="flex items-center justify-between border-b border-slate-200 bg-indigo-950 px-5 py-3.5 text-white">
				<div class="flex items-center gap-2.5">
					<div class="flex h-7 w-7 items-center justify-center bg-indigo-800 text-white">
						{#if ehCeo}
							<IconDental size={16} />
						{:else}
							<IconStethoscope size={16} />
						{/if}
					</div>
					<div>
						<div class="font-bold uppercase tracking-wider text-xs">
							Atribuições de Atendimento & Agenda Clínica
						</div>
						<div class="text-[10px] text-indigo-300">
							Profissional: <span class="text-white font-bold">{usuarioAtribuicao.nome}</span> · {rotuloRegistro}: {usuarioAtribuicao.matricula || 'Não informado'}
						</div>
					</div>
				</div>
				<button onclick={() => (modalAtribuicoesAberto = false)} class="text-indigo-300 hover:text-white font-bold text-base">
					✕
				</button>
			</div>

			<div class="p-5 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
				{#if erroModalAtribuicao}
					<div class="border border-rose-300 bg-rose-50 p-3 text-rose-900 font-bold flex items-center gap-2">
						<IconAlertTriangle size={16} class="text-rose-700 shrink-0" />
						<span>{erroModalAtribuicao}</span>
					</div>
				{/if}

				<!-- Identificação do Profissional -->
				<div class="border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center bg-indigo-900 text-white font-bold text-sm">
							{usuarioAtribuicao.nome.substring(0, 2).toUpperCase()}
						</div>
						<div>
							<div class="text-sm font-bold text-slate-900">{usuarioAtribuicao.nome}</div>
							<div class="text-[11px] text-slate-600">
								CPF: <strong>{usuarioAtribuicao.cpf || '—'}</strong> · Função: <strong class="text-indigo-900">{formatarRoleLabel((usuarioAtribuicao as any).perfil || usuarioAtribuicao.role)}</strong>
							</div>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class="bg-indigo-100 text-indigo-900 border border-indigo-300 px-2 py-0.5 text-[10px] font-bold">
							{siglaOrgao} — {nomeOrgao}
						</span>
					</div>
				</div>

				<!-- Seção 1: Atendimentos e Serviços Atualmente Atribuídos -->
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
						<div class="text-[11px] font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
							<IconCalendar size={14} class="text-indigo-800" />
							<span>Serviços & Atendimentos Atribuídos ({escalasDoUsuarioAtual.length})</span>
						</div>
						<span class="text-[10px] text-slate-500">Escalas ativas na regulação e balcão</span>
					</div>

					{#if escalasDoUsuarioAtual.length === 0}
						<div class="border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-500 flex flex-col items-center gap-2">
							<IconAlertTriangle size={20} class="text-amber-600" />
							<div class="font-bold text-slate-700">Nenhum atendimento atribuído a este profissional ainda.</div>
							<div class="text-[11px] max-w-md">
								Utilize o formulário abaixo para vincular as especialidades/serviços que ele realiza e definir os dias e horários em que atenderá.
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-2.5">
							{#each escalasDoUsuarioAtual as esc (esc.id || esc.especialidade)}
								<div class="border border-slate-200 bg-white p-3 hover:border-indigo-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-2">
											<span class="bg-blue-900 text-white text-[9px] font-bold px-1.5 py-0.5 uppercase">
												{esc.tipoServico || 'CONSULTA'}
											</span>
											<span class="text-xs font-bold text-slate-900">{esc.especialidade}</span>
											<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-bold px-1.5 py-0.2">
												{esc.status || 'ATIVA'}
											</span>
										</div>
										<div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
											<div class="flex items-center gap-1">
												<IconCalendar size={12} class="text-slate-500" />
												<span class="font-bold text-slate-700">Dias:</span>
												<div class="flex gap-1">
													{#each (esc.diasSemana || []) as dia}
														<span class="bg-indigo-50 border border-indigo-200 text-indigo-900 px-1 py-0.2 text-[9px] font-bold">
															{dia}
														</span>
													{/each}
												</div>
											</div>
											<div class="flex items-center gap-1">
												<IconClock size={12} class="text-slate-500" />
												<span>{esc.horarioInicio || '08:00'} às {esc.horarioFim || '12:00'}</span>
											</div>
											<div class="text-slate-500">
												{esc.duracaoMinutos || 20} min/vaga · <strong>{esc.vagasPorTurno || 12} vagas/turno</strong>
											</div>
										</div>
									</div>

									<button
										type="button"
										onclick={() => removerAtribuicao(esc)}
										class="border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 self-start sm:self-center shrink-0"
										title="Desvincular e remover atendimento"
									>
										<IconTrash size={12} />
										<span>Desvincular</span>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Seção 2: Formulário de Atribuição de Novo Serviço/Atendimento -->
				<div class="border-t-2 border-slate-200 pt-4 flex flex-col gap-3">
					<div class="text-[11px] font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
						<IconPlus size={14} class="text-indigo-800" />
						<span>+ Atribuir Novo Serviço / Atendimento ao Profissional</span>
					</div>

					<div class="border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col gap-3.5">
						<!-- Seleção de Especialidade/Serviço do Catálogo -->
						<div class="flex flex-col gap-1">
							<label for="atri-esp" class="font-bold text-slate-800 text-[11px] flex items-center justify-between">
								<span>Serviço Especializado / Especialidade Habilitada *</span>
								<a href="/{siglaOrgao.toLowerCase()}/gestao/especialidades" class="text-indigo-700 hover:underline text-[10px] font-normal">
									Ver catálogo oficial de serviços ›
								</a>
							</label>

							{#if especialidadesCatalogo.length === 0}
								<div class="border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-[11px] flex items-center justify-between">
									<span>Nenhum serviço ou especialidade cadastrada no catálogo do {siglaOrgao}.</span>
									<a href="/{siglaOrgao.toLowerCase()}/gestao/especialidades" class="bg-amber-800 text-white px-2 py-1 text-[10px] font-bold uppercase">
										Cadastrar Serviços
									</a>
								</div>
							{:else}
								<select
									id="atri-esp"
									bind:value={atriEspecialidadeId}
									onchange={(e) => aoSelecionarEspecialidade((e.target as HTMLSelectElement).value)}
									class="border border-slate-300 bg-white p-2 text-xs font-bold"
								>
									{#each especialidadesCatalogo as esp}
										<option value={esp.id}>
											{esp.nome} — SIGTAP: {esp.codigoSigtap || 'SIA'} ({esp.tipoServico || 'CONSULTA'})
										</option>
									{/each}
								</select>
							{/if}
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
							<!-- Tipo de Atendimento -->
							<div class="flex flex-col gap-1">
								<label for="atri-tipo" class="font-bold text-slate-700 text-[11px]">Tipo de Atendimento *</label>
								<select id="atri-tipo" bind:value={atriTipoServico} class="border border-slate-300 bg-white p-2 text-xs font-bold">
									<option value="CONSULTA">Consulta Clínica Especializada</option>
									<option value="PROCEDIMENTO">Procedimento / Exame Especializado</option>
								</select>
							</div>

							<!-- Vagas por Turno -->
							<div class="flex flex-col gap-1">
								<label for="atri-vagas" class="font-bold text-slate-700 text-[11px]">Capacidade / Vagas por Turno *</label>
								<input id="atri-vagas" type="number" min="1" max="100" bind:value={atriVagasPorTurno} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
						</div>

						<!-- Dias da Semana de Atendimento -->
						<div class="flex flex-col gap-1.5">
							<span class="font-bold text-slate-700 text-[11px]">Dias de Atendimento na Semana *</span>
							<div class="flex flex-wrap gap-1.5">
								{#each DIAS_SEMANA as d}
									{@const selecionado = atriDias.includes(d.sigla)}
									<button
										type="button"
										onclick={() => toggleAtriDia(d.sigla)}
										class="px-3 py-1.5 text-xs font-bold border transition-colors flex items-center gap-1.5 {selecionado ? 'bg-indigo-900 border-indigo-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}"
									>
										<span>{d.sigla}</span>
										<span class="text-[10px] font-normal opacity-80">({d.label.split('-')[0]})</span>
										{#if selecionado}
											<IconCheck size={12} class="text-emerald-300" />
										{/if}
									</button>
								{/each}
							</div>
							<div class="text-[10px] text-slate-500">
								Selecione os dias em que o profissional executará este atendimento.
							</div>
						</div>

						<!-- Horários e Duração -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<div class="flex flex-col gap-1">
								<label for="atri-hi" class="font-bold text-slate-700 text-[11px]">Horário Início</label>
								<input id="atri-hi" type="time" bind:value={atriHorarioInicio} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
							<div class="flex flex-col gap-1">
								<label for="atri-hf" class="font-bold text-slate-700 text-[11px]">Horário Fim</label>
								<input id="atri-hf" type="time" bind:value={atriHorarioFim} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
							<div class="flex flex-col gap-1">
								<label for="atri-dur" class="font-bold text-slate-700 text-[11px]">Duração Slot (min)</label>
								<input id="atri-dur" type="number" min="5" max="180" step="5" bind:value={atriDuracaoMinutos} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
						</div>

						<div class="flex items-center justify-end mt-1">
							<button
								type="button"
								onclick={salvarAtribuicao}
								disabled={salvandoAtribuicao || especialidadesCatalogo.length === 0}
								class="border border-indigo-900 bg-indigo-900 text-white px-5 py-2 font-bold text-xs uppercase hover:bg-indigo-950 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
							>
								{#if salvandoAtribuicao}
									<span>Salvando Atribuição...</span>
								{:else}
									<IconPlus size={14} />
									<span>Salvar Atribuição & Escala</span>
								{/if}
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Rodapé do Modal -->
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
				<div class="text-[11px] text-slate-600">
					As atribuições ficam disponíveis de imediato no <strong>Agendamento de Balcão</strong> e na <strong>Regulação</strong>.
				</div>
				<button
					onclick={() => (modalAtribuicoesAberto = false)}
					class="border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 font-bold text-xs uppercase"
				>
					Concluir / Fechar
				</button>
			</div>
		</div>
	</div>
{/if}
