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
		IconCalendarEvent,
		IconClock,
		IconMapPin,
		IconUser,
		IconAlertCircle,
		IconCheck,
		IconX,
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
				return { texto: 'Aguardando Aprovação', cor: 'bg-amber-100 text-amber-900 border-amber-300' };
			case 'APROVADA':
				return { texto: 'Viagem Confirmada', cor: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
			case 'EMBARCADA':
				return { texto: 'Em Trânsito / Embarcado', cor: 'bg-blue-100 text-blue-900 border-blue-300' };
			case 'CONCLUIDA':
				return { texto: 'Viagem Concluída', cor: 'bg-slate-100 text-slate-700 border-slate-300' };
			case 'RECUSADA':
				return { texto: 'Solicitação Recusada', cor: 'bg-rose-100 text-rose-900 border-rose-300' };
			case 'CANCELADA':
				return { texto: 'Cancelada', cor: 'bg-slate-100 text-slate-500 border-slate-200' };
			default:
				return { texto: status, cor: 'bg-slate-100 text-slate-800 border-slate-300' };
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
			sucessoMsg = '✓ Sua solicitação de transporte TFD foi enviada com sucesso para a Central Municipal!';
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
			sucessoMsg = '✓ Solicitação de viagem cancelada.';
			setTimeout(() => (sucessoMsg = ''), 4000);
			await carregarDados();
		} catch (err: any) {
			alert(err?.message || 'Não foi possível cancelar a solicitação.');
		}
	}
</script>

<svelte:head>
	<title>Transporte TFD · UniSISM Paciente</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
	<!-- Top Bar -->
	<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-black text-slate-900 sm:text-2xl flex items-center gap-2">
				<IconBus size={26} class="text-purple-700" />
				<span>Tratamento Fora do Domicílio (TFD)</span>
			</h1>
			<p class="text-xs text-slate-500 mt-0.5">
				Solicite vagas na frota municipal de saúde para consultas e procedimentos fora de Águas Belas
			</p>
		</div>

		<div class="flex items-center gap-2">
			<button
				onclick={carregarDados}
				disabled={carregando}
				class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
			>
				<IconRefresh size={15} class={carregando ? 'animate-spin' : ''} />
			</button>
			<button
				onclick={abrirModal}
				class="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 active:scale-95 transition-all"
			>
				<IconPlus size={16} />
				<span>Solicitar Viagem TFD</span>
			</button>
		</div>
	</div>

	{#if sucessoMsg}
		<div class="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900 shadow-sm">
			<IconCheck size={18} class="text-emerald-700 shrink-0" />
			<span>{sucessoMsg}</span>
		</div>
	{/if}

	<!-- Lista de Solicitações do Paciente -->
	{#if carregando}
		<div class="flex h-48 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
		</div>
	{:else if solicitacoes.length === 0}
		<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
			<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-700">
				<IconBus size={24} />
			</div>
			<h3 class="text-sm font-bold text-slate-800 mt-3">Você ainda não solicitou nenhuma viagem</h3>
			<p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
				Caso você tenha uma consulta ou procedimento agendado em Recife, Caruaru ou Garanhuns, clique no botão acima para pedir sua vaga na van/ônibus da saúde.
			</p>
			<button
				onclick={abrirModal}
				class="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 font-mono text-xs font-bold text-white shadow hover:bg-purple-800"
			>
				<IconPlus size={15} />
				<span>Fazer Primeira Solicitação</span>
			</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each solicitacoes as s (s.id)}
				{@const b = statusBadge(s.status)}
				<div class="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
					<!-- Cabeçalho -->
					<div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
						<div>
							<div class="flex items-center gap-2">
								<span class="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider {b.cor}">
									{b.texto}
								</span>
								{#if s.prioridade && s.prioridade !== 'NORMAL'}
									<span class="rounded bg-rose-100 border border-rose-300 px-2 py-0.5 text-[9px] font-black text-rose-800 uppercase">
										{s.prioridade}
									</span>
								{/if}
							</div>
							<h3 class="text-base font-bold text-slate-900 mt-1.5 flex items-center gap-1.5">
								<span>Destino: {s.viagem.destinoCidade}</span>
								{#if s.viagem.destinoLocal}
									<span class="text-slate-400 font-normal text-xs">({s.viagem.destinoLocal})</span>
								{/if}
							</h3>
						</div>

						<div class="text-right">
							<div class="text-[9px] font-semibold uppercase tracking-widest text-slate-400">PEDIDO EM</div>
							<div class="font-mono text-xs font-bold text-slate-600">
								{formatarData(s.criadaEm)}
							</div>
						</div>
					</div>

					<!-- Informações da Viagem -->
					<div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 font-mono">
						<div class="rounded-lg bg-slate-50 p-2.5">
							<span class="text-slate-400 block text-[9px] uppercase tracking-wider">Data de Saída</span>
							<strong class="text-slate-800 text-xs">{formatarData(s.viagem.dataPartida)}</strong>
						</div>
						<div class="rounded-lg bg-slate-50 p-2.5">
							<span class="text-slate-400 block text-[9px] uppercase tracking-wider">Horário</span>
							<strong class="text-slate-800 text-xs">{s.viagem.horaPartida}</strong>
						</div>
						<div class="rounded-lg bg-slate-50 p-2.5">
							<span class="text-slate-400 block text-[9px] uppercase tracking-wider">Ponto de Embarque</span>
							<strong class="text-slate-800 text-xs truncate block">{s.viagem.localEmbarque}</strong>
						</div>
						<div class="rounded-lg bg-slate-50 p-2.5">
							<span class="text-slate-400 block text-[9px] uppercase tracking-wider">Assento Alocado</span>
							<strong class="text-purple-900 text-xs flex items-center gap-1">
								<IconArmchair size={14} />
								<span>{s.numeroAssento || 'Em alocação'}</span>
							</strong>
						</div>
					</div>

					{#if s.acompanhante}
						<div class="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
							<IconUsers size={15} class="text-slate-400" />
							<span>Acompanhante autorizado: <strong class="text-slate-800">{s.acompanhante}</strong></span>
						</div>
					{/if}

					{#if s.status === 'RECUSADA' && s.motivoRecusa}
						<div class="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
							<strong>Motivo da Recusa:</strong> {s.motivoRecusa}
						</div>
					{/if}

					<!-- Ações -->
					{#if s.status === 'AGUARDANDO'}
						<div class="mt-3 flex justify-end border-t border-slate-100 pt-2">
							<button
								onclick={() => cancelarPedido(s.id)}
								class="text-xs font-bold text-rose-700 hover:text-rose-900 hover:underline"
							>
								Cancelar esta solicitação
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
			title="Solicitar Transporte TFD"
			subtitle="Peça sua vaga para tratamento médico fora do município"
			maxWidth="md"
		>
			<div class="flex flex-col gap-4 p-1 text-xs">
				{#if erroModal}
					<div class="border border-rose-300 bg-rose-50 p-2.5 font-bold text-rose-900 flex items-center gap-2">
						<IconAlertTriangle size={16} class="text-rose-700 shrink-0" />
						<span>{erroModal}</span>
					</div>
				{/if}

				<!-- Selecionar Viagem Disponível -->
				<div>
					<label for="viagem-select" class="block font-mono text-xs font-semibold text-slate-700 mb-1">
						Selecione a Viagem Programada *
					</label>
					{#if viagensDisponiveis.length === 0}
						<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
							Nenhuma viagem agendada com vagas no momento. Procure o setor de TFD na Secretaria de Saúde.
						</div>
					{:else}
						<select
							id="viagem-select"
							bind:value={viagemIdSelecionada}
							class="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-purple-600 focus:outline-none"
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
							Vincular ao seu Encaminhamento (opcional)
						</label>
						<select
							id="enc-select"
							bind:value={encaminhamentoId}
							class="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800 focus:border-purple-600 focus:outline-none"
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
						class="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-purple-600 focus:outline-none"
					></textarea>
				</div>

				<!-- Precisa de Acompanhante? -->
				<div class="border-t border-slate-100 pt-3">
					<label class="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
						<input
							type="checkbox"
							bind:checked={precisaAcompanhante}
							class="h-4 w-4 rounded border-slate-300 text-purple-700 focus:ring-purple-600"
						/>
						<span>Necessito de Acompanhante</span>
					</label>

					{#if precisaAcompanhante}
						<div class="mt-2 pl-6">
							<label for="nome-acompanhante" class="block text-[11px] text-slate-600 mb-1">
								Nome Completo do Acompanhante *
							</label>
							<input
								id="nome-acompanhante"
								type="text"
								placeholder="Nome do acompanhante"
								bind:value={acompanhanteNome}
								class="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-purple-600 focus:outline-none"
							/>
						</div>
					{/if}
				</div>

				<!-- Botões -->
				<div class="mt-2 flex justify-end gap-2 border-t border-slate-200 pt-3">
					<button
						type="button"
						onclick={() => (modalAberto = false)}
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-700 hover:bg-slate-100"
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
