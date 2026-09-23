<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarDataHora, mesAtual } from '$lib/presentation/utils/tfdFormat';
	import type { RegistroAuditoriaTFD } from '$lib/api/tfd-types';
	import { onMount } from 'svelte';

	let registros = $state<RegistroAuditoriaTFD[]>([]);
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	let exportando = $state(false);
	let mesExport = $state(mesAtual());
	let verificando = $state(false);

	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 5000);
	}

	let filtroRecurso = $state<string>('TODOS');
	let busca = $state('');

	const lista = $derived.by(() => {
		let base = registros;
		if (filtroRecurso !== 'TODOS') base = base.filter((r) => r.recursoTipo === filtroRecurso);
		if (busca.trim()) {
			const q = busca.toLowerCase();
			base = base.filter(
				(r) =>
					r.acao.toLowerCase().includes(q) ||
					r.operadorNome.toLowerCase().includes(q) ||
					(r.recursoProtocolo ?? '').toLowerCase().includes(q)
			);
		}
		return base;
	});

	const tiposRecurso: string[] = [
		'TODOS',
		'VEICULO',
		'MOTORISTA',
		'SOLICITACAO',
		'VIAGEM',
		'ABASTECIMENTO',
		'SALDO',
		'AJUDA_CUSTO'
	];

	function tipoTone(t: string): string {
		const map: Record<string, string> = {
			VEICULO: 'border-blue-700 bg-blue-50 text-blue-900',
			MOTORISTA: 'border-purple-700 bg-purple-50 text-purple-800',
			SOLICITACAO: 'border-amber-600 bg-amber-50 text-amber-800',
			VIAGEM: 'border-emerald-700 bg-emerald-50 text-emerald-800',
			ABASTECIMENTO: 'border-orange-600 bg-orange-50 text-orange-800',
			SALDO: 'border-red-700 bg-red-50 text-red-800',
			AJUDA_CUSTO: 'border-sky-700 bg-sky-50 text-sky-800'
		};
		return map[t] ?? 'border-slate-300 bg-slate-50 text-slate-700';
	}

	let detalheAberto = $state<RegistroAuditoriaTFD | null>(null);

	async function carregar() {
		carregando = true;
		erroLista = null;
		try {
			registros = await api.tfd.auditoria.list();
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function exportarTJ() {
		if (!mesExport) return;
		exportando = true;
		try {
			const { blob, filename } = await api.tfd.auditoria.exportarTJ(mesExport);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			notificar('ok', `Trilha ${mesExport} exportada · ${filename}.`);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			exportando = false;
		}
	}

	async function verificar() {
		verificando = true;
		try {
			const r = await api.tfd.auditoria.verificar();
			if (r.corrompidos.length === 0) {
				notificar('ok', `Cadeia íntegra · ${r.total} registros verificados.`);
			} else {
				notificar('erro', `${r.corrompidos.length} registro(s) corrompido(s) detectado(s)!`);
			}
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			verificando = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
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

	{#if erroLista}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erroLista}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Total de Eventos"
			value={carregando ? '—' : registros.length}
			sublabel="Trilha imutável"
		/>
		<MetricCard
			label="Operações Financeiras"
			value={carregando
				? '—'
				: registros.filter(
						(r) =>
							r.recursoTipo === 'ABASTECIMENTO' ||
							r.recursoTipo === 'AJUDA_CUSTO' ||
							r.recursoTipo === 'SALDO'
					).length}
			sublabel="Custos · ajudas · saldos"
		/>
		<MetricCard
			label="Decisões Operacionais"
			value={carregando
				? '—'
				: registros.filter((r) => r.acao.includes('SOLICITACAO') || r.acao.includes('VIAGEM'))
						.length}
			sublabel="Aprovações + agendamentos"
		/>
		<MetricCard
			label="Cadastros"
			value={carregando
				? '—'
				: registros.filter((r) => r.recursoTipo === 'VEICULO' || r.recursoTipo === 'MOTORISTA')
						.length}
			sublabel="Frota + quadro"
		/>
	</div>

	<div class="border-2 border-blue-900 bg-blue-50 px-4 py-3 font-sans text-[12px] text-blue-900">
		<div class="font-mono text-[11px] font-bold tracking-widest uppercase">
			Trilha de Auditoria · Tribunal de Justiça (Lei 14.133/2021 · LC 101/2000 · LGPD)
		</div>
		<p class="mt-1">
			Cada evento abaixo tem hash <strong>encadeado</strong> com o anterior (blockchain-like).
			Qualquer adulteração de um registro quebra todos os hashes seguintes — prova matemática de
			imutabilidade. Retenção: <strong>20 anos</strong>.
		</p>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Registros de Auditoria"
			subtitle="Cada operação relevante deixa um vestígio permanente · clique para ver antes/depois"
			index="01"
		>
			<div class="flex items-center gap-2">
				<input
					type="month"
					bind:value={mesExport}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				<PrimaryButton
					label="Exportar TJ (ZIP)"
					variant="secondary"
					onclick={exportarTJ}
					loading={exportando}
				/>
				<PrimaryButton
					label="Verificar Cadeia"
					variant="secondary"
					onclick={verificar}
					loading={verificando}
				/>
			</div>
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<input
				type="text"
				bind:value={busca}
				placeholder="Buscar por ação, operador ou protocolo..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div
			class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			<span class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Recurso
			</span>
			{#each tiposRecurso as t (t)}
				<button
					type="button"
					onclick={() => (filtroRecurso = t)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{filtroRecurso === t
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{t}
				</button>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Quando</th>
						<th class="border-r border-slate-200 px-3 py-2">Recurso</th>
						<th class="border-r border-slate-200 px-3 py-2">Ação</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo/Ref.</th>
						<th class="border-r border-slate-200 px-3 py-2">Operador</th>
						<th class="border-r border-slate-200 px-3 py-2">IP</th>
						<th class="px-3 py-2">Hash</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if lista.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum registro encontrado.
							</td>
						</tr>
					{:else}
						{#each lista as r (r.id)}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => (detalheAberto = r)}
							>
								<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-700">
									{formatarDataHora(r.em)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {tipoTone(
											r.recursoTipo
										)}"
									>
										{r.recursoTipo}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
									{r.acao.replace(/_/g, ' ')}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-blue-900">
									{r.recursoProtocolo ?? r.recursoId.slice(0, 8) + '…'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{r.operadorNome}
									<div class="text-[10px] text-slate-500">
										{r.operadorMatricula} · {r.operadorRole}
									</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-600">
									{r.ip}
								</td>
								<td class="px-3 py-2 text-[9px] text-slate-500">
									{r.hash.slice(0, 12)}…
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Detalhe do registro -->
{#if detalheAberto}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="flex max-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4"
			>
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						REGISTRO DE AUDITORIA
					</div>
					<div class="font-mono text-base font-bold text-slate-900">
						{detalheAberto.acao.replace(/_/g, ' ')}
					</div>
				</div>
				<button
					type="button"
					onclick={() => (detalheAberto = null)}
					class="border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-slate-900"
				>
					Fechar
				</button>
			</div>

			<div class="overflow-y-auto p-6">
				<dl class="grid grid-cols-12 gap-x-4 gap-y-3 font-mono text-[11px]">
					<div class="col-span-6">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Recurso</dt>
						<dd class="mt-0.5 text-slate-900">
							{detalheAberto.recursoTipo} · {detalheAberto.recursoProtocolo ??
								detalheAberto.recursoId}
						</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Quando</dt>
						<dd class="mt-0.5 text-slate-900">{formatarDataHora(detalheAberto.em)}</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Operador</dt>
						<dd class="mt-0.5 font-sans text-slate-900">
							{detalheAberto.operadorNome} · {detalheAberto.operadorMatricula} ({detalheAberto.operadorRole})
						</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							IP / User-Agent
						</dt>
						<dd class="mt-0.5 truncate text-slate-700">
							{detalheAberto.ip} · {detalheAberto.userAgent.slice(0, 50)}…
						</dd>
					</div>

					<div class="col-span-6 border border-slate-200 bg-slate-50 p-3">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							Estado Antes
						</dt>
						<pre
							class="mt-0.5 max-h-48 overflow-auto text-[10px] break-all whitespace-pre-wrap text-slate-700">{detalheAberto.antes
								? JSON.stringify(detalheAberto.antes, null, 2)
								: '(sem snapshot · operação de criação)'}</pre>
					</div>
					<div class="col-span-6 border border-slate-200 bg-slate-50 p-3">
						<dt class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							Estado Depois
						</dt>
						<pre
							class="mt-0.5 max-h-48 overflow-auto text-[10px] break-all whitespace-pre-wrap text-slate-700">{detalheAberto.depois
								? JSON.stringify(detalheAberto.depois, null, 2)
								: '(sem snapshot · operação de remoção)'}</pre>
					</div>

					<div class="col-span-12 border-2 border-slate-900 bg-slate-50 p-3 font-mono">
						<dt class="text-[10px] font-bold tracking-widest text-slate-700 uppercase">
							Cadeia Criptográfica
						</dt>
						<dd class="mt-1 text-[10px] leading-relaxed text-slate-700">
							<div>
								HASH ANTERIOR: <span class="text-slate-500">{detalheAberto.hashAnterior}</span>
							</div>
							<div>
								HASH DESTE: <span class="font-bold text-blue-900">{detalheAberto.hash}</span>
							</div>
						</dd>
					</div>
				</dl>
			</div>
		</div>
	</div>
{/if}
