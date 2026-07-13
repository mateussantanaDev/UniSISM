<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	interface IntegracaoStatus {
		nome: string;
		descricao: string;
		tipo: 'Federal' | 'Interno';
		status: 'online' | 'offline';
		latencyMs: number;
		mensagem: string;
	}

	interface IntegracoesResponse {
		status: 'online' | 'degraded' | 'offline';
		checkedAt: string;
		integracoes: IntegracaoStatus[];
	}

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let response = $state<IntegracoesResponse | null>(null);

	// Estado do formulário de configuração real
	let modalAberto = $state(false);
	let formNome = $state('');
	let formUrl = $state('');
	let formUsuario = $state('');
	let formSenha = $state('');
	let formToken = $state('');
	let formEnviando = $state(false);
	let formErro = $state('');

	async function carregarStatus() {
		loading = true;
		errorMsg = null;
		try {
			response = await api.admin.getIntegracoes();
		} catch (e: any) {
			console.error(e);
			if (e instanceof ApiError) {
				errorMsg = `${e.message} (Código: ${e.code})`;
			} else {
				errorMsg = e.message || 'Erro desconhecido ao carregar status das integrações.';
			}
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (auth.me && auth.me.role !== 'DESENVOLVEDOR' && auth.me.role !== 'ADMIN') {
			goto('/sms/configuracoes/parametros', { replaceState: true });
			return;
		}
		carregarStatus();
	});

	function abrirModal() {
		formErro = '';
		formNome = '';
		formUrl = '';
		formUsuario = '';
		formSenha = '';
		formToken = '';
		modalAberto = true;
	}

	async function salvarConector() {
		if (!formNome.trim()) {
			formErro = 'O nome do conector é obrigatório.';
			return;
		}
		if (!formUrl.trim()) {
			formErro = 'A URL de integração é obrigatória.';
			return;
		}

		formEnviando = true;
		formErro = '';

		try {
			await api.admin.salvarIntegracao({
				nome: formNome,
				url: formUrl.trim(),
				usuario: formUsuario.trim() || null,
				senha: formSenha.trim() || null,
				token: formToken.trim() || null
			});
			modalAberto = false;
			await carregarStatus();
		} catch (e: any) {
			formErro = e.message || 'Falha ao salvar conector.';
		} finally {
			formEnviando = false;
		}
	}

	function formatTime(isoString: string) {
		const d = new Date(isoString);
		return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	const isReal = (i: IntegracaoStatus) => {
		const msg = (i.mensagem || '').toLowerCase();
		return !msg.includes('simulado') && !msg.includes('simulada') && !msg.includes('defina');
	};

	let federais = $derived(
		response?.integracoes
			.filter((i: IntegracaoStatus) => i.tipo && i.tipo.toUpperCase() === 'FEDERAL')
			.filter(isReal) || []
	);

	let internos = $derived(
		response?.integracoes
			.filter((i: IntegracaoStatus) => i.tipo && i.tipo.toUpperCase() !== 'FEDERAL')
			.filter(isReal) || []
	);
</script>

{#if auth.me?.role === 'DESENVOLVEDOR' || auth.me?.role === 'ADMIN'}
<section class="flex flex-col gap-6">
	<!-- Top Bar / Header -->
	<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white p-4 shadow-sm border-t-2 border-t-slate-800">
		<div>
			<h1 class="text-lg font-bold text-slate-900 font-mono tracking-tight">Monitor de Integrações</h1>
			<p class="text-xs text-slate-500">Status em tempo real das conexões externas e internas do ecossistema UniSISM</p>
		</div>
		<div class="flex gap-2">
			<PrimaryButton
				label="Voltar"
				variant="secondary"
				onclick={() => goto('/sms/configuracoes')}
			/>
			<PrimaryButton
				label="+ Configurar Conector Real"
				variant="primary"
				onclick={abrirModal}
			/>
			<button
				onclick={carregarStatus}
				disabled={loading}
				class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-4 w-4 {loading ? 'animate-spin' : ''}"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
					/>
				</svg>
				Recarregar
			</button>
		</div>
	</div>

	<!-- Loading State -->
	{#if loading && !response}
		<div class="flex flex-col items-center justify-center border border-slate-200 bg-white py-20 text-center shadow-sm">
			<div class="h-10 w-10 animate-spin border-4 border-slate-200 border-t-blue-600 rounded-full"></div>
			<div class="mt-4 font-mono text-xs font-bold text-slate-700 tracking-wider">TESTANDO CONECTORES</div>
			<p class="mt-2 text-xs text-slate-500">Acessando endpoints de saúde, verificando latência de rede e integridade de storage...</p>
		</div>

	<!-- Error State -->
	{:else if errorMsg}
		<div class="border border-red-200 bg-red-50 p-6 text-center shadow-sm">
			<div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-red-300 bg-red-100 text-red-600 rounded-full">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
				</svg>
			</div>
			<h2 class="text-sm font-bold text-red-900 font-mono">Falha na Comunicação com o Servidor</h2>
			<p class="mt-2 text-xs text-red-700">{errorMsg}</p>
			<div class="mt-4 flex justify-center gap-2">
				<PrimaryButton
					label="Tentar Novamente"
					variant="primary"
					onclick={carregarStatus}
				/>
			</div>
		</div>

	<!-- Loaded Status Dashboard -->
	{:else if response}
		<!-- Global Health Banner -->
		<div class="shadow-sm">
			{#if response.status === 'online'}
				<div class="flex items-center gap-4 border border-emerald-200 bg-emerald-50/50 p-4">
					<div class="relative flex h-3 w-3">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
						<span class="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
					</div>
					<div class="flex-1">
						<h3 class="text-xs font-bold uppercase tracking-wider text-emerald-950 font-mono">Todos os Conectores Saudáveis</h3>
						<p class="text-xs text-emerald-800">Todas as integrações locais e federais respondendo normalmente.</p>
					</div>
					<div class="text-[10px] text-emerald-700 font-mono">
						Último teste: {formatTime(response.checkedAt)}
					</div>
				</div>
			{:else if response.status === 'degraded'}
				<div class="flex items-center gap-4 border border-amber-200 bg-amber-50/50 p-4">
					<div class="relative flex h-3 w-3">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
						<span class="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
					</div>
					<div class="flex-1">
						<h3 class="text-xs font-bold uppercase tracking-wider text-amber-950 font-mono">Instabilidade Detectada</h3>
						<p class="text-xs text-amber-800">Um ou mais conectores estão offline ou demorando para responder.</p>
					</div>
					<div class="text-[10px] text-amber-700 font-mono">
						Último teste: {formatTime(response.checkedAt)}
					</div>
				</div>
			{:else}
				<div class="flex items-center gap-4 border border-red-200 bg-red-50/50 p-4">
					<div class="relative flex h-3 w-3">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
						<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
					</div>
					<div class="flex-1">
						<h3 class="text-xs font-bold uppercase tracking-wider text-red-950 font-mono">Falha Crítica</h3>
						<p class="text-xs text-red-800">Nenhum conector está respondendo. Verifique os logs do backend.</p>
					</div>
					<div class="text-[10px] text-red-700 font-mono">
						Último teste: {formatTime(response.checkedAt)}
					</div>
				</div>
			{/if}
		</div>

		<!-- Grid: Conectores Externos -->
		<div class="border border-slate-200 bg-white shadow-sm">
			<PanelHeader
				title="Conectores Externos (Federais)"
				subtitle="Homologações e sincronizações de dados do SUS municipal"
				index="01"
			/>
			<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-3">
				{#each federais as item}
					<div class="bg-white p-5 flex flex-col justify-between min-h-[140px] hover:bg-slate-50/50 transition-colors">
						<div>
							<div class="flex items-start justify-between gap-4">
								<h4 class="font-mono text-sm font-bold text-slate-900">{item.nome}</h4>
								<div class="flex items-center gap-1.5">
									{#if item.status === 'online'}
										<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
										<span class="font-mono text-[9px] font-bold text-emerald-700 tracking-wider uppercase">ONLINE</span>
									{:else}
										<span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span>
										<span class="font-mono text-[9px] font-bold text-rose-700 tracking-wider uppercase">OFFLINE</span>
									{/if}
								</div>
							</div>
							<p class="mt-1 text-xs text-slate-500">{item.descricao}</p>
						</div>

						<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
							<span class="text-[10px] font-mono text-slate-500 truncate max-w-[70%]" title={item.mensagem}>{item.mensagem}</span>
							{#if item.status === 'online'}
								<span class="border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
									{item.latencyMs} ms
								</span>
							{:else}
								<span class="border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-800">
									—
								</span>
							{/if}
						</div>
					</div>
				{:else}
					<div class="bg-white p-8 text-center text-slate-500 text-xs font-mono col-span-3 border border-slate-100">
						Nenhum conector federal real configurado ou ativo.
					</div>
				{/each}
			</div>
		</div>

		<!-- Grid: Conectores Internos -->
		<div class="border border-slate-200 bg-white shadow-sm">
			<PanelHeader
				title="Conectores Internos (Infraestrutura)"
				subtitle="Bases e serviços internos executados no cluster municipal"
				index="02"
			/>
			<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 lg:grid-cols-4">
				{#each internos as item}
					<div class="bg-white p-5 flex flex-col justify-between min-h-[140px] hover:bg-slate-50/50 transition-colors">
						<div>
							<div class="flex items-start justify-between gap-4">
								<h4 class="font-mono text-sm font-bold text-slate-900">{item.nome}</h4>
								<div class="flex items-center gap-1.5">
									{#if item.status === 'online'}
										<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
										<span class="font-mono text-[9px] font-bold text-emerald-700 tracking-wider uppercase">ONLINE</span>
									{:else}
										<span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span>
										<span class="font-mono text-[9px] font-bold text-rose-700 tracking-wider uppercase">OFFLINE</span>
									{/if}
								</div>
							</div>
							<p class="mt-1 text-xs text-slate-500">{item.descricao}</p>
						</div>

						<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
							<span class="text-[10px] font-mono text-slate-500 truncate max-w-[70%]" title={item.mensagem}>{item.mensagem}</span>
							{#if item.status === 'online' && item.latencyMs > 0}
								<span class="border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
									{item.latencyMs} ms
								</span>
							{:else if item.status === 'online'}
								<span class="border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
									ativo
								</span>
							{:else}
								<span class="border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-800">
									—
								</span>
							{/if}
						</div>
					</div>
				{:else}
					<div class="bg-white p-8 text-center text-slate-500 text-xs font-mono col-span-4 border border-slate-100">
						Nenhum conector interno real ativo ou respondendo.
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Modal Configurar Conector -->
	{#if modalAberto}
		<Modal
			isOpen={modalAberto}
			onClose={() => (modalAberto = false)}
			title="Configurar Conector Real"
			subtitle="Configure as credenciais de produção para a integração selecionada"
			maxWidth="md"
		>
			<div class="flex flex-col gap-4 p-1">
				{#if formErro}
					<div class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[10px] font-bold text-red-900 uppercase">
						⚠ {formErro}
					</div>
				{/if}

				<FormField
					label="Nome do Conector"
					name="formNome"
					type="text"
					placeholder="Ex: CADSUS, e-SUS APS, SISREG, Minha Integração"
					span={12}
					bind:value={formNome}
				/>

				<FormField
					label="URL da Integração"
					name="formUrl"
					type="text"
					placeholder="https://api.exemplo.gov.br/v1"
					span={12}
					bind:value={formUrl}
				/>

				<div class="grid grid-cols-2 gap-4">
					<FormField
						label="Usuário / Login (opcional)"
						name="formUsuario"
						type="text"
						placeholder="cadsus_operador"
						span={6}
						bind:value={formUsuario}
					/>
					<FormField
						label="Senha (opcional)"
						name="formSenha"
						type="password"
						placeholder="••••••••"
						span={6}
						bind:value={formSenha}
					/>
				</div>

				<FormField
					label="Token de Acesso / API Key (opcional)"
					name="formToken"
					type="text"
					placeholder="Bearer eyJhbG..."
					span={12}
					bind:value={formToken}
				/>

				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4 mt-2">
					<PrimaryButton
						label="Cancelar"
						variant="secondary"
						onclick={() => (modalAberto = false)}
					/>
					<PrimaryButton
						label="Salvar Conector"
						loading={formEnviando}
						onclick={salvarConector}
					/>
				</div>
			</div>
		</Modal>
	{/if}
</section>
{/if}
