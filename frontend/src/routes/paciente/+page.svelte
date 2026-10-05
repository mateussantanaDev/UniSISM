<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import { usePacienteAuth } from '$lib/presentation/contexts/pacienteAuthContext';
	import type {
		Encaminhamento,
		UbsMinhaDto,
		BannerPacienteDto,
		TfdSolicitacaoPacienteDto
	} from '$lib/api/types';
	import {
		IconCalendarEvent,
		IconBus,
		IconNotes,
		IconVaccine,
		IconBuildingHospital,
		IconCheck,
		IconClock,
		IconPhone,
		IconMapPin,
		IconChevronRight,
		IconArrowRight,
		IconAlertCircle,
		IconSpeakerphone
	} from '@tabler/icons-svelte';

	const auth = usePacienteAuth();

	let carregando = $state(true);
	let encaminhamentoAtivo = $state<Encaminhamento | null>(null);
	let minhaUbs = $state<UbsMinhaDto | null>(null);
	let banners = $state<BannerPacienteDto[]>([]);
	let solicitacoesTfd = $state<TfdSolicitacaoPacienteDto[]>([]);

	let primeiroNome = $derived.by(() => {
		const n = auth.me?.nome?.trim() || 'Cidadão';
		return n.split(' ')[0];
	});

	function formatarData(isoStr?: string | null) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
		} catch {
			return isoStr;
		}
	}

	function formatarDataHora(isoStr?: string | null) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
		} catch {
			return isoStr;
		}
	}

	function statusEncaminhamentoLabel(status: string) {
		switch (status) {
			case 'AGUARDANDO_REGULACAO':
				return { texto: 'AGUARDANDO REGULAÇÃO', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'APROVADO':
			case 'AGENDADO':
				return { texto: 'CONSULTA AGENDADA', classes: 'border-emerald-700 text-emerald-800 bg-emerald-50' };
			case 'PENDENTE':
			case 'PENDENCIA_DOCUMENTO':
				return { texto: 'PENDÊNCIA', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'REJEITADO':
				return { texto: 'NÃO APROVADO', classes: 'border-red-700 text-red-800 bg-red-50' };
			case 'ATENDIDO':
			case 'CONCLUIDO':
				return { texto: 'ATENDIDO', classes: 'border-blue-700 text-blue-800 bg-blue-50' };
			default:
				return { texto: status, classes: 'border-slate-400 text-slate-700 bg-slate-100' };
		}
	}

	function statusTfdLabel(status: string) {
		switch (status) {
			case 'AGUARDANDO':
				return { texto: 'AGUARDANDO APROVAÇÃO', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'APROVADA':
				return { texto: 'VIAGEM APROVADA', classes: 'border-emerald-700 text-emerald-800 bg-emerald-50' };
			case 'EMBARCADA':
				return { texto: 'EMBARQUE CONFIRMADO', classes: 'border-blue-700 text-blue-800 bg-blue-50' };
			case 'RECUSADA':
				return { texto: 'NÃO AUTORIZADA', classes: 'border-red-700 text-red-800 bg-red-50' };
			case 'CONCLUIDA':
				return { texto: 'VIAGEM CONCLUÍDA', classes: 'border-slate-400 text-slate-700 bg-slate-100' };
			default:
				return { texto: status, classes: 'border-slate-400 text-slate-700 bg-slate-100' };
		}
	}

	onMount(async () => {
		carregando = true;
		try {
			const [encAtivoRes, ubsRes, bannersRes, tfdRes] = await Promise.all([
				api.pacienteApp.encaminhamentoAtivo().catch(() => null),
				api.pacienteApp.minhaUbs().catch(() => null),
				api.pacienteApp.banners().catch(() => []),
				api.pacienteApp.tfdSolicitacoes().catch(() => [])
			]);

			encaminhamentoAtivo = encAtivoRes;
			minhaUbs = ubsRes;
			banners = Array.isArray(bannersRes) ? bannersRes : [];
			solicitacoesTfd = Array.isArray(tfdRes) ? tfdRes : [];
		} catch (err) {
			console.error('[UniSISM Paciente] Erro ao carregar dados do dashboard:', err);
		} finally {
			carregando = false;
		}
	});
</script>

<svelte:head>
	<title>Painel do Cidadão · UniSISM Águas Belas</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-6">
	<!-- Saudação & Identificação Municipal -->
	<section class="border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<h1 class="font-mono text-lg font-bold tracking-tight text-slate-900 sm:text-xl uppercase">
						CIDADÃO: {auth.me?.nome || 'PACIENTE'}
					</h1>
					<span
						class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800"
					>
						SUS · ATIVO
					</span>
				</div>
				<div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-600">
					<span>CPF: <strong>{auth.me?.cpfFormatado || '•••••••••••'}</strong></span>
					{#if auth.me?.cns}
						<span>CARTÃO SUS: <strong>{auth.me.cns}</strong></span>
					{/if}
					<span>MUNICÍPIO: <strong>ÁGUAS BELAS - PE</strong></span>
				</div>
			</div>

			{#if minhaUbs}
				<div class="border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
					<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						UBS DE REFERÊNCIA
					</div>
					<div class="mt-0.5 font-bold text-slate-900 truncate max-w-[260px]">
						{minhaUbs.nome}
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Comunicados da Secretaria de Saúde -->
	{#if banners.length > 0}
		<section class="border-l-4 border-l-blue-900 border border-slate-200 bg-blue-950 p-4 text-white shadow-sm">
			<div class="flex items-start gap-3">
				<div class="bg-blue-900 p-2 text-white shrink-0">
					<IconSpeakerphone size={20} />
				</div>
				<div class="flex-1">
					<div class="font-mono text-[10px] font-bold tracking-widest uppercase text-blue-300">
						COMUNICADO OFICIAL · SECRETARIA MUNICIPAL DE SAÚDE
					</div>
					<h3 class="font-mono text-sm font-bold text-white mt-1 uppercase">
						{banners[0].titulo}
					</h3>
					{#if banners[0].corpo || banners[0].subtitulo}
						<p class="text-xs text-blue-100 mt-1 leading-relaxed">
							{banners[0].corpo || banners[0].subtitulo}
						</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Seção: Encaminhamento Ativo / Consulta -->
	<section class="border border-slate-200 bg-white shadow-sm">
		<div
			class="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5"
		>
			<div class="flex items-center gap-2">
				<span class="flex h-5 w-5 items-center justify-center bg-blue-900 font-mono text-[10px] font-bold text-white">
					01
				</span>
				<h2 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
					Encaminhamento em Andamento na Regulação
				</h2>
			</div>
			<a
				href="/paciente/encaminhamentos"
				class="font-mono text-[11px] font-bold tracking-wider text-blue-900 uppercase hover:underline flex items-center gap-1"
			>
				<span>Ver todos</span>
				<IconChevronRight size={14} />
			</a>
		</div>

		<div class="p-4">
			{#if encaminhamentoAtivo}
				{@const badge = statusEncaminhamentoLabel(encaminhamentoAtivo.status)}
				<div class="flex flex-col gap-3">
					<div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
						<div>
							<div class="flex items-center gap-2">
								<span
									class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider {badge.classes}"
								>
									{badge.texto}
								</span>
								<span class="font-mono text-xs text-slate-500">
									PROTOCOLO: <strong>{encaminhamentoAtivo.protocolo}</strong>
								</span>
							</div>
							<h3 class="font-mono text-base font-bold text-slate-900 mt-2 uppercase">
								{encaminhamentoAtivo.solicitacao?.especialidadeSolicitada || 'CONSULTA ESPECIALIZADA'}
							</h3>
							{#if encaminhamentoAtivo.solicitacao?.cid10}
								<div class="font-mono text-xs text-slate-600 mt-0.5">
									CID-10: <strong>{encaminhamentoAtivo.solicitacao.cid10}</strong>
								</div>
							{/if}
						</div>

						<div class="text-right font-mono text-xs">
							<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">SOLICITADO EM</div>
							<div class="font-bold text-slate-900 mt-0.5">
								{formatarData(encaminhamentoAtivo.criadoEm)}
							</div>
						</div>
					</div>

					{#if encaminhamentoAtivo.agendamentoPrevisto}
						<div class="border border-emerald-300 bg-emerald-50/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<div class="bg-emerald-700 p-2 text-white shrink-0">
									<IconCalendarEvent size={20} />
								</div>
								<div>
									<div class="font-mono text-xs font-bold text-emerald-950 uppercase">
										DATA MARCADA: {formatarDataHora(encaminhamentoAtivo.agendamentoPrevisto)}
									</div>
									<div class="text-xs text-emerald-900 mt-0.5">
										Local: <strong>{encaminhamentoAtivo.localAgendamento || 'Centro de Especialidades Médicas (CEM)'}</strong>
									</div>
								</div>
							</div>

							<a
								href="/paciente/encaminhamentos"
								class="inline-flex items-center justify-center gap-2 border border-blue-900 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-widest text-white uppercase hover:bg-blue-950 transition-colors"
							>
								<span>Comprovante</span>
								<IconArrowRight size={14} />
							</a>
						</div>
					{:else}
						<div class="flex items-center justify-between border border-amber-200 bg-amber-50/60 p-3 text-xs">
							<div class="flex items-center gap-2 text-amber-900">
								<IconClock size={16} class="text-amber-700 shrink-0" />
								<span>Aguardando a Central de Regulação Municipal autorizar e liberar vaga médica.</span>
							</div>
							<a
								href="/paciente/encaminhamentos"
								class="font-mono text-xs font-bold text-blue-900 uppercase hover:underline"
							>
								Acompanhar Fila →
							</a>
						</div>
					{/if}
				</div>
			{:else}
				<div class="border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
					<div class="font-mono text-xs font-bold text-slate-700 uppercase">
						Nenhum encaminhamento em fila no momento
					</div>
					<p class="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
						Todas as suas solicitações estão regulares. Caso necessite de nova consulta especializada ou exame, dirija-se à sua UBS de referência para acolhimento médico.
					</p>
				</div>
			{/if}
		</div>
	</section>

	<!-- Seção: Grid de Serviços Municipais -->
	<section>
		<div class="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
			<span class="flex h-5 w-5 items-center justify-center bg-blue-900 font-mono text-[10px] font-bold text-white">
				02
			</span>
			<h2 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
				Serviços de Saúde do Cidadão
			</h2>
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<!-- Consultas -->
			<a
				href="/paciente/encaminhamentos"
				class="group relative flex flex-col border border-slate-200 bg-white p-4 transition-all hover:border-blue-900 hover:shadow-md"
			>
				<div class="absolute top-0 left-0 h-full w-1 bg-blue-900"></div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						CONSULTAS
					</span>
					<IconCalendarEvent size={18} class="text-blue-900" />
				</div>
				<div class="mt-3 font-mono text-sm font-bold text-slate-900 uppercase">
					Encaminhamentos
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					Acompanhamento de pedidos, datas marcadas e comprovantes de atendimento.
				</div>
			</a>

			<!-- TFD -->
			<a
				href="/paciente/tfd"
				class="group relative flex flex-col border border-slate-200 bg-white p-4 transition-all hover:border-blue-900 hover:shadow-md"
			>
				<div class="absolute top-0 left-0 h-full w-1 bg-purple-900"></div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						TRANSPORTE TFD
					</span>
					<IconBus size={18} class="text-purple-900" />
				</div>
				<div class="mt-3 font-mono text-sm font-bold text-slate-900 uppercase">
					Viagens Fora do Domicílio
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					Solicitação de vagas na frota para Recife, Caruaru e Garanhuns.
				</div>
			</a>

			<!-- Histórico -->
			<a
				href="/paciente/dossie"
				class="group relative flex flex-col border border-slate-200 bg-white p-4 transition-all hover:border-blue-900 hover:shadow-md"
			>
				<div class="absolute top-0 left-0 h-full w-1 bg-emerald-700"></div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						PRONTUÁRIO
					</span>
					<IconNotes size={18} class="text-emerald-800" />
				</div>
				<div class="mt-3 font-mono text-sm font-bold text-slate-900 uppercase">
					Dossiê Clínico Digital
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					Histórico de atendimentos médicos, receitas e condutas ambulatoriais.
				</div>
			</a>

			<!-- Vacinas -->
			<a
				href="/paciente/dossie"
				class="group relative flex flex-col border border-slate-200 bg-white p-4 transition-all hover:border-blue-900 hover:shadow-md"
			>
				<div class="absolute top-0 left-0 h-full w-1 bg-amber-600"></div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						IMUNIZAÇÃO
					</span>
					<IconVaccine size={18} class="text-amber-700" />
				</div>
				<div class="mt-3 font-mono text-sm font-bold text-slate-900 uppercase">
					Carteira de Vacinas
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					Registro de doses aplicadas, lotes e cronograma vacinal municipal.
				</div>
			</a>
		</div>
	</section>

	<!-- Seção: Transporte TFD Recente -->
	{#if solicitacoesTfd.length > 0}
		{@const solic = solicitacoesTfd[0]}
		{@const badgeTfd = statusTfdLabel(solic.status)}
		<section class="border border-slate-200 bg-white shadow-sm">
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5"
			>
				<div class="flex items-center gap-2">
					<span class="flex h-5 w-5 items-center justify-center bg-blue-900 font-mono text-[10px] font-bold text-white">
						03
					</span>
					<h2 class="font-mono text-xs font-bold tracking-widest text-slate-900 uppercase">
						Última Solicitação de Viagem TFD
					</h2>
				</div>
				<a
					href="/paciente/tfd"
					class="font-mono text-[11px] font-bold tracking-wider text-blue-900 uppercase hover:underline"
				>
					Ver todas as viagens →
				</a>
			</div>

			<div class="p-4">
				<div class="flex items-center justify-between border-b border-slate-100 pb-3">
					<div class="flex items-center gap-2">
						<IconBus size={18} class="text-purple-900" />
						<span class="font-mono text-sm font-bold text-slate-900 uppercase">
							DESTINO: {solic.viagem.destinoCidade} {#if solic.viagem.destinoLocal}({solic.viagem.destinoLocal}){/if}
						</span>
					</div>
					<span
						class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider {badgeTfd.classes}"
					>
						{badgeTfd.texto}
					</span>
				</div>

				<div class="mt-3 grid grid-cols-2 gap-3 text-xs font-mono sm:grid-cols-4">
					<div class="border border-slate-200 bg-slate-50 p-2.5">
						<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">DATA SAÍDA</span>
						<strong class="text-slate-900">{formatarData(solic.viagem.dataPartida)}</strong>
					</div>
					<div class="border border-slate-200 bg-slate-50 p-2.5">
						<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">HORÁRIO</span>
						<strong class="text-slate-900">{solic.viagem.horaPartida}</strong>
					</div>
					<div class="border border-slate-200 bg-slate-50 p-2.5">
						<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">LOCAL EMBARQUE</span>
						<strong class="text-slate-900 truncate block">{solic.viagem.localEmbarque}</strong>
					</div>
					<div class="border border-slate-200 bg-slate-50 p-2.5">
						<span class="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">ASSENTO</span>
						<strong class="text-blue-950 font-black">{solic.numeroAssento || 'A DEFINIR'}</strong>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- UBS de Referência Info Card -->
	{#if minhaUbs}
		<section class="border border-slate-200 bg-white shadow-sm">
			<div
				class="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase"
			>
				<IconBuildingHospital size={16} class="text-blue-900" />
				<span>Unidade Básica de Saúde (UBS) Vinculada</span>
			</div>

			<div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
				<div>
					<h3 class="font-mono text-sm font-bold text-slate-900 uppercase">{minhaUbs.nome}</h3>
					{#if minhaUbs.endereco}
						<div class="text-slate-600 flex items-center gap-1.5 mt-1 font-mono text-xs">
							<IconMapPin size={14} class="text-slate-400 shrink-0" />
							<span>{minhaUbs.endereco} {minhaUbs.bairro ? `· ${minhaUbs.bairro}` : ''}</span>
						</div>
					{/if}
					<div class="text-slate-500 font-mono text-[11px] mt-1">
						HORÁRIO: {minhaUbs.horarioFuncionamento || 'Segunda a Sexta das 07:00 às 17:00'}
					</div>
				</div>

				{#if minhaUbs.telefone || minhaUbs.whatsapp}
					<div class="flex items-center gap-2">
						{#if minhaUbs.telefone}
							<a
								href="tel:{minhaUbs.telefone.replace(/\D/g, '')}"
								class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 transition-colors"
							>
								<IconPhone size={14} />
								<span>Ligar</span>
							</a>
						{/if}
						{#if minhaUbs.whatsapp}
							<a
								href="https://wa.me/55{minhaUbs.whatsapp.replace(/\D/g, '')}"
								target="_blank"
								rel="noreferrer"
								class="inline-flex items-center gap-1.5 border border-emerald-700 bg-emerald-700 px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-white uppercase hover:bg-emerald-800 transition-colors"
							>
								<span>WhatsApp</span>
							</a>
						{/if}
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
