<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';

	interface ChamadaPainel {
		id: string;
		pacienteNome: string;
		consultorio: string;
		medicoNome: string;
		especialidade: string;
		horario: string;
		tipo: 'CONSULTA' | 'PROCEDIMENTO' | 'RETORNO';
		chamadoEm: Date;
	}

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let tituloPainel = $derived(ehCeo ? 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)' : 'CENTRO DE ESPECIALIDADES MÉDICAS (CEM)');
	let subtituloPainel = $derived(ehCeo ? 'SAÚDE BUCAL ESPECIALIZADA · SALA DE ESPERA' : 'AMBULATÓRIO DE ESPECIALIDADES MÉDICAS · SALA DE ESPERA');

	let chamadaAtual = $state<ChamadaPainel | null>(null);
	let ultimasChamadas = $state<ChamadaPainel[]>([]);
	let horarioAtual = $state('');
	let dataAtual = $state('');
	let audioHabilitado = $state(true);
	let vozHabilitada = $state(true);
	let isFullscreen = $state(false);
	let piscarDestaque = $state(false);

	let timerRelogio: any = null;
	let timerPolling: any = null;
	let ultimaChamadaIdProcessada = '';

	// Web Audio API Hospital Chime Synthesizer (Zero dependências externas de MP3)
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
			console.info('[UniSISM Painel] Web Audio em espera por interação do usuário.', e);
		}
	}

	// Síntese de Voz Nativa do Navegador (Web Speech API)
	function falarChamada(paciente: string, consultorio: string) {
		if (!vozHabilitada || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		try {
			window.speechSynthesis.cancel();
			const texto = `Paciente, ${paciente}. Comparecer ao ${consultorio}.`;
			const utterance = new SpeechSynthesisUtterance(texto);
			utterance.lang = 'pt-BR';
			utterance.rate = 0.95;
			utterance.pitch = 1.0;
			
			// Toca o chime primeiro, e fala em seguida
			tocarChimeHospitalar();
			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 600);
		} catch (e) {
			console.info('[UniSISM Painel] Síntese de voz em espera.', e);
		}
	}

	function atualizarRelogio() {
		const agora = new Date();
		horarioAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		dataAtual = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
	}

	async function sincronizarChamadas() {
		try {
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 50 }).catch(() => []);
			
			// Pacientes em atendimento chamados recentemente
			const chamados = res
				.filter((e: any) => e.statusAtendimentoCentro === 'EM_ATENDIMENTO' || e.statusAtendimentoCentro === 'AGUARDANDO_ATENDIMENTO')
				.map((e: any, idx: number) => {
					const salaNumero = ((idx % 6) + 1).toString().padStart(2, '0');
					return {
						id: e.id,
						pacienteNome: e.paciente?.nome || 'Paciente Identificado',
						consultorio: `CONSULTÓRIO ${salaNumero} — ALA A`,
						medicoNome: e.profissionalAtribuido || 'Dr(a). Médico Especialista',
						especialidade: e.solicitacao?.especialidadeSolicitada || 'Especialidade',
						horario: new Date(e.atualizadoEm || e.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
						tipo: 'CONSULTA' as const,
						chamadoEm: new Date(e.atualizadoEm || e.criadoEm)
					};
				});

			if (chamados.length > 0) {
				const maisRecente = chamados[0];
				
				// Se for uma nova chamada que ainda não foi anunciada
				if (maisRecente.id !== ultimaChamadaIdProcessada) {
					ultimaChamadaIdProcessada = maisRecente.id;
					chamadaAtual = maisRecente;
					ultimasChamadas = chamados.slice(1, 5);
					
					piscarDestaque = true;
					setTimeout(() => { piscarDestaque = false; }, 4000);
					
					falarChamada(maisRecente.pacienteNome, maisRecente.consultorio);
				}
			} else if (!chamadaAtual) {
				// Estado inicial ilustrativo de standby caso a fila esteja limpa
				chamadaAtual = {
					id: 'standby-01',
					pacienteNome: 'AGUARDANDO PRÓXIMA CHAMADA',
					consultorio: 'PAINEL CENTRAL DE ATENDIMENTO',
					medicoNome: 'RECEPÇÃO E TRIAGEM SUS',
					especialidade: 'CENTRO DE ESPECIALIDADES',
					horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
					tipo: 'CONSULTA',
					chamadoEm: new Date()
				};
			}
		} catch (e) {
			console.info('[UniSISM Painel] Sincronização de chamadas em modo contínuo.', e);
		}
	}

	function alternarFullscreen() {
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

		sincronizarChamadas();
		timerPolling = setInterval(sincronizarChamadas, 5000);
	});

	onDestroy(() => {
		if (timerRelogio) clearInterval(timerRelogio);
		if (timerPolling) clearInterval(timerPolling);
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
		}
	});
</script>

<svelte:head>
	<title>PAINEL DE CHAMADA DE PACIENTES · UNISISM TV</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col bg-slate-950 text-white font-mono select-none overflow-hidden">
	<!-- Top Bar: Identificação e Relógio -->
	<header class="flex h-20 items-center justify-between border-b-2 border-slate-800 bg-slate-900 px-8">
		<div class="flex items-center gap-4">
			<div class="flex h-12 w-12 items-center justify-center bg-blue-600 font-black text-xl text-white shadow-md">
				SUS
			</div>
			<div>
				<div class="text-xl font-bold tracking-widest text-white uppercase font-sans">
					{tituloPainel}
				</div>
				<div class="text-xs font-semibold text-blue-400 tracking-wider uppercase">
					{subtituloPainel}
				</div>
			</div>
		</div>

		<!-- Controles e Relógio -->
		<div class="flex items-center gap-6">
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => audioHabilitado = !audioHabilitado}
					class="border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors flex items-center gap-1.5 {audioHabilitado ? 'text-emerald-400' : 'text-slate-500'}"
					title="Ativar/Desativar Som"
				>
					<span>{audioHabilitado ? '🔊 SOM LIGADO' : '🔇 MUDO'}</span>
				</button>

				<button
					type="button"
					onclick={() => vozHabilitada = !vozHabilitada}
					class="border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors flex items-center gap-1.5 {vozHabilitada ? 'text-blue-400' : 'text-slate-500'}"
					title="Ativar/Desativar Voz"
				>
					<span>{vozHabilitada ? '🗣️ VOZ ATIVA' : '🤐 VOZ OFF'}</span>
				</button>

				<button
					type="button"
					onclick={tocarChimeHospitalar}
					class="border border-blue-600 bg-blue-600/30 hover:bg-blue-600 px-3 py-1.5 text-xs font-bold text-blue-300 hover:text-white uppercase rounded transition-colors"
					title="Testar Sinal Sonoro"
				>
					🔔 Testar Som
				</button>

				<button
					type="button"
					onclick={alternarFullscreen}
					class="border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-white uppercase rounded transition-colors"
					title="Modo Tela Cheia"
				>
					⛶ Tela Cheia
				</button>
			</div>

			<div class="border-l border-slate-800 pl-6 text-right">
				<div class="text-2xl font-black tracking-widest text-emerald-400 font-mono">
					{horarioAtual || '00:00:00'}
				</div>
				<div class="text-[11px] text-slate-400 capitalize">
					{dataAtual || 'Carregando data...'}
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content Grid -->
	<main class="flex flex-1 overflow-hidden p-6 gap-6">
		<!-- Left: Chamada Principal (Hero Display) -->
		<section class="flex flex-3 flex-col justify-between rounded-xl border-4 {piscarDestaque ? 'border-amber-400 bg-amber-950/40 animate-pulse' : 'border-blue-600 bg-slate-900/90'} p-8 shadow-2xl transition-all duration-300">
			<div>
				<div class="flex items-center justify-between border-b-2 border-slate-800 pb-4">
					<div class="flex items-center gap-3">
						<span class="inline-block h-4 w-4 rounded-full bg-emerald-500 animate-ping"></span>
						<span class="text-sm font-bold tracking-widest text-emerald-400 uppercase">
							CHAMADA DE PACIENTE EM ANDAMENTO
						</span>
					</div>
					<div class="text-sm font-bold text-slate-400">
						HORÁRIO: <strong class="text-white">{chamadaAtual?.horario || '—'}</strong>
					</div>
				</div>

				<!-- Nome do Paciente em Destaque Gigante -->
				<div class="mt-8 flex flex-col gap-2">
					<span class="text-xs font-bold tracking-widest text-slate-400 uppercase">PACIENTE:</span>
					<div class="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white font-sans uppercase leading-none drop-shadow-md">
						{chamadaAtual?.pacienteNome || 'AGUARDANDO...'}
					</div>
				</div>
			</div>

			<!-- Destino: Consultório & Especialista -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-slate-800 pt-6">
				<!-- Box Consultório -->
				<div class="rounded-lg border-2 border-emerald-500/50 bg-emerald-950/50 p-6 flex flex-col justify-center">
					<span class="text-xs font-bold tracking-widest text-emerald-300 uppercase">DIRIGIR-SE AO LOCAL:</span>
					<div class="text-3xl lg:text-4xl font-black text-emerald-400 mt-2 font-mono uppercase">
						{chamadaAtual?.consultorio || 'SALA DE ATENDIMENTO'}
					</div>
				</div>

				<!-- Box Especialista -->
				<div class="rounded-lg border-2 border-blue-500/50 bg-blue-950/50 p-6 flex flex-col justify-center">
					<span class="text-xs font-bold tracking-widest text-blue-300 uppercase">PROFISSIONAL RESPONSÁVEL:</span>
					<div class="text-2xl lg:text-3xl font-bold text-white mt-1 font-sans">
						{chamadaAtual?.medicoNome || 'Dr(a). Especialista'}
					</div>
					<div class="text-sm font-semibold text-blue-300 mt-1 uppercase">
						{chamadaAtual?.especialidade || 'Consulta Especializada'}
					</div>
				</div>
			</div>
		</section>

		<!-- Right: Últimas Chamadas Anteriores -->
		<aside class="flex flex-1 flex-col rounded-xl border-2 border-slate-800 bg-slate-900/60 p-6">
			<div class="border-b-2 border-slate-800 pb-3 flex items-center justify-between">
				<span class="text-xs font-bold tracking-wider text-slate-400 uppercase">ÚLTIMAS CHAMADAS</span>
				<span class="text-[10px] text-slate-500 font-bold">HISTÓRICO</span>
			</div>

			<div class="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto">
				{#each ultimasChamadas as c (c.id)}
					<div class="rounded-lg border border-slate-800 bg-slate-800/60 p-3.5 flex flex-col gap-1 transition-all hover:bg-slate-800">
						<div class="flex items-center justify-between">
							<span class="font-bold text-slate-200 text-sm font-sans truncate">{c.pacienteNome}</span>
							<span class="text-[11px] font-mono text-emerald-400 font-bold">{c.horario}</span>
						</div>
						<div class="text-xs font-bold text-blue-400 font-mono">
							{c.consultorio}
						</div>
						<div class="text-[10px] text-slate-400 truncate">
							{c.medicoNome} · {c.especialidade}
						</div>
					</div>
				{:else}
					<div class="flex flex-1 items-center justify-center text-center text-slate-600 text-xs italic">
						Nenhuma chamada anterior registrada nesta sessão.
					</div>
				{/each}
			</div>

			<!-- Footer com Mensagem Institucional -->
			<div class="border-t-2 border-slate-800 pt-3 text-center text-[10px] text-slate-500 uppercase tracking-wider">
				Atenção ao sinal sonoro · Mantenha seu documento com foto em mãos
			</div>
		</aside>
	</main>
</div>
