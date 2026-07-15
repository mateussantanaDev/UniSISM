<script lang="ts">
	import EncaminhamentoExplorer from '$lib/presentation/components/EncaminhamentoExplorer.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroSms } from '$lib/api/erros-sms';
	import type { Encaminhamento, Ubs } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Respostas Oficiais do SUS
	 *
	 * Duas funcionalidades aqui:
	 *
	 *   1. **Explorador hierárquico** (UBS → Ano → Mês → Dia) com filtro
	 *      `respostaSUS=true` — mostra os encaminhamentos JÁ com retorno
	 *      do SUS Federal anexado. O clique abre o detalhe DIRETO na aba
	 *      "Anexos" (via `?aba=anexos`) — fixando o bug em que a tela abria
	 *      em "Paciente" e o regulador achava que "não tinha nada".
	 *
	 *   2. **+ Enviar Resposta SUS** — botão que abre modal para registrar
	 *      o PDF oficial: regulador escolhe a UBS, depois o encaminhamento
	 *      APROVADO sem resposta ainda, faz upload do PDF e digita uma
	 *      observação. O backend (`POST /encaminhamentos/:id/resposta-sus`)
	 *      anexa o documento; a hierarquia UBS/Ano/Mês/Dia do explorer é
	 *      derivada automaticamente da data de criação do encaminhamento.
	 */

	let abrir = $state(false);
	let etapa = $state<'ubs' | 'enc' | 'upload'>('ubs');
	let processando = $state(false);
	let erro = $state('');

	// Dados disponíveis para preenchimento
	let ubss = $state<Ubs[]>([]);
	let ubsSelecionada = $state<Ubs | null>(null);
	let encaminhamentos = $state<Encaminhamento[]>([]);
	let encSelecionado = $state<Encaminhamento | null>(null);
	let termoBusca = $state('');

	let encaminhamentosFiltrados = $derived.by(() => {
		const term = termoBusca.trim().toLowerCase();
		if (!term) return encaminhamentos;
		return encaminhamentos.filter((e) =>
			(e.paciente?.nome ?? '').toLowerCase().includes(term)
		);
	});

	let arquivo = $state<File | null>(null);
	let observacao = $state('');

	// Toast simples (modal não tem)
	let toast = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	let recargaKey = $state(0); // bump pra forçar reload do explorer após salvar

	function notificar(t: 'ok' | 'erro', texto: string) {
		toast = { tipo: t, texto };
		setTimeout(() => (toast = null), 5000);
	}

	function abrirModal() {
		etapa = 'ubs';
		ubsSelecionada = null;
		encSelecionado = null;
		encaminhamentos = [];
		termoBusca = '';
		arquivo = null;
		observacao = '';
		erro = '';
		abrir = true;
	}

	function fecharModal() {
		if (processando) return;
		abrir = false;
	}

	async function carregarUbss() {
		try {
			ubss = await api.admin.listUbs();
		} catch (e) {
			erro = mensagemErroSms(e);
		}
	}

	onMount(carregarUbss);

	/**
	 * Lista os APROVADOS da UBS escolhida que ainda NÃO têm resposta SUS.
	 * Backend filtra por `respostaSUS=false`; UBS é filtrado client-side
	 * porque a query atual não aceita `ubsId` (não inventar parâmetro).
	 */
	async function carregarEncsDaUbs() {
		if (!ubsSelecionada) return;
		processando = true;
		erro = '';
		try {
			const lista = await api.encaminhamentos.list({
				status: 'APROVADO',
				respostaSUS: false,
				limit: 500
			});
			// Filtra client-side pela UBS escolhida. O DTO de Encaminhamento não
			// expõe `ubsId` — usa o nome em `unidadeOrigem` como chave de match.
			const nomeAlvo = ubsSelecionada!.nome.trim().toLowerCase();
			encaminhamentos = lista.filter(
				(e) => (e.unidadeOrigem ?? '').trim().toLowerCase() === nomeAlvo
			);
		} catch (e) {
			erro = mensagemErroSms(e);
			encaminhamentos = [];
		} finally {
			processando = false;
		}
	}

	function escolherUbs(u: Ubs) {
		ubsSelecionada = u;
		etapa = 'enc';
		void carregarEncsDaUbs();
	}

	function escolherEnc(e: Encaminhamento) {
		encSelecionado = e;
		etapa = 'upload';
	}

	function onFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		arquivo = input.files?.[0] ?? null;
	}

	async function enviar() {
		if (!encSelecionado || !arquivo) return;
		processando = true;
		erro = '';
		try {
			await api.encaminhamentos.registrarRespostaSus(
				encSelecionado.id,
				arquivo,
				observacao.trim()
			);
			notificar('ok', 'Resposta SUS registrada · anexada ao encaminhamento.');
			abrir = false;
			recargaKey++; // força explorer a recarregar
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'ENCAMINHAMENTO_NAO_EM_PENDENCIA' || e.code === 'STATUS_INVALIDO') {
					erro = 'Este encaminhamento mudou de status — reabra a tela e tente outro.';
				} else if (e.code === 'ARQUIVO_INVALIDO' || e.code === 'MIME_NAO_SUPORTADO') {
					erro = 'Arquivo precisa ser um PDF válido.';
				} else if (e.code === 'ARQUIVO_MUITO_GRANDE') {
					erro = 'Arquivo muito grande (limite 10 MB).';
				} else {
					erro = mensagemErroSms(e);
				}
			} else {
				erro = mensagemErroSms(e);
			}
		} finally {
			processando = false;
		}
	}

	function voltarEtapa() {
		if (etapa === 'enc') {
			etapa = 'ubs';
			encaminhamentos = [];
		} else if (etapa === 'upload') {
			etapa = 'enc';
			arquivo = null;
			observacao = '';
		}
	}
</script>

<svelte:head>
	<title>Respostas do SUS · UNISISM</title>
</svelte:head>

<div class="flex flex-col gap-4">
	{#if toast}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{toast.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-900'
				: 'border-red-700 bg-red-50 text-red-900'}"
		>
			{toast.tipo === 'ok' ? '✓' : '⚠'} {toast.texto}
		</div>
	{/if}

	<!-- Ação principal: enviar resposta SUS -->
	<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
		<div class="leading-tight">
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Ação
			</div>
			<div class="font-sans text-sm text-slate-700">
				Anexar o PDF oficial devolvido pela regulação federal a um encaminhamento aprovado.
			</div>
		</div>
		<PrimaryButton label="+ Enviar Resposta SUS" onclick={abrirModal} />
	</div>

	{#key recargaKey}
		<EncaminhamentoExplorer
			basePath="/sms/respostas"
			titulo="Respostas do SUS"
			subtitulo="Retornos oficiais da regulação federal · UBS · Ano · Mês · Dia"
			emojiVazio="📨"
			mensagemVazio="Nenhuma resposta oficial recebida ainda."
			respostaSUS={true}
			excluirRascunho
			tipoFiltro="respostas"
			detalheQuery="?aba=anexos"
			dica="Cada item leva direto à aba de Anexos com o PDF oficial em destaque."
		/>
	{/key}
</div>

<!-- ────────── Modal de envio ────────── -->
{#if abrir}
	<Modal
		isOpen={abrir}
		title="Enviar Resposta SUS"
		subtitle={etapa === 'ubs'
			? 'Passo 1 de 3 · Escolha a UBS'
			: etapa === 'enc'
				? 'Passo 2 de 3 · Escolha o encaminhamento'
				: 'Passo 3 de 3 · Anexar PDF'}
		maxWidth="lg"
		onClose={fecharModal}
	>
		<div class="flex flex-col gap-3 py-1">
			<!-- Breadcrumb das etapas -->
			<div class="flex items-center gap-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				<span class={etapa === 'ubs' ? 'font-bold text-blue-900' : ''}>UBS</span>
				<span>›</span>
				<span class={etapa === 'enc' ? 'font-bold text-blue-900' : etapa === 'ubs' ? 'text-slate-300' : ''}>
					{ubsSelecionada?.nome ?? 'Encaminhamento'}
				</span>
				<span>›</span>
				<span class={etapa === 'upload' ? 'font-bold text-blue-900' : 'text-slate-300'}>
					Upload
				</span>
			</div>

			{#if erro}
				<div class="border border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-800">
					{erro}
				</div>
			{/if}

			<!-- ─── Etapa 1: Escolher UBS ────────────────────────────── -->
			{#if etapa === 'ubs'}
				{#if ubss.length === 0}
					<div class="border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center font-sans text-sm text-slate-500">
						Nenhuma UBS cadastrada nesta prefeitura.
					</div>
				{:else}
					<ul class="grid grid-cols-1 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2">
						{#each ubss as u (u.id)}
							<li>
								<button
									type="button"
									onclick={() => escolherUbs(u)}
									class="flex w-full items-start gap-3 bg-white px-3 py-3 text-left hover:bg-blue-50 hover:text-blue-900"
								>
									<div class="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 bg-slate-50 font-mono text-[11px] font-bold text-slate-700">
										UBS
									</div>
									<div class="leading-tight">
										<div class="font-sans text-sm font-semibold text-slate-900">{u.nome}</div>
										<div class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
											{u.municipio} · {u.uf}
										</div>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

			<!-- ─── Etapa 2: Escolher Encaminhamento ─────────────────── -->
			{#if etapa === 'enc'}
				{#if processando}
					<div class="px-6 py-12 text-center font-sans text-sm text-slate-500">
						Carregando encaminhamentos aprovados...
					</div>
				{:else if encaminhamentos.length === 0}
					<div class="border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center font-sans text-sm text-slate-500">
						Nenhum encaminhamento APROVADO sem resposta nesta UBS.
					</div>
				{:else}
					<!-- Barra de pesquisa por nome do paciente -->
					<div class="relative">
						<input
							type="text"
							bind:value={termoBusca}
							placeholder="🔍 Digite o nome do paciente para filtrar..."
							class="w-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans"
						/>
					</div>

					<div class="max-h-[300px] overflow-y-auto border border-slate-200">
						<table class="w-full border-collapse text-xs">
							<thead class="sticky top-0 z-10 bg-slate-100">
								<tr class="border-b border-slate-200 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
									<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
									<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
									<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
									<th class="px-3 py-2">Data</th>
								</tr>
							</thead>
							<tbody class="font-mono">
								{#if encaminhamentosFiltrados.length === 0}
									<tr>
										<td colspan="4" class="px-3 py-8 text-center font-sans text-slate-500">
											Nenhum paciente encontrado com o termo digitado.
										</td>
									</tr>
								{:else}
									{#each encaminhamentosFiltrados as e (e.id)}
										<tr
											onclick={() => escolherEnc(e)}
											class="cursor-pointer border-b border-slate-100 hover:bg-blue-50"
										>
											<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
												{e.protocolo}
											</td>
											<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900 font-semibold">
												{e.paciente.nome}
											</td>
											<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
												{e.solicitacao.especialidadeSolicitada}
											</td>
											<td class="px-3 py-2 text-slate-600">
												{new Date(e.criadoEm).toLocaleDateString('pt-BR')}
											</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}

			<!-- ─── Etapa 3: Upload do PDF ───────────────────────────── -->
			{#if etapa === 'upload' && encSelecionado}
				<div class="border border-slate-200 bg-slate-50 px-3 py-2">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Para o encaminhamento
					</div>
					<div class="mt-0.5 font-mono text-sm font-bold text-blue-900">
						{encSelecionado.protocolo}
					</div>
					<div class="font-sans text-[12px] text-slate-700">
						{encSelecionado.paciente.nome} · {encSelecionado.solicitacao.especialidadeSolicitada}
					</div>
				</div>

				<label class="flex flex-col gap-1">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						PDF da Resposta SUS <span class="text-red-700">*</span>
					</span>
					<input
						type="file"
						accept="application/pdf"
						onchange={onFile}
						class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
					/>
					<span class="text-[11px] text-slate-500">
						Apenas PDF · até 10 MB · será passado pelo antivírus.
					</span>
				</label>

				<label class="flex flex-col gap-1">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						Observação
					</span>
					<textarea
						bind:value={observacao}
						rows={3}
						maxlength={500}
						placeholder="Notas internas, data do agendamento, número do exame..."
						class="border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					></textarea>
				</label>
			{/if}

			<!-- ─── Ações ────────────────────────────────────────────── -->
			<div class="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-3">
				<div>
					{#if etapa !== 'ubs'}
						<PrimaryButton
							label="← Voltar"
							variant="secondary"
							onclick={voltarEtapa}
							disabled={processando}
						/>
					{/if}
				</div>
				<div class="flex gap-2">
					<PrimaryButton
						label="Cancelar"
						variant="secondary"
						onclick={fecharModal}
						disabled={processando}
					/>
					{#if etapa === 'upload'}
						<PrimaryButton
							label={processando ? 'Enviando...' : 'Enviar Resposta'}
							onclick={enviar}
							disabled={processando || !arquivo}
						/>
					{/if}
				</div>
			</div>
		</div>
	</Modal>
{/if}
