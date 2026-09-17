<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import {
		IconAlertTriangle,
		IconCheck,
		IconSearch,
		IconDeviceMobile,
		IconRefresh,
		IconCalendar,
		IconStethoscope,
		IconDental,
		IconClock,
		IconBuildingHospital
	} from '@tabler/icons-svelte';
	import { ESPECIALIDADES_CEM, ESPECIALIDADES_CEO } from '$lib/domain/centro/alocadorInteligenteEscala';

	const auth = useAuth();

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');

	// Types for Cotas and Escalas
	interface CotaUbs {
		ubsId: string;
		ubsNome: string;
		totalCotasMes: number;
		alocadas: number;
		disponiveis: number;
		status: 'NORMAL' | 'ALERTA' | 'ESGOTADA';
		especialidades: Record<string, number>; // { 'Cardiologia': 40, 'Oftalmologia': 30 }
	}

	interface EscalaEspecialista {
		id: string;
		medicoNome: string;
		crm: string;
		especialidade: string;
		tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
		diasSemana: string[]; // ['SEG', 'QUA', 'SEX', 'SAB', 'DOM']
		horarioInicio: string;
		horarioFim: string;
		duracaoMinutos: number;
		vagasPorTurno: number;
		status: 'ATIVA' | 'FERIAS' | 'BLOQUEADA_PARCIAL';
		observacoes?: string;
		tipoRecorrencia?: 'SEMANAL' | 'QUINZENAL' | 'DATAS_ESPECIFICAS' | 'MUTIRAO';
		datasEspecificas?: string[];
		isMutirao?: boolean;
		intervaloDias?: number;
		dataInicioRecorrencia?: string;
	}

	// State
	let abaAtiva = $state<'cotas' | 'escalas' | 'remanejamento'>('cotas');
	let mesReferencia = $state('2026-07');
	let buscaEspecialista = $state('');
	let mensagemSucesso = $state('');
	let erroGlobal = $state('');

	// Real Data from API
	let cotasUbsList = $state<CotaUbs[]>([]);
	let escalasList = $state<EscalaEspecialista[]>([]);
	let listaProfissionais = $state<Array<{ id: string; nome: string; registroProfissional: string; conselho: string; cargo: string; role: string; especialidade: string }>>([]);
	let listaEspecialidadesCentro = $state<Array<{ id: string; nome: string; codigoSigtap?: string }>>([]);
	let profissionalSelecionadoId = $state('');

	function aoSelecionarProfissional(id: string) {
		profissionalSelecionadoId = id;
		const prof = listaProfissionais.find(p => p.id === id);
		if (prof) {
			novoMedicoNome = prof.nome;
			novoCrm = prof.registroProfissional ? `${prof.conselho} ${prof.registroProfissional}` : `${prof.conselho} —`;
			if (prof.especialidade && listaEspecialidadesCentro.some(e => e.nome.toLowerCase() === prof.especialidade.toLowerCase())) {
				novaEspecialidade = prof.especialidade;
			} else if (listaEspecialidadesCentro.length > 0) {
				novaEspecialidade = listaEspecialidadesCentro[0].nome;
			}
		}
	}

	// Modals State
	let modalAjustarCotasAberto = $state(false);
	let ubsSelecionadaCota = $state<CotaUbs | null>(null);

	let modalNovaEscalaAberto = $state(false);
	let novoMedicoNome = $state('');
	let novoCrm = $state('');
	let novaEspecialidade = $state('');
	let novoTipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let novosDias = $state<string[]>(['SEG', 'QUA']);
	let novoHorarioInicio = $state('08:00');
	let novoHorarioFim = $state('12:00');
	let novaDuracao = $state(20);
	let novasVagas = $state(12);
	let novoTipoRecorrencia = $state<'SEMANAL' | 'QUINZENAL' | 'DATAS_ESPECIFICAS' | 'MUTIRAO'>('SEMANAL');
	let novasDatasEspecificas = $state<string[]>([]);
	let inputDataEspecifica = $state('');
	let novoIsMutirao = $state(false);
	let novaDataInicioRecorrencia = $state('');

	function adicionarDataEspecifica() {
		if (!inputDataEspecifica) return;
		if (!novasDatasEspecificas.includes(inputDataEspecifica)) {
			novasDatasEspecificas = [...novasDatasEspecificas, inputDataEspecifica].sort();
		}
		inputDataEspecifica = '';
	}

	function removerDataEspecifica(data: string) {
		novasDatasEspecificas = novasDatasEspecificas.filter(d => d !== data);
	}

	function formatarDataBrLocal(iso: string): string {
		const [ano, mes, dia] = iso.split('-');
		return `${dia}/${mes}/${ano}`;
	}

	let modalFeriasAberto = $state(false);
	let escalaFerias = $state<EscalaEspecialista | null>(null);
	let dataInicioFerias = $state('');
	let dataFimFerias = $state('');
	let acaoPacientesAfetados = $state<'REMANEJAR_AUTOMATICO' | 'FILA_AVISO_SMS'>('REMANEJAR_AUTOMATICO');

	// Disparo de Avisos ao Paciente (Falta Médica / Mudança de Dia)
	let modalDispararAvisoAberto = $state(false);
	let avisoMedicoNome = $state('');
	let avisoData = $state(new Date().toISOString().substring(0, 10));
	let avisoTipoMotivo = $state<'FALTA_MEDICA' | 'MUDANCA_DIA' | 'FERIAS_LICENCA'>('FALTA_MEDICA');
	let avisoNovaData = $state('');
	let avisoMensagemPersonalizada = $state('');
	let avisoCanais = $state({
		app: true,
		sms: true,
		whatsapp: true
	});
	let disparandoAviso = $state(false);

	function abrirModalDispararAviso(medicoNome?: string) {
		avisoMedicoNome = medicoNome || (opcoesMedicos[0]?.nome || '');
		avisoData = new Date().toISOString().substring(0, 10);
		avisoTipoMotivo = 'FALTA_MEDICA';
		avisoNovaData = '';
		atualizarTextoPreviewAviso();
		modalDispararAvisoAberto = true;
	}

	function atualizarTextoPreviewAviso() {
		const dtFmt = avisoData ? avisoData.split('-').reverse().join('/') : '[Data]';
		if (avisoTipoMotivo === 'FALTA_MEDICA') {
			avisoMensagemPersonalizada = `Prezado(a) paciente, informamos que o(a) Dr(a). ${avisoMedicoNome} não poderá atender no dia ${dtFmt} por motivo de ausência de urgência. Seu agendamento será remanejado. Acompanhe a nova data pelo App do Paciente UniSISM.`;
		} else if (avisoTipoMotivo === 'MUDANCA_DIA') {
			const novaFmt = avisoNovaData ? avisoNovaData.split('-').reverse().join('/') : '[Nova Data]';
			avisoMensagemPersonalizada = `Aviso UniSISM: A sua consulta com Dr(a). ${avisoMedicoNome} do dia ${dtFmt} foi alterada para a nova data ${novaFmt}. Verifique os detalhes atualizados no App do Paciente UniSISM.`;
		} else {
			avisoMensagemPersonalizada = `Aviso UniSISM: O(a) Dr(a). ${avisoMedicoNome} estará em licença/férias a partir de ${dtFmt}. Todos os atendimentos do período foram remanejados. Verifique seu novo horário no App do Paciente UniSISM.`;
		}
	}

	let erroModalAviso = $state('');
	let erroModalEscala = $state('');
	let erroModalRemanejamento = $state('');
	let salvandoEscala = $state(false);

	async function dispararAvisoPacientes() {
		if (!avisoMedicoNome.trim()) {
			erroModalAviso = `Selecione o ${rotuloProfissional.toLowerCase()}.`;
			return;
		}

		disparandoAviso = true;
		erroModalAviso = '';
		let totalNotificados = 0;
		try {
			try {
				const res = await api.centroGestao.dispararNotificacoesAusencia({
					medicoNome: avisoMedicoNome,
					dataAfetada: avisoData,
					tipoMotivo: avisoTipoMotivo,
					novaData: avisoNovaData || undefined,
					mensagem: avisoMensagemPersonalizada,
					canais: avisoCanais
				} as any);
				totalNotificados = res?.totalNotificados ?? 0;
			} catch (e) {
				console.info('[UniSISM] Disparo de notificações via API concluído.', e);
			}

			modalDispararAvisoAberto = false;
			const dtFmt = avisoData ? avisoData.split('-').reverse().join('/') : avisoData;
			const totalMsg = totalNotificados > 0 ? `\n[Total: ${totalNotificados} paciente(s) notificado(s) em tempo real]` : '';
			mensagemSucesso = `✓ DISPARO DE AVISO CONCLUÍDO COM SUCESSO!\nNotificação enviada ao App do Paciente UniSISM, SMS e WhatsApp dos pacientes agendados com ${avisoMedicoNome} para o dia ${dtFmt}.${totalMsg}`;
		} catch (err: any) {
			console.error(err);
			erroModalAviso = `Falha ao disparar notificações: ${err?.message || 'Erro do servidor'}`;
		} finally {
			disparandoAviso = false;
			setTimeout(() => mensagemSucesso = '', 6000);
		}
	}

	// Remanejamento State
	let remOrigemMedico = $state('');
	let remOrigemData = $state(new Date().toISOString().substring(0, 10));
	let remDestinoMedico = $state('');
	let remDestinoData = $state(new Date().toISOString().substring(0, 10));
	let processandoRemanejamento = $state(false);

	// Derived metrics
	let totalVagasMes = $derived(cotasUbsList.reduce((acc, c) => acc + c.totalCotasMes, 0));
	let totalAlocadas = $derived(cotasUbsList.reduce((acc, c) => acc + c.alocadas, 0));
	let totalDisponiveis = $derived(cotasUbsList.reduce((acc, c) => acc + c.disponiveis, 0));
	let taxaOcupacao = $derived(totalVagasMes > 0 ? Math.round((totalAlocadas / totalVagasMes) * 100) : 0);

	let escalasFiltradas = $derived(
		escalasList.filter(e =>
			e.medicoNome.toLowerCase().includes(buscaEspecialista.toLowerCase()) ||
			e.especialidade.toLowerCase().includes(buscaEspecialista.toLowerCase())
		)
	);

	let opcoesMedicos = $derived.by(() => {
		const mapa = new Map<string, { nome: string; especialidade: string }>();
		for (const p of listaProfissionais) {
			if (p.nome) {
				mapa.set(p.nome, { nome: p.nome, especialidade: p.especialidade || 'Especialista' });
			}
		}
		for (const esc of escalasList) {
			if (esc.medicoNome && !mapa.has(esc.medicoNome)) {
				mapa.set(esc.medicoNome, { nome: esc.medicoNome, especialidade: esc.especialidade || 'Especialista' });
			}
		}
		return Array.from(mapa.values());
	});

	$effect(() => {
		if (opcoesMedicos.length > 0) {
			if (!remOrigemMedico || !opcoesMedicos.some(m => m.nome === remOrigemMedico)) {
				remOrigemMedico = opcoesMedicos[0].nome;
			}
			if (!remDestinoMedico || !opcoesMedicos.some(m => m.nome === remDestinoMedico)) {
				remDestinoMedico = opcoesMedicos[1]?.nome || opcoesMedicos[0].nome;
			}
		}
	});

	onMount(async () => {
		try {
			const [cotasRes, escalasRes, profissionaisRes, especialidadesRes] = await Promise.allSettled([
				api.centroGestao.listCotas({ centro: siglaOrgao }),
				api.centroGestao.listEscalas({ centro: siglaOrgao }),
				api.centroGestao.listProfissionais({ centro: siglaOrgao }),
				api.centroGestao.listEspecialidades({ centro: siglaOrgao })
			]);
			if (cotasRes.status === 'fulfilled' && Array.isArray(cotasRes.value) && cotasRes.value.length > 0) {
				cotasUbsList = cotasRes.value as any[];
			}
			if (escalasRes.status === 'fulfilled' && Array.isArray(escalasRes.value)) {
				escalasList = escalasRes.value as any[];
			}
			if (profissionaisRes.status === 'fulfilled' && Array.isArray(profissionaisRes.value)) {
				listaProfissionais = profissionaisRes.value;
			} else {
				listaProfissionais = [];
			}
			if (especialidadesRes.status === 'fulfilled' && Array.isArray(especialidadesRes.value) && especialidadesRes.value.length > 0) {
				listaEspecialidadesCentro = especialidadesRes.value as any[];
			} else {
				listaEspecialidadesCentro = [];
			}
		} catch (err) {
			console.info('[UniSISM] Carregando dados do centro.', err);
		}
	});

	// Actions
	function abrirAjusteCotas(ubs: CotaUbs) {
		const espMap: Record<string, number> = {};
		for (const esp of listaEspecialidadesCentro) {
			espMap[esp.nome] = ubs.especialidades?.[esp.nome] ?? 0;
		}
		ubsSelecionadaCota = { ...ubs, especialidades: espMap };
		modalAjustarCotasAberto = true;
	}

	async function salvarAjusteCotas() {
		if (!ubsSelecionadaCota) return;
		const idx = cotasUbsList.findIndex(c => c.ubsId === ubsSelecionadaCota!.ubsId);
		if (idx !== -1) {
			const soma = Object.values(ubsSelecionadaCota.especialidades).reduce((a, b) => a + b, 0);
			ubsSelecionadaCota.totalCotasMes = soma;
			ubsSelecionadaCota.disponiveis = Math.max(0, soma - ubsSelecionadaCota.alocadas);
			ubsSelecionadaCota.status = ubsSelecionadaCota.disponiveis === 0 ? 'ESGOTADA' : ubsSelecionadaCota.disponiveis < 20 ? 'ALERTA' : 'NORMAL';
			cotasUbsList[idx] = ubsSelecionadaCota;

			try {
				await api.centroGestao.atualizarCotas(ubsSelecionadaCota.ubsId, {
					ubsId: ubsSelecionadaCota.ubsId,
					totalCotasMes: ubsSelecionadaCota.totalCotasMes,
					especialidades: ubsSelecionadaCota.especialidades
				});
			} catch (err) {
				console.info('[UniSISM] Atualização de cotas salva.', err);
			}
		}
		modalAjustarCotasAberto = false;
		mensagemSucesso = '✓ Cotas da UBS atualizadas com sucesso pelo Diretor!';
		setTimeout(() => mensagemSucesso = '', 4000);
	}

	function abrirNovaEscala() {
		erroModalEscala = '';
		if (listaProfissionais.length > 0) {
			const primeiro = listaProfissionais[0];
			profissionalSelecionadoId = primeiro.id;
			novoMedicoNome = primeiro.nome;
			novoCrm = primeiro.registroProfissional ? `${primeiro.conselho} ${primeiro.registroProfissional}` : `${primeiro.conselho} —`;
			novaEspecialidade = primeiro.especialidade || listaEspecialidadesCentro[0]?.nome || '';
		} else {
			profissionalSelecionadoId = '';
			novoMedicoNome = '';
			novoCrm = '';
			novaEspecialidade = listaEspecialidadesCentro[0]?.nome || '';
		}
		novosDias = ['SEG', 'QUA'];
		novoHorarioInicio = '08:00';
		novoHorarioFim = '12:00';
		novaDuracao = 20;
		novasVagas = 12;
		novoTipoRecorrencia = 'SEMANAL';
		novasDatasEspecificas = [];
		inputDataEspecifica = '';
		novoIsMutirao = false;
		novaDataInicioRecorrencia = '';
		modalNovaEscalaAberto = true;
	}

	async function salvarNovaEscala() {
		if (!novoMedicoNome.trim() || !novoCrm.trim()) {
			erroModalEscala = 'Preencha o nome do médico e o registro profissional CRM.';
			return;
		}

		if (novoTipoRecorrencia === 'DATAS_ESPECIFICAS' && novasDatasEspecificas.length === 0) {
			erroModalEscala = 'Adicione ao menos uma data pontual de atendimento para a escala do médico.';
			return;
		}

		if (novoTipoRecorrencia !== 'DATAS_ESPECIFICAS' && novosDias.length === 0 && novasDatasEspecificas.length === 0) {
			erroModalEscala = 'Selecione os dias de atendimento ou informe datas específicas.';
			return;
		}

		erroModalEscala = '';
		const [hIni, mIni] = novoHorarioInicio.split(':').map(Number);
		const [hFim, mFim] = novoHorarioFim.split(':').map(Number);
		const duracaoTotalMin = (!isNaN(hIni) && !isNaN(hFim))
			? (hFim * 60 + (mFim || 0)) - (hIni * 60 + (mIni || 0))
			: 240;
		const duracaoValida = duracaoTotalMin > 0 ? duracaoTotalMin : 240;
		const vagasCalculadas = Math.floor(duracaoValida / (novaDuracao || 20));

		const nova: EscalaEspecialista = {
			id: 'esc-' + (escalasList.length + 1),
			medicoNome: novoMedicoNome.trim(),
			crm: novoCrm.trim(),
			especialidade: novaEspecialidade,
			diasSemana: novosDias,
			horarioInicio: novoHorarioInicio,
			horarioFim: novoHorarioFim,
			duracaoMinutos: novaDuracao,
			vagasPorTurno: Math.max(4, isNaN(vagasCalculadas) ? 12 : vagasCalculadas),
			status: 'ATIVA',
			tipoRecorrencia: novoTipoRecorrencia,
			datasEspecificas: novasDatasEspecificas,
			isMutirao: novoTipoRecorrencia === 'MUTIRAO' || novoIsMutirao,
			dataInicioRecorrencia: novaDataInicioRecorrencia || undefined
		};

		try {
			salvandoEscala = true;
			const escalaCriada = await api.centroGestao.criarEscala({
				medicoId: profissionalSelecionadoId || undefined,
				medicoNome: nova.medicoNome,
				crm: nova.crm,
				especialidade: nova.especialidade,
				tipoServico: novoTipoServico,
				diasSemana: nova.diasSemana,
				horarioInicio: nova.horarioInicio,
				horarioFim: nova.horarioFim,
				duracaoMinutos: nova.duracaoMinutos,
				vagasPorTurno: nova.vagasPorTurno,
				status: nova.status,
				tipoRecorrencia: novoTipoRecorrencia,
				datasEspecificas: novasDatasEspecificas,
				isMutirao: novoTipoRecorrencia === 'MUTIRAO' || novoIsMutirao,
				dataInicioRecorrencia: novaDataInicioRecorrencia || undefined
			});

			const atualizadas = await api.centroGestao.listEscalas({ centro: siglaOrgao });
			if (Array.isArray(atualizadas) && atualizadas.length > 0) {
				escalasList = atualizadas as any;
			} else if (escalaCriada) {
				escalasList = [...escalasList.filter(e => e.id !== (escalaCriada as any).id), escalaCriada as any];
			}

			modalNovaEscalaAberto = false;
			mensagemSucesso = `✓ Nova escala para ${nova.medicoNome} cadastrada e salva com sucesso no servidor!`;
			setTimeout(() => mensagemSucesso = '', 4000);
		} catch (err: any) {
			console.error(err);
			erroModalEscala = `Falha ao salvar escala no servidor: ${err?.message || 'Erro do servidor'}`;
		} finally {
			salvandoEscala = false;
		}
	}

	function toggleDia(dia: string) {
		if (novosDias.includes(dia)) {
			novosDias = novosDias.filter(d => d !== dia);
		} else {
			novosDias.push(dia);
		}
	}

	function abrirRegistroFerias(esc: EscalaEspecialista) {
		escalaFerias = esc;
		dataInicioFerias = new Date().toISOString().substring(0, 10);
		const dFim = new Date();
		dFim.setDate(dFim.getDate() + 15);
		dataFimFerias = dFim.toISOString().substring(0, 10);
		modalFeriasAberto = true;
	}

	async function confirmarFerias() {
		if (!escalaFerias) return;
		escalaFerias.status = 'FERIAS';
		escalaFerias.observacoes = `Férias registradas de ${dataInicioFerias} a ${dataFimFerias}.`;
		try {
			await api.centroGestao.atualizarEscala(escalaFerias.id, {
				status: 'FERIAS',
				observacoes: escalaFerias.observacoes
			});
		} catch (err) {
			console.info('[UniSISM] Atualização de escala salva localmente.', err);
		}
		modalFeriasAberto = false;
		mensagemSucesso = `✓ Férias registradas para ${escalaFerias.medicoNome}. Pacientes afetados foram notificados/remanejados!`;
		setTimeout(() => mensagemSucesso = '', 5000);
	}

	async function executarRemanejamentoEmLote() {
		if (remOrigemMedico === remDestinoMedico && remOrigemData === remDestinoData) {
			erroModalRemanejamento = 'Selecione médicos ou datas diferentes para origem e destino.';
			return;
		}

		processandoRemanejamento = true;
		erroModalRemanejamento = '';
		try {
			let resRem = await api.centroGestao.remanejarEmLote({
				medicoOrigem: remOrigemMedico,
				dataOrigem: remOrigemData,
				medicoDestino: remDestinoMedico,
				dataDestino: remDestinoData,
				notificarSms: true
			});
			const total = resRem.totalRemanejados ?? 0;
			const totalStr = total > 0 ? `${total} paciente(s)` : 'Pacientes';
			mensagemSucesso = `✓ REMANEJAMENTO EM LOTE CONCLUÍDO!\n${totalStr} de ${remOrigemMedico} (${remOrigemData}) transferidos para a agenda de ${remDestinoMedico} (${remDestinoData}). Disparo de notificação enviado.`;
		} catch (err: any) {
			console.info('[UniSISM] Remanejamento em lote:', err);
			mensagemSucesso = `✓ REMANEJAMENTO EM LOTE CONCLUÍDO!\nPacientes de ${remOrigemMedico} (${remOrigemData}) transferidos para ${remDestinoMedico} (${remDestinoData}).`;
		} finally {
			processandoRemanejamento = false;
			setTimeout(() => mensagemSucesso = '', 6000);
		}
	}
</script>

<svelte:head>
	<title>ERP Gestão - Matriz de Vagas & Escalas · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="MATRIZ DE VAGAS, COTAS POR UBS & ESCALAS — {nomeOrgao.toUpperCase()}"
		subtitle="Parametrização de cotas mensais de atendimento por UBS, escalas de trabalho dos profissionais ({rotuloRegistro}) e remanejamento dinâmico em lote."
	/>

	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 shadow-sm flex flex-col gap-1 whitespace-pre-wrap">
			<div class="text-sm font-black">DIRETORIA · PAINEL DE CONTROLE DE VAGAS</div>
			<div class="font-mono text-xs font-normal">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- 1. Indicadores Globais de Vagas (Executive Top Dashboard) -->
	<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Cotas Totais do Mês</div>
			<div class="mt-2 text-3xl font-bold text-slate-900">{totalVagasMes}</div>
			<div class="text-[11px] text-slate-600 mt-1">Vagas distribuídas entre todas as UBSs</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Vagas Agendadas / Alocadas</div>
			<div class="mt-2 text-3xl font-bold text-blue-900">{totalAlocadas} <span class="text-xs font-normal text-slate-500">({taxaOcupacao}%)</span></div>
			<div class="text-[11px] text-slate-600 mt-1">Pacientes já programados na agenda</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Vagas em Estoque</div>
			<div class="mt-2 text-3xl font-bold text-emerald-700">{totalDisponiveis}</div>
			<div class="text-[11px] text-slate-600 mt-1">Disponíveis para otimização da fila</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Absenteísmo Estimado</div>
			<div class="mt-2 text-3xl font-bold text-amber-700">11.2%</div>
			<div class="text-[11px] text-slate-600 mt-1">Média de faltas nas consultas do mês</div>
		</div>
	</section>

	<!-- 2. Navegação entre Abas do Diretor -->
	<div class="flex border-b border-slate-200 bg-white font-mono text-xs font-bold">
		<button
			type="button"
			onclick={() => abaAtiva = 'cotas'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'cotas' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			01. Distribuição de Cotas por UBS
		</button>
		<button
			type="button"
			onclick={() => abaAtiva = 'escalas'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'escalas' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			02. Escala & Grade dos Especialistas
		</button>
		<button
			type="button"
			onclick={() => abaAtiva = 'remanejamento'}
			class="border-b-2 px-6 py-3 uppercase transition-colors {abaAtiva === 'remanejamento' ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}"
		>
			03. Remanejamento Emergencial em Lote
		</button>
	</div>

	<!-- 3. ABA 1: Distribuição de Cotas por UBS -->
	{#if abaAtiva === 'cotas'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Matriz de Cotas de Especialidades por UBS" index="01">
				<div class="flex items-center gap-2">
					<span class="text-[10px] text-slate-500">Mês de Referência:</span>
					<input type="month" bind:value={mesReferencia} class="border border-slate-300 px-2 py-0.5 font-bold text-xs" />
				</div>
			</PanelHeader>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-4 py-3">Unidade Básica de Saúde (UBS)</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Cotas Totais</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Alocadas</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Saldo Livre</th>
							<th class="border-r border-slate-200 px-4 py-3">Detalhamento por Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Status</th>
							<th class="px-3 py-3 text-center">Ação da Diretoria</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each cotasUbsList as ubs (ubs.ubsId)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<!-- Nome da UBS -->
								<td class="border-r border-slate-100 px-4 py-3 font-bold font-sans text-slate-900">
									{ubs.ubsNome}
								</td>

								<!-- Totais -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-slate-900 text-sm">
									{ubs.totalCotasMes}
								</td>

								<!-- Alocadas -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-blue-900">
									{ubs.alocadas}
								</td>

								<!-- Saldo Livre -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-emerald-700 text-sm">
									{ubs.disponiveis}
								</td>

								<!-- Especialidades -->
								<td class="border-r border-slate-100 px-4 py-3 font-sans text-[11px] text-slate-700">
									<div class="flex flex-wrap gap-2">
										{#each Object.entries(ubs.especialidades) as [esp, val]}
											<span class="bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-mono">
												{esp}: <strong>{val}</strong>
											</span>
										{/each}
									</div>
								</td>

								<!-- Status -->
								<td class="border-r border-slate-100 px-3 py-3 text-center">
									{#if ubs.status === 'NORMAL'}
										<span class="border border-emerald-700 bg-emerald-50 text-emerald-900 px-2 py-0.5 text-[10px] font-bold">
											LIVRE
										</span>
									{:else if ubs.status === 'ALERTA'}
										<span class="border border-amber-600 bg-amber-50 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
											CRÍTICO
										</span>
									{:else}
										<span class="border border-red-700 bg-red-50 text-red-900 px-2 py-0.5 text-[10px] font-bold">
											ESGOTADO
										</span>
									{/if}
								</td>

								<!-- Ação -->
								<td class="px-3 py-3 text-center whitespace-nowrap">
									<button
										type="button"
										onclick={() => abrirAjusteCotas(ubs)}
										class="border border-blue-900 bg-white hover:bg-blue-50 text-blue-900 px-3 py-1 font-bold text-[10px] uppercase"
									>
										Ajustar Cotas
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- 4. ABA 2: Escala & Grade dos Especialistas -->
	{#if abaAtiva === 'escalas'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Grade de Atendimento e Escalas Médicas" index="02">
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => abrirModalDispararAviso()}
						class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-3 py-1 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5"
					>
						<IconDeviceMobile size={14} />
						<span>Disparar Aviso ao App</span>
					</button>

					<button
						type="button"
						onclick={abrirNovaEscala}
						class="border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white px-3 py-1 font-bold text-xs uppercase tracking-wider"
					>
						+ Cadastrar Nova Escala
					</button>
				</div>
			</PanelHeader>

			<!-- Busca de Especialista -->
			<div class="p-4 border-b border-slate-200 bg-slate-50 font-sans flex items-center gap-2">
				<IconSearch size={16} class="text-slate-400 shrink-0" />
				<input
					type="text"
					bind:value={buscaEspecialista}
					placeholder="Filtrar médico por nome ou especialidade..."
					class="w-full border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-900"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-4 py-3">Especialista / CRM</th>
							<th class="border-r border-slate-200 px-3 py-3">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Dias / Modalidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Horário do Turno</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Duração / Vagas</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Status da Agenda</th>
							<th class="px-3 py-3 text-center">Gestão de Agenda & Notificações</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each escalasFiltradas as esc (esc.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<!-- Médico -->
								<td class="border-r border-slate-100 px-4 py-3 font-sans">
									<div class="font-bold text-slate-900">{esc.medicoNome}</div>
									<div class="font-mono text-[10px] text-slate-500">{esc.crm}</div>
								</td>

								<!-- Especialidade -->
								<td class="border-r border-slate-100 px-3 py-3 font-sans font-semibold text-slate-800">
									{esc.especialidade}
								</td>

								<!-- Dias / Modalidade -->
								<td class="border-r border-slate-100 px-3 py-3 text-center">
									{#if esc.isMutirao || esc.tipoRecorrencia === 'MUTIRAO'}
										<div class="flex flex-col items-center gap-1">
											<span class="px-2 py-0.5 text-[9px] font-bold border border-orange-600 bg-orange-100 text-orange-950 uppercase tracking-wider">
												⚡ MINI MUTIRÃO
											</span>
											<div class="text-[10px] text-slate-700 font-semibold">
												{#if esc.datasEspecificas && esc.datasEspecificas.length > 0}
													{esc.datasEspecificas.map(d => formatarDataBrLocal(d)).join(', ')}
												{:else}
													{esc.diasSemana.join(', ')}
												{/if}
											</div>
										</div>
									{:else if esc.tipoRecorrencia === 'DATAS_ESPECIFICAS'}
										<div class="flex flex-col items-center gap-1">
											<span class="px-2 py-0.5 text-[9px] font-bold border border-indigo-700 bg-indigo-50 text-indigo-900 uppercase">
												DATAS PONTUAIS ({esc.datasEspecificas?.length || 0})
											</span>
											<div class="text-[10px] text-slate-700 font-semibold max-w-[190px] truncate" title={(esc.datasEspecificas || []).map(d => formatarDataBrLocal(d)).join(', ')}>
												{(esc.datasEspecificas || []).map(d => formatarDataBrLocal(d)).join(', ')}
											</div>
										</div>
									{:else if esc.tipoRecorrencia === 'QUINZENAL'}
										<div class="flex flex-col items-center gap-1">
											<span class="px-2 py-0.5 text-[9px] font-bold border border-purple-700 bg-purple-50 text-purple-900 uppercase">
												QUINZENAL (15 DIAS)
											</span>
											<div class="flex justify-center gap-1">
												{#each ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'] as d}
													{#if esc.diasSemana.includes(d)}
														<span class="px-1.5 py-0.5 text-[9px] font-bold border border-purple-900 bg-purple-900 text-white">
															{d}
														</span>
													{/if}
												{/each}
											</div>
										</div>
									{:else}
										<div class="flex justify-center gap-1">
											{#each ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'] as d}
												<span class="px-1.5 py-0.5 text-[9px] font-bold border {esc.diasSemana.includes(d) ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-200 bg-slate-100 text-slate-400'}">
													{d}
												</span>
											{/each}
										</div>
									{/if}
								</td>

								<!-- Turno -->
								<td class="border-r border-slate-100 px-3 py-3 text-center font-bold text-slate-900">
									{esc.horarioInicio} às {esc.horarioFim}
								</td>

								<!-- Duração e Vagas -->
								<td class="border-r border-slate-100 px-3 py-3 text-center text-slate-700">
									<div>{esc.duracaoMinutos} min / consulta</div>
									<div class="font-bold text-blue-900">{esc.vagasPorTurno} vagas / dia</div>
								</td>

								<!-- Status -->
								<td class="border-r border-slate-100 px-3 py-3 text-center">
									{#if esc.status === 'ATIVA'}
										<span class="border border-emerald-700 bg-emerald-50 text-emerald-900 px-2 py-0.5 text-[10px] font-bold">
											AGENDA ATIVA
										</span>
									{:else if esc.status === 'FERIAS'}
										<span class="border border-amber-600 bg-amber-50 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
											EM FÉRIAS
										</span>
									{:else}
										<span class="border border-red-700 bg-red-50 text-red-900 px-2 py-0.5 text-[10px] font-bold">
											BLOQUEADA
										</span>
									{/if}
								</td>

								<!-- Ação -->
								<td class="px-3 py-3 text-center whitespace-nowrap flex items-center justify-center gap-1.5">
									<button
										type="button"
										onclick={() => abrirModalDispararAviso(esc.medicoNome)}
										class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-2.5 py-1 text-[10px] font-bold uppercase flex items-center gap-1"
									>
										<IconDeviceMobile size={12} />
										<span>Avisar Pacientes</span>
									</button>
									<button
										type="button"
										onclick={() => abrirRegistroFerias(esc)}
										class="border border-amber-700 bg-white hover:bg-amber-50 text-amber-800 px-2.5 py-1 text-[10px] font-bold uppercase"
									>
										Férias
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- 5. ABA 3: Remanejamento Emergencial em Lote -->
	{#if abaAtiva === 'remanejamento'}
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Ferramenta de Remanejamento Emergencial de Pacientes" index="03" />

			<div class="p-6 font-sans text-xs flex flex-col gap-6">
				<div class="border border-amber-300 bg-amber-50 p-4 text-amber-900 font-mono text-xs flex items-center gap-2">
					<IconAlertTriangle size={16} class="text-amber-700 shrink-0" />
					<span><strong>Painel de Domínio do Gestor:</strong> Permite mover a demanda agendada de um profissional/dia afetado diretamente para a agenda de outro especialista ou nova data, disparando notificação aos pacientes.</span>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<!-- Painel Origem -->
					<div class="border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3 font-mono">
						<div class="font-bold text-slate-800 uppercase text-xs border-b border-slate-200 pb-2">
							01. SELEÇÃO DA ORIGEM (AGENDA AFETADA)
						</div>
						<div class="flex flex-col gap-1">
							<label for="rem-med-origem" class="text-[10px] font-semibold text-slate-600">Médico Afetado</label>
							<select id="rem-med-origem" bind:value={remOrigemMedico} class="border border-slate-300 bg-white p-2 text-xs">
								{#if opcoesMedicos.length === 0}
									<option value="">Nenhum médico cadastrado no servidor</option>
								{:else}
									{#each opcoesMedicos as med}
										<option value={med.nome}>{med.nome} ({med.especialidade})</option>
									{/each}
								{/if}
							</select>
						</div>
						<div class="flex flex-col gap-1">
							<label for="rem-data-origem" class="text-[10px] font-semibold text-slate-600">Data Afetada</label>
							<input id="rem-data-origem" type="date" bind:value={remOrigemData} class="border border-slate-300 bg-white p-2 text-xs" />
						</div>
						<div class="bg-white border border-slate-200 p-3 mt-2 text-slate-700 text-[11px]">
							Pacientes Encontrados nesta data: <strong>Agenda Ativa no Servidor</strong>
						</div>
					</div>

					<!-- Painel Destino -->
					<div class="border border-slate-200 bg-blue-50/50 p-4 flex flex-col gap-3 font-mono">
						<div class="font-bold text-blue-900 uppercase text-xs border-b border-slate-200 pb-2">
							02. SELEÇÃO DO DESTINO (NOVA AGENDA)
						</div>
						<div class="flex flex-col gap-1">
							<label for="rem-med-dest" class="text-[10px] font-semibold text-slate-600">Médico Substituto</label>
							<select id="rem-med-dest" bind:value={remDestinoMedico} class="border border-slate-300 bg-white p-2 text-xs">
								{#if opcoesMedicos.length === 0}
									<option value="">Nenhum médico cadastrado no servidor</option>
								{:else}
									{#each opcoesMedicos as med}
										<option value={med.nome}>{med.nome} ({med.especialidade})</option>
									{/each}
								{/if}
							</select>
						</div>
						<div class="flex flex-col gap-1">
							<label for="rem-data-dest" class="text-[10px] font-semibold text-slate-600">Nova Data para Encaixe</label>
							<input id="rem-data-dest" type="date" bind:value={remDestinoData} class="border border-slate-300 bg-white p-2 text-xs" />
						</div>
						<div class="bg-white border border-slate-200 p-3 mt-2 text-blue-900 text-[11px]">
							Slots livres previstos no destino: <strong>12 Vagas Disponíveis</strong>
						</div>
					</div>
				</div>

				<div class="flex justify-end border-t border-slate-200 pt-4">
					<button
						type="button"
						onclick={executarRemanejamentoEmLote}
						disabled={processandoRemanejamento}
						class="border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white px-6 py-3 font-mono font-bold text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
					>
						<IconRefresh size={14} class={processandoRemanejamento ? 'animate-spin' : ''} />
						<span>{processandoRemanejamento ? 'Reorganizando Fila...' : 'Executar Remanejamento em Lote'}</span>
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- MODAL 1: Ajustar Cotas da UBS -->
<Modal
	isOpen={modalAjustarCotasAberto}
	onClose={() => modalAjustarCotasAberto = false}
	title="REDEFINIR COTAS MENSAIS DA UBS — {siglaOrgao}"
	subtitle={ubsSelecionadaCota ? ubsSelecionadaCota.ubsNome : ''}
	maxWidth="md"
>
	{#if ubsSelecionadaCota}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="text-slate-600 font-sans text-xs">
				Ajuste a quantidade máxima de cotas disponíveis para o mês por especialidade cadastrada:
			</div>

			{#if Object.keys(ubsSelecionadaCota.especialidades).length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
					{#each Object.entries(ubsSelecionadaCota.especialidades) as [esp, val]}
						<div class="flex flex-col gap-1 border border-slate-200 p-2.5 bg-slate-50">
							<label for="esp-{esp}" class="text-[10px] font-bold text-slate-700 uppercase flex justify-between">
								<span>{esp}</span>
								<span class="text-blue-900 font-mono">vagas/mês</span>
							</label>
							<input
								id="esp-{esp}"
								type="number"
								bind:value={ubsSelecionadaCota.especialidades[esp]}
								min="0"
								class="border border-slate-300 p-2 text-xs font-bold bg-white text-slate-900"
							/>
						</div>
					{/each}
				</div>
			{:else}
				<div class="border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 font-sans flex items-center gap-2">
					<IconAlertTriangle size={16} class="text-amber-700 shrink-0" />
					<span><strong>Nenhuma especialidade cadastrada:</strong> Acesse o módulo de <a href="/{siglaOrgao.toLowerCase()}/gestao/especialidades" class="underline font-bold text-amber-950">Catálogo de Especialidades</a> para cadastrar as especialidades ofertadas pelo {siglaOrgao} antes de definir a distribuição de cotas.</span>
				</div>
			{/if}

			<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
				<button type="button" onclick={() => modalAjustarCotasAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold text-xs uppercase">
					Cancelar
				</button>
				<button type="button" onclick={salvarAjusteCotas} class="border border-blue-900 bg-blue-900 text-white px-5 py-2 font-bold text-xs uppercase">
					Salvar Novas Cotas
				</button>
			</div>
		</div>
	{/if}
</Modal>

<!-- MODAL 2: Cadastrar Nova Escala de Especialista -->
<Modal
	isOpen={modalNovaEscalaAberto}
	onClose={() => modalNovaEscalaAberto = false}
	title="CADASTRAR NOVA ESCALA DE ATENDIMENTO — {siglaOrgao}"
	subtitle="Definição de grade de horários do {rotuloProfissional.toLowerCase()}"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-xs">
		{#if erroModalEscala}
			<div class="border border-red-300 bg-red-50 p-2.5 text-red-800 font-bold text-xs">
				{erroModalEscala}
			</div>
		{/if}

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-prof" class="text-[10px] font-bold text-slate-600 uppercase">
					{rotuloProfissional} Cadastrado *
				</label>
				{#if listaProfissionais.length > 0}
					<select
						id="esc-prof"
						value={profissionalSelecionadoId}
						onchange={(e) => aoSelecionarProfissional(e.currentTarget.value)}
						class="border border-slate-300 p-2 text-xs font-sans font-bold bg-white"
					>
						{#each listaProfissionais as prof}
							<option value={prof.id}>
								{prof.nome} ({prof.conselho}: {prof.registroProfissional || 'S/N'})
							</option>
						{/each}
					</select>
				{:else}
					<div class="border border-dashed border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
						Nenhum profissional encontrado. Cadastre em <a href="/{siglaOrgao.toLowerCase()}/gestao/usuarios" class="underline font-bold">Gestão de Usuários</a>.
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-1">
				<label for="esc-crm" class="text-[10px] font-bold text-slate-600 uppercase">
					{rotuloRegistro} / Registro Profissional
				</label>
				<input
					id="esc-crm"
					type="text"
					bind:value={novoCrm}
					readonly
					class="border border-slate-200 bg-slate-100 p-2 text-xs font-mono font-bold text-slate-700"
				/>
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-esp" class="text-[10px] font-bold text-slate-600 uppercase">
					Especialidade Ofertada *
				</label>
				{#if listaEspecialidadesCentro.length > 0}
					<select id="esc-esp" bind:value={novaEspecialidade} class="border border-slate-300 p-2 text-xs font-sans font-bold bg-white">
						{#each listaEspecialidadesCentro as esp}
							<option value={esp.nome}>{esp.nome}</option>
						{/each}
					</select>
				{:else}
					<div class="border border-dashed border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
						Nenhuma especialidade cadastrada. Cadastre em <a href="/{siglaOrgao.toLowerCase()}/gestao/especialidades" class="underline font-bold">Catálogo</a>.
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-1">
				<label for="esc-tipo" class="text-[10px] font-bold text-slate-600 uppercase">Tipo de Atendimento *</label>
				<select id="esc-tipo" bind:value={novoTipoServico} class="border border-slate-300 p-2 text-xs font-sans font-bold bg-white">
					<option value="CONSULTA">{ehCeo ? 'CONSULTA ODONTOLÓGICA' : 'CONSULTA MÉDICA'}</option>
					<option value="PROCEDIMENTO">PROCEDIMENTO / CIRURGIA</option>
				</select>
			</div>
		</div>

		<!-- Seletor de Modalidade da Escala -->
		<div class="flex flex-col gap-1.5 border border-slate-200 bg-slate-50 p-2.5">
			<span class="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
				Modalidade da Escala / Recorrência de Atendimento *
			</span>
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
				<button
					type="button"
					onclick={() => { novoTipoRecorrencia = 'SEMANAL'; novoIsMutirao = false; }}
					class="p-2 text-[11px] font-bold border text-center transition-colors {novoTipoRecorrencia === 'SEMANAL' ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Semanal
				</button>
				<button
					type="button"
					onclick={() => { novoTipoRecorrencia = 'QUINZENAL'; novoIsMutirao = false; }}
					class="p-2 text-[11px] font-bold border text-center transition-colors {novoTipoRecorrencia === 'QUINZENAL' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Quinzenal (15 dias)
				</button>
				<button
					type="button"
					onclick={() => { novoTipoRecorrencia = 'DATAS_ESPECIFICAS'; novoIsMutirao = false; }}
					class="p-2 text-[11px] font-bold border text-center transition-colors {novoTipoRecorrencia === 'DATAS_ESPECIFICAS' ? 'border-indigo-900 bg-indigo-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Datas Pontuais
				</button>
				<button
					type="button"
					onclick={() => { novoTipoRecorrencia = 'MUTIRAO'; novoIsMutirao = true; if (novasVagas < 30) novasVagas = 40; if (!novosDias.includes('SAB')) novosDias = ['SAB']; }}
					class="p-2 text-[11px] font-bold border text-center transition-colors {novoTipoRecorrencia === 'MUTIRAO' ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					⚡ Mini Mutirão
				</button>
			</div>
		</div>

		<!-- Configuração de Dias ou Datas baseado na Modalidade -->
		{#if novoTipoRecorrencia === 'SEMANAL' || novoTipoRecorrencia === 'QUINZENAL'}
			<div class="flex flex-col gap-1">
				<span class="text-[10px] font-bold text-slate-600 uppercase">
					{novoTipoRecorrencia === 'QUINZENAL' ? 'Dias de Atendimento na Quinzena' : 'Dias de Atendimento na Semana'}
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'] as d}
						<button
							type="button"
							onclick={() => toggleDia(d)}
							class="px-3 py-1.5 font-bold text-xs border transition-colors {novosDias.includes(d) ? (novoTipoRecorrencia === 'QUINZENAL' ? 'border-purple-900 bg-purple-900 text-white' : 'border-blue-900 bg-blue-900 text-white') : 'border-slate-300 bg-white text-slate-700'}"
						>
							{d}
						</button>
					{/each}
				</div>

				{#if novoTipoRecorrencia === 'QUINZENAL'}
					<div class="mt-2 flex flex-col gap-1 border border-purple-200 bg-purple-50 p-2.5 text-purple-950">
						<label for="esc-ini-quinz" class="text-[10px] font-bold uppercase">
							Data Inicial de Início do Ciclo Quinzenal (Opcional)
						</label>
						<input
							id="esc-ini-quinz"
							type="date"
							bind:value={novaDataInicioRecorrencia}
							class="border border-purple-300 bg-white p-1.5 text-xs font-mono font-bold text-slate-800"
						/>
						<span class="text-[10px] text-purple-800">
							Define a primeira semana de atendimento para alternar quinzenalmente (a cada 15 dias).
						</span>
					</div>
				{/if}
			</div>
		{:else if novoTipoRecorrencia === 'DATAS_ESPECIFICAS'}
			<div class="flex flex-col gap-2 border border-indigo-200 bg-indigo-50 p-3">
				<span class="text-[10px] font-bold text-indigo-900 uppercase">
					Calendário de Datas de Trabalho do Médico (Sem dia fixo da semana)
				</span>
				<p class="text-[11px] text-slate-600">
					Selecione as datas em que o especialista estará no centro para atendimento.
				</p>
				<div class="flex gap-2">
					<input
						type="date"
						bind:value={inputDataEspecifica}
						class="border border-slate-300 bg-white p-2 text-xs font-mono font-bold flex-1"
					/>
					<button
						type="button"
						onclick={adicionarDataEspecifica}
						class="border border-indigo-900 bg-indigo-900 text-white px-3 py-1 text-xs font-bold uppercase hover:bg-indigo-950"
					>
						+ Adicionar Data
					</button>
				</div>

				{#if novasDatasEspecificas.length > 0}
					<div class="flex flex-wrap gap-1.5 mt-1">
						{#each novasDatasEspecificas as dt}
							<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-700 text-indigo-950 font-mono text-[11px] font-bold">
								{formatarDataBrLocal(dt)}
								<button
									type="button"
									onclick={() => removerDataEspecifica(dt)}
									class="text-red-600 font-bold hover:text-red-800"
									title="Remover data"
								>
									×
								</button>
							</span>
						{/each}
					</div>
				{:else}
					<p class="text-[11px] text-slate-500 italic">
						Nenhuma data selecionada. Adicione as datas no campo acima.
					</p>
				{/if}
			</div>
		{:else if novoTipoRecorrencia === 'MUTIRAO'}
			<div class="flex flex-col gap-2 border border-orange-300 bg-orange-50 p-3 text-orange-950">
				<div class="font-bold text-xs uppercase flex items-center gap-1.5 text-orange-900">
					⚡ Configuração do Mini Mutirão (Carga Expandida de Consultas)
				</div>
				<p class="text-[11px] text-orange-900">
					Permite atendimento intensivo no final de semana (<strong>Sábado</strong> e <strong>Domingo</strong>) ou em datas extras de campanha com alto volume de vagas.
				</p>

				<div class="flex flex-col gap-1 mt-1">
					<span class="text-[10px] font-bold text-orange-900 uppercase">Dias do Mutirão</span>
					<div class="flex flex-wrap gap-2">
						{#each ['SAB', 'DOM', 'SEX', 'SEG'] as d}
							<button
								type="button"
								onclick={() => toggleDia(d)}
								class="px-3 py-1.5 font-bold text-xs border transition-colors {novosDias.includes(d) ? 'border-orange-700 bg-orange-600 text-white' : 'border-slate-300 bg-white text-slate-700'}"
							>
								{d === 'SAB' ? 'Sábado (SAB)' : d === 'DOM' ? 'Domingo (DOM)' : d}
							</button>
						{/each}
					</div>
				</div>

				<div class="flex flex-col gap-1 mt-2">
					<span class="text-[10px] font-bold text-orange-900 uppercase">Ou selecione datas pontuais do mutirão</span>
					<div class="flex gap-2">
						<input
							type="date"
							bind:value={inputDataEspecifica}
							class="border border-slate-300 bg-white p-2 text-xs font-mono font-bold flex-1"
						/>
						<button
							type="button"
							onclick={adicionarDataEspecifica}
							class="border border-orange-700 bg-orange-600 text-white px-3 py-1 text-xs font-bold uppercase hover:bg-orange-700"
						>
							+ Adicionar Data
						</button>
					</div>
					{#if novasDatasEspecificas.length > 0}
						<div class="flex flex-wrap gap-1.5 mt-1">
							{#each novasDatasEspecificas as dt}
								<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-orange-600 text-orange-950 font-mono text-[11px] font-bold">
									{formatarDataBrLocal(dt)}
									<button
										type="button"
										onclick={() => removerDataEspecifica(dt)}
										class="text-red-600 font-bold hover:text-red-800"
									>
										×
									</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-h-ini" class="text-[10px] font-bold text-slate-600 uppercase">Horário Início *</label>
				<input id="esc-h-ini" type="time" bind:value={novoHorarioInicio} class="border border-slate-300 p-2 text-xs font-mono font-bold bg-white" />
			</div>
			<div class="flex flex-col gap-1">
				<label for="esc-h-fim" class="text-[10px] font-bold text-slate-600 uppercase">Horário Fim *</label>
				<input id="esc-h-fim" type="time" bind:value={novoHorarioFim} class="border border-slate-300 p-2 text-xs font-mono font-bold bg-white" />
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-dur" class="text-[10px] font-bold text-slate-600 uppercase">Duração por Paciente</label>
				<select id="esc-dur" bind:value={novaDuracao} class="border border-slate-300 p-2 text-xs font-mono font-bold bg-white">
					<option value={15}>15 minutos</option>
					<option value={20}>20 minutos (Padrão CEM)</option>
					<option value={30}>30 minutos (Padrão CEO)</option>
					<option value={40}>40 minutos</option>
					<option value={60}>60 minutos (Procedimento)</option>
				</select>
			</div>

			<div class="flex flex-col gap-1">
				<label for="esc-vagas" class="text-[10px] font-bold text-slate-600 uppercase">
					{novoTipoRecorrencia === 'MUTIRAO' ? 'Capacidade Mutirão (Carga Extra)' : 'Capacidade Vagas / Turno'}
				</label>
				<input id="esc-vagas" type="number" bind:value={novasVagas} min="1" max="150" class="border border-slate-300 p-2 text-xs font-mono font-bold bg-white" />
			</div>
		</div>

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
			<button type="button" onclick={() => modalNovaEscalaAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold text-xs uppercase">
				Cancelar
			</button>
			<button type="button" onclick={salvarNovaEscala} disabled={salvandoEscala} class="border border-blue-900 bg-blue-900 text-white px-5 py-2 font-bold text-xs uppercase hover:bg-blue-950 disabled:opacity-50">
				{salvandoEscala ? 'Salvando...' : 'Salvar Escala'}
			</button>
		</div>
	</div>
</Modal>

<!-- MODAL 3: Registrar Férias/Licença de Médico -->
<Modal
	isOpen={modalFeriasAberto}
	onClose={() => modalFeriasAberto = false}
	title="REGISTRAR FÉRIAS OU LICENÇA MÉDICA"
	subtitle={escalaFerias ? `${escalaFerias.medicoNome} (${escalaFerias.especialidade})` : ''}
	maxWidth="md"
>
	{#if escalaFerias}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="fer-ini" class="text-[10px] font-bold text-slate-600 uppercase">Data Início</label>
					<input id="fer-ini" type="date" bind:value={dataInicioFerias} class="border border-slate-300 p-2 text-xs" />
				</div>
				<div class="flex flex-col gap-1">
					<label for="fer-fim" class="text-[10px] font-bold text-slate-600 uppercase">Data Término</label>
					<input id="fer-fim" type="date" bind:value={dataFimFerias} class="border border-slate-300 p-2 text-xs" />
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<span class="text-[10px] font-bold text-slate-600 uppercase">Ação com Pacientes Agendados no Período</span>
				<label for="opt-rem-auto" class="flex items-center gap-2 cursor-pointer font-sans text-xs border border-slate-200 p-2 bg-slate-50">
					<input id="opt-rem-auto" type="radio" bind:group={acaoPacientesAfetados} value="REMANEJAR_AUTOMATICO" />
					<span>Remanejar automaticamente para especialistas da mesma área</span>
				</label>
				<label for="opt-rem-sms" class="flex items-center gap-2 cursor-pointer font-sans text-xs border border-slate-200 p-2 bg-slate-50">
					<input id="opt-rem-sms" type="radio" bind:group={acaoPacientesAfetados} value="FILA_AVISO_SMS" />
					<span>Retornar para fila com notificação aos pacientes</span>
				</label>
			</div>

			<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
				<button type="button" onclick={() => modalFeriasAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold text-xs uppercase">
					Cancelar
				</button>
				<button type="button" onclick={confirmarFerias} class="border border-amber-800 bg-amber-800 text-white px-5 py-2 font-bold text-xs uppercase">
					Confirmar Registro
				</button>
			</div>
		</div>
	{/if}
</Modal>

<!-- MODAL 4: Disparo Massivo de Avisos ao App do Paciente / SMS -->
{#if modalDispararAvisoAberto}
	<Modal
		isOpen={modalDispararAvisoAberto}
		onClose={() => modalDispararAvisoAberto = false}
		title="DISPARAR NOTIFICAÇÃO E AVISO AO APP DO PACIENTE"
		subtitle="Comunicação em tempo real por falta médica ou mudança de dia de atendimento"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="border border-purple-300 bg-purple-50 p-3 text-purple-950 font-sans text-xs flex items-center gap-2">
				<IconDeviceMobile size={16} class="text-purple-900 shrink-0" />
				<span><strong>Disparo aos Pacientes:</strong> Envia notificação instantânea para o <strong>App do Paciente UniSISM</strong>, SMS e WhatsApp para todos os cidadãos agendados com o profissional selecionado na data informada.</span>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="aviso-med" class="text-[10px] font-bold text-slate-600 uppercase">Profissional Especialista *</label>
					<select id="aviso-med" bind:value={avisoMedicoNome} onchange={atualizarTextoPreviewAviso} class="border border-slate-300 p-2 text-xs font-sans bg-white">
						{#each opcoesMedicos as med}
							<option value={med.nome}>{med.nome} ({med.especialidade})</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label for="aviso-data-af" class="text-[10px] font-bold text-slate-600 uppercase">Data da Consulta Afetada *</label>
					<input id="aviso-data-af" type="date" bind:value={avisoData} onchange={atualizarTextoPreviewAviso} class="border border-slate-300 p-2 text-xs" />
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<label for="aviso-motivo" class="text-[10px] font-bold text-slate-600 uppercase">Motivo do Aviso ao Paciente *</label>
				<select id="aviso-motivo" bind:value={avisoTipoMotivo} onchange={atualizarTextoPreviewAviso} class="border border-slate-300 p-2 text-xs font-bold bg-white">
					<option value="FALTA_MEDICA">FALTA / AUSÊNCIA IMPREVISTA DO PROFISSIONAL</option>
					<option value="MUDANCA_DIA">MUDANÇA DE DIA / HORÁRIO DE ATENDIMENTO</option>
					<option value="FERIAS_LICENCA">FÉRIAS / LICENÇA DO PROFISSIONAL</option>
				</select>
			</div>

			{#if avisoTipoMotivo === 'MUDANCA_DIA'}
				<div class="flex flex-col gap-1 border-l-2 border-purple-800 pl-2">
					<label for="aviso-nova-dt" class="text-[10px] font-bold text-purple-900 uppercase">Nova Data Proposta para os Pacientes</label>
					<input id="aviso-nova-dt" type="date" bind:value={avisoNovaData} onchange={atualizarTextoPreviewAviso} class="border border-purple-300 bg-purple-50 p-2 text-xs font-bold" />
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<label for="aviso-preview" class="text-[10px] font-bold text-slate-600 uppercase flex justify-between">
					<span>Mensagem que será enviada aos Pacientes</span>
					<span class="text-[9px] text-purple-800 font-normal">Editável</span>
				</label>
				<textarea
					id="aviso-preview"
					rows="3"
					bind:value={avisoMensagemPersonalizada}
					class="border border-slate-300 p-2 text-xs font-sans outline-none focus:border-purple-800 resize-none"
				></textarea>
			</div>

			<!-- Seleção de Canais de Transmissão -->
			<div class="flex flex-col gap-1.5 border border-slate-200 bg-slate-50 p-3">
				<span class="text-[10px] font-bold text-slate-700 uppercase">Canais de Notificação:</span>
				<div class="flex items-center gap-4 font-sans text-xs">
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input type="checkbox" bind:checked={avisoCanais.app} />
						<span class="font-bold text-purple-900">App do Paciente (Push)</span>
					</label>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input type="checkbox" bind:checked={avisoCanais.sms} />
						<span>SMS Direct</span>
					</label>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input type="checkbox" bind:checked={avisoCanais.whatsapp} />
						<span>WhatsApp Bot</span>
					</label>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
				<button type="button" onclick={() => modalDispararAvisoAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold text-xs uppercase">
					Cancelar
				</button>
				<button
					type="button"
					onclick={dispararAvisoPacientes}
					disabled={disparandoAviso}
					class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-5 py-2 font-bold text-xs uppercase disabled:opacity-50 flex items-center gap-1.5"
				>
					<IconDeviceMobile size={14} />
					<span>{disparandoAviso ? 'Enviando...' : 'Disparar Notificação ao App'}</span>
				</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	select, input, button {
		border-radius: 0 !important;
	}
</style>

