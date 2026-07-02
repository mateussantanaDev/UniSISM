<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import ScanBadge from '$lib/presentation/components/ScanBadge.svelte';
	import AnexoActions from '$lib/presentation/components/AnexoActions.svelte';
	import { api } from '$lib/api';
	import { mensagemErroSms } from '$lib/api/erros-sms';
	import type { AnexoDocumento, Encaminhamento, TipoAnexo } from '$lib/api/types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	/**
	 * Detalhe simplificado — apenas 3 abas:
	 *   1. Paciente
	 *   2. Solicitação Clínica
	 *   3. Anexos (com Visualizar / Baixar / Compartilhar)
	 *
	 * Sem timeline, sem botões de aprovar/rejeitar/pendência (só
	 * REGULADOR_SMS+admin tem isso na rota /sms/encaminhamento/:id).
	 */

	let enc = $state<Encaminhamento | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	/**
	 * Aba inicial baseada em `?aba=` na URL.
	 *
	 * Importante para o fluxo de Respostas SUS: o regulador chega aqui pelo
	 * explorador `/sms/respostas`, que adiciona `?aba=anexos` para abrir
	 * direto no PDF oficial em vez de na ficha do paciente.
	 */
	const abaInicial = $derived.by<'paciente' | 'clinico' | 'anexos'>(() => {
		const q = page.url.searchParams.get('aba');
		if (q === 'anexos' || q === 'clinico') return q;
		return 'paciente';
	});
	let aba = $state<'paciente' | 'clinico' | 'anexos'>('paciente');
	$effect(() => {
		aba = abaInicial;
	});

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4500);
	}

	async function carregar() {
		const id = page.params.id;
		if (!id) {
			erro = 'ID do encaminhamento ausente.';
			carregando = false;
			return;
		}
		try {
			enc = await api.encaminhamentos.byId(id);
		} catch (e) {
			erro = mensagemErroSms(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	function formatarData(iso: string): string {
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

	function tamanhoFmt(kb: number): string {
		if (kb < 1024) return `${kb} KB`;
		return `${(kb / 1024).toFixed(2)} MB`;
	}

	let anexosOrdenados = $derived.by<AnexoDocumento[]>(() => {
		if (!enc) return [];
		// Resposta do SUS primeiro, depois Solicitação Médica, depois resto.
		const ordem: Record<TipoAnexo, number> = {
			RESPOSTA_SUS: 0,
			SOLICITACAO: 1,
			LAUDO: 2,
			EXAME: 3,
			CARTAO_SUS: 4,
			RG: 5,
			CPF: 6,
			OUTRO: 7
		};
		return [...enc.anexos].sort(
			(a, b) => (ordem[a.tipo] ?? 99) - (ordem[b.tipo] ?? 99)
		);
	});

	function voltar() {
		// Volta uma posição se houver histórico, senão para o explorador.
		if (history.length > 1) history.back();
		else goto('/sms/solicitacoes');
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
			{mensagem.tipo === 'ok' ? '✓' : '⚠'} {mensagem.texto}
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white px-6 py-12 text-center font-sans text-sm text-slate-500">
			<div class="mx-auto mb-3 h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
			Carregando encaminhamento...
		</div>
	{:else if erro}
		<div class="border border-red-700 bg-red-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase">
			⚠ {erro}
		</div>
		<button
			type="button"
			onclick={voltar}
			class="self-start border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
		>
			← Voltar
		</button>
	{:else if enc}
		<!-- Cabeçalho -->
		<div class="border border-slate-200 bg-white">
			<div class="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3 md:flex-row md:items-center md:justify-between">
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						{enc.unidadeOrigem}
					</div>
					<div class="font-mono text-base font-bold text-blue-900">
						{enc.protocolo}
					</div>
					<div class="font-sans text-[12px] text-slate-700">
						Recebido em {formatarData(enc.criadoEm)}
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<StatusBadge status={enc.status} />
					<button
						type="button"
						onclick={voltar}
						class="border border-slate-300 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
					>
						← Voltar
					</button>
				</div>
			</div>

			<!-- Abas -->
			<div class="flex border-b border-slate-200 bg-slate-50">
				{#each [{ k: 'paciente', label: 'Paciente' }, { k: 'clinico', label: 'Solicitação Clínica' }, { k: 'anexos', label: `Anexos · ${enc.anexos.length}` }] as t (t.k)}
					<button
						type="button"
						onclick={() => (aba = t.k as typeof aba)}
						class="border-b-2 px-4 py-2.5 font-mono text-[11px] font-bold tracking-widest uppercase transition-colors
							{aba === t.k
							? 'border-blue-900 bg-white text-blue-900'
							: 'border-transparent text-slate-600 hover:text-blue-900'}"
					>
						{t.label}
					</button>
				{/each}
			</div>

			<!-- Conteúdo das abas -->
			<div class="p-4">
				{#if aba === 'paciente'}
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div class="border border-slate-200 bg-slate-50 px-4 py-3">
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								Nome
							</div>
							<div class="mt-1 font-sans text-base font-bold text-slate-900">
								{enc.paciente.nome}
							</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 px-4 py-3">
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								CPF
							</div>
							<div class="mt-1 font-mono text-sm font-bold text-slate-900">
								{enc.paciente.cpf}
							</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 px-4 py-3">
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								Data de Nascimento
							</div>
							<div class="mt-1 font-sans text-sm text-slate-900">
								{new Date(enc.paciente.dataNascimento).toLocaleDateString('pt-BR')}
								<span class="font-mono text-[11px] text-slate-500">
									· {calcularIdade(enc.paciente.dataNascimento)} anos
								</span>
							</div>
						</div>
						{#if enc.paciente.telefone}
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Telefone
								</div>
								<div class="mt-1 font-mono text-sm text-slate-900">
									{enc.paciente.telefone}
								</div>
							</div>
						{/if}
						{#if enc.paciente.cartaoSus}
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Cartão SUS
								</div>
								<div class="mt-1 font-mono text-sm text-slate-900">
									{enc.paciente.cartaoSus}
								</div>
							</div>
						{/if}
						{#if enc.paciente.endereco}
							<div class="border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Endereço
								</div>
								<div class="mt-1 font-sans text-sm text-slate-900">
									{enc.paciente.endereco}
									{#if enc.paciente.bairro || enc.paciente.municipio || enc.paciente.uf}
										<div class="text-slate-700">
											{[enc.paciente.bairro, enc.paciente.municipio, enc.paciente.uf]
												.filter(Boolean)
												.join(' · ')}
											{#if enc.paciente.cep}· CEP {enc.paciente.cep}{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{:else if aba === 'clinico'}
					<div class="flex flex-col gap-3">
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Especialidade
								</div>
								<div class="mt-1 font-sans text-base font-bold text-slate-900">
									{enc.solicitacao.especialidadeSolicitada}
								</div>
							</div>
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Prioridade
								</div>
								<div class="mt-1.5">
									<StatusBadge prioridade={enc.solicitacao.prioridade} />
								</div>
							</div>
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									CID-10
								</div>
								<div class="mt-1 font-mono text-sm font-bold text-slate-900">
									{enc.solicitacao.cid10}
								</div>
								<div class="mt-0.5 font-sans text-[12px] text-slate-700">
									{enc.solicitacao.cidDescricao}
								</div>
							</div>
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Médico Solicitante
								</div>
								<div class="mt-1 font-sans text-sm text-slate-900">
									{enc.solicitacao.medicoSolicitante}
								</div>
								<div class="mt-0.5 font-mono text-[11px] text-slate-600">
									CRM {enc.solicitacao.crm}
								</div>
							</div>
							<div class="border border-slate-200 bg-slate-50 px-4 py-3">
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Data da Solicitação
								</div>
								<div class="mt-1 font-sans text-sm text-slate-900">
									{new Date(enc.solicitacao.dataSolicitacao).toLocaleDateString('pt-BR')}
								</div>
							</div>
						</div>

						<div class="border border-slate-200 bg-white px-4 py-3">
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								Justificativa Clínica
							</div>
							<div
								class="mt-2 border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[13px] leading-relaxed text-blue-900 whitespace-pre-wrap"
							>
								{enc.solicitacao.justificativaClinica}
							</div>
						</div>
					</div>
				{:else if aba === 'anexos'}
					<div class="flex flex-col gap-3">
						{#if anexosOrdenados.length === 0}
							<div class="border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum anexo neste encaminhamento.
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="w-full border-collapse text-xs">
									<thead>
										<tr
											class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
										>
											<th class="border-r border-slate-200 px-3 py-2">Arquivo</th>
											<th class="border-r border-slate-200 px-3 py-2">Tipo</th>
											<th class="border-r border-slate-200 px-3 py-2">Tamanho</th>
											<th class="border-r border-slate-200 px-3 py-2">Scan</th>
											<th class="border-r border-slate-200 px-3 py-2">Enviado em</th>
											<th class="px-3 py-2">Ações</th>
										</tr>
									</thead>
									<tbody class="font-mono">
										{#each anexosOrdenados as a (a.id)}
											<tr class="border-b border-slate-100 hover:bg-slate-50">
												<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
													{a.nome}
												</td>
												<td class="border-r border-slate-100 px-3 py-2">
													<span
														class="border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase"
													>
														{tipoLabel[a.tipo]}
													</span>
												</td>
												<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
													{tamanhoFmt(a.tamanhoKb)}
												</td>
												<td class="border-r border-slate-100 px-3 py-2">
													<ScanBadge status={a.scanStatus} />
												</td>
												<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
													{formatarData(a.uploadEm)}
												</td>
												<td class="px-3 py-2">
													<AnexoActions
														anexo={a}
														protocoloEncaminhamento={enc.protocolo}
														size="sm"
														onMensagem={notificar}
													/>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							<div
								class="border-l-4 border-blue-900 bg-blue-50 px-4 py-2 font-sans text-[12px] text-blue-900"
							>
								<strong class="font-mono tracking-widest uppercase">Como funciona:</strong>
								<br />
								<strong>Visualizar</strong> abre o documento no motor PDF deste navegador, dentro de uma janela.
								<strong>Baixar</strong> abre uma nova aba com o visualizador padrão do navegador (use os botões dele para baixar/imprimir).
								<strong>Compartilhar</strong> envia o arquivo via WhatsApp/Email/etc. quando o dispositivo suporta, ou copia uma referência segura para a área de transferência.
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
