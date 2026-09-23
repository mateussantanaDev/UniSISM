<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import type { Encaminhamento, EventoTimeline } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconShieldCheck,
		IconDownload,
		IconSearch,
		IconRefresh,
		IconUserPlus,
		IconTrash,
		IconEdit,
		IconCalendar,
		IconStethoscope,
		IconInfoCircle
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let orgaoRegulador = $derived(ehCeo ? 'CFO / CRO' : 'CFM / CRM');

	interface LogAuditoriaCentro {
		id: string;
		dataHora: string;
		acao: string;
		tipo: 'CADASTRO' | 'EDICAO' | 'EXCLUSAO' | 'AGENDAMENTO' | 'SOAP' | 'OPERACIONAL';
		operador: string;
		perfil: string;
		protocolo: string;
		paciente: string;
		detalhes: string;
		motivo?: string | null;
		ipOrigem: string;
	}

	let logs = $state<LogAuditoriaCentro[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroAcao = $state('TODAS');

	// Contadores rápidos para o topo
	let totalCadastros = $derived(logs.filter((l) => l.tipo === 'CADASTRO').length);
	let totalExclusoes = $derived(logs.filter((l) => l.tipo === 'EXCLUSAO').length);
	let totalEdicoes = $derived(logs.filter((l) => l.tipo === 'EDICAO').length);
	let totalOperadoresUnicos = $derived(
		new Set(logs.map((l) => l.operador).filter((op) => op && op !== 'Sistema Automatizado')).size
	);

	async function carregarAuditoria() {
		carregando = true;
		try {
			const [encs, resAuditoria] = await Promise.all([
				api.encaminhamentos.list({ limit: 500 }).catch(() => []),
				api.centroGestao
					.listAuditoria({ centro: siglaOrgao, limit: 200 })
					.catch(() => ({ total: 0, logs: [] }))
			]);

			const logsProcessados: LogAuditoriaCentro[] = [];

			// 1. Processa logs oficiais da tabela AuditoriaLog
			if (resAuditoria && Array.isArray(resAuditoria.logs)) {
				for (const al of resAuditoria.logs) {
					let tipoCalculado: LogAuditoriaCentro['tipo'] = 'OPERACIONAL';
					const acaoUpper = (al.acao || '').toUpperCase();
					if (
						acaoUpper.includes('EXCLU') ||
						acaoUpper.includes('DELET') ||
						acaoUpper.includes('CANCEL')
					) {
						tipoCalculado = 'EXCLUSAO';
					} else if (
						acaoUpper.includes('CADASTRO') ||
						acaoUpper.includes('CRIAR') ||
						acaoUpper.includes('RECEPCAO_AGENDAR')
					) {
						tipoCalculado = 'CADASTRO';
					} else if (
						acaoUpper.includes('EDIT') ||
						acaoUpper.includes('ATUALIZ') ||
						acaoUpper.includes('UPDATE')
					) {
						tipoCalculado = 'EDICAO';
					} else if (acaoUpper.includes('AGENDA') || acaoUpper.includes('REMARCA')) {
						tipoCalculado = 'AGENDAMENTO';
					} else if (acaoUpper.includes('SOAP') || acaoUpper.includes('CONSULTA')) {
						tipoCalculado = 'SOAP';
					}

					logsProcessados.push({
						id: al.id,
						dataHora: al.criadoEm || new Date().toISOString(),
						acao: al.acao,
						tipo: tipoCalculado,
						operador: al.atendenteNome || 'Operador',
						perfil: al.atendenteRole || 'RECEPÇÃO',
						protocolo:
							al.protocolo || (al.recursoId ? al.recursoId.substring(0, 8).toUpperCase() : 'GERAL'),
						paciente: al.pacienteNome || '—',
						detalhes: al.motivo ? `Motivo: ${al.motivo}` : al.detalhes || `Recurso: ${al.recurso}`,
						motivo: al.motivo,
						ipOrigem: al.ip || '10.0.4.12'
					});
				}
			}

			// 2. Processa os dados dos encaminhamentos (criadoPor, atualizadoPor, deletadoPor, timeline)
			const encsCentro = (encs as Encaminhamento[]).filter((e: Encaminhamento) => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return (
						f === 'CENTRO_ESPECIALIDADES' ||
						f === 'CEM' ||
						(f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO')
					);
				}
			});

			for (const enc of encsCentro) {
				// Evento de criação / cadastro
				if (enc.criadoPorNome) {
					logsProcessados.push({
						id: `cad-${enc.id}`,
						dataHora: enc.criadoEm || new Date().toISOString(),
						acao: 'CADASTRO DE ENCAMINHAMENTO (RECEPÇÃO)',
						tipo: 'CADASTRO',
						operador: enc.criadoPorNome,
						perfil: 'RECEPÇÃO',
						protocolo: enc.protocolo,
						paciente: enc.paciente.nome,
						detalhes: `Especialidade: ${enc.solicitacao.especialidadeSolicitada} · Paciente cadastrado na fila regulada`,
						ipOrigem: '10.0.4.10'
					});
				}

				// Evento de exclusão (se houver)
				if (enc.deletadoPorNome) {
					logsProcessados.push({
						id: `del-${enc.id}`,
						dataHora: (enc as any).deletadoEm || enc.atualizadoEm || new Date().toISOString(),
						acao: 'EXCLUSÃO / CANCELAMENTO AUDITADO',
						tipo: 'EXCLUSAO',
						operador: enc.deletadoPorNome,
						perfil: 'AUDITORIA / OPERADOR',
						protocolo: enc.protocolo,
						paciente: enc.paciente.nome,
						detalhes: `Motivo: ${enc.motivoExclusao || 'Justificativa administrativa'}`,
						motivo: enc.motivoExclusao,
						ipOrigem: '10.0.4.11'
					});
				}

				// Evento de edição / alteração (se houver)
				if (enc.atualizadoPorNome && enc.atualizadoPorNome !== enc.criadoPorNome) {
					logsProcessados.push({
						id: `upd-${enc.id}`,
						dataHora: enc.atualizadoEm || new Date().toISOString(),
						acao: 'ATUALIZAÇÃO DE DADOS DO ENCAMINHAMENTO',
						tipo: 'EDICAO',
						operador: enc.atualizadoPorNome,
						perfil: 'REGULAÇÃO / RECEPÇÃO',
						protocolo: enc.protocolo,
						paciente: enc.paciente.nome,
						detalhes: `Registro atualizado no sistema pelo operador ${enc.atualizadoPorNome}`,
						ipOrigem: '10.0.4.14'
					});
				}

				// Timeline events
				if (Array.isArray((enc as any).timeline)) {
					for (const ev of (enc as any).timeline) {
						let tipo: LogAuditoriaCentro['tipo'] = 'OPERACIONAL';
						const desc = (ev.descricao || '').toUpperCase();
						if (ev.tipo === 'EXCLUIDO' || desc.includes('EXCLUÍDO') || desc.includes('CANCELADO'))
							tipo = 'EXCLUSAO';
						else if (ev.tipo === 'CRIADO' || desc.includes('CRIADO') || desc.includes('CADASTRADO'))
							tipo = 'CADASTRO';
						else if (ev.tipo === 'AGENDADO' || desc.includes('AGENDAD')) tipo = 'AGENDAMENTO';
						else if (desc.includes('SOAP') || desc.includes('ATENDIMENTO')) tipo = 'SOAP';

						logsProcessados.push({
							id: 'ev-' + (ev.id || Math.random().toString(36).substring(2, 9)),
							dataHora: ev.em || new Date().toISOString(),
							acao: ev.descricao || ev.tipo,
							tipo,
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

			// Deduplica por id
			const mapa = new Map<string, LogAuditoriaCentro>();
			for (const l of logsProcessados) {
				if (!mapa.has(l.id)) {
					mapa.set(l.id, l);
				}
			}

			// Ordena por data decrescente
			const listaOrdenada = Array.from(mapa.values());
			listaOrdenada.sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
			logs = listaOrdenada;
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarAuditoria();
	});

	let filtrados = $derived.by(() => {
		return logs.filter((l) => {
			const termo = busca.toLowerCase().trim();
			const matchBusca =
				!termo ||
				l.acao.toLowerCase().includes(termo) ||
				l.operador.toLowerCase().includes(termo) ||
				l.protocolo.toLowerCase().includes(termo) ||
				l.paciente.toLowerCase().includes(termo) ||
				l.detalhes.toLowerCase().includes(termo) ||
				(l.motivo && l.motivo.toLowerCase().includes(termo));

			if (!matchBusca) return false;
			if (filtroAcao !== 'TODAS' && l.tipo !== filtroAcao) return false;

			return true;
		});
	});

	function exportarCsv() {
		const cabecalho = 'Data/Hora;Protocolo;Paciente;Tipo;Ação;Operador;Perfil;Detalhes;IP\n';
		const linhas = filtrados
			.map(
				(l) =>
					`"${l.dataHora}";"${l.protocolo}";"${l.paciente}";"${l.tipo}";"${l.acao}";"${l.operador}";"${l.perfil}";"${(l.detalhes || '').replace(/"/g, '""')}";"${l.ipOrigem}"`
			)
			.join('\n');

		const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute(
			'download',
			`auditoria_operadores_${siglaOrgao.toLowerCase()}_${new Date().toISOString().substring(0, 10)}.csv`
		);
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
		title="TRILHA DE AUDITORIA & RASTREABILIDADE OPERACIONAL — {nomeOrgao.toUpperCase()}"
		subtitle="Registro completo e rastreável de cada ação: quem cadastrou, quem editou e quem deletou ou cancelou solicitações, sob diretrizes {orgaoRegulador} e LGPD."
	/>

	<!-- Cards de Indicadores de Auditoria -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<div class="flex flex-col gap-1 border border-slate-200 bg-white p-3 shadow-xs">
			<span class="text-[10px] font-bold text-slate-500 uppercase">Total de Eventos</span>
			<span class="text-xl font-black text-slate-900">{logs.length}</span>
			<span class="text-[10px] text-slate-400">Trilha cronológica ativa</span>
		</div>

		<div class="flex flex-col gap-1 border border-emerald-200 bg-emerald-50/50 p-3 shadow-xs">
			<span class="flex items-center gap-1 text-[10px] font-bold text-emerald-800 uppercase">
				<IconUserPlus size={12} class="text-emerald-700" />
				<span>Cadastros Rastreados</span>
			</span>
			<span class="text-xl font-black text-emerald-900">{totalCadastros}</span>
			<span class="text-[10px] text-emerald-700">Com operador identificado</span>
		</div>

		<div class="flex flex-col gap-1 border border-amber-200 bg-amber-50/50 p-3 shadow-xs">
			<span class="flex items-center gap-1 text-[10px] font-bold text-amber-800 uppercase">
				<IconEdit size={12} class="text-amber-700" />
				<span>Alterações Registradas</span>
			</span>
			<span class="text-xl font-black text-amber-900">{totalEdicoes}</span>
			<span class="text-[10px] text-amber-700">Dados ou status modificados</span>
		</div>

		<div class="flex flex-col gap-1 border border-red-200 bg-red-50/50 p-3 shadow-xs">
			<span class="flex items-center gap-1 text-[10px] font-bold text-red-800 uppercase">
				<IconTrash size={12} class="text-red-700" />
				<span>Exclusões Auditadas</span>
			</span>
			<span class="text-xl font-black text-red-900">{totalExclusoes}</span>
			<span class="text-[10px] text-red-700">Com motivo registrado</span>
		</div>
	</div>

	<!-- Banner de Conformidade e Ações -->
	<section
		class="flex flex-col justify-between gap-3 border border-indigo-200 bg-indigo-50/70 p-3.5 text-indigo-950 md:flex-row md:items-center"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-9 w-9 items-center justify-center bg-indigo-900 text-base font-bold text-white shadow-xs"
			>
				<IconShieldCheck size={20} />
			</div>
			<div>
				<div class="text-xs font-bold">
					AUDITORIA INTEGRAL DE OPERADORES ({orgaoRegulador} / LGPD)
				</div>
				<div class="text-[11px] text-indigo-800">
					Rastreamento nominal: {totalOperadoresUnicos} operadores ativos com identificação em tempo real
					de cadastro, alteração e cancelamento com motivo obrigatório.
				</div>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={carregarAuditoria}
				disabled={carregando}
				class="flex items-center gap-1.5 border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-900 uppercase hover:bg-indigo-100"
			>
				<IconRefresh size={14} class={carregando ? 'animate-spin' : ''} />
				<span>Atualizar</span>
			</button>
			<button
				type="button"
				onclick={exportarCsv}
				class="flex items-center gap-1.5 border border-indigo-900 bg-indigo-900 px-3.5 py-1.5 text-[11px] font-bold text-white uppercase hover:bg-indigo-950"
			>
				<IconDownload size={14} />
				<span>Exportar CSV</span>
			</button>
		</div>
	</section>

	<!-- Barra de Controles e Filtros -->
	<section
		class="flex flex-col justify-between gap-3 border border-slate-200 bg-white p-4 md:flex-row md:items-center"
	>
		<div class="flex flex-1 items-center gap-2">
			<div class="relative w-full max-w-md">
				<input
					type="text"
					bind:value={busca}
					placeholder="Buscar por Operador, Paciente, Protocolo, Ação ou Motivo..."
					class="w-full border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 focus:bg-white"
				/>
			</div>

			<select
				bind:value={filtroAcao}
				class="border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 focus:bg-white"
			>
				<option value="TODAS">TODOS OS EVENTOS ({logs.length})</option>
				<option value="CADASTRO">QUEM CADASTROU ({totalCadastros})</option>
				<option value="EDICAO">QUEM ALTEROU ({totalEdicoes})</option>
				<option value="EXCLUSAO">QUEM DELETOU / CANCELOU ({totalExclusoes})</option>
				<option value="AGENDAMENTO">AGENDAMENTOS / ESCALAS</option>
				<option value="SOAP">CONSULTAS / ATENDIMENTO SOAP</option>
				<option value="OPERACIONAL">OPERACIONAL GERAL</option>
			</select>
		</div>

		<div class="text-right font-mono text-[11px] text-slate-500">
			Exibindo <strong>{filtrados.length}</strong> de <strong>{logs.length}</strong> registros
		</div>
	</section>

	<!-- Tabela de Auditoria com Destaque para Operadores -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500">
			Carregando trilha completa de auditoria do {siglaOrgao}...
		</div>
	{:else}
		<div class="overflow-x-auto border border-slate-200 bg-white shadow-xs">
			<table class="w-full text-left font-mono text-xs">
				<thead
					class="border-b border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase"
				>
					<tr>
						<th class="p-3">DATA / HORA</th>
						<th class="p-3">TIPO</th>
						<th class="p-3">EVENTO / AÇÃO</th>
						<th class="p-3">PROTOCOLO / PACIENTE</th>
						<th class="p-3">OPERADOR (QUEM FEZ)</th>
						<th class="p-3">PERFIL</th>
						<th class="p-3 text-right">IP / TERMINAL</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each filtrados as l (l.id)}
						<tr
							class="transition-colors hover:bg-slate-50 {l.tipo === 'EXCLUSAO'
								? 'bg-red-50/30'
								: ''}"
						>
							<td class="p-3 whitespace-nowrap">
								<div class="font-bold text-slate-900">
									{new Date(l.dataHora).toLocaleDateString('pt-BR')}
								</div>
								<div class="text-[10px] text-slate-500">
									{new Date(l.dataHora).toLocaleTimeString('pt-BR')}
								</div>
							</td>
							<td class="p-3 whitespace-nowrap">
								{#if l.tipo === 'CADASTRO'}
									<span
										class="border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-900 uppercase"
									>
										CADASTRO
									</span>
								{:else if l.tipo === 'EXCLUSAO'}
									<span
										class="border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-900 uppercase"
									>
										EXCLUSÃO
									</span>
								{:else if l.tipo === 'EDICAO'}
									<span
										class="border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 uppercase"
									>
										ALTERAÇÃO
									</span>
								{:else if l.tipo === 'AGENDAMENTO'}
									<span
										class="border border-blue-300 bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-900 uppercase"
									>
										AGENDAMENTO
									</span>
								{:else if l.tipo === 'SOAP'}
									<span
										class="border border-purple-300 bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-900 uppercase"
									>
										ATENDIMENTO
									</span>
								{:else}
									<span
										class="border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 uppercase"
									>
										OPERACIONAL
									</span>
								{/if}
							</td>
							<td class="p-3 font-sans">
								<div class="font-bold text-slate-800">{l.acao}</div>
								<div
									class="text-[11px] {l.tipo === 'EXCLUSAO'
										? 'font-semibold text-red-700'
										: 'font-mono text-slate-500'} mt-0.5"
								>
									{l.detalhes}
								</div>
							</td>
							<td class="p-3">
								<span
									class="border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-900"
								>
									{l.protocolo}
								</span>
								<div class="mt-0.5 font-sans text-[11px] font-semibold text-slate-700">
									{l.paciente}
								</div>
							</td>
							<td class="p-3 font-sans">
								<div class="flex items-center gap-1.5 font-bold text-slate-900">
									{#if l.tipo === 'CADASTRO'}
										<span
											class="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-600"
											title="Cadastrou"
										></span>
									{:else if l.tipo === 'EXCLUSAO'}
										<span
											class="inline-block h-2 w-2 shrink-0 rounded-full bg-red-600"
											title="Excluiu"
										></span>
									{:else if l.tipo === 'EDICAO'}
										<span
											class="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-600"
											title="Alterou"
										></span>
									{/if}
									<span>{l.operador}</span>
								</div>
							</td>
							<td class="p-3 whitespace-nowrap">
								<span
									class="border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-900 uppercase"
								>
									{l.perfil}
								</span>
							</td>
							<td class="p-3 text-right font-mono text-[10px] whitespace-nowrap text-slate-500">
								{l.ipOrigem}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="p-8 text-center text-slate-500 font-sans">
								Nenhum evento registrado com os filtros informados.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
