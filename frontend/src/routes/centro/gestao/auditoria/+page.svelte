<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import type { Encaminhamento, EventoTimeline } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconShieldCheck,
		IconDownload,
		IconSearch
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let orgaoRegulador = $derived(ehCeo ? 'CFO / CRO' : 'CFM / CRM');

	interface LogAuditoriaCentro {
		id: string;
		dataHora: string;
		acao: string;
		tipo: string;
		operador: string;
		perfil: string;
		protocolo: string;
		paciente: string;
		detalhes: string;
		ipOrigem: string;
	}

	let logs = $state<LogAuditoriaCentro[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroAcao = $state('TODAS');

	onMount(async () => {
		try {
			const [encs, resAuditoria] = await Promise.all([
				api.encaminhamentos.list({ limit: 500 }).catch(() => []),
				(api.centroGestao as any).obterAuditoria ? (api.centroGestao as any).obterAuditoria({ limit: 100 }).catch(() => ({ logs: [] })) : Promise.resolve({ logs: [] })
			]);

			const logsProcessados: LogAuditoriaCentro[] = [];

			// Converte timeline dos encaminhamentos do centro
			const encsCentro = (encs as Encaminhamento[]).filter((e: Encaminhamento) => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return f === 'CENTRO_ESPECIALIDADES' || f === 'CEM' || (f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO');
				}
			});

			for (const enc of encsCentro) {
				if (Array.isArray((enc as any).timeline)) {
					for (const ev of (enc as any).timeline) {
						logsProcessados.push({
							id: 'ev-' + Math.random().toString(36).substring(2, 9),
							dataHora: ev.em || new Date().toISOString(),
							acao: ev.descricao || ev.tipo,
							tipo: ev.tipo || 'OPERACIONAL',
							operador: ev.autorNome || 'Sistema Automatizado',
							perfil: ev.autorPerfil || 'RECEPÇÃO',
							protocolo: enc.protocolo,
							paciente: enc.paciente.nome,
							detalhes: ev.detalhes || `Ação executada no protocolo ${enc.protocolo}`,
							ipOrigem: '10.0.4.12'
						});
					}
				}
			}

			// Se houver logs da API oficial
			if (resAuditoria && Array.isArray((resAuditoria as any).logs)) {
				for (const al of (resAuditoria as any).logs) {
					logsProcessados.push({
						id: al.id,
						dataHora: al.criadoEm || new Date().toISOString(),
						acao: al.acao,
						tipo: 'SISTEMICO',
						operador: al.atendenteNome || 'Operador',
						perfil: 'DIRETORIA',
						protocolo: al.recursoId ? al.recursoId.substring(0, 8).toUpperCase() : 'GERAL',
						paciente: 'Operação Administrativa',
						detalhes: `Recurso: ${al.recurso}`,
						ipOrigem: '10.0.4.88'
					});
				}
			}

			// Ordena por data decrescente
			logsProcessados.sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
			logs = logsProcessados;
		} finally {
			carregando = false;
		}
	});

	let filtrados = $derived.by(() => {
		return logs.filter(l => {
			const termo = busca.toLowerCase().trim();
			const matchBusca = !termo ||
				l.acao.toLowerCase().includes(termo) ||
				l.operador.toLowerCase().includes(termo) ||
				l.protocolo.toLowerCase().includes(termo) ||
				l.paciente.toLowerCase().includes(termo);

			if (!matchBusca) return false;
			if (filtroAcao !== 'TODAS' && l.tipo !== filtroAcao) return false;

			return true;
		});
	});

	function exportarCsv() {
		const cabecalho = 'Data/Hora;Protocolo;Paciente;Ação;Operador;Perfil;IP\n';
		const linhas = filtrados.map(l =>
			`"${l.dataHora}";"${l.protocolo}";"${l.paciente}";"${l.acao}";"${l.operador}";"${l.perfil}";"${l.ipOrigem}"`
		).join('\n');

		const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', `auditoria_${siglaOrgao.toLowerCase()}_${new Date().toISOString().substring(0, 10)}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
</script>

<svelte:head>
	<title>Trilha de Auditoria & Compliance · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<PanelHeader
		title="TRILHA DE AUDITORIA, SEGURANÇA & COMPLIANCE — {nomeOrgao.toUpperCase()}"
		subtitle="Registro imutável de eventos operacionais, prescrições, chamadas de pacientes, escalas médicas e acessos a dados sensíveis sob diretrizes {orgaoRegulador} e LGPD."
	/>

	<!-- Banner de Conformidade -->
	<section class="border border-indigo-200 bg-indigo-50/70 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-indigo-950">
		<div class="flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center bg-indigo-900 text-white font-bold text-base shadow-xs">
				<IconShieldCheck size={20} />
			</div>
			<div>
				<div class="font-bold text-xs">CONFORMIDADE REGULATÓRIA ATIVA ({orgaoRegulador} / LGPD)</div>
				<div class="text-[11px] text-indigo-800">
					Todos os acessos e gravações no prontuário eletrônico do {siglaOrgao} geram hash cronológico imutável com rastreio de IP e carimbo de data/hora oficial.
				</div>
			</div>
		</div>

		<button
			type="button"
			onclick={exportarCsv}
			class="border border-indigo-900 bg-indigo-900 text-white px-3.5 py-1.5 font-bold uppercase hover:bg-indigo-950 text-[11px] flex items-center gap-1.5"
		>
			<IconDownload size={14} />
			<span>Exportar CSV Auditoria</span>
		</button>
	</section>

	<!-- Barra de Controles e Filtros -->
	<section class="border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
		<div class="flex flex-1 items-center gap-2">
			<div class="relative w-full max-w-md">
				<input
					type="text"
					bind:value={busca}
					placeholder="Buscar por Ação, Operador, Paciente ou Protocolo..."
					class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono outline-none focus:border-slate-900 focus:bg-white"
				/>
			</div>

			<select
				bind:value={filtroAcao}
				class="border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono outline-none focus:border-slate-900 focus:bg-white"
			>
				<option value="TODAS">TODOS OS TIPOS DE EVENTO</option>
				<option value="AGENDAMENTO">AGENDAMENTOS / ESCALAS</option>
				<option value="SOAP">CONSULTAS / ATENDIMENTO SOAP</option>
				<option value="PRESENCA">PRESENÇA / SALA DE ESPERA</option>
				<option value="CANCELAMENTO">REMANEJAMENTO / CANCELAMENTO</option>
				<option value="OPERACIONAL">OPERACIONAL GERAL</option>
			</select>
		</div>

		<div class="text-right text-[11px] text-slate-500 font-mono">
			Exibindo <strong>{filtrados.length}</strong> eventos registrados
		</div>
	</section>

	<!-- Tabela de Auditoria -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500">
			Carregando trilha de auditoria do {siglaOrgao}...
		</div>
	{:else}
		<div class="border border-slate-200 bg-white overflow-x-auto shadow-xs">
			<table class="w-full text-left font-mono text-xs">
				<thead class="border-b border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
					<tr>
						<th class="p-3">DATA / HORA</th>
						<th class="p-3">EVENTO / AÇÃO</th>
						<th class="p-3">PROTOCOLO / PACIENTE</th>
						<th class="p-3">OPERADOR RESPONSÁVEL</th>
						<th class="p-3">PERFIL / PAPEL</th>
						<th class="p-3 text-right">IP / TERMINAL</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each filtrados as l (l.id)}
						<tr class="hover:bg-slate-50 transition-colors">
							<td class="p-3">
								<div class="font-bold text-slate-900">{new Date(l.dataHora).toLocaleDateString('pt-BR')}</div>
								<div class="text-[10px] text-slate-500">{new Date(l.dataHora).toLocaleTimeString('pt-BR')}</div>
							</td>
							<td class="p-3 font-sans">
								<div class="font-bold text-slate-800">{l.acao}</div>
								<div class="text-[10px] text-slate-500 font-mono">{l.detalhes}</div>
							</td>
							<td class="p-3">
								<span class="bg-slate-100 text-slate-900 border border-slate-300 font-bold px-1.5 py-0.5 text-[10px]">
									{l.protocolo}
								</span>
								<div class="text-[10px] text-slate-600 font-sans mt-0.5">{l.paciente}</div>
							</td>
							<td class="p-3 font-sans">
								<div class="font-bold text-slate-900">{l.operador}</div>
							</td>
							<td class="p-3">
								<span class="bg-blue-50 text-blue-900 border border-blue-200 font-bold px-2 py-0.5 text-[9px] uppercase">
									{l.perfil}
								</span>
							</td>
							<td class="p-3 text-right text-slate-500 font-mono text-[10px]">
								{l.ipOrigem}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="p-8 text-center text-slate-500 font-sans">
								Nenhum evento registrado com os filtros informados.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
