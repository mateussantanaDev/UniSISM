<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import NominalJustificativa from '$lib/presentation/components/NominalJustificativa.svelte';
	import ImprimirRelatorioPDF from '$lib/presentation/components/ImprimirRelatorioPDF.svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		CriarRelatorioRequest,
		FormatoRelatorio,
		Relatorio,
		TipoRelatorio
	} from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import {
		FORMATO_TONE,
		catalogoDe,
		dataHoraDisplay,
		hojeYmd,
		mensagemAmigavel,
		primeiroDoMes,
		tamanhoDisplay,
		tiposPermitidosPara,
		validarPeriodo
	} from '$lib/presentation/utils/relatorios';
	import { onMount } from 'svelte';

	const auth = useAuth();

	// ─────────── Estado do formulário ───────────
	let tipoSelecionado = $state<TipoRelatorio | null>(null);
	let dataInicial = $state(primeiroDoMes());
	let dataFinal = $state(hojeYmd());
	let formato = $state<FormatoRelatorio>('PDF');
	let incluirNomes = $state(false);

	// ─────────── Estado do ciclo ───────────
	let gerando = $state(false);
	let historico = $state<Relatorio[]>([]);
	let carregandoHistorico = $state(true);
	let erroGerar = $state('');
	let relatorioPreview = $state<Relatorio | null>(null);

	// Rate limit — bloqueio por 60s após 429.
	let bloqueadoAte = $state<number>(0);
	let agoraMs = $state(Date.now());

	// Keep `agoraMs` updated pra atualizar o contador regressivo.
	$effect(() => {
		if (bloqueadoAte <= agoraMs) return;
		const id = setInterval(() => (agoraMs = Date.now()), 1000);
		return () => clearInterval(id);
	});
	let bloqueado = $derived(agoraMs < bloqueadoAte);
	let segundosBloqueio = $derived(Math.max(0, Math.ceil((bloqueadoAte - agoraMs) / 1000)));

	// ─────────── Modal nominal ───────────
	let nominalAberto = $state(false);

	// ─────────── Derivados ───────────
	let tiposVisiveis = $derived(tiposPermitidosPara(auth.me?.role));
	let catalogoSelecionado = $derived(tipoSelecionado ? catalogoDe(tipoSelecionado) : null);
	let periodoIgnorado = $derived(catalogoSelecionado?.periodoIgnorado ?? false);
	let permiteNominal = $derived(catalogoSelecionado?.permiteNominal ?? false);

	// ─────────── Ciclo de carregamento ───────────
	async function refreshHistorico() {
		try {
			historico = await api.relatorios.list();
		} catch {
			/* silencioso — mantém histórico anterior */
		}
	}

	onMount(async () => {
		await refreshHistorico();
		carregandoHistorico = false;
	});

	// ─────────── Geração ───────────
	function selecionarTipo(t: TipoRelatorio) {
		tipoSelecionado = t;
		// Reset flag nominal ao trocar de tipo.
		if (!catalogoDe(t).permiteNominal) incluirNomes = false;
		erroGerar = '';
	}

	async function tentarGerar() {
		if (!tipoSelecionado || bloqueado) return;
		erroGerar = '';

		// Validação client-side do período (pula se tipo ignora período).
		const erroPeriodo = validarPeriodo(dataInicial, dataFinal, periodoIgnorado);
		if (erroPeriodo) {
			erroGerar = erroPeriodo;
			return;
		}

		// Se é nominal, abre modal pra colher justificativa.
		if (permiteNominal && incluirNomes) {
			nominalAberto = true;
			return;
		}

		await enviar();
	}

	async function confirmarNominal(justificativa: string) {
		await enviar({ incluirNomes: true, justificativa });
		nominalAberto = false;
	}

	async function enviar(filtros?: Record<string, unknown>) {
		if (!tipoSelecionado) return;
		gerando = true;
		erroGerar = '';
		try {
			const req: CriarRelatorioRequest = {
				tipo: tipoSelecionado,
				dataInicial,
				dataFinal,
				formato,
				...(filtros ? { filtros } : {})
			};
			const novo = await api.relatorios.create(req);
			historico = [novo, ...historico.filter((r) => r.id !== novo.id)];
			if (novo.status === 'PROCESSANDO') pollar(novo.id);
			tipoSelecionado = null;
			incluirNomes = false;
		} catch (e) {
			erroGerar = mensagemAmigavel(e);
			// Rate limit → bloqueia botão por 60s.
			if (e instanceof ApiError && e.code === 'RATE_LIMIT_EXCEDIDO') {
				bloqueadoAte = Date.now() + 60_000;
				agoraMs = Date.now();
			}
		} finally {
			gerando = false;
		}
	}

	async function pollar(id: string, iter = 0) {
		if (iter > 30) return;
		await new Promise((r) => setTimeout(r, 2000));
		await refreshHistorico();
		const atual = historico.find((r) => r.id === id);
		if (atual?.status === 'PROCESSANDO') pollar(id, iter + 1);
	}

	async function baixar(r: Relatorio) {
		if (r.status !== 'DISPONIVEL') return;
		if (r.formato === 'PDF') {
			relatorioPreview = r;
			return;
		}
		try {
			const { blob, filename } = await api.relatorios.download(r.id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			erroGerar = mensagemAmigavel(e);
			// Se o arquivo expirou / sumiu, marca status como FALHA localmente.
			if (e instanceof ApiError && (e.code === 'RELATORIO_EXPIRADO' || e.code === 'ARQUIVO_NAO_ENCONTRADO')) {
				historico = historico.map((x) =>
					x.id === r.id ? { ...x, status: 'FALHA' as const } : x
				);
			}
		}
	}

	async function gerarNovamente(r: Relatorio) {
		// Pré-preenche o formulário a partir do relatório expirado/falho.
		tipoSelecionado = r.tipo;
		formato = r.formato;
		// Não copia período — deixa o usuário revalidar.
		erroGerar = '';
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<section class="flex flex-col gap-4">
	<!-- Aviso de escopo por role -->
	{#if tiposVisiveis.length === 0}
		<div
			class="border border-amber-600 bg-amber-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-amber-900 uppercase"
		>
			⚠ Nenhum tipo de relatório disponível para sua role ({auth.me?.role ?? '—'})
		</div>
	{/if}

	<!-- 1. Escolha do tipo -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="1. Escolha o Relatório"
			subtitle="Tipos filtrados pela sua permissão ({auth.me?.role ?? '—'})"
			index="01"
		/>
		<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
			{#each tiposVisiveis as r (r.tipo)}
				{@const ativo = tipoSelecionado === r.tipo}
				<button
					type="button"
					onclick={() => selecionarTipo(r.tipo)}
					class="flex items-start gap-3 bg-white px-4 py-3 text-left transition-colors
						{ativo ? 'bg-blue-50 ring-2 ring-blue-900' : 'hover:bg-slate-50'}"
				>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center border font-mono text-base
							{ativo ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-slate-50 text-slate-700'}"
					>
						{r.icone}
					</div>
					<div class="flex-1 leading-tight">
						<div class="flex items-center gap-2">
							<span
								class="font-mono text-xs font-bold tracking-wider uppercase
									{ativo ? 'text-blue-900' : 'text-slate-900'}"
							>
								{r.titulo}
							</span>
							{#if r.restrito}
								<span
									class="border border-red-700 bg-red-50 px-1 py-px font-mono text-[9px] font-bold tracking-widest text-red-800 uppercase"
								>
									Restrito
								</span>
							{/if}
							{#if r.permiteNominal}
								<span
									class="border border-amber-600 bg-amber-50 px-1 py-px font-mono text-[9px] font-bold tracking-widest text-amber-800 uppercase"
								>
									Nominal opt-in
								</span>
							{/if}
						</div>
						<div class="mt-0.5 text-[11px] text-slate-600">{r.descricao}</div>
					</div>
					{#if ativo}
						<span
							class="border border-blue-900 bg-blue-900 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-white uppercase"
						>
							✓
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- 2. Parâmetros -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="2. Parâmetros"
			subtitle={catalogoSelecionado
				? `Relatório: ${catalogoSelecionado.titulo}`
				: 'Selecione um tipo acima'}
			index="02"
		/>
		<div class="grid grid-cols-12 gap-3 p-4">
			<div class="col-span-6 md:col-span-3">
				<label
					for="di"
					class="mb-1 block text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Data Inicial
				</label>
				<input
					id="di"
					type="date"
					bind:value={dataInicial}
					disabled={!tipoSelecionado || periodoIgnorado}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50 disabled:text-slate-400"
				/>
			</div>
			<div class="col-span-6 md:col-span-3">
				<label
					for="df"
					class="mb-1 block text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Data Final
				</label>
				<input
					id="df"
					type="date"
					bind:value={dataFinal}
					disabled={!tipoSelecionado || periodoIgnorado}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50 disabled:text-slate-400"
				/>
			</div>
			<div class="col-span-12 md:col-span-3">
				<label
					for="fmt"
					class="mb-1 block text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Formato
				</label>
				<select
					id="fmt"
					bind:value={formato}
					disabled={!tipoSelecionado}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50 disabled:text-slate-400"
				>
					<option value="PDF">PDF · A4 institucional</option>
					<option value="CSV">CSV · separado por vírgula</option>
					<option value="XLSX">XLSX · Microsoft Excel</option>
				</select>
			</div>
			<div class="col-span-12 flex items-end md:col-span-3">
				<PrimaryButton
					label={bloqueado
						? `Aguarde ${segundosBloqueio}s`
						: permiteNominal && incluirNomes
							? 'Continuar · Nominal'
							: 'Gerar Relatório'}
					onclick={tentarGerar}
					loading={gerando}
					disabled={!tipoSelecionado || bloqueado}
					fullWidth
				/>
			</div>

			<!-- Aviso de período ignorado -->
			{#if periodoIgnorado}
				<div
					class="col-span-12 border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
				>
					ℹ Este relatório reflete o <strong>estado atual</strong> — as datas acima serão ignoradas pelo
					backend.
				</div>
			{/if}

			<!-- Checkbox nominal (BUSCA_ATIVA) -->
			{#if permiteNominal}
				<label
					class="col-span-12 flex cursor-pointer items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
				>
					<input
						type="checkbox"
						bind:checked={incluirNomes}
						class="mt-0.5 h-3.5 w-3.5 border-amber-600 text-amber-700 focus:ring-amber-600"
					/>
					<span>
						<strong class="font-mono tracking-wider uppercase"
							>Incluir nomes dos pacientes (modo nominal)</strong
						>
						— exigirá justificativa de ≥ 30 caracteres gravada em auditoria. O PDF virá com marca d'água
						CONFIDENCIAL.
					</span>
				</label>
			{/if}

			{#if erroGerar}
				<div
					class="col-span-12 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {erroGerar}
				</div>
			{/if}
		</div>
	</div>

	<!-- 3. Histórico -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Histórico de Relatórios"
			subtitle="Arquivos gerados nos últimos 90 dias · TTL 7 dias para download"
			index="03"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{historico.length} REGISTROS
			</span>
		</PanelHeader>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Gerado em</th>
						<th class="border-r border-slate-200 px-3 py-2">Título</th>
						<th class="border-r border-slate-200 px-3 py-2">Período</th>
						<th class="border-r border-slate-200 px-3 py-2">Formato</th>
						<th class="border-r border-slate-200 px-3 py-2">Tamanho</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregandoHistorico}
						{#each Array(3) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if historico.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhum relatório gerado nos últimos 90 dias.
							</td>
						</tr>
					{:else}
						{#each historico as r (r.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{dataHoraDisplay(r.geradoEm)}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900"
								>
									{r.titulo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{r.periodo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase {FORMATO_TONE[
											r.formato
										]}"
									>
										{r.formato}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{tamanhoDisplay(r.tamanhoKb)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									{#if r.status === 'DISPONIVEL'}
										<span
											class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
										>
											✓ DISPONÍVEL
										</span>
									{:else if r.status === 'PROCESSANDO'}
										<span
											class="border border-amber-600 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-amber-800 uppercase"
										>
											⏳ PROCESSANDO
										</span>
									{:else}
										<span
											class="border border-red-700 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-red-800 uppercase"
										>
											✗ FALHA
										</span>
									{/if}
								</td>
								<td class="flex gap-1.5 px-3 py-2">
									{#if r.status === 'DISPONIVEL'}
										<button
											type="button"
											onclick={() => baixar(r)}
											class="border border-slate-300 bg-white px-3 py-1 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											Baixar
										</button>
									{:else if r.status === 'FALHA'}
										<button
											type="button"
											onclick={() => gerarNovamente(r)}
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											Gerar Novamente
										</button>
									{:else}
										<span class="px-2 py-0.5 text-[10px] tracking-widest text-slate-400 uppercase">
											Aguarde...
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</section>

<!-- Modal nominal -->
<Modal
	isOpen={nominalAberto}
	onClose={() => (nominalAberto = false)}
	title="Justificativa para Relatório Nominal"
	subtitle="Busca Ativa · uso restrito · auditado por 5 anos"
	maxWidth="md"
>
	<NominalJustificativa
		onConfirmar={confirmarNominal}
		onCancelar={() => (nominalAberto = false)}
		{gerando}
	/>
</Modal>

{#if relatorioPreview}
	<ImprimirRelatorioPDF
		relatorio={relatorioPreview}
		operador={auth.me?.nome}
		prefeitura={auth.me?.prefeitura}
		onFechar={() => (relatorioPreview = null)}
	/>
{/if}
