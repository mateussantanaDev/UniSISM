<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import type { ChamadaPainelUbs } from '$lib/api/types';
	import { PRIORIDADE_LABEL, TIPO_ATENDIMENTO_LABEL } from '$lib/api/types';

	let chamadaAtual = $state<ChamadaPainelUbs | null>(null);
	let ultimasChamadas = $state<ChamadaPainelUbs[]>([]);
	let ubsNome = $state('Unidade Básica de Saúde');
	let prefeituraNome = $state('Secretaria Municipal de Saúde');

	let horarioAtual = $state('');
	let dataAtual = $state('');
	let audioHabilitado = $state(true);
	let vozHabilitada = $state(true);
	let isFullscreen = $state(false);
	let piscarDestaque = $state(false);

	let timerRelogio: any = null;
	let timerPolling: any = null;
	let ultimaChamadaIdProcessada = '';

	// Web Audio API Hospital Chime Synthesizer (Sons puros de hospital D5 e A5)
	function tocarChimeHospitalar() {
		if (!audioHabilitado || typeof window === 'undefined') return;
		try {
			const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();

			const agora = ctx.currentTime;

			// Nota 1: D5 (587.33 Hz)
			const osc1 = ctx.createOscillator();
			const gain1 = ctx.createGain();
			osc1.type = 'sine';
			osc1.frequency.setValueAtTime(587.33, agora);
			gain1.gain.setValueAtTime(0, agora);
			gain1.gain.linearRampToValueAtTime(0.3, agora + 0.05);
			gain1.gain.exponentialRampToValueAtTime(0.001, agora + 0.6);
			osc1.connect(gain1);
			gain1.connect(ctx.destination);
			osc1.start(agora);
			osc1.stop(agora + 0.6);

			// Nota 2: A5 (880.00 Hz)
			const osc2 = ctx.createOscillator();
			const gain2 = ctx.createGain();
			osc2.type = 'sine';
			osc2.frequency.setValueAtTime(880.0, agora + 0.25);
			gain2.gain.setValueAtTime(0, agora + 0.25);
			gain2.gain.linearRampToValueAtTime(0.35, agora + 0.3);
			gain2.gain.exponentialRampToValueAtTime(0.001, agora + 0.9);
			osc2.connect(gain2);
			gain2.connect(ctx.destination);
			osc2.start(agora + 0.25);
			osc2.stop(agora + 0.9);
		} catch (e) {
			console.info('[UniSISM Painel UBS] Web Audio em espera por interação do usuário.', e);
		}
	}

	// Síntese de Voz Nativa em Português (Web Speech API)
	function falarChamada(paciente: string, consultorio: string, medico: string) {
		if (!vozHabilitada || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		try {
			window.speechSynthesis.cancel();
			const texto = `Atenção! Paciente, ${paciente}. Comparecer ao ${consultorio}. Dr(a) ${medico}.`;
			const utterance = new SpeechSynthesisUtterance(texto);
			utterance.lang = 'pt-BR';
			utterance.rate = 0.92;
			utterance.pitch = 1.0;

			// Toca o chime sonoro hospitalar e fala em seguida
			tocarChimeHospitalar();
			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 650);
		} catch (e) {
			console.info('[UniSISM Painel UBS] Síntese de voz em espera.', e);
		}
	}

	function atualizarRelogio() {
		const agora = new Date();
		horarioAtual = agora.toLocaleTimeString('pt-BR', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		dataAtual = agora.toLocaleDateString('pt-BR', {
			weekday: 'long',
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}

	async function consultarChamadasPainel() {
		try {
			const res = await api.ubs.getPainelChamadas({ limite: 6 });
			if (res.ubsNome) ubsNome = res.ubsNome;
			if (res.prefeituraNome) prefeituraNome = res.prefeituraNome;

			if (res.chamadaAtual) {
				const idAtual = res.chamadaAtual.id;
				if (idAtual !== ultimaChamadaIdProcessada) {
					ultimaChamadaIdProcessada = idAtual;
					chamadaAtual = res.chamadaAtual;

					// Efeito de destaque visual
					piscarDestaque = true;
					setTimeout(() => (piscarDestaque = false), 4000);

					// Dispara o alerta sonoro e de voz na TV
					falarChamada(
						res.chamadaAtual.pacienteNome,
						res.chamadaAtual.consultorio,
						res.chamadaAtual.medicoNome
					);
				}
			}

			ultimasChamadas = res.ultimasChamadas || [];
		} catch (e) {
			// silencioso
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
			isFullscreen = true;
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen().catch(() => {});
				isFullscreen = false;
			}
		}
	}

	onMount(() => {
		atualizarRelogio();
		timerRelogio = setInterval(atualizarRelogio, 1000);

		consultarChamadasPainel();
		timerPolling = setInterval(consultarChamadasPainel, 2500);

		document.addEventListener('fullscreenchange', () => {
			isFullscreen = !!document.fullscreenElement;
		});
	});

	onDestroy(() => {
		if (timerRelogio) clearInterval(timerRelogio);
		if (timerPolling) clearInterval(timerPolling);
	});
</script>

<svelte:head>
	<title>PAINEL TV DE CHAMADAS · SALA DE ESPERA UBS</title>
</svelte:head>

<!-- Layout Hospitalar em Tela Cheia -->
<div
	class="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-mono text-white select-none"
>
	<!-- Topo: Identificação Municipal & Relógio Digital -->
	<header
		class="flex h-20 items-center justify-between border-b-4 border-blue-600 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-8"
	>
		<div class="flex items-center gap-4">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-2xl font-black text-white shadow-lg"
			>
				+
			</div>
			<div>
				<div class="text-xs font-bold tracking-widest text-blue-400 uppercase">
					{prefeituraNome} · ATENÇÃO PRIMÁRIA SUS
				</div>
				<h1 class="text-2xl font-black tracking-wide text-white uppercase">
					{ubsNome}
				</h1>
			</div>
		</div>

		<!-- Relógio & Data -->
		<div class="flex items-center gap-6">
			<div class="text-right">
				<div class="text-3xl font-black tracking-wider text-amber-400">
					{horarioAtual}
				</div>
				<div class="text-xs font-semibold tracking-wide text-slate-400 capitalize">
					{dataAtual}
				</div>
			</div>

			<!-- Botões de Controle do Painel -->
			<div class="flex items-center gap-2 border-l border-slate-700 pl-4">
				<button
					type="button"
					onclick={tocarChimeHospitalar}
					title="Testar Áudio"
					class="rounded border border-slate-700 bg-slate-800 p-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
				>
					🔔 Áudio
				</button>
				<button
					type="button"
					onclick={toggleFullscreen}
					title="Alternar Tela Cheia"
					class="rounded border border-blue-600 bg-blue-900/60 p-2 text-xs font-bold text-blue-200 hover:bg-blue-800"
				>
					{isFullscreen ? '⤢ Sair Fullscreen' : '⤢ Tela Cheia'}
				</button>
			</div>
		</div>
	</header>

	<!-- Corpo Principal: Chamada Atual em Destaque + Lateral com Histórico -->
	<main class="flex flex-1 overflow-hidden">
		<!-- Seção da Chamada Atual (70% da tela) -->
		<section
			class="flex flex-1 flex-col justify-between border-r-4 border-slate-800 bg-slate-900/90 p-10 transition-colors duration-500
			{piscarDestaque ? 'bg-blue-950/90 ring-8 ring-blue-500 inset-0' : ''}"
		>
			{#if chamadaAtual}
				<!-- Badge de Status -->
				<div class="flex items-center justify-between">
					<div
						class="flex items-center gap-3 rounded-full bg-blue-600 px-6 py-2 text-sm font-black tracking-widest text-white uppercase shadow-lg animate-pulse"
					>
						<span>📢 CHAMANDO AGORA</span>
					</div>

					<div class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-amber-400">
						{PRIORIDADE_LABEL[chamadaAtual.prioridade]}
					</div>
				</div>

				<!-- Paciente em Destaque Gigante -->
				<div class="my-auto text-center">
					<div class="font-mono text-5xl font-black text-amber-400 tracking-widest mb-4">
						SENHA {chamadaAtual.senha}
					</div>

					<h2
						class="text-6xl font-black tracking-tight text-white uppercase leading-tight drop-shadow-md lg:text-7xl"
					>
						{chamadaAtual.pacienteNome}
					</h2>

					<div class="mt-4 text-xl font-bold text-slate-300 uppercase tracking-wider">
						{TIPO_ATENDIMENTO_LABEL[chamadaAtual.tipoAtendimento]}
					</div>
				</div>

				<!-- Caixa do Consultório & Médico (Alto Contraste) -->
				<div
					class="grid grid-cols-2 gap-6 rounded-2xl border-4 border-emerald-500 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 p-6 text-center shadow-2xl"
				>
					<div class="border-r-2 border-emerald-800/80 pr-4">
						<div class="text-sm font-bold tracking-widest text-emerald-400 uppercase">
							DIRIJA-SE AO LOCAL:
						</div>
						<div class="text-4xl font-black tracking-wide text-emerald-300 uppercase mt-1">
							{chamadaAtual.consultorio}
						</div>
					</div>

					<div class="pl-4">
						<div class="text-sm font-bold tracking-widest text-slate-400 uppercase">
							PROFISSIONAL / MÉDICO:
						</div>
						<div class="text-3xl font-black tracking-wide text-white uppercase mt-1">
							{chamadaAtual.medicoNome}
						</div>
						{#if chamadaAtual.crm}
							<div class="text-xs font-bold text-slate-400">CRM: {chamadaAtual.crm}</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Tela de Espera Sem Chamadas -->
				<div class="my-auto text-center text-slate-500">
					<div class="text-7xl mb-4">🏥</div>
					<h2 class="text-4xl font-black text-slate-300 uppercase tracking-widest">
						SALA DE ESPERA · ATENDIMENTO UBS
					</h2>
					<p class="mt-3 text-lg text-slate-400">
						Aguarde ser chamado pelo painel sonoro e luminoso. Tenha em mãos seu Documento com Foto e
						Cartão do SUS.
					</p>
				</div>
			{/if}
		</section>

		<!-- Coluna Lateral: Histórico das Últimas Chamadas (30% da tela) -->
		<aside class="flex w-[420px] shrink-0 flex-col bg-slate-950 p-6">
			<div class="border-b-2 border-slate-800 pb-3">
				<h3 class="text-sm font-black tracking-widest text-slate-400 uppercase">
					ÚLTIMAS CHAMADAS
				</h3>
				<div class="text-[11px] text-slate-500">Histórico recente de encaminhamentos</div>
			</div>

			<div class="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
				{#if ultimasChamadas.length === 0}
					<div class="my-auto text-center text-xs text-slate-600">
						Nenhuma chamada anterior registrada hoje.
					</div>
				{:else}
					{#each ultimasChamadas as c (c.id)}
						<div
							class="rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-slate-700"
						>
							<div class="flex items-center justify-between">
								<span class="font-mono text-sm font-black text-amber-400">
									{c.senha}
								</span>
								<span class="text-[10px] font-bold text-slate-500">
									{new Date(c.chamadoEm).toLocaleTimeString('pt-BR', {
										hour: '2-digit',
										minute: '2-digit'
									})}
								</span>
							</div>

							<div class="mt-1 truncate text-base font-bold text-white uppercase">
								{c.pacienteNome}
							</div>

							<div class="mt-2 flex items-center justify-between text-xs">
								<span class="font-bold text-emerald-400 uppercase">
									{c.consultorio}
								</span>
								<span class="truncate text-[11px] text-slate-400 max-w-[150px]">
									{c.medicoNome}
								</span>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Rodapé do Painel -->
			<div class="mt-auto border-t border-slate-800 pt-3 text-center text-[10px] text-slate-600 uppercase">
				UniSISM · Sistema Integrado de Saúde Municipal
			</div>
		</aside>
	</main>
</div>
