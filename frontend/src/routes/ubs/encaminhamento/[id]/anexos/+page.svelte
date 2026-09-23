<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import ScanBadge from '$lib/presentation/components/ScanBadge.svelte';
	import { useEncaminhamento } from '$lib/presentation/contexts/encaminhamentoContext';
	import type { AnexoDocumento } from '$lib/domain/models/Encaminhamento';

	const ctx = useEncaminhamento();
	let enc = $derived(ctx.encaminhamento!);

	const tipoLabel: Record<AnexoDocumento['tipo'], string> = {
		SOLICITACAO: 'Solicitação Médica',
		RG: 'Documento de Identidade',
		CPF: 'CPF',
		CARTAO_SUS: 'Cartão SUS',
		EXAME: 'Exame Laboratorial',
		LAUDO: 'Laudo Médico',
		RESPOSTA_SUS: 'Resposta Oficial do SUS',
		OUTRO: 'Outro Documento'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function totalMb(): string {
		const soma = enc.anexos.reduce((acc, a) => acc + a.tamanhoKb, 0);
		return (soma / 1024).toFixed(2);
	}
</script>

<section class="flex flex-col gap-4">
	<!-- Métricas dos anexos -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-blue-900"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Total de Anexos
			</div>
			<div class="mt-1 font-mono text-2xl font-bold text-slate-900">{enc.anexos.length}</div>
		</div>
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-slate-400"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Volume Total</div>
			<div class="mt-1 font-mono text-2xl font-bold text-slate-900">{totalMb()}</div>
			<div class="font-mono text-[10px] text-slate-500">megabytes</div>
		</div>
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-emerald-700"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Solicitação Original
			</div>
			<div class="mt-1 font-mono text-sm font-bold text-emerald-800">
				{enc.anexos.some((a) => a.tipo === 'SOLICITACAO') ? '✓ PRESENTE' : '◐ AUSENTE'}
			</div>
		</div>
		<div class="relative border border-slate-200 bg-white px-4 py-3">
			<span class="absolute top-0 left-0 h-full w-1 bg-amber-600"></span>
			<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
				Última Inclusão
			</div>
			<div class="mt-1 font-mono text-xs font-bold text-slate-900">
				{enc.anexos.length > 0 ? formatarData(enc.anexos[enc.anexos.length - 1].uploadEm) : '—'}
			</div>
		</div>
	</div>

	<!-- Tabela -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Documentos Vinculados"
			subtitle="Arquivos anexados ao encaminhamento"
			index="01"
		>
			<PrimaryButton label="Adicionar Anexo" variant="primary" />
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
											? 'Abrir visualização do documento'
											: scanPendente
												? 'Aguardando verificação de antivírus'
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
												? 'Aguardando verificação de antivírus'
												: 'Arquivo bloqueado pelo scan de segurança'}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase
											{scanLiberado
											? 'text-slate-700 hover:border-blue-900 hover:text-blue-900'
											: 'cursor-not-allowed text-slate-400'}"
									>
										Baixar
									</button>
									<button
										type="button"
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
									>
										Remover
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
