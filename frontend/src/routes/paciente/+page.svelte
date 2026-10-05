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
		IconClock,
		IconPhone,
		IconMapPin,
		IconChevronRight,
		IconArrowRight,
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
				return { texto: 'AGUARDANDO VAGA', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'APROVADO':
			case 'AGENDADO':
				return { texto: 'CONSULTA MARCADA', classes: 'border-emerald-700 text-emerald-800 bg-emerald-50' };
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
				return { texto: 'AGUARDANDO', classes: 'border-amber-600 text-amber-800 bg-amber-50' };
			case 'APROVADA':
				return { texto: 'CONFIRMADA', classes: 'border-emerald-700 text-emerald-800 bg-emerald-50' };
			case 'EMBARCADA':
				return { texto: 'EMBARCADO', classes: 'border-blue-700 text-blue-800 bg-blue-50' };
			case 'RECUSADA':
				return { texto: 'RECUSADA', classes: 'border-red-700 text-red-800 bg-red-50' };
			case 'CONCLUIDA':
				return { texto: 'CONCLUÍDA', classes: 'border-slate-400 text-slate-700 bg-slate-100' };
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
	<title>Início · UniSISM</title>
</svelte:head>

<div class="space-y-4">
	<!-- Saudação Mobile Native -->
	<section class="border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex items-center justify-between">
			<div>
				<div class="flex items-center gap-2">
					<h1 class="font-mono text-base font-bold text-slate-900">
						Olá, {primeiroNome}!
					</h1>
					<span class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-800 uppercase">
						Ativo
					</span>
				</div>
				<p class="font-mono text-xs text-slate-500 mt-0.5">
					CPF: {auth.me?.cpfFormatado || '•••••••••••'}
				</p>
			</div>

			{#if minhaUbs}
				<div class="text-right font-mono text-[11px]">
					<div class="text-[9px] text-slate-400 uppercase font-bold">Minha UBS</div>
					<div class="font-bold text-slate-800 truncate max-w-[140px]">{minhaUbs.nome}</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Comunicados Rápidos se houver -->
	{#if banners.length > 0}
		<section class="border-l-4 border-l-blue-900 border border-slate-200 bg-blue-950 p-3.5 text-white shadow-sm font-mono">
			<div class="flex items-start gap-2.5">
				<IconSpeakerphone size={18} class="text-blue-300 shrink-0 mt-0.5" />
				<div>
					<div class="text-[9px] font-bold tracking-widest uppercase text-blue-300">
						AVISO
					</div>
					<h3 class="text-xs font-bold text-white uppercase mt-0.5">
						{banners[0].titulo}
					</h3>
					{#if banners[0].corpo || banners[0].subtitulo}
						<p class="text-[11px] text-blue-100 font-sans mt-0.5 leading-relaxed">
							{banners[0].corpo || banners[0].subtitulo}
						</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Card: Encaminhamento / Consulta Ativa -->
	<section class="border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-100 bg-slate-50 px-4 py-2 flex items-center justify-between">
			<div class="font-mono text-xs font-bold tracking-wider text-slate-800 uppercase">
				Próxima Consulta / Pedido
			</div>
			<a
				href="/paciente/encaminhamentos"
				class="font-mono text-[10px] font-bold text-blue-900 uppercase hover:underline flex items-center gap-0.5"
			>
				<span>Ver todos</span>
				<IconChevronRight size={13} />
			</a>
		</div>

		<div class="p-4">
			{#if encaminhamentoAtivo}
				{@const badge = statusEncaminhamentoLabel(encaminhamentoAtivo.status)}
				<div class="flex flex-col gap-3">
					<div class="flex items-start justify-between gap-2">
						<div>
							<span class="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold {badge.classes}">
								{badge.texto}
							</span>
							<h3 class="font-mono text-sm font-bold text-slate-900 uppercase mt-1.5">
								{encaminhamentoAtivo.solicitacao?.especialidadeSolicitada || 'Consulta Especializada'}
							</h3>
							<div class="font-mono text-[11px] text-slate-500 mt-0.5">
								Protocolo: #{encaminhamentoAtivo.protocolo}
							</div>
						</div>

						<div class="text-right font-mono text-[11px] text-slate-500">
							<div>{formatarData(encaminhamentoAtivo.criadoEm)}</div>
						</div>
					</div>

					{#if encaminhamentoAtivo.agendamentoPrevisto}
						<div class="border border-emerald-300 bg-emerald-50/70 p-3 flex items-center justify-between gap-2">
							<div>
								<div class="font-mono text-xs font-bold text-emerald-950 uppercase">
									{formatarDataHora(encaminhamentoAtivo.agendamentoPrevisto)}
								</div>
								<div class="text-[11px] text-emerald-900 mt-0.5">
									{encaminhamentoAtivo.localAgendamento || 'Centro de Especialidades Médicas (CEM)'}
								</div>
							</div>

							<a
								href="/paciente/encaminhamentos"
								class="border border-blue-900 bg-blue-900 px-3 py-1.5 font-mono text-xs font-bold text-white uppercase hover:bg-blue-950"
							>
								Ver
							</a>
						</div>
					{:else}
						<div class="flex items-center gap-2 border border-amber-200 bg-amber-50/60 p-2.5 font-mono text-xs text-amber-900">
							<IconClock size={16} class="text-amber-700 shrink-0" />
							<span>Aguardando a regulação médica liberar vaga.</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="text-center py-6 font-mono text-xs text-slate-500">
					Nenhuma consulta pendente na fila no momento.
				</div>
			{/if}
		</div>
	</section>

	<!-- Grid de Ações Rápidas (Mobile Touch Tiles) -->
	<section class="grid grid-cols-2 gap-2.5">
		<!-- Consultas -->
		<a
			href="/paciente/encaminhamentos"
			class="border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-900 transition-all flex flex-col justify-between"
		>
			<div class="flex items-center justify-between">
				<IconCalendarEvent size={20} class="text-blue-900" />
				<span class="font-mono text-[9px] font-bold text-slate-400 uppercase">AGENDA</span>
			</div>
			<div class="mt-3">
				<div class="font-mono text-xs font-bold text-slate-900 uppercase">Consultas</div>
				<div class="text-[10px] text-slate-500 mt-0.5">Encaminhamentos e datas</div>
			</div>
		</a>

		<!-- TFD -->
		<a
			href="/paciente/tfd"
			class="border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-900 transition-all flex flex-col justify-between"
		>
			<div class="flex items-center justify-between">
				<IconBus size={20} class="text-purple-900" />
				<span class="font-mono text-[9px] font-bold text-slate-400 uppercase">VIAGENS</span>
			</div>
			<div class="mt-3">
				<div class="font-mono text-xs font-bold text-slate-900 uppercase">Transporte TFD</div>
				<div class="text-[10px] text-slate-500 mt-0.5">Vagas Recife e região</div>
			</div>
		</a>

		<!-- Prontuário -->
		<a
			href="/paciente/dossie"
			class="border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-900 transition-all flex flex-col justify-between"
		>
			<div class="flex items-center justify-between">
				<IconNotes size={20} class="text-emerald-800" />
				<span class="font-mono text-[9px] font-bold text-slate-400 uppercase">CLÍNICO</span>
			</div>
			<div class="mt-3">
				<div class="font-mono text-xs font-bold text-slate-900 uppercase">Prontuário</div>
				<div class="text-[10px] text-slate-500 mt-0.5">Histórico e receitas</div>
			</div>
		</a>

		<!-- Vacinas -->
		<a
			href="/paciente/dossie"
			class="border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-900 transition-all flex flex-col justify-between"
		>
			<div class="flex items-center justify-between">
				<IconVaccine size={20} class="text-amber-700" />
				<span class="font-mono text-[9px] font-bold text-slate-400 uppercase">DOSES</span>
			</div>
			<div class="mt-3">
				<div class="font-mono text-xs font-bold text-slate-900 uppercase">Vacinas</div>
				<div class="text-[10px] text-slate-500 mt-0.5">Carteira digital</div>
			</div>
		</a>
	</section>

	<!-- Transporte TFD Recente se houver -->
	{#if solicitacoesTfd.length > 0}
		{@const solic = solicitacoesTfd[0]}
		{@const badgeTfd = statusTfdLabel(solic.status)}
		<section class="border border-slate-200 bg-white shadow-sm font-mono">
			<div class="border-b border-slate-100 bg-slate-50 px-4 py-2 flex items-center justify-between">
				<div class="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
					<IconBus size={15} class="text-purple-900" />
					<span>Última Viagem TFD</span>
				</div>
				<span class="border px-1.5 py-0.2 text-[9px] font-bold uppercase {badgeTfd.classes}">
					{badgeTfd.texto}
				</span>
			</div>

			<div class="p-3.5 text-xs">
				<div class="font-bold text-slate-900 uppercase">
					Destino: {solic.viagem.destinoCidade}
				</div>
				<div class="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
					<div>
						<span class="text-slate-400 block text-[9px] uppercase">Data</span>
						<strong class="text-slate-800">{formatarData(solic.viagem.dataPartida)}</strong>
					</div>
					<div>
						<span class="text-slate-400 block text-[9px] uppercase">Hora</span>
						<strong class="text-slate-800">{solic.viagem.horaPartida}</strong>
					</div>
					<div>
						<span class="text-slate-400 block text-[9px] uppercase">Assento</span>
						<strong class="text-blue-950 font-bold">{solic.numeroAssento || '—'}</strong>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- UBS de Referência Info Card -->
	{#if minhaUbs}
		<section class="border border-slate-200 bg-white p-3.5 shadow-sm font-mono text-xs">
			<div class="flex items-center justify-between">
				<div>
					<div class="text-[9px] font-bold text-slate-400 uppercase">Unidade de Atendimento</div>
					<h3 class="font-bold text-slate-900 uppercase mt-0.5">{minhaUbs.nome}</h3>
					{#if minhaUbs.endereco}
						<div class="text-[11px] text-slate-500 font-sans mt-0.5">
							{minhaUbs.endereco}
						</div>
					{/if}
				</div>

				{#if minhaUbs.telefone || minhaUbs.whatsapp}
					<div class="flex items-center gap-1.5 shrink-0">
						{#if minhaUbs.telefone}
							<a
								href="tel:{minhaUbs.telefone.replace(/\D/g, '')}"
								class="border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
								title="Ligar"
							>
								<IconPhone size={14} />
							</a>
						{/if}
						{#if minhaUbs.whatsapp}
							<a
								href="https://wa.me/55{minhaUbs.whatsapp.replace(/\D/g, '')}"
								target="_blank"
								rel="noreferrer"
								class="border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-white font-bold text-[10px] uppercase hover:bg-emerald-800"
							>
								WhatsApp
							</a>
						{/if}
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
