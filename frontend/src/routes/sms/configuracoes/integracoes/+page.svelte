<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { goto } from '$app/navigation';

	interface IntegracaoStatus {
		nome: string;
		descricao: string;
		tipo: 'Federal' | 'Interno';
		status: 'online' | 'offline';
		latencyMs: number;
		mensagem: string;
	}

	interface IntegracaoConfigResponse {
		nome: string;
		url: string;
		usuario: string | null;
		token: string | null;
		temSenha: boolean;
	}

	interface IntegracoesResponse {
		status: 'online' | 'degraded' | 'offline';
		checkedAt: string;
		integracoes: IntegracaoStatus[];
		configuracoes: IntegracaoConfigResponse[];
	}

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let response = $state<IntegracoesResponse | null>(null);

	// Estado do formulário de configuração
	let formNome = $state<'CADSUS' | 'e-SUS APS' | 'SISREG' | 'Webhook UBS' | null>(null);
	let formUrl = $state('');
	let formUsuario = $state('');
	let formSenha = $state('');
	let formToken = $state('');
	let salvando = $state(false);
	let formSuccess = $state(false);
	let formError = $state<string | null>(null);

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
		carregarStatus();
	});

	function iniciarConfiguracao(nome: 'CADSUS' | 'e-SUS APS' | 'SISREG' | 'Webhook UBS') {
		formNome = nome;
		formSuccess = false;
		formError = null;

		const config = response?.configuracoes.find((c) => c.nome === nome);
		if (config) {
			formUrl = config.url;
			formUsuario = config.usuario || '';
			formToken = config.token || '';
			formSenha = '';
		} else {
			formUrl = '';
			formUsuario = '';
			formToken = '';
			formSenha = '';
		}
	}

	async function submeterConfiguracao(e: Event) {
		e.preventDefault();
		if (!formNome) return;

		salvando = true;
		formSuccess = false;
		formError = null;

		try {
			await api.admin.salvarIntegracao({
				nome: formNome,
				url: formUrl,
				usuario: formUsuario || null,
				senha: formSenha || null,
				token: formToken || null,
			});
			formSuccess = true;
			await carregarStatus();
			setTimeout(() => {
				formSuccess = false;
			}, 3000);
		} catch (err: any) {
			console.error(err);
			formError = err.message || 'Falha ao salvar a configuração do conector.';
		} finally {
			salvando = false;
		}
	}

	function formatTime(isoString: string) {
		const d = new Date(isoString);
		return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	let federais = $derived(response?.integracoes.filter((i: IntegracaoStatus) => i.tipo === 'Federal') || []);
	let internos = $derived(response?.integracoes.filter((i: IntegracaoStatus) => i.tipo === 'Interno') || []);
</script>

<section class="flex flex-col gap-6">
	<!-- Top Bar / Header -->
	<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white p-4 shadow-sm">
		<div>
			<h1 class="text-lg font-bold text-slate-900 font-mono tracking-tight">Monitor de Integrações</h1>
			<p class="text-xs text-slate-500">Configuração e status em tempo real das conexões externas e internas do ecossistema UniSISM</p>
		</div>
		<div class="flex gap-2">
			<PrimaryButton
				label="Voltar"
				variant="secondary"
				onclick={() => goto('/sms/configuracoes')}
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
			<div class="mt-4 font-mono text-xs font-bold text-slate-700 tracking-wider">ACESSANDO CONECTORES</div>
			<p class="mt-2 text-xs text-slate-500">Testando conectividade de banco de dados, latência e serviços ativos...</p>
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
						<h3 class="text-xs font-bold uppercase tracking-wider text-emerald-950 font-mono">Todos os Conectores Ativos</h3>
						<p class="text-xs text-emerald-800">Conectores ativos respondendo normalmente.</p>
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
						<h3 class="text-xs font-bold uppercase tracking-wider text-amber-950 font-mono">Conexão Parcial</h3>
						<p class="text-xs text-amber-800">Alguns conectores estão pendentes de configuração ou offline.</p>
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
						<h3 class="text-xs font-bold uppercase tracking-wider text-red-950 font-mono">Todos os Conectores Indisponíveis</h3>
						<p class="text-xs text-red-800">Nenhum conector respondeu com sucesso.</p>
					</div>
					<div class="text-[10px] text-red-700 font-mono">
						Último teste: {formatTime(response.checkedAt)}
					</div>
				</div>
			{/if}
		</div>

		<!-- Form: Editar/Configurar Conector -->
		{#if formNome}
			<div class="border border-slate-300 bg-white p-6 shadow-md transition-all">
				<div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
					<div class="flex items-center gap-2">
						<span class="h-2 w-2 rounded-full bg-blue-500"></span>
						<h3 class="font-mono text-xs font-bold tracking-wider text-slate-900 uppercase">
							Configurar Conector: {formNome}
						</h3>
					</div>
					<button
						onclick={() => formNome = null}
						class="font-mono text-[10px] font-bold text-slate-500 hover:text-slate-800 tracking-wider uppercase border border-slate-200 px-2 py-0.5"
					>
						Fechar [x]
					</button>
				</div>

				<form onsubmit={submeterConfiguracao} class="flex flex-col gap-4">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-12">
						<div class="col-span-12 md:col-span-8 flex flex-col gap-1">
							<label for="url" class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
								Endpoint / URL do Conector *
							</label>
							<input
								id="url"
								type="url"
								required
								bind:value={formUrl}
								placeholder="https://api.cadsus.saude.gov.br/v1"
								class="border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none bg-slate-50"
							/>
						</div>

						<div class="col-span-12 md:col-span-4 flex flex-col gap-1">
							<label for="usuario" class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
								Usuário / Login (Opcional)
							</label>
							<input
								id="usuario"
								type="text"
								bind:value={formUsuario}
								placeholder="ex: ubs-municipal"
								class="border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none bg-slate-50"
							/>
						</div>

						<div class="col-span-12 md:col-span-6 flex flex-col gap-1">
							<label for="senha" class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
								Senha de Acesso (Opcional)
							</label>
							<input
								id="senha"
								type="password"
								bind:value={formSenha}
								placeholder="••••••••••••"
								class="border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none bg-slate-50"
							/>
							{#if response?.configuracoes.find((c) => c.nome === formNome)?.temSenha}
								<span class="text-[9px] font-mono text-emerald-700 font-bold">
									✓ Senha já salva. Deixe em branco para manter a atual.
								</span>
							{/if}
						</div>

						<div class="col-span-12 md:col-span-6 flex flex-col gap-1">
							<label for="token" class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
								Token de API / Token Bearer (Opcional)
							</label>
							<input
								id="token"
								type="text"
								bind:value={formToken}
								placeholder="ex: x-api-key ou jwt-bearer-token"
								class="border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none bg-slate-50"
							/>
						</div>
					</div>

					<!-- Error or Success Alert -->
					{#if formError}
						<div class="border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-mono">
							[ERRO] {formError}
						</div>
					{/if}
					{#if formSuccess}
						<div class="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-mono">
							[SUCESSO] Configuração do conector salva e testada com sucesso!
						</div>
					{/if}

					<div class="flex justify-end gap-2 border-t border-slate-100 pt-3">
						<button
							type="submit"
							disabled={salvando}
							class="bg-slate-950 text-white font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50"
						>
							{salvando ? 'Salvando...' : 'Salvar Configuração'}
						</button>
					</div>
				</form>
			</div>
		{/if}

		<!-- Grid: Conectores Externos -->
		<div class="border border-slate-200 bg-white shadow-sm">
			<PanelHeader
				title="Conectores Externos (Federais)"
				subtitle="Homologações e sincronizações de dados do SUS municipal"
				index="01"
			/>
			<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-3">
				{#each federais as item}
					<div class="bg-white p-5 flex flex-col justify-between min-h-[160px] hover:bg-slate-50/50 transition-colors">
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
							<span class="text-[10px] font-mono text-slate-500 truncate max-w-[50%]" title={item.mensagem}>{item.mensagem}</span>
							<div class="flex items-center gap-2">
								<button
									onclick={() => iniciarConfiguracao(item.nome as any)}
									class="font-mono text-[9px] font-bold tracking-widest text-blue-600 hover:text-blue-800 hover:underline uppercase"
								>
									[ Configurar ]
								</button>
								{#if item.status === 'online'}
									<span class="border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
										{item.latencyMs} ms
									</span>
								{:else}
									<span class="border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
										—
									</span>
								{/if}
							</div>
						</div>
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
					<div class="bg-white p-5 flex flex-col justify-between min-h-[160px] hover:bg-slate-50/50 transition-colors">
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
							<span class="text-[10px] font-mono text-slate-500 truncate max-w-[50%]" title={item.mensagem}>{item.mensagem}</span>
							<div class="flex items-center gap-2">
								{#if item.nome === 'Webhook UBS'}
									<button
										onclick={() => iniciarConfiguracao('Webhook UBS')}
										class="font-mono text-[9px] font-bold tracking-widest text-blue-600 hover:text-blue-800 hover:underline uppercase"
									>
										[ Configurar ]
									</button>
								{/if}
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
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
