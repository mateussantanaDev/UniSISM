<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import ScanBadge from '$lib/presentation/components/ScanBadge.svelte';
	import { useEncaminhamento } from '$lib/presentation/contexts/encaminhamentoContext';
	import type { TipoAnexo } from '$lib/api/types';

	import { separarDataHora } from '$lib/presentation/utils/stringUtils';

	const ctx = useEncaminhamento();
	let enc = $derived(ctx.encaminhamento!);

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

	function formatarDataHoraPartes(iso?: string | null) {
		if (!iso) return { data: '—', hora: 'Sem anexos' };
		const str = new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		return separarDataHora(str);
	}

	function formatarData(iso: string) {
		const { data, hora } = formatarDataHoraPartes(iso);
		return `${data} ${hora}`;
	}

	function totalMb(): string {
		const soma = enc.anexos.reduce((acc, a) => acc + a.tamanhoKb, 0);
		return (soma / 1024).toFixed(2);
	}

	let temSolicitacao = $derived(enc.anexos.some((a) => a.tipo === 'SOLICITACAO'));

	let anexosInfectados = $derived(enc.anexos.filter((a) => a.scanStatus === 'INFECTADO').length);
	let anexosPendentes = $derived(enc.anexos.filter((a) => a.scanStatus === 'PENDENTE').length);
	let ultimoAnexoData = $derived(
		enc.anexos.length > 0 ? formatarDataHoraPartes(enc.anexos[enc.anexos.length - 1].uploadEm) : { data: '—', hora: 'Sem anexos' }
	);
</script>

<section class="flex flex-col gap-4">
	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Total de Documentos"
			value={enc.anexos.length}
			sublabel="Arquivos anexados"
		/>
		<MetricCard label="Volume Total" value={totalMb()} sublabel="megabytes" />
		<MetricCard
			label="Solicitação Original"
			value={temSolicitacao ? '✓' : '◐'}
			sublabel={temSolicitacao ? 'Anexada' : 'Ausente — rever com a UBS'}
			accent={temSolicitacao ? 'success' : 'warning'}
		/>
		<MetricCard
			label="Última Inclusão"
			value={ultimoAnexoData.data}
			sublabel={ultimoAnexoData.hora}
		/>
	</div>

	{#if anexosInfectados > 0}
		<div
			class="flex items-center gap-3 border-2 border-red-700 bg-red-50 px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-red-900 uppercase"
		>
			<span class="text-base">⛔</span>
			<div>
				{anexosInfectados} ANEXO{anexosInfectados > 1 ? 'S' : ''} INFECTADO{anexosInfectados > 1 ? 'S' : ''} ·
				DOWNLOAD BLOQUEADO. A UBS DE ORIGEM PRECISA REENVIAR O ARQUIVO.
			</div>
		</div>
	{/if}
	{#if anexosPendentes > 0}
		<div
			class="flex items-center gap-3 border border-slate-300 bg-slate-50 px-4 py-2 font-mono text-[11px] tracking-wider text-slate-700 uppercase"
		>
			<span class="text-base">⟳</span>
			<div>
				{anexosPendentes} ANEXO{anexosPendentes > 1 ? 'S' : ''} em scan — download liberado ao concluir
			</div>
		</div>
	{/if}

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Documentos Vinculados"
			subtitle="Anexos enviados pela UBS de origem"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{enc.anexos.length} ARQUIVOS
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">#</th>
						<th class="border-r border-slate-200 px-3 py-2">Arquivo</th>
						<th class="border-r border-slate-200 px-3 py-2">Tipo</th>
						<th class="border-r border-slate-200 px-3 py-2">Tamanho</th>
						<th class="border-r border-slate-200 px-3 py-2">Scan</th>
						<th class="border-r border-slate-200 px-3 py-2">Enviado em</th>
						<th class="px-3 py-2">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if enc.anexos.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum documento anexado a este encaminhamento.
							</td>
						</tr>
					{:else}
						{#each enc.anexos as a, i (a.id)}
							{@const scanLiberado = a.scanStatus === 'LIMPO'}
							{@const scanPendente = a.scanStatus === 'PENDENTE'}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-500">
									{String(i + 1).padStart(2, '0')}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-semibold text-slate-900">
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
									{(a.tamanhoKb / 1024).toFixed(2)} MB
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<ScanBadge status={a.scanStatus} />
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(a.uploadEm)}
								</td>
								<td class="flex gap-1.5 px-3 py-2">
									<button
										type="button"
										disabled={!scanLiberado}
										title={scanLiberado
											? 'Abrir visualização'
											: scanPendente
												? 'Aguardando antivírus'
												: 'Arquivo bloqueado pelo scan de segurança'}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase
											{scanLiberado
												? 'text-slate-700 hover:border-blue-900 hover:text-blue-900'
												: 'cursor-not-allowed text-slate-400'}"
									>
										Visualizar
									</button>
									<button
										type="button"
										disabled={!scanLiberado}
										title={scanLiberado
											? 'Baixar arquivo original'
											: scanPendente
												? 'Aguardando antivírus'
												: 'Arquivo bloqueado pelo scan de segurança'}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase
											{scanLiberado
												? 'text-slate-700 hover:border-blue-900 hover:text-blue-900'
												: 'cursor-not-allowed text-slate-400'}"
									>
										Baixar
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</section>
