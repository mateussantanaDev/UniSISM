<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import SeatPicker from '$lib/presentation/components/SeatPicker.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import AnexoActions from '$lib/presentation/components/AnexoActions.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarCpf } from '$lib/presentation/utils/tfdFormat';
	import type {
		PassageiroViagem,
		PrioridadeTfdPaciente,
		StatusTfdPaciente,
		TfdPacienteSolicAdmin,
		ViagemFrota
	} from '$lib/api/tfd-types';
	import type { Encaminhamento, TipoAnexo } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	const auth = useAuth();
	const id = $derived(page.params.id ?? '');
	const podeOperar = $derived(!!auth.podeGerenciarTFD);

	let sol = $state<TfdPacienteSolicAdmin | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	// ─── Modais ───
	let aprovarAberto = $state(false);
	/**
	 * Assento escolhido no SeatPicker (1..capacidade) — `null` significa
	 * "auto-atribuir" e o backend escolhe o próximo livre (`A{n}`).
	 */
	let assentoEscolhido = $state<number | null>(null);
	let recusarAberto = $state(false);
	let motivoRecusa = $state('');
	let embarqueAberto = $state(false);
	let concluirAberto = $state(false);

	let processando = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	// ─── Modal: Encaminhamento Vinculado (TFD) ───
	let encaminhamentoModalAberto = $state(false);
	let encaminhamentoCarregado = $state<Encaminhamento | null>(null);
	let carregandoEncaminhamento = $state(false);
	let erroEncaminhamento = $state<string | null>(null);

	const tipoLabel: Record<TipoAnexo, string> = {
		SOLICITACAO: 'Solicitação Médica',
		RG: 'Documento de Identidade',
		CPF: 'CPF',
		CARTAO_SUS: 'Cartão SUS',
		EXAME: 'Exame Laboratorial',
		LAUDO: 'Laudo Médico',
		RESPOSTA_SUS: 'Resposta Oficial do SUS',
		OUTRO: 'Outro Documento'
	};

	async function abrirModalEncaminhamento() {
		if (!sol?.encaminhamentoId) return;
		encaminhamentoModalAberto = true;
		carregandoEncaminhamento = true;
		erroEncaminhamento = null;
		try {
			encaminhamentoCarregado = await api.encaminhamentos.byId(sol.encaminhamentoId);
		} catch (e) {
			erroEncaminhamento = 'Não foi possível carregar os detalhes do encaminhamento.';
			console.error(e);
		} finally {
			carregandoEncaminhamento = false;
		}
	}

	function formatarDataIso(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function calcularIdade(dataNasc: string): number {
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
	}

	// ─── Dados pra mapa de assentos (modal aprovar) ───
	let viagemFull = $state<ViagemFrota | null>(null);
	let carregandoAssentos = $state(false);

	/**
	 * Backend (`viagens.ts`) agora mescla as 2 fontes em `viagem.passageiros`:
	 *   - UBS: `ViagemPassageiro` (sempre `numeroAssento: number`)
	 *   - App paciente APROVADA/EMBARCADA: parseado de `"A12"` → `12`
	 *
	 * Só precisamos remover o próprio pedido aprovado/embarcado se ele aparecer
	 * (acontece quando o gestor reabre a tela depois de ter aprovado e volta).
	 * Em estado AGUARDANDO o backend não inclui ele aqui mesmo.
	 */
	const passageirosFusion = $derived.by<PassageiroViagem[]>(() => {
		const todos = viagemFull?.passageiros ?? [];
		const meuId = sol?.id;
		if (!meuId) return todos;
		return todos.filter((p) => p.id !== `sol-${meuId}` && p.id !== `app-${meuId}`);
	});

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4500);
	}

	async function carregar() {
		if (!id) return;
		carregando = true;
		erro = null;
		try {
			sol = await api.tfd.solicitacoesPaciente.byId(id);
		} catch (e) {
			erro = mensagemErroTfd(e);
			sol = null;
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// ─── Ações de transição ───

	/**
	 * Abre o modal de aprovação e carrega a viagem completa para o mapa.
	 *
	 * O backend agora retorna `viagem.passageiros[]` já mesclado com pedidos
	 * do app APROVADAS/EMBARCADAS — então um único fetch basta. Se falhar,
	 * o modal abre mesmo assim com fallback "auto-atribuir".
	 */
	async function abrirAprovar() {
		if (!sol) return;
		assentoEscolhido = null;
		aprovarAberto = true;
		carregandoAssentos = true;
		try {
			viagemFull = await api.tfd.viagens.byId(sol.viagem.id);
		} catch (e) {
			console.warn('Falha ao carregar mapa de assentos:', e);
		} finally {
			carregandoAssentos = false;
		}
	}

	async function aprovar() {
		if (!sol) return;
		processando = true;
		// Backend usa convenção "A{n}" pra auto-atribuição — manter consistente.
		const numeroAssento = assentoEscolhido != null ? `A${assentoEscolhido}` : undefined;
		try {
			sol = await api.tfd.solicitacoesPaciente.aprovar(sol.id, { numeroAssento });
			aprovarAberto = false;
			assentoEscolhido = null;
			notificar('ok', `Pedido aprovado · assento ${sol.numeroAssento} · paciente notificado.`);
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'TFD_VIAGEM_SEM_VAGAS') {
					notificar('erro', 'Viagem ficou lotada antes da aprovação. Recuse este pedido.');
				} else if (e.code === 'TFD_ASSENTO_OCUPADO') {
					notificar('erro', `Assento ${assentoEscolhido} foi ocupado agora mesmo · escolha outro.`);
					// Recarrega o mapa pra refletir a nova ocupação
					if (sol) {
						try {
							viagemFull = await api.tfd.viagens.byId(sol.viagem.id);
							assentoEscolhido = null;
						} catch {
							// ignora — usuário pode fechar e tentar de novo
						}
					}
				} else if (e.code === 'TFD_ASSENTO_INDISPONIVEL') {
					notificar('erro', 'Sem assentos livres na viagem.');
				} else {
					notificar('erro', mensagemErroTfd(e));
				}
			} else {
				notificar('erro', mensagemErroTfd(e));
			}
		} finally {
			processando = false;
		}
	}

	async function recusar() {
		if (!sol) return;
		const motivo = motivoRecusa.trim();
		if (motivo.length < 5) {
			notificar('erro', 'O motivo precisa ter ao menos 5 caracteres.');
			return;
		}
		processando = true;
		try {
			sol = await api.tfd.solicitacoesPaciente.recusar(sol.id, motivo);
			recusarAberto = false;
			motivoRecusa = '';
			notificar('ok', 'Pedido recusado · paciente notificado · auditoria registrada.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function marcarEmbarque() {
		if (!sol) return;
		processando = true;
		try {
			sol = await api.tfd.solicitacoesPaciente.embarque(sol.id);
			embarqueAberto = false;
			notificar('ok', 'Embarque registrado.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function marcarConclusao() {
		if (!sol) return;
		processando = true;
		try {
			sol = await api.tfd.solicitacoesPaciente.concluir(sol.id);
			concluirAberto = false;
			notificar('ok', 'Pedido concluído.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	// ─── Tons de UI ───
	const statusTone: Record<StatusTfdPaciente, string> = {
		AGUARDANDO: 'border-amber-600 bg-amber-50 text-amber-800',
		APROVADA: 'border-blue-700 bg-blue-50 text-blue-900',
		EMBARCADA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		CONCLUIDA: 'border-slate-700 bg-slate-100 text-slate-800',
		RECUSADA: 'border-red-700 bg-red-50 text-red-800',
		CANCELADA: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	const prioridadeTone: Record<PrioridadeTfdPaciente, string> = {
		NORMAL: 'border-slate-300 bg-white text-slate-700',
		PRIORITARIA: 'border-amber-600 bg-amber-50 text-amber-800',
		URGENTE: 'border-red-700 bg-red-50 text-red-800'
	};

	function formatarDataHora(iso: string): string {
		try {
			return new Date(iso).toLocaleString('pt-BR');
		} catch {
			return iso;
		}
	}

	function formatarData(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('pt-BR');
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>Pedido do App · TFD · UNISISM</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<!-- Breadcrumb minimalista -->
	<nav
		class="flex items-center gap-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase"
	>
		<a href="/tfd/solicitacoes-paciente" class="hover:text-blue-900">Pedidos do App</a>
		<span>›</span>
		<span class="text-slate-700">{sol?.paciente.nome ?? '...'}</span>
	</nav>

	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-800'
				: 'border-red-700 bg-red-50 text-red-800'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'}
			{mensagem.texto}
		</div>
	{/if}

	{#if carregando}
		<div
			class="border border-slate-200 bg-white px-4 py-12 text-center font-sans text-sm text-slate-500"
		>
			Carregando...
		</div>
	{:else if erro}
		<div
			class="border border-red-700 bg-red-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{:else if sol}
		<div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
			<!-- ─── COLUNA PRINCIPAL ─────────────────────────────────── -->
			<div class="flex flex-col gap-4">
				<!-- Cabeçalho do pedido -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader
						title="Pedido do App"
						subtitle="Solicitação vinda da Face 3 (cidadão)"
						index="01"
					>
						<span
							class="border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {statusTone[
								sol.status
							]}"
						>
							{sol.status}
						</span>
						<span
							class="border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {prioridadeTone[
								sol.prioridade
							]}"
						>
							{sol.prioridade}
						</span>
					</PanelHeader>

					<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
						<div class="col-span-12 md:col-span-6">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Paciente
							</dt>
							<dd class="mt-0.5 text-base font-bold text-slate-900">{sol.paciente.nome}</dd>
							<dd class="mt-0.5 font-mono text-[11px] text-slate-600">
								CPF {formatarCpf(sol.paciente.cpf)}
							</dd>
						</div>
						<div class="col-span-12 md:col-span-6">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Encaminhamento vinculado
							</dt>
							<dd class="mt-0.5 font-mono text-sm text-slate-900">
								{#if sol.encaminhamentoProtocolo && sol.encaminhamentoId}
									{#if auth.ehAdminOuDev}
										<!--
											Detalhe canônico de Encaminhamento mora em Face 2 (Regulação SMS).
											Só ADMIN / DESENVOLVEDOR têm permissão para o layout /sms/*.
											REGULADOR_SMS também tem, mas não opera TFD então não chega aqui.
										-->
										<a
											class="text-blue-900 underline decoration-blue-900/30 underline-offset-2"
											href="/sms/encaminhamento/{sol.encaminhamentoId}"
										>
											{sol.encaminhamentoProtocolo}
										</a>
									{:else}
										<button
											type="button"
											class="text-left font-mono text-blue-900 underline decoration-blue-900/30 underline-offset-2 hover:text-blue-700"
											onclick={abrirModalEncaminhamento}
										>
											{sol.encaminhamentoProtocolo}
										</button>
									{/if}
								{:else}
									—
								{/if}
							</dd>
						</div>

						<div class="col-span-12">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Justificativa do paciente
							</dt>
							<dd
								class="mt-1 rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap text-slate-700"
							>
								{sol.justificativaPaciente}
							</dd>
						</div>

						{#if sol.acompanhante}
							<div class="col-span-12">
								<dt
									class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
								>
									Acompanhante
								</dt>
								<dd class="mt-0.5 text-sm text-slate-900">{sol.acompanhante}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Detalhes da viagem -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Viagem alvo" subtitle="Para a qual o paciente pediu vaga" index="02">
						<a
							href="/tfd/viagens/{sol.viagem.id}"
							class="font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase underline decoration-blue-900/30 underline-offset-2 hover:text-blue-700"
						>
							Abrir viagem →
						</a>
					</PanelHeader>
					<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
						<div class="col-span-12 md:col-span-6">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Destino
							</dt>
							<dd class="mt-0.5 text-sm font-semibold text-slate-900">{sol.viagem.destino}</dd>
							{#if sol.viagem.unidadeDestino && sol.viagem.unidadeDestino !== sol.viagem.destino}
								<dd class="mt-0.5 text-xs text-slate-600">{sol.viagem.unidadeDestino}</dd>
							{/if}
						</div>
						<div class="col-span-6 md:col-span-3">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Data
							</dt>
							<dd class="mt-0.5 font-mono text-sm text-slate-900">
								{formatarData(sol.viagem.data)}
							</dd>
						</div>
						<div class="col-span-6 md:col-span-3">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Hora de saída
							</dt>
							<dd class="mt-0.5 font-mono text-sm text-slate-900">
								{sol.viagem.horaSaida}
							</dd>
						</div>
						<div class="col-span-6 md:col-span-3">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
							>
								Vagas
							</dt>
							<dd
								class="mt-0.5 font-mono text-sm {sol.viagem.vagasOcupadas >= sol.viagem.vagasTotais
									? 'text-red-800'
									: 'text-slate-900'}"
							>
								{sol.viagem.vagasOcupadas} / {sol.viagem.vagasTotais}
							</dd>
						</div>
						{#if sol.numeroAssento}
							<div class="col-span-6 md:col-span-3">
								<dt
									class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
								>
									Assento atribuído
								</dt>
								<dd class="mt-0.5 font-mono text-sm font-bold text-blue-900">
									{sol.numeroAssento}
								</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Recusa, se aplicável -->
				{#if sol.status === 'RECUSADA' && sol.motivoRecusa}
					<div class="border border-red-700 bg-red-50 px-4 py-3">
						<div class="font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase">
							Motivo da recusa
						</div>
						<p class="mt-1 text-sm whitespace-pre-wrap text-red-900">{sol.motivoRecusa}</p>
					</div>
				{/if}

				<!-- Timeline -->
				<div class="border border-slate-200 bg-white">
					<PanelHeader
						title="Histórico"
						subtitle="Transições registradas na auditoria TJ"
						index="03"
					/>
					<ul class="divide-y divide-slate-100 px-4 py-2 font-mono text-[11px]">
						<li class="flex items-center justify-between py-1.5">
							<span class="tracking-widest text-slate-600 uppercase">Criada</span>
							<span class="text-slate-900">{formatarDataHora(sol.criadaEm)}</span>
						</li>
						{#if sol.aprovadaEm}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-blue-900 uppercase">Aprovada</span>
								<span class="text-slate-900">{formatarDataHora(sol.aprovadaEm)}</span>
							</li>
						{/if}
						{#if sol.recusadaEm}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-red-800 uppercase">Recusada</span>
								<span class="text-slate-900">{formatarDataHora(sol.recusadaEm)}</span>
							</li>
						{/if}
						{#if sol.canceladaEm}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-slate-600 uppercase">
									Cancelada pelo paciente
								</span>
								<span class="text-slate-900">{formatarDataHora(sol.canceladaEm)}</span>
							</li>
						{/if}
						{#if sol.operadorNome}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-slate-600 uppercase">Operador</span>
								<span class="text-slate-900">{sol.operadorNome}</span>
							</li>
						{/if}
						{#if sol.tentativasReabertura > 0}
							<li class="flex items-center justify-between py-1.5">
								<span class="tracking-widest text-amber-800 uppercase">
									Tentativas de reabertura
								</span>
								<span class="text-slate-900">{sol.tentativasReabertura}</span>
							</li>
						{/if}
					</ul>
				</div>
			</div>

			<!-- ─── PAINEL DE AÇÃO ───────────────────────────────────── -->
			<aside class="flex flex-col gap-3">
				<div class="border border-slate-200 bg-white">
					<PanelHeader title="Ação" subtitle="Próximo passo possível" index="·" />
					<div class="flex flex-col gap-2 px-4 py-3">
						{#if !podeOperar}
							<p class="text-xs text-slate-500">
								Você não tem permissão para operar este pedido. Apenas gestor TFD ou admin.
							</p>
						{:else if sol.status === 'AGUARDANDO'}
							<PrimaryButton
								label="Aprovar pedido"
								onclick={abrirAprovar}
								disabled={processando}
								fullWidth
							/>
							<PrimaryButton
								label="Recusar"
								variant="danger"
								onclick={() => (recusarAberto = true)}
								disabled={processando}
								fullWidth
							/>
						{:else if sol.status === 'APROVADA'}
							<PrimaryButton
								label="Registrar embarque"
								onclick={() => (embarqueAberto = true)}
								disabled={processando}
								fullWidth
							/>
							<p class="mt-1 text-[11px] text-slate-500">
								Use no dia da viagem, quando o paciente embarcar.
							</p>
						{:else if sol.status === 'EMBARCADA'}
							<PrimaryButton
								label="Concluir"
								onclick={() => (concluirAberto = true)}
								disabled={processando}
								fullWidth
							/>
							<p class="mt-1 text-[11px] text-slate-500">Marque ao retorno do paciente.</p>
						{:else}
							<p class="text-xs text-slate-500">
								Pedido em estado final ({sol.status}). Sem ações disponíveis.
							</p>
						{/if}
					</div>
				</div>

				<!-- Card sobre fluxo (UX explicativa) -->
				<div class="border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
					<div class="font-mono font-bold tracking-widest text-slate-700 uppercase">
						Sobre este fluxo
					</div>
					<p class="mt-2">
						Pedido vem do app paciente. Aprovação aloca em vaga real da viagem (com lock atômico).
						Recusa exige motivo (≥5 caracteres) e notifica o paciente. Toda transição vai para a
						cadeia hash do TFD.
					</p>
				</div>
			</aside>
		</div>
	{/if}
</div>

<!-- ─── Modal: Aprovar ───────────────────────────────────────────── -->
{#if aprovarAberto && sol}
	<Modal
		isOpen={aprovarAberto}
		title="Aprovar pedido"
		subtitle={`${sol.paciente.nome} · ${sol.viagem.destino} · ${formatarData(sol.viagem.data)}`}
		maxWidth="lg"
		onClose={() => (aprovarAberto = false)}
	>
		<div class="flex flex-col gap-4 py-1">
			<!-- Mapa de assentos · estilo BlaBlaCar -->
			<div class="border border-slate-200 bg-white p-4">
				<div class="mb-3 flex items-center justify-between gap-2">
					<div class="leading-tight">
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
							Escolha o assento
						</div>
						<div class="font-sans text-[11px] text-slate-500">
							Clique em um assento verde · livre para alocar.
							{#if assentoEscolhido == null}
								Deixar sem escolher = sistema atribui automaticamente.
							{/if}
						</div>
					</div>
					{#if assentoEscolhido != null}
						<button
							type="button"
							onclick={() => (assentoEscolhido = null)}
							class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
						>
							Limpar
						</button>
					{/if}
				</div>

				{#if carregandoAssentos}
					<div class="h-32 animate-pulse bg-slate-100"></div>
				{:else if viagemFull}
					<SeatPicker
						capacidade={viagemFull.vagasTotais}
						passageiros={passageirosFusion}
						selecionado={assentoEscolhido}
						onSelecionar={(n) => (assentoEscolhido = n)}
					/>
				{:else}
					<!-- Fallback: viagem não carregou; aprova com auto-atribuir -->
					<div
						class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
					>
						Não foi possível carregar o mapa de assentos. A aprovação ainda pode ser feita — o
						sistema atribui o próximo assento livre.
					</div>
				{/if}
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
				<div class="font-sans text-[12px] text-slate-600">
					{#if assentoEscolhido != null}
						Assento selecionado: <strong class="font-mono text-blue-900">A{assentoEscolhido}</strong
						>
					{:else}
						Nenhum assento selecionado — sistema vai atribuir automaticamente.
					{/if}
				</div>
				<div class="flex gap-2">
					<PrimaryButton
						label="Cancelar"
						variant="secondary"
						onclick={() => (aprovarAberto = false)}
						disabled={processando}
					/>
					<PrimaryButton
						label={processando ? 'Aprovando...' : 'Confirmar aprovação'}
						onclick={aprovar}
						disabled={processando}
					/>
				</div>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Recusar ──────────────────────────────────────────── -->
{#if recusarAberto && sol}
	<Modal isOpen={recusarAberto} title="Recusar pedido" onClose={() => (recusarAberto = false)}>
		<div class="flex flex-col gap-3 px-1 py-1">
			<p class="text-sm text-slate-700">
				O paciente será notificado da recusa pelo app. Explique o motivo de forma clara — vai
				aparecer na notificação dele.
			</p>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Motivo da recusa <span class="text-red-700">*</span>
				</span>
				<textarea
					bind:value={motivoRecusa}
					rows={4}
					minlength={5}
					maxlength={500}
					placeholder="Ex.: Documentação incompleta. Compareça à UBS para regularizar."
					class="border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
				<span class="text-[11px] text-slate-500">
					Mínimo 5 caracteres. Máximo 500. {motivoRecusa.trim().length}/500.
				</span>
			</label>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (recusarAberto = false)}
					disabled={processando}
				/>
				<PrimaryButton
					label={processando ? 'Recusando...' : 'Recusar'}
					variant="danger"
					onclick={recusar}
					disabled={processando || motivoRecusa.trim().length < 5}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Embarque ─────────────────────────────────────────── -->
{#if embarqueAberto && sol}
	<Modal
		isOpen={embarqueAberto}
		title="Registrar embarque"
		onClose={() => (embarqueAberto = false)}
	>
		<div class="flex flex-col gap-3 px-1 py-1">
			<p class="text-sm text-slate-700">
				Confirmar que <strong>{sol.paciente.nome}</strong> embarcou na viagem para
				<strong>{sol.viagem.destino}</strong>?
			</p>
			<p class="text-xs text-slate-500">Esta ação grava na cadeia hash TFD e é definitiva.</p>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (embarqueAberto = false)}
					disabled={processando}
				/>
				<PrimaryButton
					label={processando ? 'Registrando...' : 'Confirmar embarque'}
					onclick={marcarEmbarque}
					disabled={processando}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Concluir ─────────────────────────────────────────── -->
{#if concluirAberto && sol}
	<Modal isOpen={concluirAberto} title="Concluir pedido" onClose={() => (concluirAberto = false)}>
		<div class="flex flex-col gap-3 px-1 py-1">
			<p class="text-sm text-slate-700">
				Confirmar a conclusão da viagem de <strong>{sol.paciente.nome}</strong>?
			</p>
			<p class="text-xs text-slate-500">
				Esta ação encerra o ciclo do pedido. Grava na cadeia hash TFD.
			</p>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (concluirAberto = false)}
					disabled={processando}
				/>
				<PrimaryButton
					label={processando ? 'Concluindo...' : 'Confirmar conclusão'}
					onclick={marcarConclusao}
					disabled={processando}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Visualizar Encaminhamento Vinculado ───────────────── -->
{#if encaminhamentoModalAberto && sol}
	<Modal
		isOpen={encaminhamentoModalAberto}
		title="Encaminhamento Vinculado"
		subtitle={sol.encaminhamentoProtocolo ?? undefined}
		onClose={() => (encaminhamentoModalAberto = false)}
		maxWidth="lg"
	>
		{#if carregandoEncaminhamento}
			<div class="flex flex-col items-center justify-center py-12 text-slate-500">
				<div
					class="mb-3 h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
				></div>
				<span class="font-mono text-xs tracking-widest uppercase">Carregando detalhes...</span>
			</div>
		{:else if erroEncaminhamento}
			<div
				class="border border-red-700 bg-red-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erroEncaminhamento}
			</div>
		{:else if encaminhamentoCarregado}
			{@const enc = encaminhamentoCarregado}
			<div class="flex flex-col gap-5 px-1 py-1">
				<!-- Situação / Status -->
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
						<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Status</div>
						<div class="mt-1.5">
							<StatusBadge status={enc.status} />
						</div>
					</div>
					<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
						<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
							Prioridade
						</div>
						<div class="mt-1.5">
							<StatusBadge prioridade={enc.solicitacao.prioridade} />
						</div>
					</div>
					<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
						<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Origem</div>
						<div class="mt-1 font-sans text-xs font-semibold text-slate-900">
							{enc.unidadeOrigem}
						</div>
					</div>
					<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
						<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
							Criado em
						</div>
						<div class="mt-1 font-mono text-xs text-slate-900">{formatarDataIso(enc.criadoEm)}</div>
					</div>
				</div>

				{#if enc.observacoesRegulacao}
					<div class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2">
						<div class="font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase">
							Observação da Regulação
						</div>
						<div class="mt-0.5 text-xs text-amber-900">{enc.observacoesRegulacao}</div>
					</div>
				{/if}

				<!-- Paciente / Identificação -->
				<div class="border border-slate-200 bg-white">
					<div
						class="border-b border-slate-200 bg-slate-50 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase"
					>
						Paciente
					</div>
					<div class="p-4 font-sans">
						<div class="text-sm font-bold text-slate-900">{enc.paciente.nome}</div>
						<div class="mt-0.5 font-mono text-[11px] text-slate-600">
							{calcularIdade(enc.paciente.dataNascimento)} anos ·
							{enc.paciente.sexo === 'F'
								? 'Feminino'
								: enc.paciente.sexo === 'M'
									? 'Masculino'
									: 'Outro'}
						</div>
						<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
							<div>
								<dt class="font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
								<dd class="text-slate-900">{formatarCpf(enc.paciente.cpf)}</dd>
							</div>
							<div>
								<dt class="font-semibold tracking-widest text-slate-500 uppercase">Cartão SUS</dt>
								<dd class="text-slate-900">{enc.paciente.cartaoSus}</dd>
							</div>
						</dl>
					</div>
				</div>

				<!-- Detalhes Clínicos -->
				<div class="border border-slate-200 bg-white">
					<div
						class="border-b border-slate-200 bg-slate-50 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase"
					>
						Solicitação Clínica
					</div>
					<div class="p-4 font-sans">
						<div class="text-sm font-bold text-slate-900">
							{enc.solicitacao.especialidadeSolicitada}
						</div>
						<div class="mt-0.5 font-mono text-[11px] text-slate-600">
							CID-10 · {enc.solicitacao.cid10} - {enc.solicitacao.cidDescricao}
						</div>
						<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
							<div>
								<dt class="font-semibold tracking-widest text-slate-500 uppercase">
									Médico Solicitante
								</dt>
								<dd class="font-sans text-slate-900">{enc.solicitacao.medicoSolicitante}</dd>
							</div>
							<div>
								<dt class="font-semibold tracking-widest text-slate-500 uppercase">CRM</dt>
								<dd class="text-slate-900">{enc.solicitacao.crm}</dd>
							</div>
							<div class="col-span-2">
								<dt class="font-semibold tracking-widest text-slate-500 uppercase">
									Justificativa Clínica
								</dt>
								<dd
									class="mt-1 rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-xs whitespace-pre-wrap text-slate-700"
								>
									{enc.solicitacao.justificativaClinica}
								</dd>
							</div>
						</dl>
					</div>
				</div>

				<!-- Documentos Anexos -->
				<div class="border border-slate-200 bg-white">
					<div
						class="border-b border-slate-200 bg-slate-50 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase"
					>
						Documentos Anexos ({enc.anexos.length})
					</div>
					<div class="overflow-x-auto">
						<table class="w-full border-collapse text-xs">
							<thead>
								<tr
									class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
								>
									<th class="border-r border-slate-200 px-3 py-2">Arquivo</th>
									<th class="border-r border-slate-200 px-3 py-2">Tipo</th>
									<th class="border-r border-slate-200 px-3 py-2">Tamanho</th>
									<th class="px-3 py-2">Ações</th>
								</tr>
							</thead>
							<tbody class="font-mono">
								{#if enc.anexos.length === 0}
									<tr>
										<td colspan="4" class="px-3 py-6 text-center font-sans text-slate-500">
											Nenhum documento anexado.
										</td>
									</tr>
								{:else}
									{#each enc.anexos as a (a.id)}
										<tr class="border-b border-slate-100 hover:bg-slate-50">
											<td
												class="border-r border-slate-100 px-3 py-2 text-left font-semibold text-slate-900"
											>
												{a.nome}
											</td>
											<td class="border-r border-slate-100 px-3 py-2 text-left">
												<span
													class="border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase"
												>
													{tipoLabel[a.tipo] || a.tipo}
												</span>
											</td>
											<td class="border-r border-slate-100 px-3 py-2 text-left text-slate-600">
												{(a.tamanhoKb / 1024).toFixed(2)} MB
											</td>
											<td class="px-3 py-2 text-left">
												<AnexoActions
													anexo={a}
													protocoloEncaminhamento={enc.protocolo}
													size="sm"
													onMensagem={notificar}
												/>
											</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				</div>

				<div class="mt-2 flex justify-end">
					<PrimaryButton
						label="Fechar"
						variant="secondary"
						onclick={() => (encaminhamentoModalAberto = false)}
					/>
				</div>
			</div>
		{/if}
	</Modal>
{/if}
