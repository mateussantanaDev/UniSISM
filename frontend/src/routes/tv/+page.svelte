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

	interface CentroConfig {
		sigla: 'CEM' | 'CEO';
		nome: string;
		subtitulo: string;
		senhaPadrao: string;
		tipoLocal: string; // "CONSULTÓRIO" vs "CADEIRA ODONTOLÓGICA"
		corTema: 'blue' | 'emerald';
	}

	const CENTROS_CONFIG: Record<string, CentroConfig> = {
		CEM: {
			sigla: 'CEM',
			nome: 'CENTRO DE ESPECIALIDADES MÉDICAS (CEM)',
			subtitulo: 'AMBULATÓRIO DE ESPECIALIDADES MÉDICAS · SALA DE ESPERA',
			senhaPadrao: 'CEM-2026',
			tipoLocal: 'CONSULTÓRIO',
			corTema: 'blue'
		},
		CEO: {
			sigla: 'CEO',
			nome: 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)',
			subtitulo: 'SAÚDE BUCAL ESPECIALIZADA · SALA DE ESPERA',
			senhaPadrao: 'CEO-2026',
			tipoLocal: 'CADEIRA ODONTOLÓGICA',
			corTema: 'emerald'
		}
	};

	// State
	let centroPareado = $state<CentroConfig | null>(null);
	let senhaInput = $state('');
	let erroAutenticacao = $state('');
	let autenticando = $state(false);

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

	// Web Audio API Hospital Double Chime (D5 587.33Hz e A5 880.00Hz)
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
			gain1.gain.linearRampToValueAtTime(0.35, agora + 0.05);
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
			gain2.gain.linearRampToValueAtTime(0.4, agora + 0.3);
			gain2.gain.exponentialRampToValueAtTime(0.001, agora + 0.9);
			osc2.connect(gain2);
			gain2.connect(ctx.destination);
			osc2.start(agora + 0.25);
			osc2.stop(agora + 0.9);
		} catch (e) {
			console.info('[UniSISM TV] Áudio aguardando interação do usuário na Smart TV.', e);
		}
	}

	// Síntese de Voz Nativa em Português
	function falarChamada(paciente: string, consultorio: string) {
		if (!vozHabilitada || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		try {
			window.speechSynthesis.cancel();
			const texto = `Atenção: Paciente, ${paciente}. Favor dirigir-se ao ${consultorio}.`;
			const utterance = new SpeechSynthesisUtterance(texto);
			utterance.lang = 'pt-BR';
			utterance.rate = 0.95;
			utterance.pitch = 1.0;

			tocarChimeHospitalar();
			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 650);
		} catch (e) {
			console.info('[UniSISM TV] Síntese de voz em espera.', e);
		}
	}

	function atualizarRelogio() {
		const agora = new Date();
		horarioAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		dataAtual = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
	}

	// Autentica e Pareia o Centro
	function parearComSenha(senha: string) {
		const normalizada = senha.trim().toUpperCase();
		if (normalizada === 'CEM' || normalizada === 'CEM-2026' || normalizada === '7492') {
			centroPareado = CENTROS_CONFIG.CEM;
		} else if (normalizada === 'CEO' || normalizada === 'CEO-2026' || normalizada === '8301') {
			centroPareado = CENTROS_CONFIG.CEO;
		} else {
			erroAutenticacao = 'Senha de centro incorreta. Utilize a senha fornecida na recepção.';
			return false;
		}

		erroAutenticacao = '';
		if (typeof window !== 'undefined') {
			localStorage.setItem('unisism_tv_centro', centroPareado.sigla);
		}
		iniciarSincronizacao();
		return true;
	}

	function desparear() {
		centroPareado = null;
		senhaInput = '';
		erroAutenticacao = '';
		if (typeof window !== 'undefined') {
			localStorage.removeItem('unisism_tv_centro');
		}
		if (timerPolling) clearInterval(timerPolling);
	}

	async function sincronizarChamadas() {
		if (!centroPareado) return;
		try {
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 50 }).catch(() => []);
			
			// Filtra chamadas pelo escopo do centro pareado
			const ehCeo = centroPareado.sigla === 'CEO';
			const chamados = res
				.filter((e: any) => {
					// Filtro de status
					const ativo = e.statusAtendimentoCentro === 'EM_ATENDIMENTO' || e.statusAtendimentoCentro === 'AGUARDANDO_ATENDIMENTO';
					if (!ativo) return false;

					// Segregação de Órgão CEM vs CEO
					const esp = (e.solicitacao?.especialidadeSolicitada || '').toLowerCase();
					const eOdonto = esp.includes('odonto') || esp.includes('bucal') || esp.includes('canal') || esp.includes('periodontia') || esp.includes('bucomaxilo');
					return ehCeo ? eOdonto : !eOdonto;
				})
				.map((e: any, idx: number) => {
					const num = ((idx % 8) + 1).toString().padStart(2, '0');
					const local = ehCeo ? `CADEIRA ODONTOLÓGICA ${num} — SETOR B` : `CONSULTÓRIO ${num} — ALA A`;
					return {
						id: e.id,
						pacienteNome: e.paciente?.nome || 'Paciente Identificado',
						consultorio: local,
						medicoNome: e.profissionalAtribuido || (ehCeo ? 'Dr(a). Cirurgião-Dentista' : 'Dr(a). Médico Especialista'),
						especialidade: e.solicitacao?.especialidadeSolicitada || (ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada'),
						horario: new Date(e.atualizadoEm || e.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
						tipo: 'CONSULTA' as const,
						chamadoEm: new Date(e.atualizadoEm || e.criadoEm)
					};
				});

			if (chamados.length > 0) {
				const maisRecente = chamados[0];
				
				if (maisRecente.id !== ultimaChamadaIdProcessada) {
					ultimaChamadaIdProcessada = maisRecente.id;
					chamadaAtual = maisRecente;
					ultimasChamadas = chamados.slice(1, 6);
					
					piscarDestaque = true;
					setTimeout(() => { piscarDestaque = false; }, 4000);
					
					falarChamada(maisRecente.pacienteNome, maisRecente.consultorio);
				}
			} else if (!chamadaAtual) {
				chamadaAtual = {
					id: 'standby-01',
					pacienteNome: 'AGUARDANDO PRÓXIMA CHAMADA',
					consultorio: 'PAINEL CENTRAL DE ATENDIMENTO',
					medicoNome: 'RECEPÇÃO E TRIAGEM SUS',
					especialidade: centroPareado.nome,
					horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
					tipo: 'CONSULTA',
					chamadoEm: new Date()
				};
			}
		} catch (e) {
			console.info('[UniSISM TV] Aguardando sinal de chamadas...', e);
		}
	}

	function iniciarSincronizacao() {
		if (timerPolling) clearInterval(timerPolling);
		sincronizarChamadas();
		timerPolling = setInterval(sincronizarChamadas, 3000);
	}

	function alternarFullscreen() {
		if (typeof document === 'undefined') return;
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().then(() => {
				isFullscreen = true;
			}).catch(() => {});
		} else {
			document.exitFullscreen().then(() => {
				isFullscreen = false;
			}).catch(() => {});
		}
	}

	function dispararChamadaTeste() {
		const ehCeo = centroPareado?.sigla === 'CEO';
		const teste: ChamadaPainel = {
			id: 'teste-' + Date.now(),
			pacienteNome: ehCeo ? 'MARIA SILVA SANTOS (TESTE DE ÁUDIO)' : 'JOÃO CARLOS PEREIRA (TESTE DE ÁUDIO)',
			consultorio: ehCeo ? 'CADEIRA ODONTOLÓGICA 01 — SETOR B' : 'CONSULTÓRIO 03 — ALA A',
			medicoNome: ehCeo ? 'Dra. Camila Ribeiro (Endodontia)' : 'Dr. Roberto Medeiros (Cardiologia)',
			especialidade: ehCeo ? 'Tratamento Endodôntico' : 'Cardiologia Clínica',
			horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
			tipo: 'CONSULTA',
			chamadoEm: new Date()
		};

		ultimaChamadaIdProcessada = teste.id;
		chamadaAtual = teste;
		piscarDestaque = true;
		setTimeout(() => { piscarDestaque = false; }, 4000);
		falarChamada(teste.pacienteNome, teste.consultorio);
	}

	onMount(() => {
		atualizarRelogio();
		timerRelogio = setInterval(atualizarRelogio, 1000);

		// 1. Verifica parâmetro na URL (?pin=CEM-2026 ou ?centro=CEM)
		const pinUrl = page.url.searchParams.get('pin') || page.url.searchParams.get('senha') || page.url.searchParams.get('centro');
		if (pinUrl) {
			parearComSenha(pinUrl);
			return;
		}

		// 2. Verifica se a Smart TV já estava pareada no localStorage
		const salvo = localStorage.getItem('unisism_tv_centro');
		if (salvo && CENTROS_CONFIG[salvo]) {
			centroPareado = CENTROS_CONFIG[salvo];
			iniciarSincronizacao();
		}
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
	<title>{centroPareado ? `${centroPareado.sigla} · Painel TV de Chamadas` : 'UNISISM · Conectar Painel TV'}</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 font-sans text-white select-none overflow-hidden flex flex-col justify-between">
	{#if !centroPareado}
		<!-- ═══════════════════════════════════════════════════════════════
		     TELA DE PAREAMENTO / AUTENTICAÇÃO DA SMART TV
		     ═══════════════════════════════════════════════════════════════ -->
		<div class="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
			<div class="w-full max-w-xl border border-slate-800 bg-slate-900/90 shadow-2xl p-8 md:p-10 backdrop-blur-sm">
				<!-- Header institucional -->
				<div class="flex items-center gap-4 border-b border-slate-800 pb-6">
					<div class="flex h-14 w-14 items-center justify-center border-2 border-blue-400 bg-blue-950 font-mono text-2xl font-black text-blue-300">
						U
					</div>
					<div>
						<div class="font-mono text-xs font-bold tracking-widest text-blue-400 uppercase">
							SISTEMA UNIFICADO DE SAÚDE · UNISISM
						</div>
						<h1 class="font-mono text-2xl font-bold tracking-tight text-white">
							Terminal de Sala de Espera
						</h1>
						<p class="font-mono text-[11px] text-slate-400">
							Conexão de Smart TV & Painel de Chamadas Ambulatoriais
						</p>
					</div>
				</div>

				<!-- Formulário de Senha -->
				<div class="mt-8">
					<label for="senha-tv" class="block font-mono text-xs font-bold tracking-wider text-slate-300 uppercase mb-2">
						Digite a Senha ou Código do Centro
					</label>
					<div class="relative">
						<input
							id="senha-tv"
							type="text"
							placeholder="Ex.: CEM-2026 ou CEO-2026"
							bind:value={senhaInput}
							onkeydown={(e) => e.key === 'Enter' && parearComSenha(senhaInput)}
							class="w-full border-2 border-slate-700 bg-slate-950 px-4 py-3.5 font-mono text-lg font-bold tracking-widest text-white uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
						/>
					</div>

					{#if erroAutenticacao}
						<div class="mt-3 border border-red-500/60 bg-red-950/60 px-4 py-2.5 font-mono text-xs font-bold text-red-300">
							⚠ {erroAutenticacao}
						</div>
					{/if}

					<button
						onclick={() => parearComSenha(senhaInput)}
						class="mt-6 w-full border-2 border-blue-600 bg-blue-600 py-3.5 font-mono text-sm font-bold tracking-widest text-white uppercase hover:bg-blue-500 active:bg-blue-700 transition-all flex items-center justify-center gap-2"
					>
						<span>Conectar Painel da TV</span>
						<kbd class="border border-white/40 px-1.5 py-0.5 text-[10px]">↵</kbd>
					</button>

					<!-- Conexão Rápida em 1 Clique -->
					<div class="mt-8 border-t border-slate-800 pt-6">
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-400 uppercase text-center mb-4">
							Ou selecione o centro correspondente:
						</div>
						<div class="grid grid-cols-2 gap-3">
							<button
								onclick={() => parearComSenha('CEM-2026')}
								class="border border-blue-900/60 bg-blue-950/40 p-4 text-left hover:border-blue-500 hover:bg-blue-900/40 transition-all group"
							>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm font-bold text-blue-300 group-hover:text-white">CEM</span>
									<span class="inline-block h-2 w-2 rounded-full bg-blue-400"></span>
								</div>
								<div class="font-mono text-[10px] text-slate-400 mt-1">Especialidades Médicas</div>
								<div class="font-mono text-[9px] text-blue-400 mt-2 font-bold">SENHA: CEM-2026</div>
							</button>

							<button
								onclick={() => parearComSenha('CEO-2026')}
								class="border border-emerald-900/60 bg-emerald-950/40 p-4 text-left hover:border-emerald-500 hover:bg-emerald-900/40 transition-all group"
							>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm font-bold text-emerald-300 group-hover:text-white">CEO</span>
									<span class="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
								</div>
								<div class="font-mono text-[10px] text-slate-400 mt-1">Especialidades Odonto</div>
								<div class="font-mono text-[9px] text-emerald-400 mt-2 font-bold">SENHA: CEO-2026</div>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- ═══════════════════════════════════════════════════════════════
		     TELA PRINCIPAL DA SMART TV (PAINEL FULLSCREEN ATIVO)
		     ═══════════════════════════════════════════════════════════════ -->
		
		<!-- TOPO INSTITUCIONAL / HEADER -->
		<header class="border-b border-slate-800 bg-slate-900/80 px-6 py-4 flex items-center justify-between backdrop-blur-md">
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center border-2 {centroPareado.corTema === 'blue' ? 'border-blue-400 bg-blue-950 text-blue-300' : 'border-emerald-400 bg-emerald-950 text-emerald-300'} font-mono text-xl font-bold">
					{centroPareado.sigla}
				</div>
				<div>
					<div class="flex items-center gap-2">
						<span class="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase">
							SISTEMA UNIFICADO DE SAÚDE · SALA DE ESPERA
						</span>
						<span class="inline-flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
							<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
							SINAL AO VIVO
						</span>
					</div>
					<h1 class="font-mono text-lg md:text-xl font-bold tracking-tight text-white">
						{centroPareado.nome}
					</h1>
				</div>
			</div>

			<!-- RELÓGIO & DATA & CONTROLES -->
			<div class="flex items-center gap-6">
				<div class="text-right font-mono">
					<div class="text-2xl md:text-3xl font-bold tracking-widest text-white">
						{horarioAtual}
					</div>
					<div class="text-[10px] md:text-xs font-semibold tracking-wider text-slate-400 uppercase">
						{dataAtual}
					</div>
				</div>

				<div class="flex items-center gap-2 border-l border-slate-800 pl-6">
					<button
						onclick={dispararChamadaTeste}
						title="Testar áudio e chamada"
						class="border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-300 uppercase hover:bg-slate-700 transition-colors"
					>
						🔊 Testar Som
					</button>

					<button
						onclick={() => { audioHabilitado = !audioHabilitado; vozHabilitada = !vozHabilitada; }}
						class="border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-300 uppercase hover:bg-slate-700 transition-colors"
					>
						{audioHabilitado ? 'Áudio: ON' : 'Áudio: OFF'}
					</button>

					<button
						onclick={alternarFullscreen}
						class="border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-300 uppercase hover:bg-slate-700 transition-colors"
					>
						{isFullscreen ? 'Tela Normal' : 'Tela Cheia'}
					</button>

					<button
						onclick={desparear}
						title="Desconectar da TV"
						class="border border-red-900/60 bg-red-950/40 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-red-300 uppercase hover:bg-red-900/60 transition-colors"
					>
						Desconectar
					</button>
				</div>
			</div>
		</header>

		<!-- CORPO PRINCIPAL (ÚLTIMA CHAMADA GIGANTE + HISTÓRICO) -->
		<main class="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden items-stretch">
			
			<!-- COLUNA PRINCIPAL: PACIENTE CHAMADO EM DESTAQUE (COL-8) -->
			<div class="col-span-12 lg:col-span-8 flex flex-col justify-between">
				<div class="relative flex-1 border-2 {piscarDestaque ? (centroPareado.corTema === 'blue' ? 'border-blue-400 bg-blue-950/60 shadow-[0_0_50px_rgba(59,130,246,0.5)]' : 'border-emerald-400 bg-emerald-950/60 shadow-[0_0_50px_rgba(16,185,129,0.5)]') : 'border-slate-800 bg-slate-900/60'} p-8 md:p-12 flex flex-col justify-between transition-all duration-500 rounded-none">
					
					<!-- Tag de status de chamada -->
					<div class="flex items-center justify-between border-b border-slate-800/80 pb-4">
						<div class="flex items-center gap-3">
							<span class="inline-flex items-center gap-2 border {piscarDestaque ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-blue-500/50 bg-blue-950 text-blue-300'} px-3 py-1 font-mono text-xs md:text-sm font-black uppercase tracking-widest">
								{#if piscarDestaque}
									<span class="inline-block h-2.5 w-2.5 animate-ping bg-slate-950"></span>
									NOVA CHAMADA
								{:else}
									<span class="inline-block h-2 w-2 bg-blue-400"></span>
									ATENDIMENTO ATUAL
								{/if}
							</span>
							<span class="font-mono text-xs tracking-wider text-slate-400 uppercase">
								Horário: <strong class="text-white">{chamadaAtual?.horario || horarioAtual}</strong>
							</span>
						</div>

						<div class="font-mono text-xs font-bold tracking-widest text-slate-500 uppercase">
							PAINEL DE SENHAS ELETRÔNICO
						</div>
					</div>

					<!-- NOME DO PACIENTE EM TIPOGRAFIA MONUMENTAL -->
					<div class="my-auto py-6">
						<div class="font-mono text-xs md:text-sm font-bold tracking-widest text-blue-400 uppercase mb-2">
							PACIENTE CONVOCADO:
						</div>
						<div class="text-4xl md:text-6xl xl:text-7xl font-black font-mono tracking-tight text-white leading-none break-words uppercase">
							{chamadaAtual?.pacienteNome || 'AGUARDANDO PRÓXIMA CHAMADA'}
						</div>
					</div>

					<!-- LOCAL / CONSULTÓRIO / CADEIRA EM DESTAQUE GIGANTE -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/80 pt-6">
						<div class="border-2 {centroPareado.corTema === 'blue' ? 'border-blue-500/80 bg-blue-900/50' : 'border-emerald-500/80 bg-emerald-900/50'} p-6">
							<div class="font-mono text-[11px] font-bold tracking-widest {centroPareado.corTema === 'blue' ? 'text-blue-200' : 'text-emerald-200'} uppercase">
								DIRIJA-SE AO LOCAL:
							</div>
							<div class="font-mono text-2xl md:text-4xl font-black text-white tracking-wide mt-1">
								{chamadaAtual?.consultorio || 'SALA DE ATENDIMENTO'}
							</div>
						</div>

						<div class="border border-slate-800 bg-slate-950/60 p-6 flex flex-col justify-center">
							<div class="font-mono text-[11px] font-bold tracking-widest text-slate-400 uppercase">
								PROFISSIONAL / ESPECIALIDADE:
							</div>
							<div class="font-mono text-lg md:text-xl font-bold text-white mt-1">
								{chamadaAtual?.medicoNome || 'Corpo Clínico'}
							</div>
							<div class="font-mono text-xs font-semibold text-blue-400 uppercase mt-0.5">
								{chamadaAtual?.especialidade || centroPareado.nome}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- COLUNA LATERAL: ÚLTIMAS 5 CHAMADAS (COL-4) -->
			<div class="col-span-12 lg:col-span-4 flex flex-col border border-slate-800 bg-slate-900/60 p-6">
				<div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
					<div class="font-mono text-xs font-bold tracking-widest text-slate-300 uppercase">
						Últimas Chamadas
					</div>
					<span class="font-mono text-[10px] text-slate-500">HISTÓRICO RECENTE</span>
				</div>

				<div class="flex-1 flex flex-col gap-3 overflow-hidden">
					{#if ultimasChamadas.length === 0}
						<div class="flex-1 flex items-center justify-center font-mono text-xs text-slate-600 uppercase text-center p-6 border border-dashed border-slate-800">
							Aguardando chamadas anteriores nesta sessão...
						</div>
					{:else}
						{#each ultimasChamadas as uc}
							<div class="border border-slate-800 bg-slate-950/70 p-3.5 hover:border-slate-700 transition-colors">
								<div class="flex items-center justify-between">
									<span class="font-mono text-xs font-bold text-white truncate max-w-[200px] uppercase">
										{uc.pacienteNome}
									</span>
									<span class="font-mono text-[10px] font-bold text-slate-400">
										{uc.horario}
									</span>
								</div>
								<div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 font-mono text-[10px]">
									<span class="font-bold {centroPareado.corTema === 'blue' ? 'text-blue-400' : 'text-emerald-400'}">
										{uc.consultorio}
									</span>
									<span class="text-slate-400 truncate max-w-[120px]">
										{uc.especialidade}
									</span>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<!-- AVISO DE ORIENTAÇÃO -->
				<div class="mt-4 border border-blue-900/40 bg-blue-950/30 p-3 font-mono text-[10px] text-blue-200">
					<div class="font-bold uppercase flex items-center gap-1.5 mb-1">
						<span class="inline-block h-1.5 w-1.5 bg-blue-400"></span>
						ORIENTAÇÃO AO USUÁRIO
					</div>
					<p class="leading-relaxed text-slate-300">
						Ao ser anunciado no painel, dirija-se imediatamente à porta do consultório indicado portando documento de identificação.
					</p>
				</div>
			</div>
		</main>

		<!-- RODAPÉ / TICKER DE MENSAGENS INSTITUCIONAIS -->
		<footer class="border-t border-slate-800 bg-slate-900 px-6 py-2.5 flex items-center justify-between text-xs font-mono">
			<div class="flex items-center gap-4 overflow-hidden">
				<span class="border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-blue-300 uppercase tracking-widest whitespace-nowrap">
					INFORME SUS
				</span>
				<div class="text-slate-300 text-[11px] truncate tracking-wider uppercase">
					Secretaria Municipal de Saúde · Mantenha seus documentos em mãos · Vacinação e preventivos disponíveis na sua UBS de referência · Dúvidas, procure a recepção.
				</div>
			</div>

			<div class="font-mono text-[10px] text-slate-500 whitespace-nowrap pl-4">
				UNISISM TV v1.0
			</div>
		</footer>
	{/if}
</div>
