<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		TfdSolicitacaoPacienteDto,
		TfdViagemPacienteDto,
		Encaminhamento
	} from '$lib/api/types';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import {
		IconBus,
		IconPlus,
		IconClock,
		IconCheck,
		IconAlertTriangle,
		IconRefresh,
		IconUsers,
		IconArmchair
	} from '@tabler/icons-svelte';

	let solicitacoes = $state<TfdSolicitacaoPacienteDto[]>([]);
	let viagensDisponiveis = $state<TfdViagemPacienteDto[]>([]);
	let meusEncaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	// Modal Solicitar Viagem
	let modalAberto = $state(false);
	let viagemIdSelecionada = $state('');
	let justificativa = $state('');
	let encaminhamentoId = $state('');
	let precisaAcompanhante = $state(false);
	let acompanhanteNome = $state('');
	let enviandoSolicitacao = $state(false);
	let erroModal = $state('');
	let sucessoMsg = $state('');

	function formatarData(isoStr?: string | null) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
		} catch {
			return isoStr;
		}
	}

	function statusBadge(status: string) {
		switch (status) {
			case 'AGUARDANDO':
				return { texto: 'AGUARDANDO APROVAÇÃO', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'APROVADA':
				return { texto: 'VIAGEM CONFIRMADA', classes: 'border-emerald-700 text-emerald-800 bg-emerald-50' };
			case 'EMBARCADA':
				return { texto: 'EM TRÂNSITO / EMBARCADO', classes: 'border-blue-700 text-blue-800 bg-blue-50' };
			case 'CONCLUIDA':
				return { texto: 'VIAGEM CONCLUÍDA', classes: 'border-slate-400 text-slate-700 bg-slate-100' };
			case 'RECUSADA':
				return { texto: 'SOLICITAÇÃO RECUSADA', classes: 'border-red-700 text-red-800 bg-red-50' };
			case 'CANCELADA':
				return { texto: 'CANCELADA', classes: 'border-slate-300 text-slate-500 bg-slate-50' };
			default:
				return { texto: status, classes: 'border-slate-400 text-slate-700 bg-slate-100' };
		}
	}

	async function carregarDados() {
		carregando = true;
		try {
			const [solicRes, viagensRes, encsRes] = await Promise.all([
				api.pacienteApp.tfdSolicitacoes().catch(() => []),
				api.pacienteApp.tfdViagens().catch(() => []),
				api.pacienteApp.meusEncaminhamentos().catch(() => [])
			]);
			solicitacoes = Array.isArray(solicRes) ? solicRes : [];
			viagensDisponiveis = Array.isArray(viagensRes) ? viagensRes : [];
			meusEncaminhamentos = Array.isArray(encsRes) ? encsRes : [];
		} catch (err) {
			console.error('[UniSISM Paciente] Erro ao carregar TFD:', err);
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarDados();
	});

	function abrirModal() {
		erroModal = '';
		justificativa = '';
		viagemIdSelecionada = viagensDisponiveis[0]?.id || '';
		encaminhamentoId = '';
		precisaAcompanhante = false;
		acompanhanteNome = '';
		modalAberto = true;
	}

	async function enviarPedidoViagem() {
		erroModal = '';
		if (!viagemIdSelecionada) {
			erroModal = 'Selecione a viagem com data e destino desejados.';
			return;
		}
		if (justificativa.trim().length < 10) {
			erroModal = 'A justificativa precisa conter no mínimo 10 caracteres.';
			return;
		}
		if (precisaAcompanhante && !acompanhanteNome.trim()) {
			erroModal = 'Informe o nome do acompanhante.';
			return;
		}

		enviandoSolicitacao = true;
		try {
			await api.pacienteApp.tfdCriarSolicitacao({
				viagemId: viagemIdSelecionada,
				justificativa: justificativa.trim(),
				encaminhamentoId: encaminhamentoId || undefined,
				acompanhante: precisaAcompanhante ? acompanhanteNome.trim() : undefined
			});

			modalAberto = false;
			sucessoMsg = 'Solicitação de transporte TFD registrada com sucesso na Central Municipal!';
			setTimeout(() => (sucessoMsg = ''), 6000);
			await carregarDados();
		} catch (err: any) {
			console.error('[UniSISM Paciente] Falha ao solicitar viagem:', err);
			erroModal = err?.message || 'Falha ao enviar solicitação de viagem. Tente novamente.';
		} finally {
			enviandoSolicitacao = false;
		}
	}

	async function cancelarPedido(id: string) {
		if (!confirm('Deseja realmente cancelar esta solicitação de viagem?')) return;
		try {
			await api.pacienteApp.tfdCancelarSolicitacao(id);
			sucessoMsg = 'Solicitação de viagem cancelada.';
			setTimeout(() => (sucessoMsg = ''), 4000);
			await carregarDados();
		} catch (err: any) {
			alert(err?.message || 'Não foi possível cancelar a solicitação.');
		}
	}
</script>

<svelte:head>
	<title>Transporte TFD · UniSISM Águas Belas</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-6">
	<!-- Top Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
		<div>
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				SETOR DE TRANSPORTE SANITÁRIO E TFD
			</div>
			<h1 class="font-mono text-lg font-bold tracking-wide text-slate-900 sm:text-xl uppercase flex items-center gap-2">
				<IconBus size={20} class="text-blue-900" />
				<span>Tratamento Fora do Domicílio (TFD)</span>
			</h1>
			<p class="text-xs text-slate-600 mt-0.5">
				Solicitação e acompanhamento de passagens e vagas na frota municipal para Recife, Caruaru e Garanhuns.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<button
				onclick={carregarDados}
				disabled={carregando}
				class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 transition-colors"
			>
				<IconRefresh size={14} class={carregando ? 'animate-spin' : ''} />
			</button>
			<button
				onclick={abrirModal}
				class="inline-flex items-center gap-2 border border-blue-900 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-widest text-white uppercase hover:bg-blue-950 transition-colors"
			>
				<IconPlus size={16} />
				<span>Solicitar Viagem TFD</span>
			</button>
		</div>
	</div>

	{#if sucessoMsg}
		<div class="border border-emerald-700 bg-emerald-50 p-3 font-mono text-xs font-bold text-emerald-800 flex items-center gap-2">
			<IconCheck size={16} class="text-emerald-700 shrink-0" />
			<span>✓ {sucessoMsg}</span>
		</div>
	{/if}

	<!-- Lista de Solicitações do Paciente -->
	{#if carregando}
		<div class="flex h-48 items-center justify-center">
			<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
		</div>
	{:else if solicitacoes.length === 0}
		<div class="border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
			<div class="font-mono text-xs font-bold text-slate-700 uppercase">
				Nenhuma viagem solicitada até o momento
			</div>
			<p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
				Caso você tenha uma consulta ou procedimento agendado em centro de referência fora de Águas Belas, clique no botão acima para reservar vaga na van ou ônibus da saúde.
			</p>
			<button
				onclick={abrirModal}
				class="mt-4 inline-flex items-center gap-1.5 border border-blue-900 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-widest text-white uppercase hover:bg-blue-950 transition-colors"
			>
				<IconPlus size={14} />
				<span>Fazer Solicitação de Viagem</span>
			</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each solicitacoes as s (s.id)}
				{@const b = statusBadge(s.status)}
				<div class="border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-400">
					<!-- Cabeçalho -->
					<div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
						<div>
							<div class="flex items-center gap-2">
								<span
									class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider {b.classes}"
								>
									{b.texto}
								</span>
								{#if s.prioridade && s.prioridade !== 'NORMAL'}
									<span class="border border-red-700 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-800 uppercase">
										{s.prioridade}
									</span>
								{/if}
							</div>
							<h3 class="font-mono text-base font-bold text-slate-900 mt-2 uppercase flex items-center gap-1.5">
								<span>DESTINO: {s.viagem.destinoCidade}</span>
								{#if s.viagem.destinoLocal}
									<span class="text-slate-500 font-normal text-xs">({s.viagem.destinoLocal})</span>
								{/if}
							</h3>
						</div>

						<div class="text-right font-mono text-xs">
							<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">SOLICITADO EM</div>
							<div class="font-bold text-slate-700 mt-0.5">
								{formatarData(s.criadaEm)}
							</div>
						</div>
					</div>

					<!-- Informações da Viagem -->
					<div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 font-mono">
						<div class="border border-slate-200 bg-slate-50 p-2.5">
							<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">DATA SAÍDA</span>
							<strong class="text-slate-900 text-xs block mt-0.5">{formatarData(s.viagem.dataPartida)}</strong>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-2.5">
							<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">HORÁRIO</span>
							<strong class="text-slate-900 text-xs block mt-0.5">{s.viagem.horaPartida}</strong>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-2.5">
							<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">LOCAL EMBARQUE</span>
							<strong class="text-slate-900 text-xs truncate block mt-0.5">{s.viagem.localEmbarque}</strong>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-2.5">
							<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">ASSENTO ALOCADO</span>
							<strong class="text-blue-950 font-black text-xs block mt-0.5">
								{s.numeroAssento || 'EM ALOCAÇÃO'}
							</strong>
						</div>
					</div>

					{#if s.acompanhante}
						<div class="mt-2.5 font-mono text-xs text-slate-700 flex items-center gap-1.5">
							<IconUsers size={14} class="text-slate-400" />
							<span>ACOMPANHANTE AUTORIZADO: <strong class="text-slate-900">{s.acompanhante}</strong></span>
						</div>
					{/if}

					{#if s.status === 'RECUSADA' && s.motivoRecusa}
						<div class="mt-2.5 border border-red-700 bg-red-50 p-2.5 font-mono text-xs text-red-900">
							<strong>MOTIVO DA RECUSA:</strong> {s.motivoRecusa}
						</div>
					{/if}

					<!-- Ações -->
					{#if s.status === 'AGUARDANDO'}
						<div class="mt-3 flex justify-end border-t border-slate-100 pt-2">
							<button
								onclick={() => cancelarPedido(s.id)}
								class="font-mono text-xs font-bold text-red-800 uppercase hover:underline"
							>
								[ Cancelar Solicitação ]
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Modal de Solicitação de Viagem -->
	{#if modalAberto}
		<Modal
			isOpen={modalAberto}
			onClose={() => (modalAberto = false)}
			title="SOLICITAR TRANSPORTE TFD"
			subtitle="Vaga para tratamento de saúde fora do município de Águas Belas"
			maxWidth="md"
		>
			<div class="flex flex-col gap-4 p-1 text-xs">
				{#if erroModal}
					<div class="border border-red-700 bg-red-50 p-2.5 font-mono text-[11px] font-bold text-red-800 flex items-center gap-2">
						<IconAlertTriangle size={16} class="text-red-700 shrink-0" />
						<span>{erroModal}</span>
					</div>
				{/if}

				<!-- Selecionar Viagem Disponível -->
				<div>
					<label for="viagem-select" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
						Selecione a Viagem Programada *
					</label>
					{#if viagensDisponiveis.length === 0}
						<div class="border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-900">
							Nenhuma viagem agendada com vagas no momento. Procure o setor de TFD na Secretaria de Saúde.
						</div>
					{:else}
						<select
							id="viagem-select"
							bind:value={viagemIdSelecionada}
							class="w-full border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-blue-900 focus:outline-none"
						>
							{#each viagensDisponiveis as v}
								<option value={v.id}>
									{v.destinoCidade} · {formatarData(v.dataPartida)} às {v.horaPartida} ({v.vagasTotal - v.vagasOcupadas} vagas livres)
								</option>
							{/each}
						</select>
					{/if}
				</div>

				<!-- Vincular Encaminhamento Médico (opcional) -->
				{#if meusEncaminhamentos.length > 0}
					<div>
						<label for="enc-select" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
							Vincular ao Encaminhamento Médico (opcional)
						</label>
						<select
							id="enc-select"
							bind:value={encaminhamentoId}
							class="w-full border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-blue-900 focus:outline-none"
						>
							<option value="">Nenhum / Consulta Externa Particular</option>
							{#each meusEncaminhamentos as enc}
								<option value={enc.id}>
									#{enc.protocolo} — {enc.solicitacao?.especialidadeSolicitada}
								</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Justificativa -->
				<div>
					<label for="justificativa-tfd" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
						Justificativa / Motivo da Viagem * (mínimo 10 caracteres)
					</label>
					<textarea
						id="justificativa-tfd"
						rows={3}
						placeholder="Ex.: Consulta com cardiologista no Hospital Oswaldo Cruz em Recife..."
						bind:value={justificativa}
						class="w-full border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-900 focus:outline-none"
					></textarea>
				</div>

				<!-- Precisa de Acompanhante? -->
				<div class="border-t border-slate-200 pt-3">
					<label class="flex items-center gap-2 cursor-pointer font-mono text-xs font-bold text-slate-800 uppercase">
						<input
							type="checkbox"
							bind:checked={precisaAcompanhante}
							class="h-4 w-4 border-slate-300 text-blue-900 focus:ring-blue-900"
						/>
						<span>Necessito de Acompanhante (Idoso / Menor / Laudo)</span>
					</label>

					{#if precisaAcompanhante}
						<div class="mt-2 pl-6">
							<label for="nome-acompanhante" class="block font-mono text-[10px] font-bold text-slate-600 mb-1 uppercase">
								Nome Completo do Acompanhante *
							</label>
							<input
								id="nome-acompanhante"
								type="text"
								placeholder="Nome do acompanhante"
								bind:value={acompanhanteNome}
								class="w-full border border-slate-300 bg-white p-2 font-mono text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>
					{/if}
				</div>

				<!-- Botões -->
				<div class="mt-2 flex justify-end gap-2 border-t border-slate-200 pt-3">
					<button
						type="button"
						onclick={() => (modalAberto = false)}
						class="border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
					>
						Cancelar
					</button>
					<PrimaryButton
						label="Enviar Solicitação"
						loading={enviandoSolicitacao}
						disabled={viagensDisponiveis.length === 0}
						onclick={enviarPedidoViagem}
					/>
				</div>
			</div>
		</Modal>
	{/if}
</div>
