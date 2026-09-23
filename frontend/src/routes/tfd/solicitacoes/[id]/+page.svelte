<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import SeatPicker from '$lib/presentation/components/SeatPicker.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarCpf, formatarData, formatarDataHora } from '$lib/presentation/utils/tfdFormat';
	import type { SolicitacaoTFD, ViagemFrota } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	const id = $derived(page.params.id ?? '');
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let sol = $state<SolicitacaoTFD | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	// Anexar PDF tardio: UBS pode complementar até a solicitação ser realizada/cancelada.
	let podeAnexar = $derived(
		!!sol && (sol.status === 'PENDENTE' || sol.status === 'APROVADA' || sol.status === 'ALOCADA')
	);

	let anexarAberto = $state(false);
	let anexoFile = $state<File | null>(null);
	let anexoTipo = $state<import('$lib/api/tfd-types').TipoAnexoSolicitacaoTFD>('EXAME');
	let anexando = $state(false);

	let viagensCandidatas = $state<ViagemFrota[]>([]);
	let viagemAlvo = $state<ViagemFrota | null>(null);
	let viagemAlvoId = $state<string | null>(null);
	let assentoSelecionado = $state<number | null>(null);

	// ─── Modais ───
	let aprovarAberto = $state(false);
	let etapaAprov = $state<'decidir' | 'escolher-viagem' | 'escolher-assento'>('decidir');
	let observacoesAprov = $state('');
	let negarAberto = $state(false);
	let motivoNegacao = $state('');
	let processando = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function onAnexoFile(e: Event) {
		const t = e.target as HTMLInputElement;
		anexoFile = t.files?.[0] ?? null;
	}

	async function anexar() {
		if (!sol || !anexoFile) {
			notificar('erro', 'Selecione um arquivo.');
			return;
		}
		anexando = true;
		try {
			await api.tfd.solicitacoes.anexar(sol.id, anexoFile, anexoTipo);
			anexarAberto = false;
			anexoFile = null;
			anexoTipo = 'EXAME';
			notificar('ok', 'Anexo enviado · scanner antivírus em andamento.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			anexando = false;
		}
	}

	async function carregar() {
		if (!id) return;
		carregando = true;
		erro = null;
		try {
			sol = await api.tfd.solicitacoes.byId(id);
		} catch (e) {
			erro = mensagemErroTfd(e);
			sol = null;
		} finally {
			carregando = false;
		}
	}

	async function carregarViagensCandidatas() {
		try {
			const todas = await api.tfd.viagens.list({ status: 'AGENDADA' });
			const comVagas = todas.filter((v) => v.vagasOcupadas < v.vagasTotais);
			// Ordena: matches de destino primeiro
			if (sol) {
				const q = sol.destino.toLowerCase();
				comVagas.sort((a, b) => {
					const ah = a.destino.toLowerCase().includes(q) ? 1 : 0;
					const bh = b.destino.toLowerCase().includes(q) ? 1 : 0;
					return bh - ah;
				});
			}
			viagensCandidatas = comVagas;
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	async function selecionarViagem(vid: string) {
		viagemAlvoId = vid;
		assentoSelecionado = null;
		try {
			viagemAlvo = await api.tfd.viagens.byId(vid);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	function abrirAprovar() {
		etapaAprov = 'decidir';
		viagemAlvoId = null;
		viagemAlvo = null;
		assentoSelecionado = null;
		observacoesAprov = '';
		aprovarAberto = true;
	}

	async function aprovarSemAlocar() {
		if (!sol) return;
		processando = true;
		try {
			sol = await api.tfd.solicitacoes.aprovar(sol.id, {
				observacoes: observacoesAprov.trim() || undefined
			});
			aprovarAberto = false;
			notificar('ok', 'Solicitação aprovada · alocação pendente.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function aprovarENovaViagem() {
		if (!sol) return;
		processando = true;
		try {
			await api.tfd.solicitacoes.aprovar(sol.id, {
				observacoes: observacoesAprov.trim() || undefined
			});
			aprovarAberto = false;
			goto(`/tfd/viagens/nova?solicitacao=${sol.id}`);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
			processando = false;
		}
	}

	async function aprovarEAlocar() {
		if (!sol || !viagemAlvoId || !assentoSelecionado) return;
		processando = true;
		try {
			sol = await api.tfd.solicitacoes.aprovar(sol.id, {
				observacoes: observacoesAprov.trim() || undefined,
				alocacao: { viagemId: viagemAlvoId, numeroAssento: assentoSelecionado }
			});
			aprovarAberto = false;
			notificar(
				'ok',
				`Aprovada e alocada · ${viagemAlvo?.veiculoPlaca ?? ''} · assento ${assentoSelecionado}.`
			);
		} catch (e) {
			if (e instanceof ApiError && e.code === 'ASSENTO_OCUPADO') {
				// recarrega viagem pra atualizar mapa
				notificar('erro', 'Assento foi ocupado por outro operador. Escolha outro.');
				if (viagemAlvoId) await selecionarViagem(viagemAlvoId);
			} else {
				notificar('erro', mensagemErroTfd(e));
			}
		} finally {
			processando = false;
		}
	}

	async function negar() {
		if (!sol || motivoNegacao.trim().length < 10) return;
		processando = true;
		try {
			sol = await api.tfd.solicitacoes.negar(sol.id, motivoNegacao.trim());
			negarAberto = false;
			motivoNegacao = '';
			notificar('ok', 'Solicitação negada · auditoria registrada.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	$effect(() => {
		if (etapaAprov === 'escolher-viagem' && viagensCandidatas.length === 0) {
			carregarViagensCandidatas();
		}
	});

	onMount(carregar);
</script>

<div class="flex flex-col gap-4">
	<button
		type="button"
		onclick={() => history.back()}
		class="self-start border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
	>
		← Voltar
	</button>

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

	{#if carregando}
		<div class="border border-slate-200 bg-white p-10 text-center">
			<div
				class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
				Carregando solicitação...
			</div>
		</div>
	{:else if erro || !sol}
		<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
			<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
				{erro ?? 'Solicitação não encontrada'}
			</div>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					SOLICITAÇÃO TFD · {sol.status}
				</div>
				<div class="font-mono text-base font-bold text-blue-900">{sol.protocolo}</div>
				<div class="font-sans text-xs text-slate-700">
					{sol.pacienteNome ?? '—'} · CPF {formatarCpf(sol.pacienteCpf)}
				</div>
			</div>
			{#if podeOperar && sol.status === 'PENDENTE'}
				<div class="flex items-center gap-2">
					<PrimaryButton label="Negar" variant="danger" onclick={() => (negarAberto = true)} />
					<PrimaryButton label="Aprovar" onclick={abrirAprovar} />
				</div>
			{:else if podeOperar && sol.status === 'APROVADA' && !sol.viagemId}
				<PrimaryButton
					label="Alocar em Viagem"
					onclick={() => goto(`/tfd/viagens/nova?solicitacao=${sol!.id}`)}
				/>
			{/if}
		</div>

		<section class="grid grid-cols-12 gap-4">
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
				<PanelHeader title="Dados da Solicitação" index="01" />
				<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4 text-[12px]">
					<div class="col-span-12">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Motivo
						</dt>
						<dd class="mt-0.5 text-slate-900">{sol.motivo}</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Destino
						</dt>
						<dd class="mt-0.5 font-bold text-slate-900">{sol.destino}</dd>
						{#if sol.unidadeDestino}
							<dd class="mt-0.5 text-slate-700">{sol.unidadeDestino}</dd>
						{/if}
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Especialidade
						</dt>
						<dd class="mt-0.5 font-bold text-slate-900">{sol.especialidade}</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Data Desejada
						</dt>
						<dd class="mt-0.5 font-mono text-slate-900">{formatarData(sol.dataDesejada)}</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Prioridade
						</dt>
						<dd class="mt-0.5 font-mono font-bold text-slate-900">{sol.prioridade}</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Acompanhante
						</dt>
						<dd class="mt-0.5 text-slate-900">
							{sol.acompanhanteNecessario ? 'Sim — paciente precisa de acompanhante' : 'Não'}
						</dd>
					</div>
					{#if sol.observacoes}
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Observações da Aprovação
							</dt>
							<dd class="mt-0.5 text-slate-700 italic">{sol.observacoes}</dd>
						</div>
					{/if}
					{#if sol.motivoNegacao}
						<div class="col-span-12 border-l-4 border-red-700 bg-red-50 px-3 py-2">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-red-800 uppercase"
							>
								Motivo da Negação
							</dt>
							<dd class="mt-0.5 text-red-900">{sol.motivoNegacao}</dd>
						</div>
					{/if}
				</dl>
			</div>

			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
				<PanelHeader title="Identificação do Paciente" index="02" />
				<dl class="grid grid-cols-1 gap-3 px-4 py-4 text-[12px]">
					<div>
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Nome</dt>
						<dd class="mt-0.5 font-bold text-slate-900">{sol.pacienteNome ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
						<dd class="mt-0.5 font-mono text-slate-900">{formatarCpf(sol.pacienteCpf)}</dd>
					</div>
					<div>
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							UBS de Origem
						</dt>
						<dd class="mt-0.5 text-slate-900">{sol.ubsNome ?? '—'}</dd>
					</div>
					<a
						href="/ubs/pacientes/{sol.pacienteId}"
						class="border border-slate-300 bg-white px-2 py-1 text-center font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
					>
						Ver Prontuário Completo →
					</a>
				</dl>
			</div>

			<!-- Anexos -->
			<div class="col-span-12 border border-slate-200 bg-white">
				<PanelHeader
					title="Anexos da Solicitação"
					subtitle="Comprovante de encaminhamento + exames complementares"
					index="03"
				>
					<span
						class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						{sol.anexos.length} ARQUIVOS
					</span>
					{#if podeAnexar}
						<button
							type="button"
							onclick={() => (anexarAberto = true)}
							class="border border-blue-900 bg-blue-50 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:bg-blue-100"
						>
							+ Anexar
						</button>
					{/if}
				</PanelHeader>

				{#if sol.anexos.length === 0}
					<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
						Nenhum anexo recebido. Solicite à UBS o envio do comprovante de encaminhamento.
					</div>
				{:else}
					<ul class="divide-y divide-slate-100">
						{#each sol.anexos as ax (ax.id)}
							<li class="flex items-center justify-between px-4 py-3">
								<div class="flex items-center gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="h-5 w-5 shrink-0 text-slate-700"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
										/>
									</svg>
									<div class="leading-tight">
										<div class="font-sans text-sm font-bold text-slate-900">{ax.nome}</div>
										<div class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
											{ax.tipo.replace('_', ' ')} · {(ax.tamanhoKb / 1024).toFixed(2)} MB ·
											{formatarDataHora(ax.uploadEm)}
										</div>
									</div>
								</div>
								<div class="flex items-center gap-2">
									<span
										class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase
											{ax.scanStatus === 'LIMPO'
											? 'border-emerald-700 bg-emerald-50 text-emerald-800'
											: ax.scanStatus === 'PENDENTE'
												? 'border-amber-600 bg-amber-50 text-amber-800'
												: ax.scanStatus === 'INFECTADO'
													? 'border-red-700 bg-red-50 text-red-800'
													: 'border-slate-300 bg-slate-50 text-slate-700'}"
									>
										{ax.scanStatus === 'LIMPO'
											? '✓ LIMPO'
											: ax.scanStatus === 'PENDENTE'
												? '⟳ SCAN'
												: ax.scanStatus === 'INFECTADO'
													? '⛔ BLOQUEADO'
													: '⚠ FALHOU'}
									</span>
									<button
										type="button"
										disabled={ax.scanStatus !== 'LIMPO'}
										onclick={async () => {
											try {
												const { blob, filename } = await api.tfd.solicitacoes.downloadAnexo(ax.id);
												const url = URL.createObjectURL(blob);
												const a = document.createElement('a');
												a.href = url;
												a.download = filename;
												a.click();
												URL.revokeObjectURL(url);
											} catch (e) {
												notificar('erro', mensagemErroTfd(e));
											}
										}}
										class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-400"
									>
										Baixar
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Trilha -->
			<div class="col-span-12 border border-slate-200 bg-white">
				<PanelHeader title="Trilha de Decisão" index="04" />
				<ul class="divide-y divide-slate-100 px-4 py-2 font-mono text-[11px] text-slate-700">
					<li class="flex justify-between py-1.5">
						<span>Solicitação criada pela UBS</span>
						<span class="text-slate-500">{formatarDataHora(sol.criadaEm)}</span>
					</li>
					{#if sol.decididaEm}
						<li class="flex justify-between py-1.5">
							<span>
								{sol.status === 'APROVADA' || sol.status === 'ALOCADA' || sol.status === 'REALIZADA'
									? '✓ Aprovada'
									: '✗ Negada'}
							</span>
							<span class="text-slate-500">{formatarDataHora(sol.decididaEm)}</span>
						</li>
					{/if}
					{#if sol.viagemId}
						<li class="flex justify-between py-1.5">
							<span
								>Alocada na viagem
								<a href="/tfd/viagens/{sol.viagemId}" class="text-blue-900 underline"
									>{sol.viagemId.slice(0, 8)}…</a
								></span
							>
						</li>
					{/if}
				</ul>
			</div>
		</section>
	{/if}
</div>

<!-- ═══════════ Modal Aprovar ═══════════ -->
{#if sol}
	<Modal
		isOpen={aprovarAberto}
		onClose={() => (aprovarAberto = false)}
		title={etapaAprov === 'decidir'
			? 'Aprovar Solicitação'
			: etapaAprov === 'escolher-viagem'
				? 'Escolher Viagem'
				: 'Escolher Assento'}
		subtitle={etapaAprov === 'decidir'
			? 'Decisão auditada · 3 caminhos disponíveis'
			: etapaAprov === 'escolher-viagem'
				? 'Viagens AGENDADAS com vagas livres'
				: viagemAlvo
					? `${viagemAlvo.veiculoPlaca} · ${viagemAlvo.destino} · ${viagemAlvo.data} ${viagemAlvo.horaSaida}`
					: ''}
		maxWidth="lg"
	>
		{#if etapaAprov === 'decidir'}
			<div class="flex flex-col gap-4 font-mono text-slate-900">
				<div
					class="border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[12px] text-emerald-900"
				>
					Como deseja prosseguir? As 3 opções são auditadas igualmente.
				</div>

				<div class="flex flex-col">
					<label
						for="obs"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Observações (opcional)
					</label>
					<textarea
						id="obs"
						bind:value={observacoesAprov}
						rows="2"
						placeholder="Ex.: priorizar viagem com hospedagem credenciada"
						class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					></textarea>
				</div>

				<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
					<button
						type="button"
						onclick={() => (etapaAprov = 'escolher-viagem')}
						class="flex flex-col items-start gap-1.5 border-2 border-blue-900 bg-white p-3 text-left transition-colors hover:bg-blue-50"
					>
						<span class="font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase">
							1 · ALOCAR EM VIAGEM EXISTENTE
						</span>
						<span class="text-sm font-bold text-slate-900"> Escolher viagem + assento </span>
						<span class="text-[11px] text-slate-700">
							Aprova e aloca atomicamente em 1 só request.
						</span>
					</button>

					<button
						type="button"
						onclick={aprovarENovaViagem}
						class="flex flex-col items-start gap-1.5 border-2 border-slate-300 bg-white p-3 text-left transition-colors hover:border-blue-900 hover:bg-blue-50"
					>
						<span class="font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
							2 · CRIAR NOVA VIAGEM
						</span>
						<span class="text-sm font-bold text-slate-900"> Programar viagem dedicada </span>
						<span class="text-[11px] text-slate-700">
							Aprova e abre o wizard pra criar viagem com este paciente.
						</span>
					</button>

					<button
						type="button"
						onclick={aprovarSemAlocar}
						class="flex flex-col items-start gap-1.5 border border-slate-300 bg-white p-3 text-left transition-colors hover:border-slate-900"
					>
						<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
							3 · APROVAR SEM ALOCAR
						</span>
						<span class="text-sm font-bold text-slate-900"> Decidir alocação depois </span>
						<span class="text-[11px] text-slate-700">
							Solicitação fica APROVADA na fila — alocação manual depois.
						</span>
					</button>
				</div>

				<div class="flex justify-end border-t border-slate-200 pt-4">
					<PrimaryButton
						label="Cancelar"
						variant="secondary"
						onclick={() => (aprovarAberto = false)}
					/>
				</div>
			</div>
		{:else if etapaAprov === 'escolher-viagem'}
			<div class="flex flex-col gap-3 font-mono text-slate-900">
				<div
					class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
				>
					Viagens com destino similar a <strong>"{sol.destino}"</strong> aparecem primeiro.
				</div>

				{#if viagensCandidatas.length === 0}
					<div
						class="border border-slate-200 bg-slate-50 px-4 py-6 text-center font-mono text-xs text-slate-500"
					>
						Nenhuma viagem agendada com vagas. Use a opção "Criar Nova Viagem".
					</div>
				{:else}
					<ul class="divide-y divide-slate-100 border border-slate-200">
						{#each viagensCandidatas as v (v.id)}
							{@const sel = viagemAlvoId === v.id}
							<li>
								<button
									type="button"
									onclick={() => selecionarViagem(v.id)}
									class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors
										{sel ? 'bg-blue-50' : 'hover:bg-slate-50'}"
								>
									<div class="flex items-center gap-3">
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center border-2 font-mono text-[10px] font-bold
												{sel ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-400 bg-white text-transparent'}"
										>
											✓
										</span>
										<div class="leading-tight">
											<div class="font-sans text-sm font-bold text-slate-900">
												{v.veiculoPlaca ?? '—'} · {v.destino}
											</div>
											<div class="font-mono text-[11px] text-slate-600">
												{formatarData(v.data)} · saída {v.horaSaida} · {v.motoristaNome ?? '—'}
											</div>
										</div>
									</div>
									<span
										class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-800 uppercase"
									>
										{v.vagasTotais - v.vagasOcupadas} VAGAS
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="flex justify-between border-t border-slate-200 pt-4">
					<PrimaryButton
						label="← Voltar"
						variant="secondary"
						onclick={() => (etapaAprov = 'decidir')}
					/>
					<PrimaryButton
						label="Próximo · Escolher Assento →"
						onclick={() => (etapaAprov = 'escolher-assento')}
						disabled={!viagemAlvoId}
					/>
				</div>
			</div>
		{:else if viagemAlvo}
			<div class="flex flex-col gap-4 font-mono text-slate-900">
				<div
					class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
				>
					Clique em um assento livre (verde) para alocar
					<strong>{sol.pacienteNome ?? 'paciente'}</strong>{#if sol.acompanhanteNecessario}
						· paciente leva acompanhante
					{/if}.
				</div>

				<SeatPicker
					capacidade={viagemAlvo.vagasTotais}
					passageiros={viagemAlvo.passageiros}
					selecionado={assentoSelecionado}
					onSelecionar={(n) => (assentoSelecionado = n)}
				/>

				{#if assentoSelecionado}
					<div
						class="border-2 border-emerald-700 bg-emerald-50 px-3 py-2 font-mono text-[11px] tracking-wider text-emerald-900 uppercase"
					>
						✓ ASSENTO {assentoSelecionado} SELECIONADO · pronto para confirmar
					</div>
				{/if}

				<div class="flex justify-between border-t border-slate-200 pt-4">
					<PrimaryButton
						label="← Voltar"
						variant="secondary"
						onclick={() => (etapaAprov = 'escolher-viagem')}
					/>
					<PrimaryButton
						label={`Aprovar e Alocar no Assento ${assentoSelecionado ?? '—'}`}
						onclick={aprovarEAlocar}
						loading={processando}
						disabled={!assentoSelecionado}
					/>
				</div>
			</div>
		{/if}
	</Modal>

	<!-- Modal Negar -->
	<Modal
		isOpen={negarAberto}
		onClose={() => (negarAberto = false)}
		title="Negar Solicitação"
		subtitle="Motivo obrigatório · auditado por 5 anos"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			<div class="border-2 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900">
				A negação é definitiva. Uma nova solicitação precisará ser aberta caso o caso seja
				reavaliado.
			</div>
			<div class="flex flex-col">
				<label
					for="mot"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Motivo da Negação (mínimo 10 caracteres)
				</label>
				<textarea
					id="mot"
					bind:value={motivoNegacao}
					rows="3"
					placeholder="Ex.: encaminhamento da SMS não autoriza este destino"
					class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700"
				></textarea>
				<div class="mt-1 text-right text-[10px] text-slate-500">
					{motivoNegacao.trim().length}/10
				</div>
			</div>
			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton label="Cancelar" variant="secondary" onclick={() => (negarAberto = false)} />
				<PrimaryButton
					label="Confirmar Negação"
					variant="danger"
					onclick={negar}
					loading={processando}
					disabled={motivoNegacao.trim().length < 10}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Anexar PDF tardio ───────────────────────────────── -->
{#if anexarAberto && sol}
	<Modal
		isOpen={anexarAberto}
		title="Anexar documento"
		subtitle="Complementa a solicitação após criada"
		onClose={() => (anexarAberto = false)}
	>
		<div class="flex flex-col gap-3 py-1">
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Tipo do documento
				</span>
				<select
					bind:value={anexoTipo}
					class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="COMPROVANTE_ENCAMINHAMENTO">Comprovante de encaminhamento</option>
					<option value="EXAME">Exame</option>
					<option value="LAUDO">Laudo</option>
					<option value="OUTRO">Outro</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Arquivo <span class="text-red-700">*</span>
				</span>
				<input
					type="file"
					accept="application/pdf,image/jpeg,image/png,image/webp"
					onchange={onAnexoFile}
					class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
				/>
				<span class="text-[11px] text-slate-500">
					PDF, JPG, PNG ou WebP · até 10 MB · será verificado pelo antivírus.
				</span>
			</label>
			<div class="mt-3 flex justify-end gap-2">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (anexarAberto = false)}
					disabled={anexando}
				/>
				<PrimaryButton
					label={anexando ? 'Enviando...' : 'Enviar anexo'}
					onclick={anexar}
					disabled={anexando || !anexoFile}
				/>
			</div>
		</div>
	</Modal>
{/if}
