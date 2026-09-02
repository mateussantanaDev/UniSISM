<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';

	// Estado de autenticação do usuário
	let usuarioLogado = $state<{ nome: string; role: string; email: string } | null>(null);
	let rotaDestino = $state('/login');

	// Estado do seletor interativo de módulos
	let moduloAtivo = $state<'sms' | 'ubs' | 'cem' | 'ceo' | 'tfd' | 'tv' | 'app'>('sms');

	// ─── INTERATIVIDADE MÓDULO SMS ───────────────────────────────────────────
	let filtroPrioridadeSms = $state<'TODAS' | 'URGENTE' | 'ALTA' | 'ELETIVA'>('TODAS');
	let listaRegulacaoSms = $state([
		{ id: 'ENC-01', paciente: 'MARIA APARECIDA DA SILVA', ubs: 'USF Zilda Arns', especialidade: 'Cardiologia', prioridade: 'URGENTE', status: 'PENDENTE', cid: 'I10 (Hipertensão)' },
		{ id: 'ENC-02', paciente: 'JOSE CARLOS RODRIGUES', ubs: 'USF Curral Novo', especialidade: 'Ortopedia', prioridade: 'ALTA', status: 'PENDENTE', cid: 'M54.5 (Lombalgia Crônica)' },
		{ id: 'ENC-03', paciente: 'SEVERINA FERREIRA SANTOS', ubs: 'USF Tanque', especialidade: 'Dermatologia', prioridade: 'ELETIVA', status: 'PENDENTE', cid: 'L70.0 (Acne Vulgar)' },
		{ id: 'ENC-04', paciente: 'ANTONIO PEREIRA LIMA', ubs: 'USF Fulni-ô', especialidade: 'Neurologia', prioridade: 'URGENTE', status: 'APROVADO', cid: 'G40.9 (Epilepsia)' }
	]);

	function aprovarEncaminhamentoSms(id: string) {
		listaRegulacaoSms = listaRegulacaoSms.map((item) =>
			item.id === id ? { ...item, status: 'APROVADO' } : item
		);
	}

	// ─── INTERATIVIDADE MÓDULO UBS ───────────────────────────────────────────
	let buscaUbs = $state('MARIA');
	const pacientesExemploUbs = [
		{ nome: 'MARIA APARECIDA DA SILVA', cpf: '042.891.334-09', sus: '7061.0851.2525.560', condicoes: ['Hipertensão (HiperDia)', 'Diabética'], ubs: 'USF Zilda Arns', status: 'Acolhida' },
		{ nome: 'MARIA DAS DORES GOMES', cpf: '019.452.118-22', sus: '7004.0921.8834.190', condicoes: ['Gestante 24 semanas', 'Pré-Natal Ativo'], ubs: 'USF Zilda Arns', status: 'Aguardando Médico' },
		{ nome: 'JOSEFA MARIA DE SOUZA', cpf: '055.781.994-30', sus: '7028.0912.4246.763', condicoes: ['Idosa 78 anos', 'Asma'], ubs: 'USF Manoel Monteiro', status: 'Encaminhamento Emitido' },
		{ nome: 'JOSE CARLOS DOS SANTOS', cpf: '491.572.134-53', sus: '7085.0937.0663.377', condicoes: ['Lombalgia'], ubs: 'USF Curral Novo', status: 'Acolhido' }
	];

	let pacientesFiltradosUbs = $derived(
		pacientesExemploUbs.filter((p) =>
			p.nome.toLowerCase().includes(buscaUbs.toLowerCase()) ||
			p.cpf.includes(buscaUbs) ||
			p.sus.includes(buscaUbs)
		)
	);

	// ─── INTERATIVIDADE MÓDULO CEM ───────────────────────────────────────────
	let consultorioCemAtivo = $state('CONS-01');
	let abaSoapAtiva = $state<'S' | 'O' | 'A' | 'P'>('A');

	// ─── INTERATIVIDADE MÓDULO CEO ───────────────────────────────────────────
	let denteSelecionado = $state<number>(16);
	let statusDentes = $state<Record<number, { status: string; procedimento: string }>>({
		16: { status: 'TRATAMENTO_CANAL', procedimento: '03.07.03.004-3 Endodontia Molar' },
		21: { status: 'RESTAURADO', procedimento: '03.07.01.002-3 Restauração Resina' },
		36: { status: 'EXTRACAO_RECOMENDADA', procedimento: '03.07.04.008-1 Cirurgia Oral Menor' },
		46: { status: 'HIGIDO', procedimento: 'Hígido / Sem Alteração' }
	});

	function alterarStatusDente(st: string, proc: string) {
		statusDentes[denteSelecionado] = { status: st, procedimento: proc };
	}

	// ─── INTERATIVIDADE MÓDULO TFD ───────────────────────────────────────────
	let rotaTfdAtiva = $state<'recife' | 'garanhuns'>('recife');
	let assentoSelecionado = $state<number>(1);
	const passageirosTfd = [
		{ assento: 1, nome: 'SEVERINA RAMOS', dest: 'IMIP (Oncologia)', acom: 'SIM', status: 'Confirmado' },
		{ assento: 2, nome: 'JOSEFA MARIA', dest: 'HUOC (Cardio)', acom: 'NÃO', status: 'Confirmado' },
		{ assento: 3, nome: 'ANTONIO LIMA', dest: 'PROCAPE', acom: 'SIM', status: 'Confirmado' },
		{ assento: 4, nome: 'MARIA SILVA', dest: 'CISAM (Obstetrícia)', acom: 'SIM', status: 'Pendente Ajuda Custo' },
		{ assento: 5, nome: 'FRANCISCO ASSIS', dest: 'HRPE (Ortopedia)', acom: 'NÃO', status: 'Confirmado' }
	];

	// ─── INTERATIVIDADE SMART TV COM SÍNTESE DE VOZ ──────────────────────────
	let testandoVoz = $state(false);
	let feedbackVoz = $state('');

	function tocarChimeHospitalar(): void {
		try {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();
			const now = ctx.currentTime;

			// Tom suave 1
			const osc1 = ctx.createOscillator();
			const gain1 = ctx.createGain();
			osc1.type = 'sine';
			osc1.frequency.setValueAtTime(587.33, now); // D5
			gain1.gain.setValueAtTime(0.2, now);
			gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
			osc1.connect(gain1);
			gain1.connect(ctx.destination);
			osc1.start(now);
			osc1.stop(now + 0.5);

			// Tom suave 2
			const osc2 = ctx.createOscillator();
			const gain2 = ctx.createGain();
			osc2.type = 'sine';
			osc2.frequency.setValueAtTime(880.0, now + 0.15); // A5
			gain2.gain.setValueAtTime(0.25, now + 0.15);
			gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
			osc2.connect(gain2);
			gain2.connect(ctx.destination);
			osc2.start(now + 0.15);
			osc2.stop(now + 0.7);
		} catch {}
	}

	function dispararChamadaVozDemo(nome = 'SEVERINO RAMOS DE SOUZA', local = 'CONSULTÓRIO ZERO DOIS, ORTOPEDIA') {
		testandoVoz = true;
		feedbackVoz = `Sintetizando voz: "Atenção: ${nome}, favor dirigir-se ao ${local}."`;

		tocarChimeHospitalar();

		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
			const texto = `Atenção: Paciente ${nome}. Favor dirigir-se ao ${local}.`;
			const utterance = new SpeechSynthesisUtterance(texto);
			utterance.lang = 'pt-BR';
			utterance.rate = 0.95;
			utterance.pitch = 1.05;

			const vozes = window.speechSynthesis.getVoices();
			const vozPt = vozes.find((v) => v.lang.includes('pt') && (v.name.toLowerCase().includes('maria') || v.name.toLowerCase().includes('luciana') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('brasil')));
			if (vozPt) utterance.voice = vozPt;

			utterance.onend = () => {
				testandoVoz = false;
				setTimeout(() => (feedbackVoz = ''), 3000);
			};

			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 600);
		} else {
			setTimeout(() => {
				testandoVoz = false;
			}, 2000);
		}
	}

	// ─── INTERATIVIDADE APP DO CIDADÃO ───────────────────────────────────────
	let telaAppAtiva = $state<'consultas' | 'viagens' | 'vacinas' | 'avisos'>('consultas');

	// Formulário de Demonstração B2G
	let formNome = $state('');
	let formMunicipio = $state('');
	let formUf = $state('PE');
	let formCargo = $state('Secretário(a) de Saúde');
	let formEmail = $state('');
	let formTelefone = $state('');
	let enviandoForm = $state(false);
	let formEnviado = $state(false);
	let protocoloDemonstracao = $state('');

	// Simulador de Eficiência Municipal
	let porteSelecionado = $state<'pequeno' | 'medio' | 'grande'>('medio');

	const portesConfig = {
		pequeno: {
			habitantes: 'Até 30.000 hab.',
			ubss: '6 a 10 UBSs',
			economiaHoras: '1.200h/mês',
			reducaoAbsenteismo: '45%',
			cotasOtimizadas: '2.500 vagas/mês',
			controleTfd: 'R$ 85.000/ano em combustível e diárias'
		},
		medio: {
			habitantes: '30.000 a 100.000 hab. (Ex: Águas Belas)',
			ubss: '13 a 25 UBSs',
			economiaHoras: '4.800h/mês',
			reducaoAbsenteismo: '62%',
			cotasOtimizadas: '9.000 vagas/mês',
			controleTfd: 'R$ 340.000/ano em combustível e diárias'
		},
		grande: {
			habitantes: 'Mais de 100.000 hab.',
			ubss: '30+ UBSs & Policlínicas',
			economiaHoras: '12.500h/mês',
			reducaoAbsenteismo: '70%',
			cotasOtimizadas: '28.000 vagas/mês',
			controleTfd: 'R$ 950.000/ano em combustível e diárias'
		}
	};

	onMount(async () => {
		if (api.tokens.get()) {
			try {
				const me = await api.auth.me();
				usuarioLogado = { nome: me.nome, role: me.role, email: me.email };
				rotaDestino = rbac.faceDestinoPadrao(me.role, me);
			} catch {
				api.tokens.set(null);
				usuarioLogado = null;
			}
		}
	});

	function submeterDemonstracao(e: SubmitEvent) {
		e.preventDefault();
		enviandoForm = true;
		setTimeout(() => {
			protocoloDemonstracao = `B2G-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
			enviandoForm = false;
			formEnviado = true;
		}, 800);
	}
</script>

<svelte:head>
	<title>UniSISM · Sistema Operacional de Saúde Pública Municipal</title>
	<meta
		name="description"
		content="Plataforma integrada de regulação em tempo real, prontuário digital e atendimento clínico que conecta UBSs, Centros de Especialidades (CEM/CEO), Frotas TFD, Painéis Smart TV e o Cidadão."
	/>
</svelte:head>

<div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased selection:bg-blue-900 selection:text-white">
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- TOPBAR TELEMETRIA & STATUS GLOBAL                                     -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<aside class="border-b border-slate-800 bg-slate-950 px-4 py-1.5 text-xs text-slate-400">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
			<div class="flex items-center gap-3">
				<span class="flex items-center gap-1.5 text-emerald-400 font-semibold">
					<span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
					REDE OPERACIONAL ATIVA
				</span>
				<span class="text-slate-600">|</span>
				<span>MUNÍCIPIO REFERÊNCIA: <strong class="text-slate-200">ÁGUAS BELAS / PE</strong></span>
				<span class="text-slate-600 hidden sm:inline">|</span>
				<span class="hidden sm:inline">NÓS CONECTADOS: <strong class="text-slate-200">13 UBSs · CEM · CEO · TFD</strong></span>
			</div>
			<div class="flex items-center gap-4 text-slate-400">
				<span>INTEGRIDADE CFM/LGPD: <strong class="text-emerald-400">100%</strong></span>
				<span class="hidden md:inline">VERSÃO: <strong>v0.18.4 PRODUCTION</strong></span>
			</div>
		</div>
	</aside>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- NAVBAR INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<header class="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
			<!-- Logo Oficial -->
			<a href="/" class="flex items-center gap-3 group">
				<div
					class="flex h-10 w-10 items-center justify-center border-2 border-slate-900 bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 shadow-sm transition-transform group-hover:scale-105"
				>
					<span class="font-mono text-xl font-black tracking-tighter text-white">U</span>
				</div>
				<div class="flex flex-col">
					<div class="flex items-center gap-1.5">
						<span class="font-mono text-lg font-black tracking-tight text-slate-950 uppercase">UniSISM</span>
						<span class="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-900">SUS B2G</span>
					</div>
					<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase">
						Saúde Pública Municipal
					</span>
				</div>
			</a>

			<!-- Navegação Desktop -->
			<nav class="hidden md:flex items-center gap-6 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase">
				<a href="#solucao" class="hover:text-blue-900 transition-colors">O Que Resolvemos</a>
				<a href="#modulos" class="hover:text-blue-900 transition-colors">Módulos Interativos</a>
				<a href="#case" class="hover:text-blue-900 transition-colors">Case Águas Belas</a>
				<a href="#seguranca" class="hover:text-blue-900 transition-colors">Auditoria & LGPD</a>
				<a href="#demonstracao" class="text-blue-700 hover:text-blue-900 transition-colors">Implantar</a>
			</nav>

			<!-- Ações / Botões -->
			<div class="flex items-center gap-3">
				{#if usuarioLogado}
					<a
						href={rotaDestino}
						class="flex items-center gap-2 border-2 border-slate-950 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
					>
						<span>PAINEL ({usuarioLogado.role})</span>
						<span>→</span>
					</a>
				{:else}
					<a
						href="#demonstracao"
						class="hidden sm:flex border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase transition-colors hover:bg-slate-200"
					>
						Solicitar Demo
					</a>
					<a
						href="/login"
						class="flex items-center gap-2 border-2 border-slate-950 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
					>
						<span>ACESSAR TERMINAL</span>
						<span>→</span>
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- HERO SECTION: O SISTEMA OPERACIONAL DA SAÚDE MUNICIPAL                -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section class="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white to-slate-100/70 py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
				<!-- Copy Principal -->
				<div class="lg:col-span-7 flex flex-col items-start gap-6">
					<div class="inline-flex items-center gap-2 border border-blue-900/20 bg-blue-50/80 px-3 py-1 text-xs font-mono font-bold tracking-wider text-blue-900 uppercase">
						<span class="h-2 w-2 rounded-full bg-blue-700"></span>
						Sistema Operacional SUS de Alta Performance
					</div>

					<h1 class="font-sans text-3xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl leading-[1.08]">
						A Saúde Pública Municipal <span class="text-blue-900 underline decoration-blue-900/30 decoration-4">Integrada</span>, Transparente e em Tempo Real.
					</h1>

					<p class="text-base sm:text-lg leading-relaxed text-slate-600 font-medium">
						O <strong class="text-slate-900">UniSISM</strong> unifica a regulação de saúde, o prontuário eletrônico PEC, as consultas com especialistas (CEM/CEO), as viagens do TFD e a chamada por Smart TV em uma única malha digital à prova de fraudes.
					</p>

					<!-- Dual Call To Action -->
					<div class="flex flex-wrap items-center gap-4 pt-2">
						<a
							href="/login"
							class="flex items-center gap-3 border-2 border-slate-950 bg-blue-900 px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
						>
							<span>ACESSAR O SISTEMA</span>
							<span class="text-lg leading-none">→</span>
						</a>

						<a
							href="#demonstracao"
							class="flex items-center gap-2 border-2 border-slate-800 bg-white px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.1)] transition-all hover:bg-slate-50"
						>
							<span>AGENDAR DEMONSTRAÇÃO B2G</span>
						</a>
					</div>

					<!-- Métricas Rápidas de Impacto -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-200 w-full">
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-xl sm:text-2xl font-black text-blue-900">58.312</div>
							<div class="font-mono text-[10px] font-bold text-slate-700 tracking-wider uppercase">Cidadãos Conectados</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-xl sm:text-2xl font-black text-slate-900">13 UBSs</div>
							<div class="font-mono text-[10px] font-bold text-slate-700 tracking-wider uppercase">Unidades na Rede</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-xl sm:text-2xl font-black text-emerald-700">100%</div>
							<div class="font-mono text-[10px] font-bold text-slate-700 tracking-wider uppercase">Imutável LGPD/CFM</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-xl sm:text-2xl font-black text-amber-700">0 Fila</div>
							<div class="font-mono text-[10px] font-bold text-slate-700 tracking-wider uppercase">Na Madrugada</div>
						</div>
					</div>
				</div>

				<!-- Visualizador Interativo da Malha SUS (Pulse Box) -->
				<div class="lg:col-span-5">
					<div class="border-2 border-slate-950 bg-slate-900 text-slate-100 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-5 font-mono">
						<!-- Header do Terminal -->
						<div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-red-500 inline-block"></span>
								<span class="h-3 w-3 rounded-full bg-amber-500 inline-block"></span>
								<span class="h-3 w-3 rounded-full bg-emerald-500 inline-block"></span>
								<span class="text-xs font-bold text-slate-400 pl-2">UNISISM // ARCHITECTURE STREAM</span>
							</div>
							<span class="text-[10px] text-emerald-400 font-bold">● LIVE PULSE</span>
						</div>

						<!-- Diagrama de Conectividade em ASCII / Terminal -->
						<div class="space-y-3 text-xs leading-relaxed">
							<div class="border border-slate-800 bg-slate-950/80 p-3">
								<div class="text-slate-400 text-[10px] uppercase font-bold">1. PONTO DE ENTRADA (ATENÇÃO BÁSICA)</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>🏥 13 Postos de Saúde (UBSs)</span>
									<span class="text-emerald-400 text-[11px]">e-SUS Cloud Sincronizado</span>
								</div>
								<div class="text-slate-400 text-[11px] pt-1">Cadastro individual, acolhimento, triagem e envio com anexos clínicos.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Regulação Algorítmica & Matriz de Cotas</div>

							<div class="border border-blue-900/50 bg-blue-950/40 p-3">
								<div class="text-blue-300 text-[10px] uppercase font-bold">2. NÓ CENTRAL (SECRETARIA DE SAÚDE - SMS)</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>🏛️ Fila Única & Auditoria Criptográfica</span>
									<span class="text-blue-400 text-[11px]">Trilha Imutável</span>
								</div>
								<div class="text-slate-300 text-[11px] pt-1">Distribuição justa de cotas para cada bairro e zona rural. Zero interferência política.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Despacho Automatizado</div>

							<div class="grid grid-cols-2 gap-2">
								<div class="border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]">
									<div class="text-amber-400 font-bold">🩺 CEM & CEO</div>
									<div class="text-slate-300 text-[10px] pt-1">Consultórios médicos, cadeiras odonto e SOAP.</div>
								</div>
								<div class="border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]">
									<div class="text-emerald-400 font-bold">🚑 TFD & FROTAS</div>
									<div class="text-slate-300 text-[10px] pt-1">Viagens, rotas, ambulâncias e ajuda de custo.</div>
								</div>
							</div>

							<div class="border border-emerald-900/40 bg-emerald-950/30 p-2.5 flex items-center justify-between text-[11px]">
								<span class="text-emerald-300 font-bold">📺 Smart TV com Voz Humanizada</span>
								<span class="text-slate-400 text-[10px]">PIN: CEM-2026</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- O QUE O UNISISM RESOLVE (DORES DO SUS × RESPOSTA UNISISM)             -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="solucao" class="border-b border-slate-200 bg-white py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-16">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase mb-3">
					Eficiência & Resolução de Gargalos
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Transformando as Maiores Dores da Saúde Pública em Governança Transparente
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-4 leading-relaxed font-medium">
					Eliminamos o desperdício de recursos, a falta de dados e as longas esperas através de uma arquitetura pensada exclusivamente para a realidade das cidades brasileiras.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Problema 1 × Solução 1 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ PROBLEMA TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Filas de Madrugada & Marcações Obscuras</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Cidadãos acordando às 03h da manhã em filas nos postos de saúde sem garantia de atendimento, e cotas distribuídas sem critério clínico claro.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Matriz de Cotas Digital por UBS + Regulação Algorítmica por Prioridade Clínica do SUS. O cidadão sai do posto já agendado ou notificado pelo celular.
						</p>
					</div>
				</div>

				<!-- Problema 2 × Solução 2 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ PROBLEMA TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Encaminhamentos em Papel Extraviados</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Guias físicas rasuradas, perda de histórico entre a UBS e o médico especialista, resultando em exames repetidos e diagnósticos tardios.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Dossiê Digital Unificado com sincronização nativa do e-SUS APS. Todo o histórico, anexos de imagem e evolução clínica em 1 clique.
						</p>
					</div>
				</div>

				<!-- Problema 3 × Solução 3 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ PROBLEMA TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Descontrole Financeiro e Logístico no TFD</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Planilhas manuais de combustível, falta de rastreio de passageiros em vans/ambulâncias e risco de glosas em auditorias do Tribunal de Contas.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Módulo TFD Completo com escalas de motoristas, controle de quilometragem, prestação de contas de ajuda de custo e assinatura digital ICP-Brasil.
						</p>
					</div>
				</div>

				<!-- Problema 4 × Solução 4 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ PROBLEMA TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Salas de Espera Caóticas & Vozes Mecânicas</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Gritos em corredores para chamar pacientes, painéis eletrônicos desconectados e falta de humanização no atendimento especializado.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Smart TV Panel com síntese de voz humanizada em português do Brasil, chamada por consultório/cadeira e pareamento instantâneo via PIN.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- VITRINE COMPLETA DE MÓDULOS (SANDBOX & DEMONSTRAÇÃO INTERATIVA)      -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="modulos" class="border-b border-slate-200 bg-slate-100/70 py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase mb-3">
					Sandbox Interativo ao Vivo
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Teste as Funcionalidades dos Módulos em Tempo Real
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-3 font-medium">
					Clique nas abas abaixo para interagir com a interface real de regulação, prontuários, chamada de TV e escalas.
				</p>
			</div>

			<!-- Navegação por Abas dos Módulos -->
			<div class="flex flex-wrap items-center justify-center gap-2 mb-8">
				<button
					type="button"
					onclick={() => (moduloAtivo = 'sms')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'sms'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🏛️ SMS (Regulação)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ubs')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'ubs'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🏥 UBS (Atenção Básica)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'cem')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'cem'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🩺 CEM (Especialidades Médicas)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ceo')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'ceo'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🦷 CEO (Especialidades Odonto)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tfd')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'tfd'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🚑 TFD (Transporte & Frotas)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tv')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'tv'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					📺 Smart TV (Chamada por Voz)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'app')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'app'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					📱 App do Cidadão
				</button>
			</div>

			<!-- Painel Interativo do Módulo Selecionado -->
			<div class="border-2 border-slate-950 bg-white p-6 sm:p-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
				{#if moduloAtivo === 'sms'}
					<div class="space-y-6">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="font-mono text-xs font-bold text-blue-900 uppercase">🏛️ SIMULADOR DE REGULAÇÃO MUNICIPAL (SMS)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Fila Única e Despacho de Cotas</h3>
							</div>
							<div class="flex items-center gap-2 font-mono text-xs">
								<span class="text-slate-500 font-bold">FILTRAR PRIORIDADE:</span>
								{#each ['TODAS', 'URGENTE', 'ALTA', 'ELETIVA'] as p}
									<button
										type="button"
										onclick={() => (filtroPrioridadeSms = p as any)}
										class="border px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer
										{filtroPrioridadeSms === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'}"
									>
										{p}
									</button>
								{/each}
							</div>
						</div>

						<div class="overflow-x-auto">
							<table class="w-full text-left font-mono text-xs border border-slate-200">
								<thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
									<tr>
										<th class="p-2.5">ID / PROTOCOLO</th>
										<th class="p-2.5">PACIENTE</th>
										<th class="p-2.5">ORIGEM (UBS)</th>
										<th class="p-2.5">ESPECIALIDADE / CID</th>
										<th class="p-2.5">PRIORIDADE</th>
										<th class="p-2.5">STATUS</th>
										<th class="p-2.5 text-right">AÇÃO REGULATÓRIA</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-200 bg-white">
									{#each listaRegulacaoSms.filter(i => filtroPrioridadeSms === 'TODAS' || i.prioridade === filtroPrioridadeSms) as enc}
										<tr class="hover:bg-slate-50">
											<td class="p-2.5 font-bold text-blue-900">{enc.id}</td>
											<td class="p-2.5 font-bold text-slate-900">{enc.paciente}</td>
											<td class="p-2.5 text-slate-600">{enc.ubs}</td>
											<td class="p-2.5">
												<span class="font-bold text-slate-900">{enc.especialidade}</span>
												<span class="block text-[10px] text-slate-500">{enc.cid}</span>
											</td>
											<td class="p-2.5">
												<span class="border px-1.5 py-0.5 text-[9px] font-bold uppercase
												{enc.prioridade === 'URGENTE' ? 'border-red-600 bg-red-50 text-red-700' : enc.prioridade === 'ALTA' ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-emerald-600 bg-emerald-50 text-emerald-700'}">
													{enc.prioridade}
												</span>
											</td>
											<td class="p-2.5">
												<span class="font-bold {enc.status === 'APROVADO' ? 'text-emerald-700' : 'text-slate-600'}">
													{enc.status}
												</span>
											</td>
											<td class="p-2.5 text-right">
												{#if enc.status === 'PENDENTE'}
													<button
														type="button"
														onclick={() => aprovarEncaminhamentoSms(enc.id)}
														class="border border-blue-900 bg-blue-900 px-2.5 py-1 text-[10px] font-bold text-white uppercase hover:bg-blue-950 cursor-pointer"
													>
														Aprovar Vaga ✓
													</button>
												{:else}
													<span class="text-emerald-700 font-bold text-[10px]">VAGA ALOCADA</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<!-- Distribuição de Cotas da Rede -->
						<div class="border border-slate-200 bg-slate-50 p-4 font-mono text-xs">
							<div class="font-bold text-slate-800 mb-2 flex justify-between">
								<span>CONSUMO MENSAL DE COTAS POR UBS</span>
								<span class="text-blue-900">Total Alocado: 1.450 / 2.000 vagas</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">USF ZILDA ARNS (SEDE)</div>
									<div class="font-bold text-slate-900 mt-0.5">85% Consumido (170/200)</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-blue-900 h-1.5" style="width: 85%"></div></div>
								</div>
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">USF CURRAL NOVO (RURAL)</div>
									<div class="font-bold text-slate-900 mt-0.5">42% Consumido (63/150)</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-emerald-600 h-1.5" style="width: 42%"></div></div>
								</div>
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">USF FULNI-Ô (INDÍGENA)</div>
									<div class="font-bold text-slate-900 mt-0.5">60% Consumido (90/150)</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-amber-600 h-1.5" style="width: 60%"></div></div>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ubs'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-emerald-700 uppercase">🏥 SIMULADOR DE ATENÇÃO BÁSICA (UBS)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Busca Rápida de Prontuário PEC & Acolhimento</h3>
							</div>
							<div class="flex items-center gap-2">
								<label for="buscaSimulada" class="text-xs font-bold text-slate-600">BUSCAR:</label>
								<input
									id="buscaSimulada"
									type="text"
									bind:value={buscaUbs}
									placeholder="Nome, CPF ou CNS..."
									class="border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each pacientesFiltradosUbs as p}
								<div class="border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-700 transition-colors">
									<div class="flex justify-between items-start">
										<div>
											<span class="font-bold text-sm text-slate-950">{p.nome}</span>
											<div class="text-[10px] text-slate-500 mt-0.5">CPF: {p.cpf} · CNS: {p.sus}</div>
										</div>
										<span class="border border-emerald-600 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800 uppercase">
											{p.status}
										</span>
									</div>

									<div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
										{#each p.condicoes as c}
											<span class="bg-slate-100 text-slate-700 px-2 py-0.5 text-[9px] font-semibold">
												● {c}
											</span>
										{/each}
									</div>

									<div class="mt-3 flex justify-between items-center text-[10px]">
										<span class="text-slate-500">Unidade: <strong>{p.ubs}</strong></span>
										<button
											type="button"
											class="text-emerald-700 font-bold hover:underline cursor-pointer"
											onclick={() => alert(`Abrindo Dossiê Clínico Digital de ${p.nome}...`)}
										>
											Abrir Dossiê PEC →
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else if moduloAtivo === 'cem'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-blue-900 uppercase">🩺 SIMULADOR DE ATENDIMENTO MÉDICO ESPECIALIZADO (CEM)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Consultórios, Fila e Prontuário SOAP</h3>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-bold text-slate-600">CONSULTÓRIO:</span>
								<select
									bind:value={consultorioCemAtivo}
									class="border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none"
								>
									<option value="CONS-01">01 — Cardiologia (Dr. Roberto Medeiros)</option>
									<option value="CONS-02">02 — Ortopedia (Dr. Paulo Mendes)</option>
									<option value="CONS-03">03 — Ginecologia (Dra. Ana Castro)</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<!-- Painel do Paciente & Chamada -->
							<div class="lg:col-span-5 border border-slate-200 bg-slate-50 p-4 space-y-3">
								<div class="text-[10px] text-slate-500 uppercase font-bold">PACIENTE EM ATENDIMENTO NO CONSULTÓRIO</div>
								<div class="bg-white border border-slate-300 p-3">
									<div class="font-bold text-base text-slate-950">SEVERINO RAMOS DE SOUZA</div>
									<div class="text-xs text-slate-600 mt-0.5">64 anos · Masculino · Curral Novo</div>
									<div class="text-[11px] text-blue-900 font-bold mt-2">Motivo: Avaliação Cardíaca Pré-Operatória</div>
								</div>

								<div class="pt-2">
									<button
										type="button"
										onclick={() => dispararChamadaVozDemo('SEVERINO RAMOS DE SOUZA', 'CONSULTÓRIO ZERO UM, CARDIOLOGIA')}
										disabled={testandoVoz}
										class="w-full border-2 border-slate-950 bg-blue-900 text-white font-bold py-2.5 text-xs uppercase flex items-center justify-center gap-2 hover:bg-blue-950 cursor-pointer disabled:opacity-50"
									>
										<span>🔊 DISPARAR CHAMADA NA SMART TV</span>
									</button>
									{#if feedbackVoz}
										<div class="mt-2 text-[10px] text-emerald-700 font-bold text-center animate-pulse">
											{feedbackVoz}
										</div>
									{/if}
								</div>
							</div>

							<!-- Prontuário SOAP Interativo -->
							<div class="lg:col-span-7 border border-slate-200 bg-white p-4">
								<div class="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3">
									<span class="text-xs font-bold text-slate-700 uppercase">PRONTUÁRIO SOAP:</span>
									{#each ['S', 'O', 'A', 'P'] as tab}
										<button
											type="button"
											onclick={() => (abaSoapAtiva = tab as any)}
											class="border px-2.5 py-0.5 text-xs font-bold uppercase transition-colors cursor-pointer
											{abaSoapAtiva === tab ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}"
										>
											{tab === 'S' ? 'Subjetivo' : tab === 'O' ? 'Objetivo' : tab === 'A' ? 'Avaliação' : 'Plano'}
										</button>
									{/each}
								</div>

								<div class="text-xs leading-relaxed text-slate-700">
									{#if abaSoapAtiva === 'S'}
										<p><strong>Queixa Principal:</strong> Paciente relata dispneia aos médios esforços há 3 meses. Nega dor precordial em repouso. Em uso de Losartana 50mg 1x/dia.</p>
									{:else if abaSoapAtiva === 'O'}
										<p><strong>Exame Físico:</strong> PA: 130x85 mmHg. FC: 72 bpm. Ausculta Cardíaca: RCR em 2T com sopro sistólico em foco aórtico 2+/6+. Sem edemas em MMII.</p>
									{:else if abaSoapAtiva === 'A'}
										<p><strong>Hipótese Diagnóstica (CID-10):</strong> I35.0 (Estenose da Valva Aórtica) + I10 (Hipertensão Primária). Risco cirúrgico classificado como Moderado.</p>
									{:else if abaSoapAtiva === 'P'}
										<p><strong>Conduta:</strong> Solicitado Ecocardiograma Transtorácico (SIGTAP 02.05.01.003-2). Mantida medicação de base. Retorno agendado para 30 dias.</p>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ceo'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-teal-700 uppercase">🦷 SIMULADOR DE ESPECIALIDADES ODONTOLÓGICAS (CEO)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Odontograma Digital & Brasil Sorridente</h3>
							</div>
							<div class="text-xs font-bold text-slate-600">
								CADEIRA 01 · ENDODONTIA (Dra. Camila Ribeiro CRO-PE 8912)
							</div>
						</div>

						<!-- Odontograma Gráfico -->
						<div class="border border-slate-200 bg-slate-50 p-4">
							<div class="text-[10px] text-slate-500 uppercase font-bold mb-3">SELECIONE O ELEMENTO DENTÁRIO PARA DIAGNÓSTICO:</div>
							<div class="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
								{#each [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as d}
									<button
										type="button"
										onclick={() => (denteSelecionado = d)}
										class="border-2 p-2 font-bold text-xs transition-all cursor-pointer
										{denteSelecionado === d ? 'border-slate-950 bg-teal-900 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-800 hover:bg-teal-50'}"
									>
										<div>#{d}</div>
										<div class="text-[8px] uppercase mt-1">
											{statusDentes[d]?.status === 'TRATAMENTO_CANAL' ? 'CANAL' : statusDentes[d]?.status === 'RESTAURADO' ? 'REST.' : statusDentes[d]?.status === 'EXTRACAO_RECOMENDADA' ? 'EXTRAIR' : 'HÍGIDO'}
										</div>
									</button>
								{/each}
							</div>
						</div>

						<!-- Detalhes do Dente Selecionado -->
						<div class="border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
							<div>
								<div class="text-xs text-slate-500 font-bold">ELEMENTO SELECIONADO: <strong class="text-teal-900 text-sm">DENTE #{denteSelecionado}</strong></div>
								<div class="text-xs text-slate-800 mt-1">Procedimento Atribuído: <strong>{statusDentes[denteSelecionado]?.procedimento || 'Hígido / Sem Alteração'}</strong></div>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onclick={() => alterarStatusDente('TRATAMENTO_CANAL', '03.07.03.004-3 Tratamento Endodôntico (Canal)')}
									class="border border-teal-800 bg-teal-800 text-white px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-teal-900 cursor-pointer"
								>
									+ Indicar Canal
								</button>
								<button
									type="button"
									onclick={() => alterarStatusDente('RESTAURADO', '03.07.01.002-3 Restauração Estética')}
									class="border border-slate-400 bg-slate-100 text-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-slate-200 cursor-pointer"
								>
									+ Restaurar
								</button>
								<button
									type="button"
									onclick={() => alterarStatusDente('HIGIDO', 'Hígido / Sem Alteração')}
									class="border border-slate-300 bg-white text-slate-600 px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-slate-50 cursor-pointer"
								>
									Limpar
								</button>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tfd'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-amber-700 uppercase">🚑 SIMULADOR DE TRATAMENTO FORA DO DOMICÍLIO (TFD)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Manifesto de Viagem, Frota e Passageiros</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'recife')}
									class="border px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer
									{rotaTfdAtiva === 'recife' ? 'border-slate-950 bg-amber-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Rota Recife (IMIP / HUOC)
								</button>
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'garanhuns')}
									class="border px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer
									{rotaTfdAtiva === 'garanhuns' ? 'border-slate-950 bg-amber-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Rota Garanhuns (HRDM)
								</button>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<!-- Esquema da Van 16 Lugares -->
							<div class="lg:col-span-5 border border-slate-200 bg-slate-50 p-4">
								<div class="text-[10px] text-slate-500 font-bold uppercase mb-3">VEÍCULO: VAN MERCEDES SPRINTER 16L (PLACA: PE-2026)</div>
								<div class="grid grid-cols-4 gap-2 text-center text-xs">
									{#each Array.from({ length: 16 }, (_, i) => i + 1) as assento}
										<button
											type="button"
											onclick={() => (assentoSelecionado = assento)}
											class="border p-2 font-bold transition-all cursor-pointer
											{assentoSelecionado === assento ? 'border-slate-950 bg-amber-700 text-white' : assento <= 5 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-400'}"
										>
											<div>P{assento}</div>
											<div class="text-[8px] uppercase mt-0.5">{assento <= 5 ? 'OCUPADO' : 'LIVRE'}</div>
										</button>
									{/each}
								</div>
							</div>

							<!-- Detalhe do Passageiro / Prestação de Contas -->
							<div class="lg:col-span-7 border border-slate-200 bg-white p-4 text-xs space-y-3">
								<div class="font-bold text-slate-900 flex justify-between">
									<span>PASSAGEIRO POLTRONA #{assentoSelecionado}</span>
									<span class="text-emerald-700">ASSINATURA ICP-BRASIL OK</span>
								</div>

								{#if assentoSelecionado <= 5}
									{@const pas = passageirosTfd[assentoSelecionado - 1]}
									<div class="border border-slate-200 bg-slate-50 p-3 space-y-1.5">
										<div>Nome: <strong class="text-slate-950">{pas.nome}</strong></div>
										<div>Hospital de Destino: <strong>{pas.dest}</strong></div>
										<div>Direito a Acompanhante: <strong>{pas.acom}</strong></div>
										<div>Status da Ajuda de Custo: <strong class="text-amber-800">{pas.status}</strong></div>
									</div>
								{:else}
									<div class="border border-dashed border-slate-300 p-6 text-center text-slate-400">
										Assento disponível para alocação na regulação do TFD.
									</div>
								{/if}
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tv'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-indigo-700 uppercase">📺 SIMULADOR DE SMART TV & CHAMADOR DE VOZ</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Painel de Recepção & Síntese Sonora Hospitalar</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => dispararChamadaVozDemo('MARIA DAS DORES GOMES', 'CONSULTÓRIO ZERO TRÊS, GINECOLOGIA')}
									disabled={testandoVoz}
									class="border-2 border-slate-950 bg-indigo-900 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-indigo-950 cursor-pointer disabled:opacity-50"
								>
									▶ TESTAR CHAMADA DE VOZ AO VIVO
								</button>
							</div>
						</div>

						<!-- Tela da TV Simulada -->
						<div class="border-4 border-slate-950 rounded-lg bg-slate-950 p-6 text-white text-center shadow-inner">
							<div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-2">
								<span>CENTRO DE ESPECIALIDADES MÉDICAS (CEM)</span>
								<span class="text-emerald-400 font-bold">● SMART TV ONLINE (PIN: CEM-2026)</span>
							</div>

							<div class="my-8 border-2 border-blue-600/50 bg-blue-950/30 p-6 rounded">
								<div class="text-xs text-amber-400 font-bold tracking-widest uppercase">CHAMANDO AGORA</div>
								<div class="text-2xl sm:text-3xl font-black text-white mt-2">SEVERINO RAMOS DE SOUZA</div>
								<div class="text-sm font-bold text-emerald-400 mt-3">CONSULTÓRIO 02 — ORTOPEDIA</div>
								<div class="text-xs text-slate-400 mt-1">Dr. Paulo Mendes · CRM-PE 14920</div>
							</div>

							<div class="flex justify-between items-center text-[11px] text-slate-400 pt-2">
								<span>Última chamada: 15:42h</span>
								<span>Prioridade: Idoso 60+</span>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'app'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-sky-700 uppercase">📱 SIMULADOR DO APLICATIVO DO CIDADÃO (FLUTTER)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Acesso Transparente na Mão do Paciente</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'consultas')}
									class="border px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer
									{telaAppAtiva === 'consultas' ? 'border-slate-950 bg-sky-900 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Consultas
								</button>
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'viagens')}
									class="border px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer
									{telaAppAtiva === 'viagens' ? 'border-slate-950 bg-sky-900 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Viagens TFD
								</button>
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'vacinas')}
									class="border px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer
									{telaAppAtiva === 'vacinas' ? 'border-slate-950 bg-sky-900 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Vacinas
								</button>
							</div>
						</div>

						<div class="flex justify-center">
							<div class="w-full max-w-sm border-4 border-slate-950 rounded-2xl bg-slate-900 p-4 text-white shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
								<div class="text-[10px] text-slate-400 text-center pb-2 border-b border-slate-800">
									OLÁ, MARIA APARECIDA (CNS: 7061...)
								</div>

								<div class="py-4 space-y-3 text-xs">
									{#if telaAppAtiva === 'consultas'}
										<div class="bg-blue-950 border border-blue-700 p-3 rounded">
											<div class="text-[9px] text-emerald-400 font-bold">CONSULTA AGENDADA</div>
											<div class="font-bold text-sm text-white mt-0.5">Cardiologia · CEM</div>
											<div class="text-[10px] text-slate-300 mt-1">Data: Quarta-feira, 08:30h</div>
											<div class="text-[10px] text-slate-400">Local: Consultório 01 (Dr. Roberto)</div>
										</div>
									{:else if telaAppAtiva === 'viagens'}
										<div class="bg-amber-950 border border-amber-700 p-3 rounded">
											<div class="text-[9px] text-amber-400 font-bold">VIAGEM CONFIRMADA TFD</div>
											<div class="font-bold text-sm text-white mt-0.5">Recife/PE · Hospital IMIP</div>
											<div class="text-[10px] text-slate-300 mt-1">Embarque: 03:30h · Praça Central</div>
											<div class="text-[10px] text-slate-400">Veículo: Van 02 · Motorista: Carlos</div>
										</div>
									{:else if telaAppAtiva === 'vacinas'}
										<div class="bg-emerald-950 border border-emerald-700 p-3 rounded space-y-1">
											<div class="text-[9px] text-emerald-400 font-bold">CARTEIRA VACINAL DIGITAL</div>
											<div class="text-[11px] text-white">✓ Covid Bivalente (Aplicada na USF Zilda Arns)</div>
											<div class="text-[11px] text-white">✓ Influenza Trivalente (Dose Anual)</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- SIMULADOR DE EFICIÊNCIA MUNICIPAL                                     -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section class="border-b border-slate-200 bg-white py-16 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="border-2 border-slate-950 bg-blue-950 text-white p-8 sm:p-12 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
				<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
					<div class="lg:col-span-5 space-y-4">
						<div class="inline-flex items-center gap-2 border border-blue-700 bg-blue-900 px-3 py-1 font-mono text-[11px] font-bold text-blue-200 uppercase">
							Calculadora de Impacto B2G
						</div>
						<h3 class="font-sans text-2xl sm:text-3xl font-black">
							Simule o Impacto do UniSISM no Porte do seu Município
						</h3>
						<p class="text-slate-300 text-sm leading-relaxed">
							Selecione a faixa populacional da sua cidade e veja os ganhos estimados em horas de fila eliminadas, redução de absenteísmo e economia operacional.
						</p>

						<div class="flex flex-col gap-2 pt-2">
							<button
								type="button"
								onclick={() => (porteSelecionado = 'pequeno')}
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors cursor-pointer
								{porteSelecionado === 'pequeno'
									? 'border-white bg-white text-slate-950'
									: 'border-blue-800 bg-blue-900/40 text-slate-300 hover:bg-blue-900'}"
							>
								1. Porte Pequeno (Até 30.000 hab.)
							</button>
							<button
								type="button"
								onclick={() => (porteSelecionado = 'medio')}
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors cursor-pointer
								{porteSelecionado === 'medio'
									? 'border-white bg-white text-slate-950'
									: 'border-blue-800 bg-blue-900/40 text-slate-300 hover:bg-blue-900'}"
							>
								2. Porte Médio (30.000 a 100.000 hab. · Águas Belas)
							</button>
							<button
								type="button"
								onclick={() => (porteSelecionado = 'grande')}
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors cursor-pointer
								{porteSelecionado === 'grande'
									? 'border-white bg-white text-slate-950'
									: 'border-blue-800 bg-blue-900/40 text-slate-300 hover:bg-blue-900'}"
							>
								3. Porte Grande (Mais de 100.000 hab.)
							</button>
						</div>
					</div>

					<div class="lg:col-span-7 bg-slate-900 border border-blue-900 p-6 font-mono">
						<div class="border-b border-slate-800 pb-3 mb-4 flex justify-between items-center text-xs">
							<span class="text-blue-300 font-bold uppercase">PROJEÇÃO DE EFICIÊNCIA MUNICIPAL</span>
							<span class="text-emerald-400">{portesConfig[porteSelecionado].habitantes}</span>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
							<div class="border border-slate-800 bg-slate-950 p-3">
								<div class="text-slate-400 text-[10px]">TEMPO DE ESPERA EM FILAS</div>
								<div class="text-xl font-bold text-emerald-400 mt-1">-{portesConfig[porteSelecionado].economiaHoras}</div>
								<div class="text-[10px] text-slate-500 mt-1">Economia de horas do cidadão</div>
							</div>

							<div class="border border-slate-800 bg-slate-950 p-3">
								<div class="text-slate-400 text-[10px]">REDUÇÃO DE FALTAS (ABSENTEÍSMO)</div>
								<div class="text-xl font-bold text-blue-400 mt-1">{portesConfig[porteSelecionado].reducaoAbsenteismo}</div>
								<div class="text-[10px] text-slate-500 mt-1">Via lembretes e confirmações</div>
							</div>

							<div class="border border-slate-800 bg-slate-950 p-3">
								<div class="text-slate-400 text-[10px]">VAGAS ESPECIALIZADAS OTIMIZADAS</div>
								<div class="text-xl font-bold text-amber-400 mt-1">{portesConfig[porteSelecionado].cotasOtimizadas}</div>
								<div class="text-[10px] text-slate-500 mt-1">No CEM e CEO sem ociosidade</div>
							</div>

							<div class="border border-slate-800 bg-slate-950 p-3">
								<div class="text-slate-400 text-[10px]">GESTÃO FINANCEIRA DO TFD</div>
								<div class="text-sm font-bold text-white mt-1">{portesConfig[porteSelecionado].controleTfd}</div>
								<div class="text-[10px] text-slate-500 mt-1">Com auditoria de combustível e rotas</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- CASE OFICIAL: ÁGUAS BELAS / PE (PRODUÇÃO HOMOLOGADA)                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="case" class="border-b border-slate-200 bg-white py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
				<div class="lg:col-span-6 space-y-6">
					<div class="inline-flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase">
						Validação em Ambiente Real
					</div>
					<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
						Case Oficial: Prefeitura Municipal de Águas Belas / PE
					</h2>
					<p class="text-slate-600 text-base sm:text-lg leading-relaxed font-medium">
						No Agreste Pernambucano, Águas Belas integrou 100% da sua base do <strong>PEC e-SUS Cloud</strong> com o UniSISM. Hoje, os 58.312 cidadãos distribuídos entre a sede urbana, distritos rurais, comunidades quilombolas e a Terra Indígena Fulni-ô contam com regulação justa e acolhimento digno.
					</p>

					<div class="border-l-4 border-blue-900 pl-4 py-1 italic text-slate-700 text-sm font-medium">
						"A integração do UniSISM eliminou a necessidade do cidadão da zona rural se deslocar de madrugada até a secretaria para marcar uma consulta com especialista ou solicitar viagem de TFD."
					</div>

					<div class="grid grid-cols-3 gap-3 font-mono text-center">
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-xl font-black text-blue-900">58.312</div>
							<div class="text-[9px] font-bold text-slate-600 uppercase">Prontuários Ativos</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-xl font-black text-slate-900">13 UBSs</div>
							<div class="text-[9px] font-bold text-slate-600 uppercase">Zonas Urbana/Rural</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-xl font-black text-emerald-600">100%</div>
							<div class="text-[9px] font-bold text-slate-600 uppercase">e-SUS APS Conectado</div>
						</div>
					</div>
				</div>

				<div class="lg:col-span-6">
					<div class="border-2 border-slate-900 bg-slate-50 p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] font-mono">
						<div class="border-b border-slate-300 pb-3 mb-4 flex justify-between items-center text-xs">
							<span class="font-bold text-slate-900">MAPA DA REDE DE ATENÇÃO MUNICIPAL</span>
							<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 font-bold">13/13 ONLINE</span>
						</div>
						<div class="space-y-2 text-xs">
							<div class="flex items-center justify-between border border-slate-200 bg-white p-2">
								<span>1. USF Zilda Arns (Sede)</span>
								<span class="text-emerald-600 font-bold">● CONECTADO</span>
							</div>
							<div class="flex items-center justify-between border border-slate-200 bg-white p-2">
								<span>2. USF Manoel Monteiro (Curral Novo)</span>
								<span class="text-emerald-600 font-bold">● CONECTADO</span>
							</div>
							<div class="flex items-center justify-between border border-slate-200 bg-white p-2">
								<span>3. USF Belarmino Rodrigues (Tanque)</span>
								<span class="text-emerald-600 font-bold">● CONECTADO</span>
							</div>
							<div class="flex items-center justify-between border border-slate-200 bg-white p-2">
								<span>4. USF Povo Indígena Fulni-ô</span>
								<span class="text-emerald-600 font-bold">● CONECTADO</span>
							</div>
							<div class="flex items-center justify-between border border-slate-200 bg-white p-2">
								<span>5. USF Comunidade Quilombola</span>
								<span class="text-emerald-600 font-bold">● CONECTADO</span>
							</div>
							<div class="text-[11px] text-slate-500 text-center pt-2 font-bold">
								+ 8 Unidades Básicas Municipais Sincronizadas
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- SEGURANÇA, LGPD & AUDITORIA CRIPTOGRÁFICA                             -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="seguranca" class="border-b border-slate-200 bg-slate-900 text-white py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-16">
				<div class="inline-flex items-center gap-2 border border-blue-700 bg-blue-950 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-blue-300 uppercase mb-3">
					Segurança de Nível Governamental
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-white">
					Conformidade Total com LGPD, CFM e Ministério da Saúde
				</h2>
				<p class="text-slate-300 text-base sm:text-lg mt-3 font-medium">
					Seus dados protegidos pelas mais rígidas normas de privacidade em saúde e auditoria imutável.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-emerald-400 text-2xl font-bold mb-2">01</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Triggers de Imutabilidade</h3>
					<p class="text-slate-400 text-xs leading-relaxed">
						Proteção no nível de banco de dados (PostgreSQL) que impede qualquer alteração ou exclusão de logs de prontuário e regulação, em conformidade com as resoluções do CFM.
					</p>
				</div>

				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-blue-400 text-2xl font-bold mb-2">02</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Antivírus ClamAV & MinIO</h3>
					<p class="text-slate-400 text-xs leading-relaxed">
						Todo anexo clínico ou laudo de exame enviado no sistema é escaneado em tempo real contra malwares antes de ser criptografado no armazenamento seguro S3/MinIO.
					</p>
				</div>

				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-amber-400 text-2xl font-bold mb-2">03</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Assinatura ICP-Brasil TFD</h3>
					<p class="text-slate-400 text-xs leading-relaxed">
						Recibos de ajuda de custo, escalas de motoristas e manifestos de passageiros emitidos com validação criptográfica para auditorias de Tribunais de Contas (TCE/TCU).
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- CTA B2G: FORMULÁRIO DE IMPLANTAÇÃO MUNICIPAL                          -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="demonstracao" class="border-b border-slate-200 bg-gradient-to-b from-white to-slate-100 py-16 sm:py-24">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="border-2 border-slate-950 bg-white p-8 sm:p-12 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
				<div class="text-center mb-8">
					<div class="inline-flex items-center gap-2 border border-blue-900/20 bg-blue-50 px-3 py-1 text-xs font-mono font-bold text-blue-900 uppercase mb-2">
						Expansão Municipal B2G
					</div>
					<h2 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
						Leve o UniSISM para o seu Município
					</h2>
					<p class="text-slate-600 text-sm sm:text-base mt-2 font-medium">
						Preencha os dados institucionais abaixo para agendar uma apresentação executiva para a Prefeitura e Secretaria de Saúde.
					</p>
				</div>

				{#if formEnviado}
					<div class="border-2 border-emerald-900 bg-emerald-50 p-6 text-center space-y-3 font-mono">
						<div class="text-2xl">🎉</div>
						<div class="text-base font-bold text-emerald-900">SOLICITAÇÃO DE IMPLANTAÇÃO REGISTRADA!</div>
						<div class="text-xs text-slate-700">
							Protocolo: <strong>{protocoloDemonstracao}</strong>
						</div>
						<p class="text-xs text-slate-600 max-w-md mx-auto">
							Nossa equipe de engenharia e regulação entrará em contato com a Secretaria Municipal de Saúde de <strong>{formMunicipio}/{formUf}</strong> em até 24 horas úteis.
						</p>
						<button
							type="button"
							onclick={() => (formEnviado = false)}
							class="border border-emerald-900 bg-emerald-800 text-white px-4 py-1.5 text-xs font-bold uppercase mt-2 hover:bg-emerald-900 cursor-pointer"
						>
							Enviar Nova Solicitação
						</button>
					</div>
				{:else}
					<form onsubmit={submeterDemonstracao} class="space-y-4">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label for="nome" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									Nome do Solicitante / Gestor *
								</label>
								<input
									id="nome"
									type="text"
									required
									bind:value={formNome}
									placeholder="Ex: Dr. Carlos Mendes"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								/>
							</div>

							<div>
								<label for="cargo" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									Cargo / Função *
								</label>
								<select
									id="cargo"
									bind:value={formCargo}
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								>
									<option>Secretário(a) Municipal de Saúde</option>
									<option>Prefeito(a) / Vice-Prefeito(a)</option>
									<option>Diretor(a) de Regulação & Avaliação</option>
									<option>Coordenador(a) da Atenção Básica</option>
									<option>Gestor(a) de Tecnologia da Informação</option>
									<option>Outro Cargo Público</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="sm:col-span-2">
								<label for="municipio" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									Município *
								</label>
								<input
									id="municipio"
									type="text"
									required
									bind:value={formMunicipio}
									placeholder="Ex: Garanhuns, Arcoverde, Caruaru..."
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								/>
							</div>

							<div>
								<label for="uf" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									UF *
								</label>
								<select
									id="uf"
									bind:value={formUf}
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								>
									<option value="PE">Pernambuco (PE)</option>
									<option value="AL">Alagoas (AL)</option>
									<option value="BA">Bahia (BA)</option>
									<option value="PB">Paraíba (PB)</option>
									<option value="CE">Ceará (CE)</option>
									<option value="SE">Sergipe (SE)</option>
									<option value="RN">Rio Grande do Norte (RN)</option>
									<option value="PI">Piauí (PI)</option>
									<option value="MA">Maranhão (MA)</option>
									<option value="OUTRO">Outro Estado</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label for="email" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									E-mail Institucional *
								</label>
								<input
									id="email"
									type="email"
									required
									bind:value={formEmail}
									placeholder="saude@municipio.pe.gov.br"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								/>
							</div>

							<div>
								<label for="telefone" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									Telefone / WhatsApp *
								</label>
								<input
									id="telefone"
									type="tel"
									required
									bind:value={formTelefone}
									placeholder="(87) 99999-9999"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								/>
							</div>
						</div>

						<div class="pt-4">
							<button
								type="submit"
								disabled={enviandoForm}
								class="w-full flex items-center justify-center gap-2 border-2 border-slate-950 bg-blue-900 px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 cursor-pointer"
							>
								{#if enviandoForm}
									<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
									<span>REGISTRANDO PROTOCOLO...</span>
								{:else}
									<span>SOLICITAR DEMONSTRAÇÃO & PROPOSTA B2G</span>
									<span>→</span>
								{/if}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- FOOTER INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<footer class="border-t border-slate-800 bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 font-mono text-xs">
		<div class="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<div class="h-6 w-6 bg-blue-900 flex items-center justify-center text-white font-bold border border-white">U</div>
					<span class="text-white font-bold text-sm">UniSISM</span>
				</div>
				<p class="text-[11px] leading-relaxed text-slate-400">
					Sistema Operacional Integrado de Regulação e Atenção à Saúde Pública Municipal.
				</p>
				<div class="text-[10px] text-emerald-400">
					● Ambiente de Produção Ativo
				</div>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3">Módulos da Rede</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li><a href="/login" class="hover:text-white transition-colors">SMS (Regulação & Gestão)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">UBS (Atenção Primária)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">CEM (Especialidades Médicas)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">CEO (Especialidades Odonto)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">TFD (Transporte & Frotas)</a></li>
					<li><a href="/tv" class="hover:text-white transition-colors">Smart TV (Painel Chamador)</a></li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3">Conformidade SUS</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li>e-SUS APS Cloud Sincronizado</li>
					<li>Tabela Unificada SIGTAP / MS</li>
					<li>Trilhas Imutáveis CFM & LGPD</li>
					<li>Certificação Digital ICP-Brasil</li>
					<li>Interoperabilidade RNDS / CADSUS</li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3">Acesso Rápido</h4>
				<div class="space-y-2">
					<a
						href="/login"
						class="block text-center border border-slate-700 bg-slate-900 px-3 py-2 text-white font-bold hover:bg-slate-800 transition-colors"
					>
						Acessar Terminal →
					</a>
					<a
						href="#demonstracao"
						class="block text-center border border-blue-900 bg-blue-950 px-3 py-2 text-blue-300 font-bold hover:bg-blue-900 hover:text-white transition-colors"
					>
						Implantar no Município
					</a>
				</div>
			</div>
		</div>

		<div class="mx-auto max-w-7xl border-t border-slate-800 pt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] text-slate-400">
			<div>
				© {new Date().getFullYear()} UniSISM · Todos os direitos reservados.
			</div>
			<div>
				Desenvolvido para Secretarias Municipais de Saúde · Brasil.
			</div>
		</div>
	</footer>
</div>
