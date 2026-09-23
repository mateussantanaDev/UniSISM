<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let respostas = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);
	let busca = $state('');

	const filtrada = $derived.by(() => {
		const q = busca.trim().toLowerCase();
		if (!q) return respostas;
		return respostas.filter((e) => {
			return (
				e.protocolo.toLowerCase().includes(q) ||
				e.paciente.nome.toLowerCase().includes(q) ||
				e.paciente.cpf.includes(busca) ||
				e.solicitacao.especialidadeSolicitada.toLowerCase().includes(q) ||
				e.solicitacao.cid10.toLowerCase().includes(q) ||
				(e.respostaSUS?.observacao ?? '').toLowerCase().includes(q)
			);
		});
	});

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			// Backend não tem filtro por respostaSUS — pegamos os APROVADOs
			// e aplicamos client-side. É o universo onde a resposta pode existir.
			const lista = await api.encaminhamentos.list({ status: 'APROVADO' });
			respostas = lista
				.filter((e) => !!e.respostaSUS)
				.sort((a, b) => {
					const da = a.respostaSUS?.registradoEm ?? a.atualizadoEm;
					const db = b.respostaSUS?.registradoEm ?? b.atualizadoEm;
					return new Date(db).getTime() - new Date(da).getTime();
				});
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao carregar respostas do SUS.';
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function trecho(s: string | undefined, max = 90): string {
		if (!s) return '—';
		const t = s.trim();
		return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
	}

	let baixandoId = $state<string | null>(null);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function baixar(e: Encaminhamento) {
		if (!e.respostaSUS) return;
		baixandoId = e.id;
		try {
			const { blob, filename } = await api.encaminhamentos.downloadAnexo(e.respostaSUS.anexoId);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename || `resposta-sus-${e.protocolo}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 5_000);
			notificar('ok', 'Download iniciado.');
		} catch (err) {
			if (err instanceof ApiError && err.code === 'ANEXO_NAO_LIBERADO') {
				notificar('erro', 'Anexo ainda em verificação de antivírus. Tente em instantes.');
			} else {
				notificar('erro', err instanceof ApiError ? err.message : 'Falha ao baixar.');
			}
		} finally {
			baixandoId = null;
		}
	}

	async function imprimir(e: Encaminhamento) {
		if (!e.respostaSUS) return;
		baixandoId = e.id;
		try {
			const { blob } = await api.encaminhamentos.downloadAnexo(e.respostaSUS.anexoId);
			const url = URL.createObjectURL(blob);
			const w = window.open(url, '_blank');
			if (w) {
				// Aguarda carregar e dispara o diálogo de impressão.
				w.addEventListener('load', () => {
					try {
						w.focus();
						w.print();
					} catch {
						// Alguns browsers precisam de delay extra.
					}
				});
				setTimeout(() => URL.revokeObjectURL(url), 60_000);
			} else {
				notificar('erro', 'Pop-up bloqueado. Permita pop-ups para imprimir.');
				URL.revokeObjectURL(url);
			}
		} catch (err) {
			notificar('erro', err instanceof ApiError ? err.message : 'Falha ao imprimir.');
		} finally {
			baixandoId = null;
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

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<!-- Métricas -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-purple-700"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Total Respondidos
			</div>
			<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
				{carregando ? '—' : respostas.length}
			</div>
			<div class="font-mono text-[10px] text-slate-500">retorno oficial do SUS recebido</div>
		</div>
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-emerald-700"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Última Resposta
			</div>
			<div class="mt-1 font-mono text-sm font-bold text-slate-900">
				{#if carregando}
					—
				{:else if respostas.length === 0}
					sem registros
				{:else}
					{formatarData(respostas[0].respostaSUS?.registradoEm ?? respostas[0].atualizadoEm)}
				{/if}
			</div>
		</div>
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-blue-900"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Filtrados</div>
			<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
				{carregando ? '—' : filtrada.length}
			</div>
			<div class="font-mono text-[10px] text-slate-500">
				{busca.trim() ? 'após busca' : 'sem filtro'}
			</div>
		</div>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Respostas Oficiais do SUS"
			subtitle="Retornos da regulação federal · paciente já agendado/notificado"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {respostas.length}
			</span>
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<label
				for="busca"
				class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				Buscar
			</label>
			<input
				id="busca"
				type="text"
				bind:value={busca}
				placeholder="Protocolo, paciente, CPF, especialidade, CID-10, observação..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Recebida em</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">Resumo da Resposta</th>
						<th class="border-r border-slate-200 px-3 py-2">Registrado por</th>
						<th class="px-3 py-2">Ações</th>
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
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								{respostas.length === 0
									? 'Nenhuma resposta do SUS recebida ainda.'
									: 'Nenhum registro corresponde à busca.'}
							</td>
						</tr>
					{:else}
						{#each filtrada as e (e.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(e.respostaSUS?.registradoEm ?? e.atualizadoEm)}
								</td>
								<td
									class="cursor-pointer border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
									onclick={() => goto(`/ubs/respostas-sms/${e.id}`)}
								>
									{e.protocolo}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900"
								>
									{e.paciente.nome}
									<div class="text-[10px] text-slate-500">{e.paciente.cpf}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{e.solicitacao.especialidadeSolicitada}
									<div class="text-[10px] text-slate-500">CID {e.solicitacao.cid10}</div>
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans text-[11px] text-slate-700"
								>
									{trecho(e.respostaSUS?.observacao)}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans text-[11px] text-slate-700"
								>
									{e.respostaSUS?.registradoPor.nome ?? '—'}
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap gap-1">
										<PrimaryButton
											label="Abrir"
											variant="secondary"
											onclick={() => goto(`/ubs/respostas-sms/${e.id}`)}
										/>
										<button
											type="button"
											onclick={() => baixar(e)}
											disabled={baixandoId === e.id}
											class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
										>
											{baixandoId === e.id ? 'Baixando...' : 'Baixar'}
										</button>
										<button
											type="button"
											onclick={() => imprimir(e)}
											disabled={baixandoId === e.id}
											class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
										>
											Imprimir
										</button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<div
		class="border-l-4 border-purple-700 bg-purple-50 px-4 py-2 font-sans text-[12px] text-purple-900"
	>
		<strong class="font-mono tracking-wider uppercase">Resposta Oficial:</strong> a SMS registra
		aqui o PDF que volta da regulação SUS após o encaminhamento ser
		<strong>APROVADO</strong>. O paciente é avisado automaticamente.
	</div>
</div>
