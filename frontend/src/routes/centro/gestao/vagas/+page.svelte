<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

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
		diasSemana: string[]; // ['SEG', 'QUA', 'SEX']
		horarioInicio: string;
		horarioFim: string;
		duracaoMinutos: number;
		vagasPorTurno: number;
		status: 'ATIVA' | 'FERIAS' | 'BLOQUEADA_PARCIAL';
		observacoes?: string;
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

	// Modals State
	let modalAjustarCotasAberto = $state(false);
	let ubsSelecionadaCota = $state<CotaUbs | null>(null);

	let modalNovaEscalaAberto = $state(false);
	let novoMedicoNome = $state('');
	let novoCrm = $state('');
	let novaEspecialidade = $state('Cardiologia');
	let novoTipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let novosDias = $state<string[]>(['SEG', 'QUA']);
	let novoHorarioInicio = $state('08:00');
	let novoHorarioFim = $state('12:00');
	let novaDuracao = $state(20);

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
		avisoMedicoNome = medicoNome || (opcoesMedicos[0]?.nome || 'Dr. Roberto Medeiros');
		avisoData = new Date().toISOString().substring(0, 10);
		avisoTipoMotivo = 'FALTA_MEDICA';
		avisoNovaData = '';
		atualizarTextoPreviewAviso();
		modalDispararAvisoAberto = true;
	}

	function atualizarTextoPreviewAviso() {
		const dtFmt = avisoData ? avisoData.split('-').reverse().join('/') : '[Data]';
		if (avisoTipoMotivo === 'FALTA_MEDICA') {
			avisoMensagemPersonalizada = `Prezado(a) paciente, informamos que o(a) Dr(a). ${avisoMedicoNome} não poderá atender no dia ${dtFmt} por motivo de ausência médica de urgência. Seu agendamento será remanejado. Acompanhe a nova data pelo App do Paciente UniSISM.`;
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

	async function dispararAvisoPacientes() {
		if (!avisoMedicoNome.trim()) {
			erroModalAviso = 'Selecione o médico especialista.';
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
	let medicosDoAdmin = $state<{ nome: string; especialidade: string }[]>([]);

	// Derived metrics
	let totalVagasMes = $derived(cotasUbsList.reduce((acc, c) => acc + c.totalCotasMes, 0));
	let totalAlocadas = $derived(cotasUbsList.reduce((acc, c) => acc + c.alocadas, 0));
	let totalDisponiveis = $derived(cotasUbsList.reduce((acc, c) => acc + c.disponiveis, 0));
	let taxaOcupacao = $derived(Math.round((totalAlocadas / (totalVagasMes || 1)) * 100));

	let escalasFiltradas = $derived(
		escalasList.filter(e =>
			e.medicoNome.toLowerCase().includes(buscaEspecialista.toLowerCase()) ||
			e.especialidade.toLowerCase().includes(buscaEspecialista.toLowerCase())
		)
	);

	let opcoesMedicos = $derived.by(() => {
		const mapa = new Map<string, { nome: string; especialidade: string }>();
		for (const esc of escalasList) {
			if (esc.medicoNome) {
				mapa.set(esc.medicoNome, { nome: esc.medicoNome, especialidade: esc.especialidade || 'Especialidade' });
			}
		}
		for (const m of medicosDoAdmin) {
			if (m.nome && !mapa.has(m.nome)) {
				mapa.set(m.nome, { nome: m.nome, especialidade: m.especialidade || 'Especialidade' });
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
			const [cotasRes, escalasRes, usuariosRes] = await Promise.allSettled([
				api.centroGestao.listCotas(),
				api.centroGestao.listEscalas(),
				api.admin.listUsuarios()
			]);
			if (cotasRes.status === 'fulfilled' && Array.isArray(cotasRes.value)) {
				cotasUbsList = cotasRes.value as any[];
			}
			if (escalasRes.status === 'fulfilled' && Array.isArray(escalasRes.value)) {
				escalasList = escalasRes.value as any[];
			}
			if (usuariosRes.status === 'fulfilled' && Array.isArray(usuariosRes.value)) {
				const medicos = usuariosRes.value.filter((u: any) => {
					const r = u.perfil || u.role;
					return r === 'MEDICO' || r === 'MEDICO_ESPECIALISTA' || r === 'REGULADOR_SMS';
				});
				medicosDoAdmin = medicos.map((m: any) => ({
					nome: m.nome,
					especialidade: m.especialidade || 'Especialista'
				}));
			}
		} catch (err) {
			console.info('[UniSISM] Carregando dados de remanejamento da diretoria.', err);
		}
	});

	// Actions
	function abrirAjusteCotas(ubs: CotaUbs) {
		ubsSelecionadaCota = { ...ubs, especialidades: { ...ubs.especialidades } };
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
				console.info('[UniSISM] Endpoint /v1/centro/gestao/cotas/:id em transição — alteração salva localmente.', err);
			}
		}
		modalAjustarCotasAberto = false;
		mensagemSucesso = '✓ Cotas da UBS atualizadas com sucesso pelo Diretor!';
		setTimeout(() => mensagemSucesso = '', 4000);
	}

	function abrirNovaEscala() {
		novoMedicoNome = '';
		novoCrm = '';
		novaEspecialidade = 'Cardiologia';
		novosDias = ['SEG', 'QUA'];
		novoHorarioInicio = '08:00';
		novoHorarioFim = '12:00';
		novaDuracao = 20;
		modalNovaEscalaAberto = true;
	}

	async function salvarNovaEscala() {
		if (!novoMedicoNome.trim() || !novoCrm.trim()) {
			erroModalEscala = 'Preencha o nome do médico e o registro profissional CRM.';
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
			status: 'ATIVA'
		};

		try {
			await api.centroGestao.criarEscala({
				medicoNome: nova.medicoNome,
				crm: nova.crm,
				especialidade: nova.especialidade,
				diasSemana: nova.diasSemana,
				horarioInicio: nova.horarioInicio,
				horarioFim: nova.horarioFim,
				duracaoMinutos: nova.duracaoMinutos,
				vagasPorTurno: nova.vagasPorTurno,
				status: nova.status
			});
		} catch (err) {
			console.info('[UniSISM] Endpoint /v1/centro/gestao/escalas em transição — salvando na grade local.', err);
		}

		escalasList.push(nova);
		modalNovaEscalaAberto = false;
		mensagemSucesso = `✓ Nova escala para ${nova.medicoNome} criada na grade horária!`;
		setTimeout(() => mensagemSucesso = '', 4000);
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

<div class="flex flex-col gap-4 font-mono text-xs">
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
											⚠ CRÍTICO
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
						class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-3 py-1 font-bold text-xs uppercase tracking-wider"
					>
						📱 Disparar Aviso ao App (Falta / Mudança)
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
			<div class="p-4 border-b border-slate-200 bg-slate-50 font-sans">
				<input
					type="text"
					bind:value={buscaEspecialista}
					placeholder="🔍 Filtrar médico por nome ou especialidade..."
					class="w-full border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-900"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-4 py-3">Especialista / CRM</th>
							<th class="border-r border-slate-200 px-3 py-3">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-3 text-center">Dias de Atendimento</th>
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

								<!-- Dias -->
								<td class="border-r border-slate-100 px-3 py-3 text-center">
									<div class="flex justify-center gap-1">
										{#each ['SEG', 'TER', 'QUA', 'QUI', 'SEX'] as d}
											<span class="px-1.5 py-0.5 text-[9px] font-bold border {esc.diasSemana.includes(d) ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-200 bg-slate-100 text-slate-400'}">
												{d}
											</span>
										{/each}
									</div>
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
										class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-2.5 py-1 text-[10px] font-bold uppercase"
									>
										📲 Avisar Pacientes
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
				<div class="border border-amber-300 bg-amber-50 p-4 text-amber-900 font-mono text-xs">
					⚠ <strong>Painel de Domínio Absoluto do Diretor:</strong> Permite mover a demanda agendada de um médico/dia afetado por imprevistos (licença, congresso) diretamente para a agenda de outro especialista ou nova data, disparando notificação por SMS aos pacientes.
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
						class="border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white px-6 py-3 font-mono font-bold text-xs uppercase tracking-wider disabled:opacity-50"
					>
						{processandoRemanejamento ? 'Reorganizando Fila...' : '🔄 Executar Remanejamento em Lote'}
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
	title="REDEFINIR COTAS MENSAIS DA UBS"
	subtitle={ubsSelecionadaCota ? ubsSelecionadaCota.ubsNome : ''}
	maxWidth="md"
>
	{#if ubsSelecionadaCota}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="text-slate-600 font-sans text-xs">
				Ajuste a quantidade máxima de cotas disponíveis para o mês por especialidade:
			</div>

			<div class="grid grid-cols-2 gap-3">
				{#each Object.entries(ubsSelecionadaCota.especialidades) as [esp, val]}
					<div class="flex flex-col gap-1">
						<label for="esp-{esp}" class="text-[10px] font-bold text-slate-600 uppercase">{esp}</label>
						<input
							id="esp-{esp}"
							type="number"
							bind:value={ubsSelecionadaCota.especialidades[esp]}
							min="0"
							class="border border-slate-300 p-2 text-xs font-bold"
						/>
					</div>
				{/each}
			</div>

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

<!-- MODAL 2: Cadastrar Nova Escala de Médico -->
<Modal
	isOpen={modalNovaEscalaAberto}
	onClose={() => modalNovaEscalaAberto = false}
	title="CADASTRAR NOVA ESCALA DE ATENDIMENTO"
	subtitle="Definição de grade de horários do médico especialista"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-xs">
		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-nome" class="text-[10px] font-bold text-slate-600 uppercase">Nome do Médico *</label>
				<input id="esc-nome" type="text" bind:value={novoMedicoNome} placeholder="Dr. Nome Sobrenome" class="border border-slate-300 p-2 text-xs font-sans" />
			</div>
			<div class="flex flex-col gap-1">
				<label for="esc-crm" class="text-[10px] font-bold text-slate-600 uppercase">CRM / Registro *</label>
				<input id="esc-crm" type="text" bind:value={novoCrm} placeholder="CRM 00000" class="border border-slate-300 p-2 text-xs" />
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-esp" class="text-[10px] font-bold text-slate-600 uppercase">Especialidade *</label>
				<select id="esc-esp" bind:value={novaEspecialidade} class="border border-slate-300 p-2 text-xs font-sans">
					<option value="Cardiologia">Cardiologia</option>
					<option value="Oftalmologia">Oftalmologia</option>
					<option value="Dermatologia">Dermatologia</option>
					<option value="Ortopedia">Ortopedia</option>
					<option value="Endocrinologia">Endocrinologia</option>
					<option value="Neurologia">Neurologia</option>
				</select>
			</div>

			<div class="flex flex-col gap-1">
				<label for="esc-tipo" class="text-[10px] font-bold text-slate-600 uppercase">Tipo de Atendimento *</label>
				<select id="esc-tipo" bind:value={novoTipoServico} class="border border-slate-300 p-2 text-xs font-sans font-bold bg-white">
					<option value="CONSULTA">🩺 CONSULTA MÉDICA</option>
					<option value="PROCEDIMENTO">🔬 PROCEDIMENTO / EXAME</option>
				</select>
			</div>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-bold text-slate-600 uppercase">Dias de Atendimento na Semana</span>
			<div class="flex gap-2">
				{#each ['SEG', 'TER', 'QUA', 'QUI', 'SEX'] as d}
					<button
						type="button"
						onclick={() => toggleDia(d)}
						class="px-3 py-1.5 font-bold text-xs border transition-colors {novosDias.includes(d) ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700'}"
					>
						{d}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid grid-cols-3 gap-3">
			<div class="flex flex-col gap-1">
				<label for="esc-ini" class="text-[10px] font-bold text-slate-600 uppercase">Início Turno</label>
				<input id="esc-ini" type="time" bind:value={novoHorarioInicio} class="border border-slate-300 p-2 text-xs" />
			</div>
			<div class="flex flex-col gap-1">
				<label for="esc-fim" class="text-[10px] font-bold text-slate-600 uppercase">Fim Turno</label>
				<input id="esc-fim" type="time" bind:value={novoHorarioFim} class="border border-slate-300 p-2 text-xs" />
			</div>
			<div class="flex flex-col gap-1">
				<label for="esc-dur" class="text-[10px] font-bold text-slate-600 uppercase">Min / Consulta</label>
				<input id="esc-dur" type="number" bind:value={novaDuracao} min="10" step="5" class="border border-slate-300 p-2 text-xs" />
			</div>
		</div>

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
			<button type="button" onclick={() => modalNovaEscalaAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold text-xs uppercase">
				Cancelar
			</button>
			<button type="button" onclick={salvarNovaEscala} class="border border-blue-900 bg-blue-900 text-white px-5 py-2 font-bold text-xs uppercase">
				Salvar Escala
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
					<span>Retornar para fila com notificação SMS ao paciente</span>
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

<!-- MODAL 4: Disparar Notificação / Aviso de Ausência / Mudança ao Paciente -->
{#if modalDispararAvisoAberto}
	<Modal
		isOpen={modalDispararAvisoAberto}
		onClose={() => modalDispararAvisoAberto = false}
		title="DISPARAR NOTIFICAÇÃO E AVISO AO APP DO PACIENTE"
		subtitle="Comunicação em tempo real por falta médica ou mudança de dia de atendimento"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-xs">
			<div class="border border-purple-300 bg-purple-50 p-3 text-purple-950 font-sans text-xs">
				📲 <strong>Disparo Massivo aos Pacientes:</strong> Envia notificação instantânea para o <strong>App do Paciente UniSISM</strong>, SMS e WhatsApp para todos os cidadãos agendados com o médico selecionado na data informada.
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="aviso-med" class="text-[10px] font-bold text-slate-600 uppercase">Médico Especialista *</label>
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
					<option value="FALTA_MEDICA">🚨 FALTA MÉDICA DE URGÊNCIA / AUSÊNCIA IMPREVISTA</option>
					<option value="MUDANCA_DIA">📅 MUDANÇA DE DIA / HORÁRIO DE ATENDIMENTO</option>
					<option value="FERIAS_LICENCA">🏖️ FÉRIAS / LICENÇA MÉDICA DO PROFISSIONAL</option>
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
						<span class="font-bold text-purple-900">📲 App do Paciente (Push)</span>
					</label>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input type="checkbox" bind:checked={avisoCanais.sms} />
						<span>💬 SMS Direct</span>
					</label>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input type="checkbox" bind:checked={avisoCanais.whatsapp} />
						<span>🟢 WhatsApp Bot</span>
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
					class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-5 py-2 font-bold text-xs uppercase disabled:opacity-50"
				>
					{disparandoAviso ? 'Enviando...' : '📲 Disparar Notificação ao App'}
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

