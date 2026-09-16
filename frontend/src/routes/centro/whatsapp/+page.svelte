<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		WhatsAppConversaDTO,
		WhatsAppMensagemDTO,
		WhatsAppConfigDTO,
		SalvarWhatsAppConfigRequest,
		EnviarTemplateWhatsAppRequest
	} from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	interface Props {
		centroTipoPadrao?: 'CEM' | 'CEO' | 'TODOS';
	}

	let { centroTipoPadrao = 'CEM' }: Props = $props();
	const auth = useAuth();

	// Estados da fila e conversas
	let loading = $state(true);
	let loadingConversa = $state(false);
	let sending = $state(false);
	let errorMsg = $state<string | null>(null);
	let successMsg = $state<string | null>(null);

	let conversas = $state<WhatsAppConversaDTO[]>([]);
	let metricas = $state({ totalPendentes: 0, minhasAtivas: 0, totalHoje: 0 });
	let conversaAtiva = $state<WhatsAppConversaDTO | null>(null);

	// Filtros
	let abaSelecionada = $state<'TODAS' | 'PENDENTES' | 'MINHAS' | 'RESOLVIDAS'>('PENDENTES');
	let termoBusca = $state('');
	let tagFiltro = $state('');

	// Mensagem de envio
	let textoMensagem = $state('');

	// Modais
	let modalConfigAberto = $state(false);
	let modalTransferirAberto = $state(false);
	let modalTemplateAberto = $state(false);

	// Configuração Meta
	let configMeta = $state<WhatsAppConfigDTO | null>(null);
	let formConfig = $state<SalvarWhatsAppConfigRequest>({
		phoneNumberId: '',
		wabaId: '',
		accessToken: '',
		webhookVerifyToken: 'unisism_meta_verify_token_2026',
		businessPhoneNumber: '+55 75 99999-0000',
		nomeExibicao: 'Central de Especialidades',
		ativo: true,
		horarioInicio: '07:00',
		horarioFim: '18:00',
		mensagemBoasVindas: 'Olá! Bem-vindo(a) ao atendimento oficial do Centro de Especialidades. Como podemos ajudar?',
		mensagemForaHorario: 'Olá! Nosso horário de atendimento é das 07:00 às 18:00. Sua mensagem foi recebida e responderemos em breve!',
		mensagemConfirmacao: 'Olá, {{nome}}! Confirmamos sua consulta de {{especialidade}} com {{medico}} para o dia {{data}} às {{hora}}. Responda SIM para confirmar ou NÃO para reagendar.'
	});
	let salvandoConfig = $state(false);
	let testandoConexao = $state(false);
	let statusConexao = $state<{ valid: boolean; name?: string; displayPhoneNumber?: string; error?: string } | null>(null);

	// Transferência
	let novoAtendenteNome = $state('');

	// Template de Envio
	let templateSelecionado = $state<'CONFIRMACAO_CONSULTA' | 'LEMBRETE_VESPERA' | 'VAGA_LIBERADA' | 'ORIENTACOES_PREPARO'>('CONFIRMACAO_CONSULTA');
	let variaveisTemplate = $state({
		nome: '',
		especialidade: '',
		medico: '',
		data: '',
		hora: '',
		local: '',
		protocolo: '',
		textoExtra: ''
	});

	// Polling em background para atualização em tempo real (a cada 4 segundos)
	let intervalId: any = null;
	let chatContainer = $state<HTMLDivElement | null>(null);

	async function carregarConversas(silencioso = false) {
		if (!silencioso) loading = true;
		errorMsg = null;
		try {
			const res = await api.centroWhatsApp.listarConversas({
				aba: abaSelecionada,
				busca: termoBusca.trim() || undefined,
				centroTipo: centroTipoPadrao !== 'TODOS' ? centroTipoPadrao : undefined,
				tag: tagFiltro || undefined
			});
			conversas = res.conversas;
			metricas = res.metricas;

			// Atualiza a conversa ativa se estiver aberta
			if (conversaAtiva) {
				const atualizada = conversas.find((c) => c.id === conversaAtiva!.id);
				if (atualizada && atualizada.ultimaMensagemData !== conversaAtiva.ultimaMensagemData) {
					void carregarDetalhesConversa(conversaAtiva.id, true);
				}
			}
		} catch (e: any) {
			console.error(e);
			if (!silencioso) {
				errorMsg = e.message || 'Erro ao carregar lista de conversas do WhatsApp.';
			}
		} finally {
			if (!silencioso) loading = false;
		}
	}

	async function carregarDetalhesConversa(id: string, silencioso = false) {
		if (!silencioso) loadingConversa = true;
		try {
			const det = await api.centroWhatsApp.obterConversa(id);
			conversaAtiva = det;

			// Pré-preenche variáveis do template se vinculado a paciente/encaminhamento
			variaveisTemplate = {
				nome: det.paciente?.nome || det.nomeContato,
				especialidade: det.encaminhamento?.especialidade || '',
				medico: det.encaminhamento?.profissionalAgendado || '',
				data: det.encaminhamento?.agendamentoPrevisto ? new Date(det.encaminhamento.agendamentoPrevisto).toLocaleDateString('pt-BR') : '',
				hora: det.encaminhamento?.agendamentoPrevisto ? new Date(det.encaminhamento.agendamentoPrevisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
				local: det.centroTipo === 'CEO' ? 'Centro Odontológico Especializado' : 'Centro de Especialidades Médicas (CEM)',
				protocolo: det.encaminhamento?.protocolo || '',
				textoExtra: ''
			};

			rolarParaFim();
		} catch (e: any) {
			console.error(e);
			errorMsg = e.message || 'Erro ao carregar histórico da conversa.';
		} finally {
			if (!silencioso) loadingConversa = false;
		}
	}

	function rolarParaFim() {
		setTimeout(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 100);
	}

	async function enviarMensagem() {
		if (!textoMensagem.trim() || !conversaAtiva || sending) return;

		sending = true;
		const corpo = textoMensagem.trim();
		textoMensagem = '';

		try {
			await api.centroWhatsApp.enviarMensagem(conversaAtiva.id, { corpo, tipo: 'TEXTO' });
			await carregarDetalhesConversa(conversaAtiva.id, true);
			await carregarConversas(true);
		} catch (e: any) {
			errorMsg = e.message || 'Erro ao enviar mensagem via Meta API.';
			textoMensagem = corpo;
		} finally {
			sending = false;
		}
	}

	async function assumirAtendimento() {
		if (!conversaAtiva) return;
		try {
			await api.centroWhatsApp.assumirConversa(conversaAtiva.id);
			await carregarDetalhesConversa(conversaAtiva.id, true);
			await carregarConversas(true);
			successMsg = 'Atendimento assumido com sucesso!';
			setTimeout(() => (successMsg = null), 3000);
		} catch (e: any) {
			errorMsg = e.message || 'Erro ao assumir atendimento.';
		}
	}

	async function transferirAtendimento() {
		if (!conversaAtiva || !novoAtendenteNome.trim()) return;
		try {
			await api.centroWhatsApp.transferirConversa(conversaAtiva.id, {
				novoAtendenteId: 'ATENDENTE_' + Date.now(),
				novoAtendenteNome: novoAtendenteNome.trim()
			});
			modalTransferirAberto = false;
			novoAtendenteNome = '';
			await carregarDetalhesConversa(conversaAtiva.id, true);
			await carregarConversas(true);
			successMsg = 'Conversa transferida com sucesso!';
			setTimeout(() => (successMsg = null), 3000);
		} catch (e: any) {
			errorMsg = e.message || 'Erro ao transferir atendimento.';
		}
	}

	async function finalizarAtendimento() {
		if (!conversaAtiva) return;
		if (!confirm(`Deseja realmente finalizar o atendimento com ${conversaAtiva.nomeContato}?`)) return;

		try {
			await api.centroWhatsApp.finalizarConversa(conversaAtiva.id, { motivo: 'Resolvido pelo atendente' });
			await carregarDetalhesConversa(conversaAtiva.id, true);
			await carregarConversas(true);
			successMsg = 'Atendimento finalizado com sucesso.';
			setTimeout(() => (successMsg = null), 3000);
		} catch (e: any) {
			errorMsg = e.message || 'Erro ao finalizar atendimento.';
		}
	}

	async function enviarTemplateModal() {
		if (!conversaAtiva) return;
		sending = true;
		try {
			await api.centroWhatsApp.enviarTemplate(conversaAtiva.id, {
				tipoTemplate: templateSelecionado,
				variaveis: variaveisTemplate
			});
			modalTemplateAberto = false;
			await carregarDetalhesConversa(conversaAtiva.id, true);
			await carregarConversas(true);
			successMsg = 'Template disparado com sucesso via WhatsApp!';
			setTimeout(() => (successMsg = null), 3000);
		} catch (e: any) {
			errorMsg = e.message || 'Erro ao enviar template.';
		} finally {
			sending = false;
		}
	}

	async function alternarTag(tag: string) {
		if (!conversaAtiva) return;
		const set = new Set(conversaAtiva.tags || []);
		if (set.has(tag)) set.delete(tag);
		else set.add(tag);

		const novasTags = Array.from(set);
		try {
			await api.centroWhatsApp.atualizarTags(conversaAtiva.id, { tags: novasTags });
			conversaAtiva.tags = novasTags;
			await carregarConversas(true);
		} catch (e: any) {
			console.error(e);
		}
	}

	// Configuração Meta
	async function abrirModalConfig() {
		modalConfigAberto = true;
		statusConexao = null;
		try {
			const cfg = await api.centroWhatsApp.getConfig();
			configMeta = cfg;
			formConfig = {
				phoneNumberId: cfg.phoneNumberId || '',
				wabaId: cfg.wabaId || '',
				accessToken: '',
				webhookVerifyToken: cfg.webhookVerifyToken || 'unisism_meta_verify_token_2026',
				businessPhoneNumber: cfg.businessPhoneNumber || '+55 75 99999-0000',
				nomeExibicao: cfg.nomeExibicao || 'Central de Regulação e Especialidades',
				ativo: cfg.ativo !== undefined ? cfg.ativo : true,
				horarioInicio: cfg.horarioInicio || '07:00',
				horarioFim: cfg.horarioFim || '18:00',
				mensagemBoasVindas: cfg.mensagemBoasVindas || '',
				mensagemForaHorario: cfg.mensagemForaHorario || '',
				mensagemConfirmacao: cfg.mensagemConfirmacao || ''
			};
		} catch (e) {
			console.error(e);
		}
	}

	async function testarConexaoMeta() {
		testandoConexao = true;
		statusConexao = null;
		try {
			const res = await api.centroWhatsApp.testarConexao();
			statusConexao = res;
		} catch (e: any) {
			statusConexao = { valid: false, error: e.message || 'Falha ao conectar com Meta.' };
		} finally {
			testandoConexao = false;
		}
	}

	async function salvarConfiguracoesMeta() {
		if (!formConfig.phoneNumberId.trim() || !formConfig.webhookVerifyToken.trim()) {
			alert('Phone Number ID e Webhook Verify Token são obrigatórios.');
			return;
		}
		salvandoConfig = true;
		try {
			await api.centroWhatsApp.salvarConfig(formConfig);
			modalConfigAberto = false;
			successMsg = 'Configurações da Meta Cloud API salvas com sucesso!';
			setTimeout(() => (successMsg = null), 4000);
		} catch (e: any) {
			alert(e.message || 'Erro ao salvar configuração.');
		} finally {
			salvandoConfig = false;
		}
	}

	function formatarDataHora(iso: string): string {
		try {
			const d = new Date(iso);
			const hoje = new Date();
			const ehHoje = d.toDateString() === hoje.toDateString();
			if (ehHoje) {
				return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
			}
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso;
		}
	}

	onMount(() => {
		carregarConversas();
		intervalId = setInterval(() => {
			carregarConversas(true);
		}, 4000);
	});

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
	});
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col bg-slate-100 font-mono text-slate-800">
	<!-- Topo de Métricas e Controles Globais -->
	<header class="flex flex-wrap items-center justify-between border-b border-slate-300 bg-white px-4 py-2.5 shadow-sm">
		<div class="flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center bg-emerald-700 font-bold text-white shadow-sm">
				💬
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-sm font-bold tracking-wider uppercase text-slate-900">
						CRM WhatsApp Multi-Atendentes · Meta Cloud API
					</h1>
					<span class="bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
						API OFICIAL META v20
					</span>
				</div>
				<p class="text-[11px] text-slate-500">
					Central de Atendimento Unificada · CEM e CEO com Automação de Confirmações e Regulação
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<!-- Pílulas de Métricas -->
			<div class="flex items-center gap-2">
				<div class="flex items-center gap-1.5 border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
					<span class="font-bold">{metricas.totalPendentes}</span>
					<span class="text-[10px] uppercase text-amber-700">Na Fila</span>
				</div>
				<div class="flex items-center gap-1.5 border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-900">
					<span class="font-bold">{metricas.minhasAtivas}</span>
					<span class="text-[10px] uppercase text-indigo-700">Minhas</span>
				</div>
				<div class="flex items-center gap-1.5 border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
					<span class="font-bold">{metricas.totalHoje}</span>
					<span class="text-[10px] uppercase text-slate-500">Hoje</span>
				</div>
			</div>

			<!-- Botão Configurações Meta -->
			<button
				type="button"
				onclick={abrirModalConfig}
				class="flex items-center gap-1.5 border border-slate-400 bg-white px-3 py-1.5 text-xs font-bold uppercase text-slate-800 hover:bg-slate-50 transition-colors"
			>
				⚙️ Configurar Meta
			</button>
		</div>
	</header>

	<!-- Notificações globais de erro ou sucesso -->
	{#if errorMsg}
		<div class="border-b border-red-300 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800 flex items-center justify-between">
			<span>⚠️ {errorMsg}</span>
			<button onclick={() => (errorMsg = null)} class="font-bold hover:underline">FECHAR</button>
		</div>
	{/if}
	{#if successMsg}
		<div class="border-b border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 flex items-center justify-between">
			<span>✅ {successMsg}</span>
			<button onclick={() => (successMsg = null)} class="font-bold hover:underline">FECHAR</button>
		</div>
	{/if}

	<!-- Painel Principal em 3 Colunas -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Coluna 1: Lista de Conversas & Fila (320px) -->
		<section class="flex w-80 flex-col border-r border-slate-300 bg-white">
			<!-- Barra de Busca -->
			<div class="border-b border-slate-200 p-2.5 bg-slate-50">
				<input
					type="text"
					bind:value={termoBusca}
					oninput={() => carregarConversas()}
					placeholder="Buscar contato, telefone, CPF..."
					class="w-full border border-slate-300 bg-white px-3 py-1.5 text-xs placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
				/>
			</div>

			<!-- Abas de Filtro -->
			<div class="flex border-b border-slate-200 bg-slate-100 text-[11px] font-bold">
				<button
					type="button"
					onclick={() => {
						abaSelecionada = 'PENDENTES';
						carregarConversas();
					}}
					class="flex-1 py-2 text-center transition-colors {abaSelecionada === 'PENDENTES'
						? 'border-b-2 border-amber-600 bg-white text-amber-900'
						: 'text-slate-600 hover:bg-slate-200'}"
				>
					FILA ({metricas.totalPendentes})
				</button>
				<button
					type="button"
					onclick={() => {
						abaSelecionada = 'MINHAS';
						carregarConversas();
					}}
					class="flex-1 py-2 text-center transition-colors {abaSelecionada === 'MINHAS'
						? 'border-b-2 border-indigo-600 bg-white text-indigo-900'
						: 'text-slate-600 hover:bg-slate-200'}"
				>
					MINHAS ({metricas.minhasAtivas})
				</button>
				<button
					type="button"
					onclick={() => {
						abaSelecionada = 'TODAS';
						carregarConversas();
					}}
					class="flex-1 py-2 text-center transition-colors {abaSelecionada === 'TODAS'
						? 'border-b-2 border-slate-800 bg-white text-slate-900'
						: 'text-slate-600 hover:bg-slate-200'}"
				>
					TODAS
				</button>
				<button
					type="button"
					onclick={() => {
						abaSelecionada = 'RESOLVIDAS';
						carregarConversas();
					}}
					class="flex-1 py-2 text-center transition-colors {abaSelecionada === 'RESOLVIDAS'
						? 'border-b-2 border-emerald-600 bg-white text-emerald-900'
						: 'text-slate-600 hover:bg-slate-200'}"
				>
					RESOLVIDAS
				</button>
			</div>

			<!-- Lista Rolável de Contatos -->
			<div class="flex-1 overflow-y-auto divide-y divide-slate-100">
				{#if loading && conversas.length === 0}
					<div class="p-6 text-center text-xs text-slate-500">
						Carregando conversas do WhatsApp...
					</div>
				{:else if conversas.length === 0}
					<div class="p-6 text-center text-xs text-slate-500">
						Nenhuma conversa encontrada nesta aba.
					</div>
				{:else}
					{#each conversas as c (c.id)}
						{@const ativa = conversaAtiva?.id === c.id}
						<button
							type="button"
							onclick={() => carregarDetalhesConversa(c.id)}
							class="w-full text-left p-3 transition-colors flex items-start gap-2.5 {ativa
								? 'bg-indigo-50/70 border-l-4 border-indigo-600'
								: 'hover:bg-slate-50'}"
						>
							<div class="flex h-9 w-9 shrink-0 items-center justify-center bg-slate-200 text-xs font-bold text-slate-700 uppercase">
								{c.nomeContato.charAt(0) || 'P'}
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-1">
									<div class="truncate text-xs font-bold text-slate-900">
										{c.nomeContato}
									</div>
									<span class="text-[10px] text-slate-400 shrink-0">
										{formatarDataHora(c.ultimaMensagemData)}
									</span>
								</div>

								<div class="flex items-center gap-1.5 text-[11px] text-slate-500">
									<span>+{c.telefone}</span>
									{#if c.cpf}
										<span class="text-[10px] text-slate-400">· {c.cpf}</span>
									{/if}
								</div>

								<div class="truncate text-xs text-slate-600 mt-0.5">
									{c.ultimaMensagemTexto || 'Nenhuma mensagem recente'}
								</div>

								<!-- Badges de status e tags -->
								<div class="mt-1.5 flex flex-wrap items-center gap-1">
									{#if c.naoLidas > 0}
										<span class="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
											{c.naoLidas} nova{c.naoLidas > 1 ? 's' : ''}
										</span>
									{/if}

									{#if c.status === 'PENDENTE'}
										<span class="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] px-1 py-0.2">
											FILA
										</span>
									{:else if c.status === 'EM_ATENDIMENTO'}
										<span class="bg-indigo-100 text-indigo-800 border border-indigo-300 text-[9px] px-1 py-0.2">
											{c.atendenteNome ? `👤 ${c.atendenteNome.split(' ')[0]}` : 'ATENDENDO'}
										</span>
									{:else if c.status === 'FINALIZADO'}
										<span class="bg-slate-100 text-slate-600 border border-slate-300 text-[9px] px-1 py-0.2">
											RESOLVIDO
										</span>
									{/if}

									{#if c.tags?.includes('CONFIRMADO')}
										<span class="bg-emerald-100 text-emerald-800 text-[9px] px-1 py-0.2 border border-emerald-300">
											CONFIRMADO
										</span>
									{/if}
									{#if c.tags?.includes('REAGENDAMENTO_SOLICITADO')}
										<span class="bg-red-100 text-red-800 text-[9px] px-1 py-0.2 border border-red-300">
											REAGENDAR
										</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</section>

		<!-- Coluna 2: Janela de Chat Ativa (Flex-1) -->
		<section class="flex flex-1 flex-col bg-slate-100 overflow-hidden">
			{#if !conversaAtiva}
				<div class="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
					<div class="text-4xl mb-2">💬</div>
					<div class="text-sm font-bold text-slate-600 uppercase tracking-wider">Nenhuma conversa selecionada</div>
					<p class="text-xs max-w-sm mt-1 text-slate-500">
						Selecione um paciente na fila ou realize uma busca para iniciar o atendimento pelo WhatsApp oficial.
					</p>
				</div>
			{:else}
				<!-- Cabeçalho do Chat -->
				<header class="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-2.5 shadow-sm">
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center bg-slate-800 font-bold text-white uppercase text-sm">
							{conversaAtiva.nomeContato.charAt(0)}
						</div>
						<div>
							<div class="flex items-center gap-2">
								<h2 class="text-xs font-bold text-slate-900 uppercase">
									{conversaAtiva.nomeContato}
								</h2>
								<span class="border border-slate-300 bg-slate-50 px-1.5 py-0.2 text-[10px] text-slate-600">
									+{conversaAtiva.telefone}
								</span>
								{#if conversaAtiva.status === 'PENDENTE'}
									<span class="bg-amber-100 border border-amber-300 text-amber-800 text-[10px] px-2 py-0.5 font-bold">
										AGUARDANDO ATENDENTE
									</span>
								{:else}
									<span class="bg-indigo-100 border border-indigo-300 text-indigo-800 text-[10px] px-2 py-0.5 font-bold">
										ATENDENTE: {conversaAtiva.atendenteNome || 'Central'}
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-2 text-[11px] text-slate-500">
								{#if conversaAtiva.cpf}
									<span>CPF: {conversaAtiva.cpf}</span>
								{/if}
								{#if conversaAtiva.encaminhamento}
									<span class="text-indigo-700 font-bold">
										· {conversaAtiva.encaminhamento.especialidade} ({conversaAtiva.encaminhamento.protocolo})
									</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Botões de Ação do Atendimento -->
					<div class="flex items-center gap-2">
						{#if conversaAtiva.status === 'PENDENTE' || conversaAtiva.atendenteId !== auth.me?.id}
							<button
								type="button"
								onclick={assumirAtendimento}
								class="bg-indigo-700 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-indigo-800 transition-colors shadow-sm"
							>
								🙋‍♂️ Assumir Conversa
							</button>
						{/if}

						<button
							type="button"
							onclick={() => (modalTransferirAberto = true)}
							class="border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50"
						>
							Transferir
						</button>

						<button
							type="button"
							onclick={() => (modalTemplateAberto = true)}
							class="border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold uppercase text-emerald-800 hover:bg-emerald-100"
						>
							⚡ Template
						</button>

						{#if conversaAtiva.status !== 'FINALIZADO'}
							<button
								type="button"
								onclick={finalizarAtendimento}
								class="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-200"
							>
								Finalizar
							</button>
						{/if}
					</div>
				</header>

				<!-- Barra de Tags Rápidas -->
				<div class="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[10px]">
					<span class="font-bold text-slate-500 uppercase">Tags da Conversa:</span>
					<button
						type="button"
						onclick={() => alternarTag('CONFIRMADO')}
						class="px-2 py-0.5 border transition-colors {conversaAtiva.tags?.includes('CONFIRMADO')
							? 'bg-emerald-600 border-emerald-700 text-white font-bold'
							: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}"
					>
						✓ Confirmado
					</button>
					<button
						type="button"
						onclick={() => alternarTag('REAGENDAMENTO_SOLICITADO')}
						class="px-2 py-0.5 border transition-colors {conversaAtiva.tags?.includes('REAGENDAMENTO_SOLICITADO')
							? 'bg-red-600 border-red-700 text-white font-bold'
							: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}"
					>
						✕ Reagendamento
					</button>
					<button
						type="button"
						onclick={() => alternarTag('DUVIDA')}
						class="px-2 py-0.5 border transition-colors {conversaAtiva.tags?.includes('DUVIDA')
							? 'bg-amber-600 border-amber-700 text-white font-bold'
							: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}"
					>
						? Dúvida / Informação
					</button>
					<button
						type="button"
						onclick={() => alternarTag('REGULACAO')}
						class="px-2 py-0.5 border transition-colors {conversaAtiva.tags?.includes('REGULACAO')
							? 'bg-indigo-600 border-indigo-700 text-white font-bold'
							: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}"
					>
						Regulação SUS
					</button>
				</div>

				<!-- Feed de Mensagens (Rolável) -->
				<div
					bind:this={chatContainer}
					class="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100"
				>
					{#if loadingConversa}
						<div class="text-center text-xs text-slate-500 py-6">Carregando histórico...</div>
					{:else if !conversaAtiva.mensagens || conversaAtiva.mensagens.length === 0}
						<div class="text-center text-xs text-slate-500 py-6">
							Nenhuma mensagem trocada ainda nesta conversa.
						</div>
					{:else}
						{#each conversaAtiva.mensagens as m (m.id)}
							{@const isAtendente = m.origem === 'ATENDENTE'}
							{@const isBot = m.origem === 'SISTEMA_BOT'}
							{@const isPaciente = m.origem === 'PACIENTE'}

							{#if isBot}
								<!-- Mensagem de Sistema / Automação -->
								<div class="flex justify-center my-2">
									<div class="max-w-md bg-purple-50 border border-purple-200 px-3 py-1.5 text-center text-xs text-purple-900 shadow-2xs">
										<div class="font-bold text-[10px] text-purple-700 uppercase tracking-wider mb-0.5">
											🤖 Automação UNISISM
										</div>
										<p class="whitespace-pre-wrap">{m.corpo}</p>
										<span class="text-[9px] text-purple-400 mt-1 block">
											{formatarDataHora(m.enviadoEm)}
										</span>
									</div>
								</div>
							{:else if isAtendente}
								<!-- Mensagem Enviada pelo Atendente -->
								<div class="flex justify-end">
									<div class="max-w-lg bg-emerald-800 text-white px-3.5 py-2 shadow-sm">
										<div class="flex items-center justify-between gap-2 text-[10px] text-emerald-200 font-bold mb-1">
											<span>Atendente: {m.atendenteNome || 'Recepção'}</span>
											<span>{formatarDataHora(m.enviadoEm)}</span>
										</div>
										<p class="text-xs whitespace-pre-wrap leading-relaxed">{m.corpo}</p>
										<div class="mt-1 flex items-center justify-end gap-1 text-[9px] text-emerald-200">
											{#if m.statusEnvio === 'LIDO'}
												<span class="text-sky-300 font-bold">✓✓ Lido</span>
											{:else if m.statusEnvio === 'ENTREGUE'}
												<span>✓✓ Entregue</span>
											{:else if m.statusEnvio === 'ENVIADO'}
												<span>✓ Enviado</span>
											{:else if m.statusEnvio === 'FALHA'}
												<span class="text-red-300 font-bold">⚠️ Falha no envio</span>
											{:else}
												<span>Pendente</span>
											{/if}
										</div>
									</div>
								</div>
							{:else}
								<!-- Mensagem Recebida do Paciente -->
								<div class="flex justify-start">
									<div class="max-w-lg bg-white border border-slate-300 text-slate-900 px-3.5 py-2 shadow-2xs">
										<div class="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-bold mb-1">
											<span>{conversaAtiva.nomeContato}</span>
											<span>{formatarDataHora(m.enviadoEm)}</span>
										</div>
										<p class="text-xs whitespace-pre-wrap leading-relaxed">{m.corpo}</p>
									</div>
								</div>
							{/if}
						{/each}
					{/if}
				</div>

				<!-- Barra de Envio de Mensagem -->
				<footer class="border-t border-slate-300 bg-white p-3">
					<form
						onsubmit={(e) => {
							e.preventDefault();
							enviarMensagem();
						}}
						class="flex items-end gap-2"
					>
						<textarea
							bind:value={textoMensagem}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									enviarMensagem();
								}
							}}
							placeholder="Escreva sua resposta ao paciente (pressione Enter para enviar)..."
							rows="2"
							class="flex-1 resize-none border border-slate-300 p-2 text-xs focus:border-emerald-600 focus:outline-none"
						></textarea>

						<button
							type="submit"
							disabled={sending || !textoMensagem.trim()}
							class="h-14 bg-emerald-700 px-5 font-bold uppercase text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-sm text-xs flex items-center justify-center gap-1.5"
						>
							{#if sending}
								Enviando...
							{:else}
								Enviar 📤
							{/if}
						</button>
					</form>
				</footer>
			{/if}
		</section>

		<!-- Coluna 3: Painel Lateral com Contexto Clínico do Paciente (280px) -->
		{#if conversaAtiva}
			<aside class="w-72 border-l border-slate-300 bg-white p-4 overflow-y-auto text-xs space-y-4">
				<div>
					<h3 class="font-bold uppercase tracking-wider text-slate-400 text-[10px] border-b border-slate-200 pb-1">
						Ficha do Paciente
					</h3>
					<div class="mt-2 space-y-1.5">
						<div>
							<span class="text-[10px] text-slate-500 uppercase block">Nome Completo</span>
							<span class="font-bold text-slate-900">{conversaAtiva.paciente?.nome || conversaAtiva.nomeContato}</span>
						</div>
						<div>
							<span class="text-[10px] text-slate-500 uppercase block">CPF</span>
							<span class="font-mono text-slate-800">{conversaAtiva.cpf || 'Não cadastrado'}</span>
						</div>
						<div>
							<span class="text-[10px] text-slate-500 uppercase block">Cartão SUS</span>
							<span class="font-mono text-slate-800">{conversaAtiva.paciente?.cartaoSus || 'Não informado'}</span>
						</div>
						<div>
							<span class="text-[10px] text-slate-500 uppercase block">Telefone WhatsApp</span>
							<span class="font-mono text-slate-800">+{conversaAtiva.telefone}</span>
						</div>
						{#if conversaAtiva.paciente?.ubs}
							<div>
								<span class="text-[10px] text-slate-500 uppercase block">UBS de Origem</span>
								<span class="text-slate-800">{conversaAtiva.paciente.ubs.nome}</span>
							</div>
						{/if}
					</div>
				</div>

				{#if conversaAtiva.encaminhamento}
					<div>
						<h3 class="font-bold uppercase tracking-wider text-slate-400 text-[10px] border-b border-slate-200 pb-1">
							Encaminhamento Ativo
						</h3>
						<div class="mt-2 space-y-1.5 bg-slate-50 border border-slate-200 p-2.5">
							<div>
								<span class="text-[10px] text-slate-500 uppercase block">Protocolo</span>
								<span class="font-bold text-indigo-900">{conversaAtiva.encaminhamento.protocolo}</span>
							</div>
							<div>
								<span class="text-[10px] text-slate-500 uppercase block">Especialidade</span>
								<span class="font-semibold text-slate-800">{conversaAtiva.encaminhamento.especialidade}</span>
							</div>
							<div>
								<span class="text-[10px] text-slate-500 uppercase block">Especialista</span>
								<span class="text-slate-800">{conversaAtiva.encaminhamento.profissionalAgendado || 'A definir'}</span>
							</div>
							<div>
								<span class="text-[10px] text-slate-500 uppercase block">Data e Horário</span>
								<span class="text-slate-800">
									{conversaAtiva.encaminhamento.agendamentoPrevisto
										? formatarDataHora(conversaAtiva.encaminhamento.agendamentoPrevisto)
										: 'Aguardando agendamento'}
								</span>
							</div>
						</div>
					</div>
				{/if}

				<!-- Ações Rápidas de Automação -->
				<div>
					<h3 class="font-bold uppercase tracking-wider text-slate-400 text-[10px] border-b border-slate-200 pb-1">
						Automações
					</h3>
					<div class="mt-2 space-y-1.5">
						<button
							type="button"
							onclick={() => {
								templateSelecionado = 'CONFIRMACAO_CONSULTA';
								modalTemplateAberto = true;
							}}
							class="w-full text-left p-2 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-[11px]"
						>
							📅 Disparar Confirmação
						</button>
						<button
							type="button"
							onclick={() => {
								templateSelecionado = 'LEMBRETE_VESPERA';
								modalTemplateAberto = true;
							}}
							class="w-full text-left p-2 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-[11px]"
						>
							🔔 Disparar Lembrete Véspera
						</button>
						<button
							type="button"
							onclick={() => {
								templateSelecionado = 'VAGA_LIBERADA';
								modalTemplateAberto = true;
							}}
							class="w-full text-left p-2 border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-[11px]"
						>
							🎉 Notificar Vaga Deferida
						</button>
					</div>
				</div>
			</aside>
		{/if}
	</div>
</div>

<!-- Modal: Configuração da Meta WhatsApp Cloud API -->
{#if modalConfigAberto}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
		<div class="w-full max-w-2xl bg-white border border-slate-400 shadow-2xl">
			<header class="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-4 py-3">
				<div class="flex items-center gap-2">
					<span class="text-base">⚙️</span>
					<h2 class="text-xs font-bold uppercase tracking-wider text-slate-900">
						Configuração Oficial Meta WhatsApp Cloud API
					</h2>
				</div>
				<button
					type="button"
					onclick={() => (modalConfigAberto = false)}
					class="text-slate-500 hover:text-slate-900 font-bold"
				>
					✕
				</button>
			</header>

			<form onsubmit={(e) => { e.preventDefault(); salvarConfiguracoesMeta(); }} class="p-4 space-y-3 max-h-[80vh] overflow-y-auto text-xs">
				{#if statusConexao}
					<div class="p-3 border {statusConexao.valid ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-red-50 border-red-300 text-red-900'}">
						<div class="font-bold flex items-center gap-1.5">
							<span>{statusConexao.valid ? '✅ Conexão Meta Válida' : '❌ Falha de Autenticação na Meta'}</span>
						</div>
						{#if statusConexao.valid}
							<p class="mt-1 text-[11px]">
								Nome da Linha: <strong>{statusConexao.name}</strong> · Número: <strong>{statusConexao.displayPhoneNumber}</strong>
							</p>
						{:else}
							<p class="mt-1 text-[11px]">{statusConexao.error}</p>
						{/if}
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							Phone Number ID (Meta) *
						</label>
						<input
							type="text"
							bind:value={formConfig.phoneNumberId}
							required
							placeholder="Ex: 1048291048102"
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							WhatsApp Business Account ID (WABA)
						</label>
						<input
							type="text"
							bind:value={formConfig.wabaId}
							placeholder="Ex: 928391829381"
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
						Meta Access Token (System User / Permanente) *
					</label>
					<input
						type="password"
						bind:value={formConfig.accessToken}
						placeholder={configMeta?.accessTokenMascarado ? `Atual: ${configMeta.accessTokenMascarado} (preencha para alterar)` : 'EAAB...'}
						class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
					/>
					<span class="text-[10px] text-slate-400 mt-0.5 block">
						Token permanente gerado no Meta Business Manager com permissões `whatsapp_business_messaging`.
					</span>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							Webhook Verify Token *
						</label>
						<input
							type="text"
							bind:value={formConfig.webhookVerifyToken}
							required
							placeholder="Token de verificação do Webhook"
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							Telefone Comercial de Exibição
						</label>
						<input
							type="text"
							bind:value={formConfig.businessPhoneNumber}
							placeholder="+55 75 99999-0000"
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
						Nome da Central de Atendimento
					</label>
					<input
						type="text"
						bind:value={formConfig.nomeExibicao}
						placeholder="Ex: Central de Especialidades e Regulação UNISISM"
						class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							Horário Início
						</label>
						<input
							type="time"
							bind:value={formConfig.horarioInicio}
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
							Horário Término
						</label>
						<input
							type="time"
							bind:value={formConfig.horarioFim}
							class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
						/>
					</div>
				</div>

				<footer class="flex items-center justify-between border-t border-slate-200 pt-3 mt-4">
					<button
						type="button"
						disabled={testandoConexao}
						onclick={testarConexaoMeta}
						class="border border-indigo-700 bg-indigo-50 px-4 py-2 font-bold uppercase text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
					>
						{testandoConexao ? 'Testando...' : '🔍 Testar Conexão Meta'}
					</button>

					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => (modalConfigAberto = false)}
							class="border border-slate-300 px-4 py-2 uppercase font-bold text-slate-700 hover:bg-slate-100"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={salvandoConfig}
							class="bg-emerald-700 px-5 py-2 font-bold uppercase text-white hover:bg-emerald-800 disabled:opacity-50"
						>
							{salvandoConfig ? 'Salvando...' : 'Salvar Configuração'}
						</button>
					</div>
				</footer>
			</form>
		</div>
	</div>
{/if}

<!-- Modal: Transferir Conversa -->
{#if modalTransferirAberto && conversaAtiva}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
		<div class="w-full max-w-md bg-white border border-slate-400 p-4 shadow-2xl">
			<h3 class="text-xs font-bold uppercase text-slate-900 border-b border-slate-200 pb-2 mb-3">
				Transferir Atendimento
			</h3>
			<p class="text-xs text-slate-600 mb-3">
				Transfira a conversa de <strong>{conversaAtiva.nomeContato}</strong> para outro colega atendente da recepção ou regulação.
			</p>
			<div>
				<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
					Nome do Novo Atendente *
				</label>
				<input
					type="text"
					bind:value={novoAtendenteNome}
					placeholder="Ex: Beatriz Lima (Recepção)"
					class="w-full border border-slate-300 p-2 text-xs focus:border-indigo-600 focus:outline-none"
				/>
			</div>
			<div class="flex justify-end gap-2 mt-4">
				<button
					type="button"
					onclick={() => (modalTransferirAberto = false)}
					class="border border-slate-300 px-3 py-1.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-100"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={transferirAtendimento}
					class="bg-indigo-700 px-4 py-1.5 text-xs font-bold uppercase text-white hover:bg-indigo-800"
				>
					Confirmar Transferência
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal: Disparo de Template Oficial -->
{#if modalTemplateAberto && conversaAtiva}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
		<div class="w-full max-w-lg bg-white border border-slate-400 shadow-2xl">
			<header class="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-4 py-2.5">
				<h3 class="text-xs font-bold uppercase text-slate-900">
					Disparar Template de Notificação
				</h3>
				<button type="button" onclick={() => (modalTemplateAberto = false)} class="text-slate-500 hover:text-slate-900">✕</button>
			</header>

			<form onsubmit={(e) => { e.preventDefault(); enviarTemplateModal(); }} class="p-4 space-y-3 text-xs">
				<div>
					<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">
						Tipo de Template
					</label>
					<select
						bind:value={templateSelecionado}
						class="w-full border border-slate-300 p-2 text-xs focus:border-emerald-600 focus:outline-none"
					>
						<option value="CONFIRMACAO_CONSULTA">📅 Confirmação de Consulta (com resposta SIM/NÃO)</option>
						<option value="LEMBRETE_VESPERA">🔔 Lembrete de Véspera de Atendimento</option>
						<option value="VAGA_LIBERADA">🎉 Aviso de Vaga Deferida pela Regulação</option>
						<option value="ORIENTACOES_PREPARO">📋 Orientações de Preparo / Exame</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Nome Paciente</label>
						<input type="text" bind:value={variaveisTemplate.nome} class="w-full border border-slate-300 p-1.5 text-xs" />
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Especialidade</label>
						<input type="text" bind:value={variaveisTemplate.especialidade} class="w-full border border-slate-300 p-1.5 text-xs" />
					</div>
				</div>

				<div class="grid grid-cols-3 gap-2">
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Médico</label>
						<input type="text" bind:value={variaveisTemplate.medico} class="w-full border border-slate-300 p-1.5 text-xs" />
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Data</label>
						<input type="text" bind:value={variaveisTemplate.data} placeholder="DD/MM/AAAA" class="w-full border border-slate-300 p-1.5 text-xs" />
					</div>
					<div>
						<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Hora</label>
						<input type="text" bind:value={variaveisTemplate.hora} placeholder="08:00" class="w-full border border-slate-300 p-1.5 text-xs" />
					</div>
				</div>

				<div>
					<label class="block font-bold text-slate-700 uppercase text-[10px] mb-1">Local / Unidade</label>
					<input type="text" bind:value={variaveisTemplate.local} class="w-full border border-slate-300 p-1.5 text-xs" />
				</div>

				<footer class="flex items-center justify-end gap-2 border-t border-slate-200 pt-3 mt-4">
					<button
						type="button"
						onclick={() => (modalTemplateAberto = false)}
						class="border border-slate-300 px-4 py-2 uppercase font-bold text-slate-700 hover:bg-slate-100"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={sending}
						class="bg-emerald-700 px-5 py-2 font-bold uppercase text-white hover:bg-emerald-800 disabled:opacity-50"
					>
						{sending ? 'Disparando...' : 'Disparar Template ⚡'}
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}
