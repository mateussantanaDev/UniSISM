<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconFileText,
		IconPlus,
		IconBulb
	} from '@tabler/icons-svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();
	let timerMensagem: any = null;

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista' : 'Médico Especialista');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');

	interface ProducaoMedico {
		id: string;
		medicoNome: string;
		crm: string;
		especialidade: string;
		atendimentosMes: number;
		tempoMedioMinutos: number | null;
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

	interface AtendimentoProcedimentoGestor {
		historicoSemProntuario?: boolean;
		id: string;
		protocolo: string;
		dataAtendimento: string;
		pacienteNome: string;
		pacienteCpf: string;
		medicoNome: string;
		medicoCrm: string;
		especialidade: string;
		tipoOrigem: 'CONSULTA' | 'PROCEDIMENTO';
		procedimentosAdicionados: {
			id: string;
			codigoSigtap: string;
			nome: string;
			quantidade: number;
			valorUnitarioBrl: number;
			adicionadoPor: 'MEDICO' | 'GESTOR';
		}[];
	}

	// State
	let abaAtiva = $state<'dashboard' | 'relatorios' | 'ajustes' | 'auditoria'>('dashboard');
	const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date());
	let periodoMes = $state(hoje.slice(0, 7));
	let erroCarregamento = $state('');
	let salvandoProcedimento = $state(false);
	let chaveProcedimento = $state('');
	let filtroEspecialidade = $state('TODAS');
	let gerandoRelatorio = $state(false);
	let mensagemSucesso = $state('');

	// Gestor Procedure Adjustment Modal State
	let modalAjusteGestorAberto = $state(false);
	let atendimentoSelecionadoAjuste = $state<AtendimentoProcedimentoGestor | null>(null);
	let novoProcCodigo = $state('02.11.02.003-6');
	let novoProcNome = $state('Eletrocardiograma (ECG)');
	let novoProcQtd = $state(1);
	let novoProcValor = $state(45.0);

	const catalogoSigtapGestorMed = [
		{ codigo: '02.11.02.003-6', nome: 'Eletrocardiograma (ECG)', valor: 45.0 },
		{ codigo: '02.05.02.009-7', nome: 'Ecocardiograma Transtorácico', valor: 180.0 },
		{ codigo: '04.04.01.001-2', nome: 'Biópsia de Pele e Subcutâneo', valor: 95.0 },
		{ codigo: '03.01.01.004-0', nome: 'Lavagem Otológica', valor: 35.0 },
		{ codigo: '04.08.01.004-7', nome: 'Infiltração Articular / Bainha Tendinosa', valor: 110.0 },
		{ codigo: '02.11.05.008-3', nome: 'Holter 24 Horas (3 Canais)', valor: 150.0 },
		{ codigo: '04.01.01.002-3', nome: 'Curativo Especial / Debridamento', valor: 40.0 },
		{ codigo: '02.06.01.007-9', nome: 'Endoscopia Digestiva Alta', valor: 220.0 }
	];

	const catalogoSigtapGestorOdonto = [
		{ codigo: '03.07.02.006-1', nome: 'Tratamento Endodôntico Dente Permanente', valor: 110.0 },
		{ codigo: '03.07.01.004-0', nome: 'Raspagem e Alisamento Periodontal', valor: 65.0 },
		{ codigo: '04.14.01.014-9', nome: 'Exodontia de Dente Incluso / Semi-incluso', valor: 140.0 },
		{ codigo: '03.07.03.003-2', nome: 'Condicionamento Odontopediátrico', valor: 80.0 },
		{ codigo: '03.07.04.004-6', nome: 'Atendimento Odonto PNE', valor: 95.0 },
		{ codigo: '07.01.07.012-9', nome: 'Moldagem e Instalação de Prótese', valor: 190.0 },
		{ codigo: '02.01.01.042-8', nome: 'Biópsia de Lesão Bucal', valor: 120.0 },
		{ codigo: '02.04.01.018-0', nome: 'Radiografia Periapical', valor: 25.0 }
	];

	let catalogoSigtapGestor = $derived(ehCeo ? catalogoSigtapGestorOdonto : catalogoSigtapGestorMed);

	let listaAtendimentosAjustaveis = $state<AtendimentoProcedimentoGestor[]>([]);

	// Report Generator State
	let relatorioTipo = $state<
		'BPA_SUS' | 'ABSENTEISMO_UBS' | 'DEMANDA_REPRIMIDA' | 'TFD_INTERMUNICIPAL'
	>('BPA_SUS');
	let relatorioFormato = $state<'PDF' | 'CSV' | 'XLSX'>('PDF');
	let relatorioDataInicio = $state(hoje.slice(0, 7) + '-01');
	let relatorioDataFim = $state(hoje);

	// Real Data from API
	let listaProducaoMedica = $state<ProducaoMedico[]>([]);
	let logsAuditoria = $state<LogAuditoriaOperacional[]>([]);

	// Derived metrics
	let totalConsultasMes = $derived(
		listaProducaoMedica.reduce((acc, m) => acc + m.atendimentosMes, 0)
	);
	let totalBpaBrl = $derived(
		listaProducaoMedica.reduce((acc, m) => acc + m.valorBpaEstimadoBRL, 0)
	);
	let totalTfdGerados = $derived(
		listaProducaoMedica.reduce((acc, m) => acc + m.encaminhamentosTFD, 0)
	);
	let absenteismoMedioGlobal = $derived((100 * listaProducaoMedica.reduce((s, m) => s + m.faltasPaciente, 0) / Math.max(1, listaProducaoMedica.reduce((s, m) => s + m.atendimentosMes + m.faltasPaciente, 0))).toFixed(1));

	let producaoFiltrada = $derived(
		listaProducaoMedica.filter(
			(m) => filtroEspecialidade === 'TODAS' || m.especialidade === filtroEspecialidade
		)
	);

	function abrirAjusteProcedimentoGestor(atend: AtendimentoProcedimentoGestor) {
		atendimentoSelecionadoAjuste = atend; erroModalAjuste = ''; chaveProcedimento = crypto.randomUUID();
		novoProcCodigo = '02.11.02.003-6';
		novoProcNome = 'Eletrocardiograma (ECG)';
		novoProcQtd = 1;
		novoProcValor = 45.0;
		modalAjusteGestorAberto = true;
	}

	let erroModalAjuste = $state('');

	function selecionarSigtapPreset(item: { codigo: string; nome: string; valor: number }) {
		novoProcCodigo = item.codigo;
		novoProcNome = item.nome;
		novoProcValor = item.valor;
		erroModalAjuste = '';
	}

	async function adicionarProcedimentoGestor() {
		if (!atendimentoSelecionadoAjuste || salvandoProcedimento) return;
		if (!novoProcNome.trim() || !Number.isInteger(novoProcQtd) || novoProcQtd < 1 || novoProcValor < 0 || !Number.isFinite(novoProcValor)) { erroModalAjuste = 'Informe nome, quantidade inteira positiva e valor não negativo.'; return; }
		salvandoProcedimento = true; erroModalAjuste = '';
		const id = atendimentoSelecionadoAjuste.id;
		try {
			await api.centroMedico.registrarProcedimentos(id, { idempotencyKey: chaveProcedimento, procedimentos: [{ codigoSigtap: novoProcCodigo.trim() || undefined, nome: novoProcNome.trim(), quantidade: novoProcQtd, valorUnitario: novoProcValor }] });
			chaveProcedimento = crypto.randomUUID();
			await carregarProducao();
			atendimentoSelecionadoAjuste = listaAtendimentosAjustaveis.find(a => a.id === id) || null;
			mensagemSucesso = 'Procedimento registrado no atendimento.';
		} catch(e: any) { erroModalAjuste = e.message || 'Não foi possível registrar o procedimento.'; }
		finally { salvandoProcedimento = false; }
	}

	onDestroy(() => {
		if (timerMensagem) clearTimeout(timerMensagem);
	});

	async function removerProcedimentoGestor(procId: string) {
		if (!atendimentoSelecionadoAjuste || salvandoProcedimento) return;
		salvandoProcedimento = true; erroModalAjuste = '';
		const id = atendimentoSelecionadoAjuste.id;
		try { await api.centroMedico.removerProcedimento(id, procId); await carregarProducao(); atendimentoSelecionadoAjuste = listaAtendimentosAjustaveis.find(a => a.id === id) || null; mensagemSucesso = 'Procedimento removido.'; }
		catch(e: any) { erroModalAjuste = e.message || 'Não foi possível remover o procedimento.'; }
		finally { salvandoProcedimento = false; }
	}
	async function carregarProducao() {
		try {
			const result = await api.centroGestao.obterProducao({ periodo: periodoMes, centro: siglaOrgao });
			listaAtendimentosAjustaveis = result.atendimentos;
			listaProducaoMedica = result.profissionais;
			erroCarregamento = '';
			const audit = await api.centroGestao.listAuditoria({ limit: 50, centro: siglaOrgao });
			logsAuditoria = audit.logs.map((l: any) => ({ id: l.id, timestamp: l.timestamp || l.criadoEm, operador: l.operador || l.atendenteNome || 'Sistema', papel: l.papel || 'Operador', acao: l.acao, detalhes: l.detalhes || JSON.stringify(l.payload || {}), ip: l.ip || 'Não registrado' }));
		} catch(e: any) { erroCarregamento = e.message || 'Falha ao carregar produção.'; }
	}
	function mudarCompetencia() { relatorioDataInicio = periodoMes + '-01'; const d = new Date(periodoMes + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(d.getUTCDate() - 1); relatorioDataFim = d.toISOString().slice(0, 10); void carregarProducao(); }
	onMount(carregarProducao);

	function formatarMoeda(val: number) {
		return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	async function baixarRelatorioOficial() {
		if (!relatorioDataInicio || !relatorioDataFim || relatorioDataInicio > relatorioDataFim) { erroCarregamento = 'Informe um período válido: o fim deve ser igual ou posterior ao início.'; return; }
		gerandoRelatorio = true; erroCarregamento = ''; mensagemSucesso = '';
		try {
			const { blob, filename } = await api.centroGestao.exportarRelatorio({ inicio: relatorioDataInicio, fim: relatorioDataFim, centro: siglaOrgao, tipo: relatorioTipo, formato: relatorioFormato });
			const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
			mensagemSucesso = `Relatório ${relatorioTipo} (${relatorioFormato}) gerado: ${relatorioDataInicio} a ${relatorioDataFim}.`;
		} catch(e: any) { erroCarregamento = e.message || 'Falha ao exportar relatório.'; }
		finally { gerandoRelatorio = false; }
	}

</script>

<svelte:head>
	<title>ERP Gestão - Produção & Relatórios · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="PRODUÇÃO ASSISTENCIAL & FATURAMENTO BPA-SUS — {nomeOrgao.toUpperCase()}"
		subtitle="Consolidação mensal de atendimentos realizados, faturamento ambulatorial SIA-SUS, absenteísmo e relatórios de conferência do {nomeOrgao}."
	/>

	<div class="flex items-center gap-2"><label for="competencia-producao">Competência</label><input id="competencia-producao" type="month" bind:value={periodoMes} onchange={mudarCompetencia} class="border border-slate-300 p-2" /></div>
	{#if erroCarregamento}<p role="alert" class="border border-red-300 bg-red-50 p-3 text-red-800">{erroCarregamento}</p>{/if}
	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div
			class="flex flex-col gap-1 border-2 border-emerald-700 bg-emerald-50 p-4 font-bold whitespace-pre-wrap text-emerald-900 shadow-sm"
		>
			<div class="text-sm font-black">DIRETORIA EXECUÇÃO · PRESTAÇÃO DE CONTAS</div>
			<div class="font-mono text-xs font-normal">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- 1. Indicadores Executivos Globais (Director Executive Board) -->
	<section class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
				Produção de Atendimentos / Mês
			</div>
			<div class="mt-2 text-3xl font-bold text-slate-900">{totalConsultasMes}</div>
			<div class="mt-1 text-[11px] text-slate-600">
				Procedimentos especializados realizados no {siglaOrgao}
			</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
				Valor registrado em procedimentos
			</div>
			<div class="mt-2 text-2xl font-bold text-emerald-700">{formatarMoeda(totalBpaBrl)}</div>
			<div class="mt-1 text-[11px] text-slate-600">
				Soma dos valores registrados nos procedimentos
			</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
				Taxa de Absenteísmo Global
			</div>
			<div class="mt-2 text-3xl font-bold text-amber-700">{absenteismoMedioGlobal}%</div>
			<div class="mt-1 text-[11px] text-slate-600">Média municipal de ausência do paciente</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
				Encaminhamentos TFD (Outras Cidades)
			</div>
			<div class="mt-2 text-3xl font-bold text-blue-900">
				{totalTfdGerados} <span class="text-xs font-normal text-slate-500">casos</span>
			</div>
			<div class="mt-1 text-[11px] text-slate-600">Alta complexidade fora do município</div>
		</div>
	</section>

	<!-- 2. Navegação entre Abas do Diretor -->
	<div class="flex border-b border-slate-200 bg-white font-mono text-xs font-bold">
		<button
			type="button"
			onclick={() => (abaAtiva = 'dashboard')}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'dashboard'
				? 'border-blue-900 bg-blue-50 text-blue-900'
				: 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			01. Analytics de Produção Médica
		</button>
		<button
			type="button"
			onclick={() => (abaAtiva = 'relatorios')}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'relatorios'
				? 'border-blue-900 bg-blue-50 text-blue-900'
				: 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			02. Gerador de Relatórios Oficiais & SUS
		</button>
		<button
			type="button"
			onclick={() => (abaAtiva = 'ajustes')}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'ajustes'
				? 'border-purple-900 bg-purple-50 font-black text-purple-900'
				: 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			03. Lançamento & Ajuste de Procedimentos (Gestor)
		</button>
		<button
			type="button"
			onclick={() => (abaAtiva = 'auditoria')}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'auditoria'
				? 'border-blue-900 bg-blue-50 text-blue-900'
				: 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			04. Trilha de Auditoria & Compliance (Logs)
		</button>
	</div>

	<!-- 3. ABA 1: Analytics de Produção Médica por Especialista -->
	{#if abaAtiva === 'dashboard'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Produtividade e Rendimento dos Médicos Especialistas" index="01">
				<div class="flex items-center gap-2">
					<label for="filtro-esp-prod" class="text-[10px] text-slate-500">Especialidade:</label>
					<select
						id="filtro-esp-prod"
						bind:value={filtroEspecialidade}
						class="border border-slate-300 px-2 py-0.5 text-xs font-bold"
					>
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
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-4 py-3">Especialista / CRM</th>
							<th class="border-r border-slate-200 px-3 py-3">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Consultas Realizadas</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Tempo Médio / Consulta</th
							>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Faltas de Pacientes</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Absenteísmo</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Encaminhamentos TFD</th>
							<th class="px-3 py-3 text-right">Valor BPA Estimado</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each producaoFiltrada as med (med.id)}
							<tr class="border-b border-slate-100 transition-colors hover:bg-slate-50">
								<!-- Médico -->
								<td class="border-r border-slate-100 px-4 py-3 font-sans">
									<div class="font-bold text-slate-900">{med.medicoNome}</div>
									<div class="font-mono text-[10px] text-slate-500">{med.crm}</div>
								</td>

								<!-- Especialidade -->
								<td
									class="border-r border-slate-100 px-3 py-3 font-sans font-semibold text-slate-800"
								>
									{med.especialidade}
								</td>

								<!-- Realizadas -->
								<td
									class="border-r border-slate-100 px-3 py-3 text-center text-sm font-bold text-blue-900"
								>
									{med.atendimentosMes}
								</td>

								<!-- Tempo Médio -->
								<td class="border-r border-slate-100 px-3 py-3 text-center text-slate-700">
									{med.tempoMedioMinutos === null ? 'Não registrado' : `${med.tempoMedioMinutos} min`}
								</td>

								<!-- Faltas -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-red-700">
									{med.faltasPaciente}
								</td>

								<!-- Absenteísmo -->
								<td
									class="border-r border-slate-100 px-3 py-3 text-center font-bold text-amber-700"
								>
									{med.taxaAbsenteismo}%
								</td>

								<!-- TFD Gerados -->
								<td
									class="border-r border-slate-100 px-3 py-3 text-center font-bold text-slate-900"
								>
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

			<div class="flex flex-col gap-6 p-6 font-sans text-xs">
				<div
					class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-4 font-mono text-xs"
				>
					<IconFileText size={15} class="shrink-0 text-blue-900" />
					<span
						>Selecione o relatório desejado para prestação de contas com a Secretaria Municipal de
						Saúde, SUS ou Tribunal de Contas:</span
					>
				</div>

				<div class="grid grid-cols-1 gap-6 font-mono md:grid-cols-2">
					<!-- Seleção do Tipo de Relatório -->
					<div class="flex flex-col gap-3">
						<span class="text-xs font-bold text-slate-800 uppercase">01. Seleção do Relatório</span>

						<label
							for="rel-type-bpa"
							class="flex cursor-pointer items-start gap-3 border p-3 transition-colors {relatorioTipo ===
							'BPA_SUS'
								? 'border-blue-900 bg-blue-50/60'
								: 'border-slate-200 bg-white'}"
						>
							<input
								id="rel-type-bpa"
								type="radio"
								bind:group={relatorioTipo}
								value="BPA_SUS"
								class="mt-0.5"
							/>
							<div>
								<div class="font-bold text-slate-900">
									Relatório BPA / SIA-SUS (Produção Ambulatorial)
								</div>
								<div class="mt-0.5 font-sans text-[11px] text-slate-600">
									Procedimentos realizados para conferência. Importação oficial SIA/SUS depende de validação específica.
								</div>
							</div>
						</label>

						<label
							for="rel-type-abs"
							class="flex cursor-pointer items-start gap-3 border p-3 transition-colors {relatorioTipo ===
							'ABSENTEISMO_UBS'
								? 'border-blue-900 bg-blue-50/60'
								: 'border-slate-200 bg-white'}"
						>
							<input
								id="rel-type-abs"
								type="radio"
								bind:group={relatorioTipo}
								value="ABSENTEISMO_UBS"
								class="mt-0.5"
							/>
							<div>
								<div class="font-bold text-slate-900">
									Relatório de Absenteísmo e Faltas por UBS
								</div>
								<div class="mt-0.5 font-sans text-[11px] text-slate-600">
									Indicador de faltas de pacientes por bairro para busca ativa de agentes de saúde.
								</div>
							</div>
						</label>

						<label
							for="rel-type-dem"
							class="flex cursor-pointer items-start gap-3 border p-3 transition-colors {relatorioTipo ===
							'DEMANDA_REPRIMIDA'
								? 'border-blue-900 bg-blue-50/60'
								: 'border-slate-200 bg-white'}"
						>
							<input
								id="rel-type-dem"
								type="radio"
								bind:group={relatorioTipo}
								value="DEMANDA_REPRIMIDA"
								class="mt-0.5"
							/>
							<div>
								<div class="font-bold text-slate-900">
									Relatório de Demanda Reprimida & Fila da Regulação
								</div>
								<div class="mt-0.5 font-sans text-[11px] text-slate-600">
									Mapeamento de gargalos de esperas longas por especialidade para licitações.
								</div>
							</div>
						</label>

						<label
							for="rel-type-tfd"
							class="flex cursor-pointer items-start gap-3 border p-3 transition-colors {relatorioTipo ===
							'TFD_INTERMUNICIPAL'
								? 'border-blue-900 bg-blue-50/60'
								: 'border-slate-200 bg-white'}"
						>
							<input
								id="rel-type-tfd"
								type="radio"
								bind:group={relatorioTipo}
								value="TFD_INTERMUNICIPAL"
								class="mt-0.5"
							/>
							<div>
								<div class="font-bold text-slate-900">
									Relatório de Encaminhamentos Intermunicipais / TFD
								</div>
								<div class="mt-0.5 font-sans text-[11px] text-slate-600">
									Prestação de contas de pacientes enviados a outros municípios por alta
									complexidade.
								</div>
							</div>
						</label>
					</div>

					<!-- Período e Formato -->
					<div class="flex flex-col gap-4 border border-slate-200 bg-slate-50 p-4">
						<span class="text-xs font-bold text-slate-800 uppercase"
							>02. Filtros e Formato de Saída</span
						>

						<div class="grid grid-cols-2 gap-3">
							<div class="flex flex-col gap-1">
								<label for="rel-ini" class="text-[10px] text-slate-600">Data Inicial</label>
								<input
									id="rel-ini"
									type="date"
									bind:value={relatorioDataInicio}
									class="border border-slate-300 bg-white p-2 text-xs"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label for="rel-fim" class="text-[10px] text-slate-600">Data Final</label>
								<input
									id="rel-fim"
									type="date"
									bind:value={relatorioDataFim}
									class="border border-slate-300 bg-white p-2 text-xs"
								/>
							</div>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-[10px] text-slate-600 uppercase">Formato do Arquivo</span>
							<div class="flex gap-2">
								{#each ['PDF', 'CSV', 'XLSX'] as f}
									<button
										type="button"
										onclick={() => (relatorioFormato = f as any)}
										class="border px-4 py-2 text-xs font-bold transition-colors {relatorioFormato ===
										f
											? 'border-blue-900 bg-blue-900 text-white'
											: 'border-slate-300 bg-white text-slate-700'}"
									>
										{f}
									</button>
								{/each}
							</div>
						</div>

						<div class="mt-auto border-t border-slate-200 pt-4">
							<button
								type="button"
								onclick={baixarRelatorioOficial}
								disabled={gerandoRelatorio}
								class="w-full border border-blue-900 bg-blue-900 py-3 text-xs font-bold tracking-wider text-white uppercase hover:bg-blue-950 disabled:opacity-50"
							>
								{gerandoRelatorio
									? 'Processando Relatório...'
									: '📥 Gerar e Baixar Relatório'}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 5. ABA 3: Lançamento & Ajuste de Procedimentos pelo Gestor -->
	{#if abaAtiva === 'ajustes'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Lançamento e Auditoria de Procedimentos por Atendimento (Ajuste da Gestão)"
				index="03"
			/>

			<div class="flex flex-col gap-4 p-4 font-sans text-xs">
				<div
					class="flex flex-col gap-1 border border-purple-300 bg-purple-50 p-4 font-mono text-xs text-purple-950"
				>
					<div class="flex items-center gap-2 font-bold tracking-wider uppercase">
						<IconBulb size={15} class="text-purple-900" />
						<span>AUDITORIA & REGISTRO RETROATIVO DE PROCEDIMENTOS</span>
						<span class="bg-purple-900 px-2 py-0.5 text-[9px] font-normal text-white"
							>GESTOR / FATURAMENTO</span
						>
					</div>
					<div>
						Se durante uma consulta o médico realizou exames ou procedimentos (*ex:
						Eletrocardiograma, Biópsia, Curativo Especial, Infiltração, Lavagem Otológica*) mas não
						registrou no sistema, o gestor pode fazer a inserção direta aqui. O valor do
						procedimento será computado no faturamento SIA-SUS/BPA e na produção do médico.
					</div>
				</div>

				<div class="overflow-x-auto border border-slate-200">
					<table class="w-full border-collapse text-left font-mono text-xs">
						<thead>
							<tr class="bg-slate-900 text-[10px] font-bold tracking-wider text-white uppercase">
								<th class="p-3">Data / Protocolo</th>
								<th class="p-3">Paciente</th>
								<th class="p-3">Médico / Especialidade</th>
								<th class="p-3">Tipo Origem</th>
								<th class="p-3">Procedimentos Registrados</th>
								<th class="p-3 text-right">Valor Total SIGTAP</th>
								<th class="p-3 text-center">Ações do Gestor</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-200">
							{#each listaAtendimentosAjustaveis as atend (atend.id)}
								{@const totalAtendBrl = atend.procedimentosAdicionados.reduce(
									(sum, p) => sum + p.valorUnitarioBrl * p.quantidade,
									0
								)}
								<tr class="hover:bg-slate-50">
									<td class="p-3">
										<div class="font-bold text-slate-900">{atend.dataAtendimento}</div>
										<div class="font-mono text-[10px] text-slate-500">{atend.protocolo}</div>
									</td>
									<td class="p-3 font-sans">
										<div class="font-bold text-slate-900">{atend.pacienteNome}</div>
										<div class="font-mono text-[10px] text-slate-500">CPF: {atend.pacienteCpf}</div>
									</td>
									<td class="p-3 font-sans">
										<div class="font-semibold text-slate-900">{atend.medicoNome}</div>
										<div class="font-mono text-[10px] text-slate-500">
											{atend.medicoCrm} · {atend.especialidade}
										</div>
									</td>
									<td class="p-3">
										<span
											class="border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900"
										>
											{atend.tipoOrigem}
										</span>
									</td>
									<td class="p-3">
										{#if atend.procedimentosAdicionados.length > 0}
											<div class="flex flex-col gap-1">
												{#each atend.procedimentosAdicionados as proc}
													<div
														class="flex items-center justify-between border border-purple-200 bg-purple-50 px-2 py-1 font-mono text-[11px] text-purple-950"
													>
														<span><strong>{proc.nome}</strong> ({proc.quantidade}x)</span>
														<span class="font-bold text-emerald-800"
															>R$ {(proc.valorUnitarioBrl * proc.quantidade).toFixed(2)}</span
														>
													</div>
												{/each}
											</div>
										{:else}
											<span class="text-[11px] text-slate-400 italic"
												>Nenhum procedimento extra registrado</span
											>
										{/if}
									</td>
									<td class="p-3 text-right text-sm font-bold text-emerald-800">
										R$ {totalAtendBrl.toFixed(2)}
									</td>
									<td class="p-3 text-center whitespace-nowrap">
										<button
											type="button"
											disabled={atend.historicoSemProntuario}
											title={atend.historicoSemProntuario ? 'Registro histórico sem prontuário clínico vinculado' : undefined}
											onclick={() => abrirAjusteProcedimentoGestor(atend)}
											class="border border-purple-900 bg-purple-900 px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-white uppercase shadow-xs hover:bg-purple-950"
										>
											{atend.historicoSemProntuario ? 'Histórico sem prontuário' : '+ Lançar / Ajustar Procedimento'}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}

	<!-- 6. ABA 4: Trilha de Auditoria & Compliance (Logs) -->
	{#if abaAtiva === 'auditoria'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Trilha de Auditoria Operacional (Audit Trail Compliance)" index="04" />

			<div class="overflow-x-auto">
				<table class="w-full border-collapse font-mono text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left text-[10px] tracking-widest text-slate-600 uppercase"
						>
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
							<tr class="border-b border-slate-100 transition-colors hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2.5 font-bold text-slate-900">
									{new Date(log.timestamp).toLocaleString('pt-BR')}
								</td>
								<td
									class="border-r border-slate-100 px-3 py-2.5 font-sans font-bold text-slate-800"
								>
									{log.operador}
								</td>
								<td class="border-r border-slate-100 px-3 py-2.5 text-center">
									<span
										class="border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold"
									>
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

<!-- Modal: Gestor Lançamento de Procedimentos Retroativos -->
{#if modalAjusteGestorAberto && atendimentoSelecionadoAjuste}
	<Modal
		isOpen={modalAjusteGestorAberto}
		onClose={() => (modalAjusteGestorAberto = false)}
		title="LANÇAMENTO DE PROCEDIMENTO PELO GESTOR"
		subtitle="Inserção retroativa no atendimento para cálculo de custo e faturamento SIA-SUS"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="border border-slate-300 bg-slate-100 p-3 font-sans">
				<div class="text-sm font-bold text-slate-900">
					{atendimentoSelecionadoAjuste.pacienteNome}
				</div>
				<div class="font-mono text-[11px] text-slate-600">
					CPF: {atendimentoSelecionadoAjuste.pacienteCpf} · Médico:
					<strong>{atendimentoSelecionadoAjuste.medicoNome}</strong>
					({atendimentoSelecionadoAjuste.especialidade})
				</div>
			</div>

			<!-- Procedimentos Já Inseridos -->
			<div class="flex flex-col gap-1">
				<span class="text-[10px] font-bold text-slate-700 uppercase"
					>Procedimentos Já Inseridos neste Atendimento:</span
				>
				{#if atendimentoSelecionadoAjuste.procedimentosAdicionados.length > 0}
					<div class="border border-slate-200 bg-white">
						{#each atendimentoSelecionadoAjuste.procedimentosAdicionados as p}
							<div
								class="flex items-center justify-between border-b border-slate-100 p-2 last:border-b-0"
							>
								<div>
									<div class="font-bold text-purple-950">{p.nome} ({p.quantidade}x)</div>
									<div class="text-[10px] text-slate-500">
										SIGTAP: {p.codigoSigtap} · Por {p.adicionadoPor}
									</div>
								</div>
								<div class="flex items-center gap-3">
									<span class="font-bold text-emerald-800"
										>R$ {(p.valorUnitarioBrl * p.quantidade).toFixed(2)}</span
									>
									<button
										type="button"
										onclick={() => removerProcedimentoGestor(p.id)}
										class="text-[10px] font-bold text-red-700 hover:underline"
									>
										[Remover]
									</button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-400 italic">
						Nenhum procedimento registrado ainda.
					</div>
				{/if}
			</div>

			<!-- Formulário para Inserção -->
			<div class="flex flex-col gap-3 border-t border-slate-200 pt-3">
				<span class="flex items-center gap-1 text-[11px] font-bold text-purple-950 uppercase">
					<IconPlus size={13} />
					<span>Adicionar Novo Procedimento SIGTAP</span>
				</span>

				{#if erroModalAjuste}
					<div
						class="flex items-center gap-1.5 border border-rose-200 bg-rose-50 p-2 font-bold text-rose-900"
					>
						<IconAlertTriangle size={14} class="shrink-0 text-rose-700" />
						<span>{erroModalAjuste}</span>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<label for="gest-proc-name" class="text-[10px] font-bold text-slate-600 uppercase"
						>Nome do Procedimento / Exame *</label
					>
					<input
						id="gest-proc-name"
						type="text"
						bind:value={novoProcNome}
						class="border border-slate-300 p-2 font-sans text-xs"
					/>
				</div>

				<div class="grid grid-cols-3 gap-3">
					<div class="flex flex-col gap-1">
						<label for="gest-proc-cod" class="text-[10px] font-bold text-slate-600 uppercase"
							>Código SIGTAP</label
						>
						<input
							id="gest-proc-cod"
							type="text"
							bind:value={novoProcCodigo}
							class="border border-slate-300 p-2 font-mono text-xs"
						/>
					</div>

					<div class="flex flex-col gap-1">
						<label for="gest-proc-val" class="text-[10px] font-bold text-slate-600 uppercase"
							>Valor Repasse (R$)</label
						>
						<input
							id="gest-proc-val"
							type="number"
							step="0.01"
							bind:value={novoProcValor}
							class="border border-slate-300 p-2 text-xs font-bold text-emerald-800"
						/>
					</div>

					<div class="flex flex-col gap-1">
						<label for="gest-proc-qtd" class="text-[10px] font-bold text-slate-600 uppercase"
							>Quantidade</label
						>
						<input
							id="gest-proc-qtd"
							type="number"
							min="1"
							bind:value={novoProcQtd}
							class="border border-slate-300 p-2 text-center text-xs font-bold"
						/>
					</div>
				</div>

				<!-- Sugestões da Tabela SIGTAP -->
				<div class="flex flex-col gap-1 pt-1">
					<span class="text-[10px] font-bold text-slate-500 uppercase">Tabela Frequente SUS:</span>
					<div class="flex flex-wrap gap-1">
						{#each catalogoSigtapGestor as sig}
							<button
								type="button"
								onclick={() => selecionarSigtapPreset(sig)}
								class="border border-purple-300 bg-purple-50 px-2 py-1 text-left font-mono text-[10px] font-semibold text-purple-950 hover:bg-purple-100"
							>
								+ {sig.nome} (R$ {sig.valor.toFixed(2)})
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="mt-2 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
				<button
					type="button"
					onclick={() => (modalAjusteGestorAberto = false)}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-100"
				>
					Fechar
				</button>
				<button
					type="button"
					onclick={adicionarProcedimentoGestor} disabled={salvandoProcedimento}
					class="border border-purple-900 bg-purple-900 px-5 py-2 text-xs font-bold text-white uppercase hover:bg-purple-950"
				>
					✓ Confirmar Lançamento pelo Gestor
				</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	select,
	input,
	button {
		border-radius: 0 !important;
	}
</style>
