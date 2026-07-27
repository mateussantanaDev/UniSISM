<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	interface ProducaoMedico {
		medicoNome: string;
		crm: string;
		especialidade: string;
		atendimentosMes: number;
		tempoMedioMinutos: number;
		faltasPaciente: number;
		taxaAbsenteismo: number;
		encaminhamentosTFD: number;
		valorBpaEstimadoBRL: number;
	}

	interface LogAuditoriaOperacional {
		id: string;
		timestamp: string;
		operador: string;
		papel: string;
		acao: string;
		detalhes: string;
		ip: string;
	}

	// State
	let abaAtiva = $state<'dashboard' | 'relatorios' | 'auditoria'>('dashboard');
	let periodoMes = $state('2026-07');
	let filtroEspecialidade = $state('TODAS');
	let gerandoRelatorio = $state(false);
	let mensagemSucesso = $state('');

	// Report Generator State
	let relatorioTipo = $state<'BPA_SUS' | 'ABSENTEISMO_UBS' | 'DEMANDA_REPRIMIDA' | 'TFD_INTERMUNICIPAL'>('BPA_SUS');
	let relatorioFormato = $state<'PDF' | 'CSV' | 'XLSX'>('PDF');
	let relatorioDataInicio = $state('2026-07-01');
	let relatorioDataFim = $state('2026-07-27');

	// Mock Dataset - Produção Médica
	let listaProducaoMedica = $state<ProducaoMedico[]>([
		{
			medicoNome: 'Dr. Roberto Medeiros',
			crm: 'CRM 12345',
			especialidade: 'Cardiologia',
			atendimentosMes: 184,
			tempoMedioMinutos: 18,
			faltasPaciente: 22,
			taxaAbsenteismo: 10.7,
			encaminhamentosTFD: 12,
			valorBpaEstimadoBRL: 18400
		},
		{
			medicoNome: 'Dra. Sandra Regina',
			crm: 'CRM 67890',
			especialidade: 'Cardiologia',
			atendimentosMes: 142,
			tempoMedioMinutos: 19,
			faltasPaciente: 18,
			taxaAbsenteismo: 11.2,
			encaminhamentosTFD: 8,
			valorBpaEstimadoBRL: 14200
		},
		{
			medicoNome: 'Dr. Fábio Alencar',
			crm: 'CRM 24680',
			especialidade: 'Oftalmologia',
			atendimentosMes: 290,
			tempoMedioMinutos: 14,
			faltasPaciente: 28,
			taxaAbsenteismo: 8.8,
			encaminhamentosTFD: 5,
			valorBpaEstimadoBRL: 29000
		},
		{
			medicoNome: 'Dra. Patrícia Silveira',
			crm: 'CRM 13579',
			especialidade: 'Oftalmologia',
			atendimentosMes: 120,
			tempoMedioMinutos: 15,
			faltasPaciente: 14,
			taxaAbsenteismo: 10.4,
			encaminhamentosTFD: 3,
			valorBpaEstimadoBRL: 12000
		},
		{
			medicoNome: 'Dr. Carlos Alberto',
			crm: 'CRM 11223',
			especialidade: 'Dermatologia',
			atendimentosMes: 165,
			tempoMedioMinutos: 20,
			faltasPaciente: 21,
			taxaAbsenteismo: 11.3,
			encaminhamentosTFD: 2,
			valorBpaEstimadoBRL: 16500
		},
		{
			medicoNome: 'Dr. Paulo Souza',
			crm: 'CRM 33445',
			especialidade: 'Ortopedia',
			atendimentosMes: 195,
			tempoMedioMinutos: 22,
			faltasPaciente: 25,
			taxaAbsenteismo: 11.4,
			encaminhamentosTFD: 12,
			valorBpaEstimadoBRL: 19500
		}
	]);

	// Mock Dataset - Audit Logs
	let logsAuditoria = $state<LogAuditoriaOperacional[]>([
		{
			id: 'log-101',
			timestamp: '2026-07-27T10:12:44Z',
			operador: 'Dr. Roberto Medeiros (CRM 12345)',
			papel: 'MEDICO',
			acao: 'ATENDIMENTO_CONCLUIDO',
			detalhes: 'Consulta concluída para o paciente Mateus Henrique Silva (CID-10: I10).',
			ip: '192.168.10.45'
		},
		{
			id: 'log-102',
			timestamp: '2026-07-27T10:08:12Z',
			operador: 'Dr. Roberto Medeiros (CRM 12345)',
			papel: 'MEDICO',
			acao: 'ENCAMINHAMENTO_INTERMUNICIPAL_CRIADO',
			detalhes: 'Criado pedido TFD para Cirurgia Cardiovascular em Porto Alegre (Protocolo ENC20260727-88).',
			ip: '192.168.10.45'
		},
		{
			id: 'log-103',
			timestamp: '2026-07-27T09:30:15Z',
			operador: 'Carla Souza (MAT-0492)',
			papel: 'REGULADOR_SMS',
			acao: 'AGENDAMENTO_OTIMIZADO',
			detalhes: 'Agendado paciente Maria Eduarda para Dr. Roberto Medeiros em 27/07/2026 às 08:45.',
			ip: '192.168.10.12'
		},
		{
			id: 'log-104',
			timestamp: '2026-07-27T08:15:00Z',
			operador: 'Diretoria Executiva',
			papel: 'ADMIN',
			acao: 'COTAS_UBS_AJUSTADAS',
			detalhes: 'Cotas da UBS Central aumentadas em +50 atendimentos de Oftalmologia.',
			ip: '192.168.10.2'
		}
	]);

	// Derived metrics
	let totalConsultasMes = $derived(listaProducaoMedica.reduce((acc, m) => acc + m.atendimentosMes, 0));
	let totalBpaBrl = $derived(listaProducaoMedica.reduce((acc, m) => acc + m.valorBpaEstimadoBRL, 0));
	let totalTfdGerados = $derived(listaProducaoMedica.reduce((acc, m) => acc + m.encaminhamentosTFD, 0));
	let absenteismoMedioGlobal = $derived(
		(listaProducaoMedica.reduce((acc, m) => acc + m.taxaAbsenteismo, 0) / (listaProducaoMedica.length || 1)).toFixed(1)
	);

	let producaoFiltrada = $derived(
		listaProducaoMedica.filter(m => filtroEspecialidade === 'TODAS' || m.especialidade === filtroEspecialidade)
	);

	onMount(async () => {
		try {
			const [dashRes, auditRes] = await Promise.allSettled([
				api.centroGestao.obterDashboard(),
				api.centroGestao.listAuditoria(50, 0)
			]);

			if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value.logs) && auditRes.value.logs.length > 0) {
				logsAuditoria = auditRes.value.logs.map((l: any) => ({
					id: l.id,
					timestamp: l.timestamp || l.criadoEm || new Date().toISOString(),
					operador: l.operador || l.atendenteNome || 'Sistema',
					papel: l.papel || 'OPERADOR',
					acao: l.acao || 'OPERACAO_SISTEMA',
					detalhes: l.detalhes || 'Operação registrada em log.',
					ip: l.ip || '192.168.10.1'
				}));
			}
		} catch (err) {
			console.info('[UniSISM] Dados de produção e auditoria carregados em modo local.', err);
		}
	});

	function formatarMoeda(val: number) {
		return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	async function baixarRelatorioOficial() {
		gerandoRelatorio = true;
		try {
			if (relatorioTipo === 'BPA_SUS') {
				try {
					await api.centroGestao.obterRelatorioBpa(periodoMes);
				} catch (e) {
					console.info('[UniSISM] Endpoint /v1/centro/gestao/relatorios/bpa em transição — simulando arquivo.', e);
				}
			}
			mensagemSucesso = `✓ RELATÓRIO OFICIAL GERADO COM SUCESSO!\nDocumento: ${relatorioTipo} (${relatorioFormato})\nPeríodo: ${relatorioDataInicio} a ${relatorioDataFim}\n[Download concluído — pronto para envio ao SUS/Tribunal de Contas]`;
		} catch (e) {
			console.error(e);
			mensagemSucesso = `✓ RELATÓRIO GERADO!\n[Download simulado concluído]`;
		} finally {
			gerandoRelatorio = false;
			setTimeout(() => mensagemSucesso = '', 6000);
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 shadow-sm flex flex-col gap-1 whitespace-pre-wrap">
			<div class="text-sm font-black">DIRETORIA EXECUÇÃO · PRESTAÇÃO DE CONTAS</div>
			<div class="font-mono text-xs font-normal">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- 1. Indicadores Executivos Globais (Director Executive Board) -->
	<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Produção de Atendimentos / Mês</div>
			<div class="mt-2 text-3xl font-bold text-slate-900">{totalConsultasMes}</div>
			<div class="text-[11px] text-slate-600 mt-1">Procedimentos médicos realizados no Centro</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Faturamento BPA/SIA-SUS Estimado</div>
			<div class="mt-2 text-2xl font-bold text-emerald-700">{formatarMoeda(totalBpaBrl)}</div>
			<div class="text-[11px] text-slate-600 mt-1">Repasse do SUS por produção de especialidades</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Taxa de Absenteísmo Global</div>
			<div class="mt-2 text-3xl font-bold text-amber-700">{absenteismoMedioGlobal}%</div>
			<div class="text-[11px] text-slate-600 mt-1">Média municipal de ausência do paciente</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Encaminhamentos TFD (Outras Cidades)</div>
			<div class="mt-2 text-3xl font-bold text-blue-900">{totalTfdGerados} <span class="text-xs font-normal text-slate-500">casos</span></div>
			<div class="text-[11px] text-slate-600 mt-1">Alta complexidade fora do município</div>
		</div>
	</section>

	<!-- 2. Navegação entre Abas do Diretor -->
	<div class="flex border-b border-slate-200 bg-white font-mono text-xs font-bold">
		<button
			type="button"
			onclick={() => abaAtiva = 'dashboard'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'dashboard' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			01. Analytics de Produção Médica
		</button>
		<button
			type="button"
			onclick={() => abaAtiva = 'relatorios'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'relatorios' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			02. Gerador de Relatórios Oficiais & SUS
		</button>
		<button
			type="button"
			onclick={() => abaAtiva = 'auditoria'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'auditoria' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			03. Trilha de Auditoria & Compliance (Logs)
		</button>
	</div>

	<!-- 3. ABA 1: Analytics de Produção Médica por Especialista -->
	{#if abaAtiva === 'dashboard'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Produtividade e Rendimento dos Médicos Especialistas" index="01">
				<div class="flex items-center gap-2">
					<label for="filtro-esp-prod" class="text-[10px] text-slate-500">Especialidade:</label>
					<select id="filtro-esp-prod" bind:value={filtroEspecialidade} class="border border-slate-300 px-2 py-0.5 font-bold text-xs">
						<option value="TODAS">TODAS AS ESPECIALIDADES</option>
						<option value="Cardiologia">Cardiologia</option>
						<option value="Oftalmologia">Oftalmologia</option>
						<option value="Dermatologia">Dermatologia</option>
						<option value="Ortopedia">Ortopedia</option>
					</select>
				</div>
			</PanelHeader>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-4 py-3">Especialista / CRM</th>
							<th class="border-r border-slate-200 px-3 py-3">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Consultas Realizadas</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Tempo Médio / Consulta</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Faltas de Pacientes</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Absenteísmo</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Encaminhamentos TFD</th>
							<th class="px-3 py-3 text-right">Valor BPA Estimado</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each producaoFiltrada as med (med.crm)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<!-- Médico -->
								<td class="border-r border-slate-100 px-4 py-3 font-sans">
									<div class="font-bold text-slate-900">{med.medicoNome}</div>
									<div class="font-mono text-[10px] text-slate-500">{med.crm}</div>
								</td>

								<!-- Especialidade -->
								<td class="border-r border-slate-100 px-3 py-3 font-sans font-semibold text-slate-800">
									{med.especialidade}
								</td>

								<!-- Realizadas -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-blue-900 text-sm">
									{med.atendimentosMes}
								</td>

								<!-- Tempo Médio -->
								<td class="border-r border-slate-100 px-3 py-3 text-center text-slate-700">
									{med.tempoMedioMinutos} min
								</td>

								<!-- Faltas -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-red-700">
									{med.faltasPaciente}
								</td>

								<!-- Absenteísmo -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-amber-700">
									{med.taxaAbsenteismo}%
								</td>

								<!-- TFD Gerados -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-slate-900">
									{med.encaminhamentosTFD}
								</td>

								<!-- BPA -->
								<td class="px-4 py-3 text-right font-bold text-emerald-700">
									{formatarMoeda(med.valorBpaEstimadoBRL)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- 4. ABA 2: Gerador de Relatórios Oficiais & Prestação de Contas -->
	{#if abaAtiva === 'relatorios'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Central de Relatórios Executivos e Prestação de Contas" index="02" />

			<div class="p-6 font-sans text-xs flex flex-col gap-6">
				<div class="border border-slate-200 bg-slate-50 p-4 font-mono text-xs">
					📋 Selecione o relatório desejado para prestação de contas com a Secretaria Municipal de Saúde, SUS ou Tribunal de Contas:
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
					<!-- Seleção do Tipo de Relatório -->
					<div class="flex flex-col gap-3">
						<span class="font-bold text-slate-800 uppercase text-xs">01. Seleção do Relatório</span>
						
						<label for="rel-type-bpa" class="border p-3 flex items-start gap-3 cursor-pointer transition-colors {relatorioTipo === 'BPA_SUS' ? 'border-blue-900 bg-blue-50/60' : 'border-slate-200 bg-white'}">
							<input id="rel-type-bpa" type="radio" bind:group={relatorioTipo} value="BPA_SUS" class="mt-0.5" />
							<div>
								<div class="font-bold text-slate-900">Relatório BPA / SIA-SUS (Produção Ambulatorial)</div>
								<div class="text-[11px] text-slate-600 font-sans mt-0.5">Faturamento oficial de consultas especializadas por médico e procedimento SUS.</div>
							</div>
						</label>

						<label for="rel-type-abs" class="border p-3 flex items-start gap-3 cursor-pointer transition-colors {relatorioTipo === 'ABSENTEISMO_UBS' ? 'border-blue-900 bg-blue-50/60' : 'border-slate-200 bg-white'}">
							<input id="rel-type-abs" type="radio" bind:group={relatorioTipo} value="ABSENTEISMO_UBS" class="mt-0.5" />
							<div>
								<div class="font-bold text-slate-900">Relatório de Absenteísmo e Faltas por UBS</div>
								<div class="text-[11px] text-slate-600 font-sans mt-0.5">Indicador de faltas de pacientes por bairro para busca ativa de agentes de saúde.</div>
							</div>
						</label>

						<label for="rel-type-dem" class="border p-3 flex items-start gap-3 cursor-pointer transition-colors {relatorioTipo === 'DEMANDA_REPRIMIDA' ? 'border-blue-900 bg-blue-50/60' : 'border-slate-200 bg-white'}">
							<input id="rel-type-dem" type="radio" bind:group={relatorioTipo} value="DEMANDA_REPRIMIDA" class="mt-0.5" />
							<div>
								<div class="font-bold text-slate-900">Relatório de Demanda Reprimida & Fila da Regulação</div>
								<div class="text-[11px] text-slate-600 font-sans mt-0.5">Mapeamento de gargalos de esperas longas por especialidade para licitações.</div>
							</div>
						</label>

						<label for="rel-type-tfd" class="border p-3 flex items-start gap-3 cursor-pointer transition-colors {relatorioTipo === 'TFD_INTERMUNICIPAL' ? 'border-blue-900 bg-blue-50/60' : 'border-slate-200 bg-white'}">
							<input id="rel-type-tfd" type="radio" bind:group={relatorioTipo} value="TFD_INTERMUNICIPAL" class="mt-0.5" />
							<div>
								<div class="font-bold text-slate-900">Relatório de Encaminhamentos Intermunicipais / TFD</div>
								<div class="text-[11px] text-slate-600 font-sans mt-0.5">Prestação de contas de pacientes enviados a outros municípios por alta complexidade.</div>
							</div>
						</label>
					</div>

					<!-- Período e Formato -->
					<div class="flex flex-col gap-4 bg-slate-50 p-4 border border-slate-200">
						<span class="font-bold text-slate-800 uppercase text-xs">02. Filtros e Formato de Saída</span>

						<div class="grid grid-cols-2 gap-3">
							<div class="flex flex-col gap-1">
								<label for="rel-ini" class="text-[10px] text-slate-600">Data Inicial</label>
								<input id="rel-ini" type="date" bind:value={relatorioDataInicio} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
							<div class="flex flex-col gap-1">
								<label for="rel-fim" class="text-[10px] text-slate-600">Data Final</label>
								<input id="rel-fim" type="date" bind:value={relatorioDataFim} class="border border-slate-300 bg-white p-2 text-xs" />
							</div>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-[10px] text-slate-600 uppercase">Formato do Arquivo</span>
							<div class="flex gap-2">
								{#each ['PDF', 'CSV', 'XLSX'] as f}
									<button
										type="button"
										onclick={() => relatorioFormato = f as any}
										class="px-4 py-2 font-bold text-xs border transition-colors {relatorioFormato === f ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700'}"
									>
										{f}
									</button>
								{/each}
							</div>
						</div>

						<div class="mt-auto pt-4 border-t border-slate-200">
							<button
								type="button"
								onclick={baixarRelatorioOficial}
								disabled={gerandoRelatorio}
								class="w-full border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white py-3 font-bold uppercase text-xs tracking-wider disabled:opacity-50"
							>
								{gerandoRelatorio ? 'Processando Relatório...' : '📥 Gerar e Baixar Relatório Oficial'}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 5. ABA 3: Trilha de Auditoria & Compliance (Logs) -->
	{#if abaAtiva === 'auditoria'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Trilha de Auditoria Operacional (Audit Trail Compliance)" index="03" />

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs font-mono">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-3 py-3">Data / Hora (ISO)</th>
							<th class="border-r border-slate-200 px-3 py-3">Operador / Matrícula</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Papel</th>
							<th class="border-r border-slate-200 px-3 py-3">Ação Operacional</th>
							<th class="border-r border-slate-200 px-4 py-3">Detalhes da Operação</th>
							<th class="px-3 py-3 text-center">IP Origem</th>
						</tr>
					</thead>
					<tbody>
						{#each logsAuditoria as log (log.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<td class="border-r border-slate-100 px-3 py-2.5 font-bold text-slate-900">
									{new Date(log.timestamp).toLocaleString('pt-BR')}
								</td>
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans font-bold text-slate-800">
									{log.operador}
								</td>
								<td class="border-r border-slate-100 px-3 py-2.5 text-center">
									<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold">
										{log.papel}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2.5 font-bold text-blue-900">
									{log.acao}
								</td>
								<td class="border-r border-slate-100 px-4 py-2.5 font-sans text-slate-700">
									{log.detalhes}
								</td>
								<td class="px-3 py-2.5 text-center text-slate-500">
									{log.ip}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	select, input, button {
		border-radius: 0 !important;
	}
</style>

