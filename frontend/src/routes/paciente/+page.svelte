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
		IconAlertCircle,
		IconCheck,
		IconClock,
		IconPhone,
		IconMapPin,
		IconChevronRight,
		IconHeartHandshake,
		IconArrowRight
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
				return { texto: 'Aguardando Regulação', cor: 'bg-amber-100 text-amber-900 border-amber-300' };
			case 'APROVADO':
			case 'AGENDADO':
				return { texto: 'Agendado', cor: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
			case 'PENDENTE':
				return { texto: 'Pendente de Documentação', cor: 'bg-orange-100 text-orange-900 border-orange-300' };
			case 'REJEITADO':
				return { texto: 'Não Aprovado', cor: 'bg-rose-100 text-rose-900 border-rose-300' };
			case 'ATENDIDO':
			case 'CONCLUIDO':
				return { texto: 'Atendido / Concluído', cor: 'bg-blue-100 text-blue-900 border-blue-300' };
			default:
				return { texto: status, cor: 'bg-slate-100 text-slate-800 border-slate-300' };
		}
	}

	function statusTfdLabel(status: string) {
		switch (status) {
			case 'AGUARDANDO':
				return { texto: 'Aguardando Aprovação', cor: 'bg-amber-100 text-amber-900 border-amber-300' };
			case 'APROVADA':
				return { texto: 'Viagem Aprovada', cor: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
			case 'EMBARCADA':
				return { texto: 'Embarque Confirmado', cor: 'bg-blue-100 text-blue-900 border-blue-300' };
			case 'RECUSADA':
				return { texto: 'Não Autorizada', cor: 'bg-rose-100 text-rose-900 border-rose-300' };
			case 'CONCLUIDA':
				return { texto: 'Viagem Concluída', cor: 'bg-slate-100 text-slate-800 border-slate-300' };
			default:
				return { texto: status, cor: 'bg-slate-100 text-slate-800 border-slate-300' };
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

<div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
	<!-- Saudação & Identificação -->
	<section class="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-xl font-black text-slate-900 sm:text-2xl">
					Olá, {primeiroNome}!
				</h1>
				<span class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
					<span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
					SUS Ativo
				</span>
			</div>
			<p class="text-xs text-slate-500 font-mono mt-0.5">
				CPF: {auth.me?.cpfFormatado || '•••••••••••'}
			</p>
		</div>

		{#if minhaUbs}
			<div class="mt-2 sm:mt-0 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm text-xs">
				<IconBuildingHospital size={16} class="text-emerald-700 shrink-0" />
				<div>
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Sua UBS de Referência</div>
					<div class="font-bold text-slate-800 truncate max-w-[200px]">{minhaUbs.nome}</div>
				</div>
			</div>
		{/if}
	</section>

	<!-- Banners de Notícia / Avisos da SMS -->
	{#if banners.length > 0}
		<section class="mb-6 overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-4 shadow-sm">
			<div class="flex items-start gap-3">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 shrink-0 text-emerald-200">
					<IconHeartHandshake size={20} />
				</div>
				<div class="flex-1">
					<div class="font-mono text-[9px] font-bold tracking-widest uppercase text-emerald-300">
						COMUNICADO DA SECRETARIA DE SAÚDE
					</div>
					<h3 class="text-sm font-bold text-white mt-0.5">{banners[0].titulo}</h3>
					{#if banners[0].corpo || banners[0].subtitulo}
						<p class="text-xs text-emerald-100/90 mt-1 leading-relaxed">
							{banners[0].corpo || banners[0].subtitulo}
						</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Card de Encaminhamento Ativo / Consulta Mais Recente -->
	<section class="mb-6">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="font-mono text-xs font-bold tracking-wider text-slate-600 uppercase">
				Encaminhamento em Andamento
			</h2>
			<a href="/paciente/encaminhamentos" class="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5">
				<span>Ver todos</span>
				<IconChevronRight size={14} />
			</a>
		</div>

		{#if encaminhamentoAtivo}
			{@const badge = statusEncaminhamentoLabel(encaminhamentoAtivo.status)}
			<div class="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
				<div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
					<div>
						<span class="inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider {badge.cor}">
							{badge.texto}
						</span>
						<h3 class="text-base font-bold text-slate-900 mt-1.5">
							{encaminhamentoAtivo.solicitacao?.especialidadeSolicitada || 'Consulta Especializada'}
						</h3>
						<div class="font-mono text-[11px] text-slate-500">
							Protocolo: <strong>{encaminhamentoAtivo.protocolo}</strong>
						</div>
					</div>

					<div class="text-right">
						<div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Data do Pedido</div>
						<div class="font-mono text-xs font-bold text-slate-800">
							{formatarData(encaminhamentoAtivo.criadoEm)}
						</div>
					</div>
				</div>

				<!-- Detalhes do Agendamento se já tiver data -->
				{#if encaminhamentoAtivo.agendamentoPrevisto}
					<div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div class="flex items-center gap-2.5">
							<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
								<IconCalendarEvent size={20} />
							</div>
							<div>
								<div class="font-bold text-slate-900 text-sm">
									{formatarDataHora(encaminhamentoAtivo.agendamentoPrevisto)}
								</div>
								<div class="text-slate-600 text-[11px]">
									Local: <strong>{encaminhamentoAtivo.localAgendamento || 'Centro de Especialidades Médicas (CEM)'}</strong>
								</div>
							</div>
						</div>

						<a
							href="/paciente/encaminhamentos"
							class="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
						>
							<span>Comprovante</span>
							<IconArrowRight size={14} />
						</a>
					</div>
				{:else}
					<div class="mt-3 flex items-center justify-between text-xs text-slate-600">
						<div class="flex items-center gap-1.5 text-amber-800">
							<IconClock size={16} class="text-amber-600" />
							<span>Aguardando a Regulação Municipal liberar vaga na agenda médica.</span>
						</div>
						<a href="/paciente/encaminhamentos" class="font-bold text-emerald-700 hover:underline">
							Acompanhar
						</a>
					</div>
				{/if}
			</div>
		{:else}
			<div class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
				<div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
					<IconCheck size={20} />
				</div>
				<h3 class="text-sm font-bold text-slate-800 mt-2">Nenhum encaminhamento pendente no momento</h3>
				<p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
					Todas as suas solicitações estão em dia. Caso precise de uma nova consulta, procure sua UBS de referência para ser atendido pelo médico.
				</p>
			</div>
		{/if}
	</section>

	<!-- Grid de Acesso Rápido (Mobile Touch Friendly) -->
	<section class="mb-6">
		<h2 class="mb-3 font-mono text-xs font-bold tracking-wider text-slate-600 uppercase">
			Serviços de Saúde
		</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<!-- Minhas Consultas -->
			<a
				href="/paciente/encaminhamentos"
				class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
			>
				<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
					<IconCalendarEvent size={24} />
				</div>
				<div class="mt-3">
					<h3 class="text-sm font-bold text-slate-900">Consultas</h3>
					<p class="text-[11px] text-slate-500 mt-0.5">Encaminhamentos e datas</p>
				</div>
			</a>

			<!-- Transporte TFD -->
			<a
				href="/paciente/tfd"
				class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
			>
				<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-800">
					<IconBus size={24} />
				</div>
				<div class="mt-3">
					<h3 class="text-sm font-bold text-slate-900">Transporte TFD</h3>
					<p class="text-[11px] text-slate-500 mt-0.5">Viagens para Recife e região</p>
				</div>
			</a>

			<!-- Histórico e Dossiê -->
			<a
				href="/paciente/dossie"
				class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
			>
				<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
					<IconNotes size={24} />
				</div>
				<div class="mt-3">
					<h3 class="text-sm font-bold text-slate-900">Meu Histórico</h3>
					<p class="text-[11px] text-slate-500 mt-0.5">Atendimentos e exames</p>
				</div>
			</a>

			<!-- Vacinas -->
			<a
				href="/paciente/dossie?aba=vacinas"
				class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
			>
				<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
					<IconVaccine size={24} />
				</div>
				<div class="mt-3">
					<h3 class="text-sm font-bold text-slate-900">Vacinas</h3>
					<p class="text-[11px] text-slate-500 mt-0.5">Carteira digital de doses</p>
				</div>
			</a>
		</div>
	</section>

	<!-- Transporte TFD Recente -->
	{#if solicitacoesTfd.length > 0}
		{@const solic = solicitacoesTfd[0]}
		{@const badgeTfd = statusTfdLabel(solic.status)}
		<section class="mb-6">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="font-mono text-xs font-bold tracking-wider text-slate-600 uppercase">
					Última Viagem TFD Solicitada
				</h2>
				<a href="/paciente/tfd" class="text-xs font-bold text-purple-800 hover:underline flex items-center gap-0.5">
					<span>Todas as viagens</span>
					<IconChevronRight size={14} />
				</a>
			</div>

			<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="flex items-center justify-between border-b border-slate-100 pb-2">
					<div class="flex items-center gap-2">
						<IconBus size={18} class="text-purple-700" />
						<span class="text-sm font-bold text-slate-900">Destino: {solic.viagem.destinoCidade}</span>
					</div>
					<span class="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase {badgeTfd.cor}">
						{badgeTfd.texto}
					</span>
				</div>

				<div class="mt-2.5 grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4">
					<div>
						<span class="text-slate-400 block text-[10px]">Data Saída:</span>
						<strong class="text-slate-800">{formatarData(solic.viagem.dataPartida)}</strong>
					</div>
					<div>
						<span class="text-slate-400 block text-[10px]">Horário:</span>
						<strong class="text-slate-800">{solic.viagem.horaPartida}</strong>
					</div>
					<div>
						<span class="text-slate-400 block text-[10px]">Embarque:</span>
						<strong class="text-slate-800 truncate block">{solic.viagem.localEmbarque}</strong>
					</div>
					<div>
						<span class="text-slate-400 block text-[10px]">Assento:</span>
						<strong class="text-slate-800">{solic.numeroAssento || 'A definir'}</strong>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- UBS de Referência Info Card -->
	{#if minhaUbs}
		<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<div class="flex items-center gap-2 font-mono text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
				<IconBuildingHospital size={16} class="text-emerald-700" />
				<span>Minha Unidade de Saúde (UBS)</span>
			</div>

			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
				<div>
					<h3 class="text-sm font-bold text-slate-900">{minhaUbs.nome}</h3>
					{#if minhaUbs.endereco}
						<div class="text-slate-600 flex items-center gap-1 mt-1">
							<IconMapPin size={14} class="text-slate-400 shrink-0" />
							<span>{minhaUbs.endereco} {minhaUbs.bairro ? `· ${minhaUbs.bairro}` : ''}</span>
						</div>
					{/if}
					<div class="text-slate-500 text-[11px] mt-1">
						Horário de Atendimento: {minhaUbs.horarioFuncionamento || 'Segunda a Sexta das 07:00 às 17:00'}
					</div>
				</div>

				{#if minhaUbs.telefone || minhaUbs.whatsapp}
					<div class="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
						{#if minhaUbs.telefone}
							<a
								href="tel:{minhaUbs.telefone.replace(/\D/g, '')}"
								class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold text-slate-700 hover:bg-slate-100"
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
								class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 font-mono text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
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
