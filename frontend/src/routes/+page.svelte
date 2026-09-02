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
		{ id: 'ENC-01', paciente: 'MARIA APARECIDA DA SILVA', ubs: 'UBS Central', especialidade: 'Cardiologia', prioridade: 'URGENTE', status: 'PENDENTE', cid: 'I10 (Hipertensão)' },
		{ id: 'ENC-02', paciente: 'JOSE CARLOS RODRIGUES', ubs: 'UBS Zona Rural', especialidade: 'Ortopedia', prioridade: 'ALTA', status: 'PENDENTE', cid: 'M54.5 (Lombalgia Crônica)' },
		{ id: 'ENC-03', paciente: 'SEVERINA FERREIRA SANTOS', ubs: 'UBS Distrito Norte', especialidade: 'Dermatologia', prioridade: 'ELETIVA', status: 'PENDENTE', cid: 'L70.0 (Acne Vulgar)' },
		{ id: 'ENC-04', paciente: 'ANTONIO PEREIRA LIMA', ubs: 'UBS Distrito Sul', especialidade: 'Neurologia', prioridade: 'URGENTE', status: 'APROVADO', cid: 'G40.9 (Epilepsia)' }
	]);

	function aprovarEncaminhamentoSms(id: string) {
		listaRegulacaoSms = listaRegulacaoSms.map((item) =>
			item.id === id ? { ...item, status: 'APROVADO' } : item
		);
	}

	// ─── INTERATIVIDADE MÓDULO UBS ───────────────────────────────────────────
	let buscaUbs = $state('MARIA');
	const pacientesExemploUbs = [
		{ nome: 'MARIA APARECIDA DA SILVA', cpf: '042.***.***-09', sus: '7061.****.****.560', condicoes: ['Hipertensão (HiperDia)', 'Diabética'], ubs: 'UBS Central', status: 'Acolhida' },
		{ nome: 'MARIA DAS DORES GOMES', cpf: '019.***.***-22', sus: '7004.****.****.190', condicoes: ['Gestante 24 semanas', 'Pré-Natal Ativo'], ubs: 'UBS Central', status: 'Aguardando Atendimento' },
		{ nome: 'JOSEFA MARIA DE SOUZA', cpf: '055.***.***-30', sus: '7028.****.****.763', condicoes: ['Idosa 78 anos', 'Asma'], ubs: 'UBS Zona Rural', status: 'Encaminhamento Emitido' },
		{ nome: 'JOSE CARLOS DOS SANTOS', cpf: '491.***.***-53', sus: '7085.****.****.377', condicoes: ['Lombalgia'], ubs: 'UBS Distrito Norte', status: 'Acolhido' }
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
	let rotaTfdAtiva = $state<'polo1' | 'polo2'>('polo1');
	let assentoSelecionado = $state<number>(1);
	const passageirosTfd = [
		{ assento: 1, nome: 'PACIENTE A. R.', dest: 'Hospital Regional (Oncologia)', acom: 'SIM', status: 'Confirmado' },
		{ assento: 2, nome: 'PACIENTE J. M.', dest: 'Hospital Universitário (Cardiologia)', acom: 'NÃO', status: 'Confirmado' },
		{ assento: 3, nome: 'PACIENTE A. L.', dest: 'Centro Cardiológico', acom: 'SIM', status: 'Confirmado' },
		{ assento: 4, nome: 'PACIENTE M. S.', dest: 'Maternidade de Alta Complexidade', acom: 'SIM', status: 'Confirmado' },
		{ assento: 5, nome: 'PACIENTE F. A.', dest: 'Hospital de Ortopedia', acom: 'NÃO', status: 'Confirmado' }
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
			gain1.gain.setValueAtTime(0.18, now);
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
			gain2.gain.setValueAtTime(0.22, now + 0.15);
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
	let telaAppAtiva = $state<'consultas' | 'viagens' | 'vacinas'>('consultas');

	// ─── FAQ GOVERNAMENTAL ───────────────────────────────────────────────────
	let faqAberta = $state<number | null>(0);

	const faqs = [
		{
			pergunta: 'Como o UniSISM se integra com o e-SUS APS e a base do PEC?',
			resposta: 'A integração é nativa e contínua. O UniSISM sincroniza prontuários, cadastros de cidadãos (CNS/CPF), vacinas e condições de saúde diretamente com o barramento do e-SUS APS, eliminando retrabalho e duplicidade de dados.'
		},
		{
			pergunta: 'É necessário adquirir servidores locais ou trocar equipamentos existentes?',
			resposta: 'Não. O UniSISM é 100% web e baseado em nuvem segura, projetado para operar com excelente desempenho em qualquer computador, tablet ou smartphone conectado à internet, sem necessidade de servidores locais dedicados.'
		},
		{
			pergunta: 'O sistema atende às exigências dos Órgãos de Controle (TCE/TCU) e CFM?',
			resposta: 'Sim. Todas as transações clínicas e despachos regulatórios geram registros de auditoria imutáveis com rastreabilidade completa. Além disso, as autorizações e manifests do TFD contam com validação digital criptográfica.'
		},
		{
			pergunta: 'Como funciona o processo de implantação e capacitação das equipes?',
			resposta: 'A implantação é ágil e estruturada, compreendendo a parametrização das unidades de saúde, alocação da matriz de cotas e capacitação presencial e remota de recepcionistas, reguladores, médicos e gestores.'
		}
	];

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
	<title>UniSISM · Sistema Integrado de Saúde Pública Municipal (SUS B2G)</title>
	<meta
		name="description"
		content="Plataforma governamental integrada de regulação em saúde, prontuário digital e gestão clínica que conecta Unidades Básicas (UBS), Centros de Especialidades (CEM/CEO), Frotas TFD, Painéis Smart TV e o Cidadão."
	/>
	<meta name="keywords" content="saúde pública, SUS, regulação municipal, prontuário eletrônico, e-SUS, PEC, CEM, CEO, TFD, gestão de saúde pública, prefeituras" />
	<meta name="author" content="UniSISM Governança em Saúde" />
	<link rel="canonical" href="https://unisism.vercel.app/" />

	<!-- OpenGraph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://unisism.vercel.app/" />
	<meta property="og:title" content="UniSISM · Sistema Integrado de Saúde Pública Municipal" />
	<meta property="og:description" content="Plataforma integrada de regulação em saúde, prontuário digital e atendimento clínico para secretarias municipais de saúde." />
	<meta property="og:image" content="https://unisism.vercel.app/og-unisism.png" />
	<meta property="og:locale" content="pt_BR" />

	<!-- Twitter Cards -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="UniSISM · Sistema Integrado de Saúde Pública Municipal" />
	<meta name="twitter:description" content="Regulação em tempo real, matriz de cotas digitais, gestão de transporte TFD e prontuário digital em conformidade com o SUS, LGPD e CFM." />
	<meta name="twitter:image" content="https://unisism.vercel.app/og-unisism.png" />

	<!-- JSON-LD Structured Data -->
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "SoftwareApplication",
			"name": "UniSISM",
			"applicationCategory": "HealthApplication",
			"operatingSystem": "Web, iOS, Android",
			"description": "Sistema Operacional Integrado de Regulação e Atenção à Saúde Pública Municipal (SUS).",
			"offers": {
				"@type": "Offer",
				"price": "0",
				"priceCurrency": "BRL"
			},
			"author": {
				"@type": "Organization",
				"name": "UniSISM Governança em Saúde",
				"url": "https://unisism.vercel.app"
			}
		}
	</script>
</svelte:head>

<div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased selection:bg-blue-900 selection:text-white">
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- TOPBAR INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<aside class="border-b border-slate-800 bg-slate-950 px-4 py-2 text-xs text-slate-400">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
			<div class="flex items-center gap-2 text-slate-300">
				<span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
				<span class="font-bold text-white">UniSISM GOV</span>
				<span class="text-slate-600">|</span>
				<span>Plataforma Integrada de Gestão e Regulação da Saúde Pública Municipal</span>
			</div>
			<div class="flex items-center gap-4 text-slate-400">
				<span>Conformidade: <strong class="text-slate-200">CFM · LGPD · e-SUS APS</strong></span>
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
					<span class="font-mono text-[9px] font-bold tracking-widest text-slate-600 uppercase">
						Saúde Pública Municipal
					</span>
				</div>
			</a>

			<!-- Navegação Desktop -->
			<nav class="hidden md:flex items-center gap-6 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase">
				<a href="#solucao" class="hover:text-blue-900 transition-colors">O Que Resolvemos</a>
				<a href="#modulos" class="hover:text-blue-900 transition-colors">Módulos</a>
				<a href="#impacto" class="hover:text-blue-900 transition-colors">Impacto na Gestão</a>
				<a href="#seguranca" class="hover:text-blue-900 transition-colors">Segurança & CFM</a>
				<a href="#faq" class="hover:text-blue-900 transition-colors">Dúvidas</a>
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
						Sistema de Governança e Regulação em Saúde Pública
					</div>

					<h1 class="font-sans text-3xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl leading-[1.08]">
						A Saúde Pública Municipal <span class="text-blue-900 underline decoration-blue-900/30 decoration-4">Integrada</span>, Digital e Transparente.
					</h1>

					<p class="text-base sm:text-lg leading-relaxed text-slate-600 font-medium">
						O <strong class="text-slate-900">UniSISM</strong> conecta todas as etapas do atendimento à saúde municipal: do acolhimento na Atenção Primária à regulação de vagas especializadas (CEM/CEO), gestão do transporte TFD e acompanhamento pelo cidadão.
					</p>

					<!-- Dual Call To Action -->
					<div class="flex flex-wrap items-center gap-4 pt-2">
						<a
							href="/login"
							class="flex items-center gap-3 border-2 border-slate-950 bg-blue-900 px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none cursor-pointer"
						>
							<span>ACESSAR O SISTEMA</span>
							<span class="text-lg leading-none">→</span>
						</a>

						<a
							href="#demonstracao"
							class="flex items-center gap-2 border-2 border-slate-800 bg-white px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.1)] transition-all hover:bg-slate-50 cursor-pointer"
						>
							<span>AGENDAR APRESENTAÇÃO B2G</span>
						</a>
					</div>

					<!-- Pilares de Qualidade -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-200 w-full">
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-lg font-black text-blue-900">Regulação Ágil</div>
							<div class="font-mono text-[10px] font-bold text-slate-600 tracking-wider uppercase">Critério Clínico SUS</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-lg font-black text-slate-900">Rede Integrada</div>
							<div class="font-mono text-[10px] font-bold text-slate-600 tracking-wider uppercase">e-SUS APS Sincronizado</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-lg font-black text-emerald-700">Auditabilidade</div>
							<div class="font-mono text-[10px] font-bold text-slate-600 tracking-wider uppercase">Conforme CFM & LGPD</div>
						</div>
						<div class="border border-slate-200 bg-white p-3">
							<div class="font-mono text-lg font-black text-slate-800">Cidadão Ativo</div>
							<div class="font-mono text-[10px] font-bold text-slate-600 tracking-wider uppercase">Acesso pelo Aplicativo</div>
						</div>
					</div>
				</div>

				<!-- Diagrama da Arquitetura Integrada -->
				<div class="lg:col-span-5">
					<div class="border-2 border-slate-950 bg-slate-900 text-slate-100 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-5 font-mono">
						<!-- Header do Terminal -->
						<div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-red-500 inline-block"></span>
								<span class="h-3 w-3 rounded-full bg-amber-500 inline-block"></span>
								<span class="h-3 w-3 rounded-full bg-emerald-500 inline-block"></span>
								<span class="text-xs font-bold text-slate-400 pl-2">ARQUITETURA MUNICIPAL INTEGRADA</span>
							</div>
							<span class="text-[10px] text-emerald-400 font-bold">● REDE SUS</span>
						</div>

						<!-- Diagrama da Malha SUS -->
						<div class="space-y-3 text-xs leading-relaxed">
							<div class="border border-slate-800 bg-slate-950/80 p-3">
								<div class="text-slate-400 text-[10px] uppercase font-bold">1. ATENÇÃO PRIMÁRIA À SAÚDE (APS)</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>🏥 Unidades Básicas de Saúde (UBS)</span>
									<span class="text-emerald-400 text-[11px]">e-SUS PEC</span>
								</div>
								<div class="text-slate-400 text-[11px] pt-1">Acolhimento, histórico clínico prévio e emissão de solicitações de exames e consultas.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Regulação Eletrônica & Matriz de Cotas</div>

							<div class="border border-blue-900/50 bg-blue-950/40 p-3">
								<div class="text-blue-300 text-[10px] uppercase font-bold">2. CENTRAL DE REGULAÇÃO MUNICIPAL (SMS)</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>🏛️ Secretaria Municipal de Saúde</span>
									<span class="text-blue-400 text-[11px]">Fila Única</span>
								</div>
								<div class="text-slate-300 text-[11px] pt-1">Distribuição justa de cotas para cada unidade de saúde com base em critérios clínicos transparentes.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Alocação e Despacho de Vagas</div>

							<div class="grid grid-cols-2 gap-2">
								<div class="border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]">
									<div class="text-amber-400 font-bold">🩺 ESPECIALIDADES</div>
									<div class="text-slate-300 text-[10px] pt-1">Consultórios médicos (CEM) e odontológicos (CEO).</div>
								</div>
								<div class="border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]">
									<div class="text-emerald-400 font-bold">🚑 TRANSPORTE TFD</div>
									<div class="text-slate-300 text-[10px] pt-1">Escala de veículos, rotas e passageiros.</div>
								</div>
							</div>

							<div class="border border-indigo-900/40 bg-indigo-950/30 p-2.5 flex items-center justify-between text-[11px]">
								<span class="text-indigo-300 font-bold">📺 Chamador Inteligente & App do Cidadão</span>
								<span class="text-slate-400 text-[10px]">Acesso Digital</span>
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
					Transformando os Desafios da Saúde Pública em Governança Transparente
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-4 leading-relaxed font-medium">
					Desenvolvido para eliminar a falta de dados, a perda de prontuários em papel e as longas esperas através de uma arquitetura pensada para os municípios brasileiros.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Problema 1 × Solução 1 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ GARGALO TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Filas Presenciais de Madrugada & Marcação Manual</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Deslocamento desnecessário de cidadãos para postos de saúde na madrugada sem garantia de atendimento e sem visibilidade sobre as vagas reais da rede.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Matriz de Cotas Digital por UBS com Regulação Algorítmica por Prioridade Clínica do SUS. O cidadão sai da consulta na UBS com sua solicitação inserida na fila regulada.
						</p>
					</div>
				</div>

				<!-- Problema 2 × Solução 2 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ GARGALO TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Extravio de Guias em Papel & Duplicidade de Exames</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Guias físicas rasuradas, perda de histórico prévio entre a UBS e o médico especialista, gerando repetição de exames e atraso no diagnóstico.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Dossiê Clínico Digital Unificado integrado ao e-SUS APS. Todo o histórico, laudos de exames e evolução médica acessíveis ao especialista em 1 clique.
						</p>
					</div>
				</div>

				<!-- Problema 3 × Solução 3 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ GARGALO TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Falta de Controle Logístico no Transporte TFD</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Controle manual de passageiros, falta de confirmação de presença em viagens intermunicipais e risco de inconsistências em prestações de contas.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Módulo TFD Integrado com controle de rotas, escalas de motoristas, lista de passageiros com acompanhantes e comprovação digital de atendimento.
						</p>
					</div>
				</div>

				<!-- Problema 4 × Solução 4 -->
				<div class="border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase mb-2">
							<span>✗ GARGALO TRADICIONAL</span>
						</div>
						<h3 class="font-sans text-xl font-bold text-slate-950 mb-2">Recepções Desorganizadas & Desconforto na Espera</h3>
						<p class="text-slate-600 text-sm leading-relaxed mb-4">
							Chamadas manuais em salas de espera cheias, gerando desinformação e ruído para profissionais de saúde e pacientes.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/50 -mx-6 -mb-6 p-6">
						<div class="flex items-center gap-2 text-xs font-mono font-bold text-blue-900 uppercase mb-1">
							<span>✓ SOLUÇÃO UNISISM</span>
						</div>
						<p class="text-slate-900 text-sm font-semibold">
							Painel Smart TV com sinal sonoro suave e chamada por voz humanizada em português, organizando o fluxo por consultório ou cadeira odontológica.
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
					Demonstração das Funcionalidades
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Explore os Módulos Especializados do UniSISM
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-3 font-medium">
					Clique nas abas abaixo para conhecer os fluxos de trabalho de cada setor da saúde municipal.
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
					🏥 UBS (Atenção Primária)
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
					🚑 TFD (Transporte de Pacientes)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tv')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all cursor-pointer
					{moduloAtivo === 'tv'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					📺 Smart TV (Chamador Inteligente)
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
								<span class="font-mono text-xs font-bold text-blue-900 uppercase">🏛️ CENTRAL DE REGULAÇÃO MUNICIPAL (SMS)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Fila Única e Despacho de Vagas</h3>
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
										<th class="p-2.5">ORIGEM</th>
										<th class="p-2.5">ESPECIALIDADE / HIPÓTESE</th>
										<th class="p-2.5">PRIORIDADE</th>
										<th class="p-2.5">STATUS</th>
										<th class="p-2.5 text-right">AÇÃO</th>
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

						<!-- Distribuição de Cotas por Unidade -->
						<div class="border border-slate-200 bg-slate-50 p-4 font-mono text-xs">
							<div class="font-bold text-slate-800 mb-2 flex justify-between">
								<span>MATRIZ DE COTAS EQUITATIVA ENTRE UNIDADES</span>
								<span class="text-blue-900">Distribuição por Demanda Clínica</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">UNIDADE URBANA CENTRAL</div>
									<div class="font-bold text-slate-900 mt-0.5">80% das Cotas Atribuídas</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-blue-900 h-1.5" style="width: 80%"></div></div>
								</div>
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">UNIDADE DISTRITAL 01</div>
									<div class="font-bold text-slate-900 mt-0.5">50% das Cotas Atribuídas</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-emerald-600 h-1.5" style="width: 50%"></div></div>
								</div>
								<div class="bg-white border border-slate-200 p-2.5">
									<div class="text-[10px] text-slate-500">UNIDADE DISTRITAL 02</div>
									<div class="font-bold text-slate-900 mt-0.5">65% das Cotas Atribuídas</div>
									<div class="w-full bg-slate-100 h-1.5 mt-1.5"><div class="bg-amber-600 h-1.5" style="width: 65%"></div></div>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ubs'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-emerald-700 uppercase">🏥 ATENÇÃO BÁSICA (UBS)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Busca Rápida de Prontuário & Acolhimento</h3>
							</div>
							<div class="flex items-center gap-2">
								<label for="buscaSimulada" class="text-xs font-bold text-slate-600">BUSCAR:</label>
								<input
									id="buscaSimulada"
									type="text"
									bind:value={buscaUbs}
									placeholder="Nome, CPF ou Cartão SUS..."
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
											onclick={() => alert(`Acessando Dossiê Clínico Digital de ${p.nome}...`)}
										>
											Abrir Dossiê Integrado →
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
								<span class="text-xs font-bold text-blue-900 uppercase">🩺 CENTRO DE ESPECIALIDADES MÉDICAS (CEM)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Consultórios Especializados & Prontuário SOAP</h3>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-bold text-slate-600">CONSULTÓRIO:</span>
								<select
									bind:value={consultorioCemAtivo}
									class="border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none"
								>
									<option value="CONS-01">01 — Cardiologia</option>
									<option value="CONS-02">02 — Ortopedia</option>
									<option value="CONS-03">03 — Ginecologia / Obstetrícia</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<!-- Painel do Paciente & Chamada -->
							<div class="lg:col-span-5 border border-slate-200 bg-slate-50 p-4 space-y-3">
								<div class="text-[10px] text-slate-500 uppercase font-bold">PACIENTE EM ATENDIMENTO NO CONSULTÓRIO</div>
								<div class="bg-white border border-slate-300 p-3">
									<div class="font-bold text-base text-slate-950">SEVERINO RAMOS DE SOUZA</div>
									<div class="text-xs text-slate-600 mt-0.5">64 anos · Masculino</div>
									<div class="text-[11px] text-blue-900 font-bold mt-2">Motivo: Avaliação Cardiológica Pré-Operatória</div>
								</div>

								<div class="pt-2">
									<button
										type="button"
										onclick={() => dispararChamadaVozDemo('SEVERINO RAMOS DE SOUZA', 'CONSULTÓRIO ZERO UM, CARDIOLOGIA')}
										disabled={testandoVoz}
										class="w-full border-2 border-slate-950 bg-blue-900 text-white font-bold py-2.5 text-xs uppercase flex items-center justify-center gap-2 hover:bg-blue-950 cursor-pointer disabled:opacity-50"
									>
										<span>🔊 DISPARAR CHAMADA NO PAINEL DE ESPERA</span>
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
									<span class="text-xs font-bold text-slate-700 uppercase">REGISTRO CLÍNICO SOAP:</span>
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
										<p><strong>Queixa Principal:</strong> Paciente relata dispneia aos médios esforços. Sem queixas de dor torácica aguda em repouso. Uso contínuo de anti-hipertensivo.</p>
									{:else if abaSoapAtiva === 'O'}
										<p><strong>Exame Físico:</strong> PA: 130x85 mmHg. FC: 72 bpm. Ausculta cardíaca com ritmo regular em dois tempos. Murmúrio vesicular presente bilateralmente.</p>
									{:else if abaSoapAtiva === 'A'}
										<p><strong>Hipótese Diagnóstica (CID-10):</strong> I35.0 (Estenose Valvar Aórtica) + I10 (Hipertensão Arterial Sistêmica). Risco cirúrgico classificado.</p>
									{:else if abaSoapAtiva === 'P'}
										<p><strong>Conduta:</strong> Solicitado Ecocardiograma Transtorácico (SIGTAP 02.05.01.003-2). Mantida orientação clínica e agendado retorno ambulatorial.</p>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ceo'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-teal-700 uppercase">🦷 CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Odontograma Digital & Brasil Sorridente</h3>
							</div>
							<div class="text-xs font-bold text-slate-600">
								CADEIRA ODONTOLÓGICA 01 · ESPECIALIDADE ENDODONTIA
							</div>
						</div>

						<!-- Odontograma Gráfico -->
						<div class="border border-slate-200 bg-slate-50 p-4">
							<div class="text-[10px] text-slate-500 uppercase font-bold mb-3">SELEÇÃO DE ELEMENTO DENTÁRIO PARA CONDUTA CLÍNICA:</div>
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
								<div class="text-xs text-slate-800 mt-1">Procedimento SIGTAP: <strong>{statusDentes[denteSelecionado]?.procedimento || 'Hígido / Sem Alteração'}</strong></div>
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
								<span class="text-xs font-bold text-amber-700 uppercase">🚑 TRATAMENTO FORA DO DOMICÍLIO (TFD)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Manifesto de Viagem, Frota e Passageiros</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'polo1')}
									class="border px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer
									{rotaTfdAtiva === 'polo1' ? 'border-slate-950 bg-amber-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Polo de Referência Regional
								</button>
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'polo2')}
									class="border px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer
									{rotaTfdAtiva === 'polo2' ? 'border-slate-950 bg-amber-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Polo de Alta Complexidade
								</button>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<!-- Esquema do Veículo de Transporte -->
							<div class="lg:col-span-5 border border-slate-200 bg-slate-50 p-4">
								<div class="text-[10px] text-slate-500 font-bold uppercase mb-3">VEÍCULO DE TRANSPORTE MUNICIPAL (16 LUGARES)</div>
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

							<!-- Detalhe do Passageiro / Manifesto -->
							<div class="lg:col-span-7 border border-slate-200 bg-white p-4 text-xs space-y-3">
								<div class="font-bold text-slate-900 flex justify-between">
									<span>REGISTRO DO PASSAGEIRO · POLTRONA #{assentoSelecionado}</span>
									<span class="text-emerald-700">MANIFESTO AUDITÁVEL</span>
								</div>

								{#if assentoSelecionado <= 5}
									{@const pas = passageirosTfd[assentoSelecionado - 1]}
									<div class="border border-slate-200 bg-slate-50 p-3 space-y-1.5">
										<div>Identificação: <strong class="text-slate-950">{pas.nome}</strong></div>
										<div>Hospital de Destino: <strong>{pas.dest}</strong></div>
										<div>Direito a Acompanhante: <strong>{pas.acom}</strong></div>
										<div>Status da Viagem: <strong class="text-emerald-700">{pas.status}</strong></div>
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
								<span class="text-xs font-bold text-indigo-700 uppercase">📺 PAINEL DE SALA DE ESPERA (SMART TV)</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Chamador Visual & Síntese de Voz Humanizada</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => dispararChamadaVozDemo('MARIA DAS DORES GOMES', 'CONSULTÓRIO ZERO TRÊS, GINECOLOGIA')}
									disabled={testandoVoz}
									class="border-2 border-slate-950 bg-indigo-900 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-indigo-950 cursor-pointer disabled:opacity-50"
								>
									▶ TESTAR CHAMADA DE VOZ
								</button>
							</div>
						</div>

						<!-- Tela da TV Simulada -->
						<div class="border-4 border-slate-950 rounded-lg bg-slate-950 p-6 text-white text-center shadow-inner">
							<div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-2">
								<span>CENTRO DE ESPECIALIDADES MUNICIPAL</span>
								<span class="text-emerald-400 font-bold">● PAINEL SINCRONIZADO</span>
							</div>

							<div class="my-8 border-2 border-blue-600/50 bg-blue-950/30 p-6 rounded">
								<div class="text-xs text-amber-400 font-bold tracking-widest uppercase">CHAMANDO AGORA</div>
								<div class="text-2xl sm:text-3xl font-black text-white mt-2">SEVERINO RAMOS DE SOUZA</div>
								<div class="text-sm font-bold text-emerald-400 mt-3">CONSULTÓRIO 02 — ORTOPEDIA</div>
							</div>

							<div class="flex justify-between items-center text-[11px] text-slate-400 pt-2">
								<span>Atendimento Regulado</span>
								<span>Prioridade Legal Atendida</span>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'app'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
							<div>
								<span class="text-xs font-bold text-sky-700 uppercase">📱 APLICATIVO DO CIDADÃO</span>
								<h3 class="font-sans text-xl font-bold text-slate-950">Acompanhamento Transparente na Palma da Mão</h3>
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
									PORTAL DO CIDADÃO · SAÚDE MUNICIPAL
								</div>

								<div class="py-4 space-y-3 text-xs">
									{#if telaAppAtiva === 'consultas'}
										<div class="bg-blue-950 border border-blue-700 p-3 rounded">
											<div class="text-[9px] text-emerald-400 font-bold">CONSULTA CONFIRMADA</div>
											<div class="font-bold text-sm text-white mt-0.5">Cardiologia · Centro de Especialidades</div>
											<div class="text-[10px] text-slate-300 mt-1">Horário Agendado: 08:30h</div>
											<div class="text-[10px] text-slate-400">Local: Consultório 01</div>
										</div>
									{:else if telaAppAtiva === 'viagens'}
										<div class="bg-amber-950 border border-amber-700 p-3 rounded">
											<div class="text-[9px] text-amber-400 font-bold">TRANSPORTE CONFIRMADO TFD</div>
											<div class="font-bold text-sm text-white mt-0.5">Hospital Regional de Referência</div>
											<div class="text-[10px] text-slate-300 mt-1">Horário de Saída: 05:00h · Ponto Central</div>
											<div class="text-[10px] text-slate-400">Veículo Municipal Oficial</div>
										</div>
									{:else if telaAppAtiva === 'vacinas'}
										<div class="bg-emerald-950 border border-emerald-700 p-3 rounded space-y-1">
											<div class="text-[9px] text-emerald-400 font-bold">CARTEIRA VACINAL DIGITAL</div>
											<div class="text-[11px] text-white">✓ Covid Bivalente (Registrada na Atenção Básica)</div>
											<div class="text-[11px] text-white">✓ Influenza Trivalente (Campanha Nacional)</div>
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
	<!-- IMPACTO NA GESTÃO & GOVERNANÇA                                        -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="impacto" class="border-b border-slate-200 bg-white py-16 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase mb-3">
					Ganhos de Governança
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Impacto Real na Gestão da Saúde Municipal
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-3 font-medium">
					Resultados comprovados na otimização de processos, redução de filas e transparência para os órgãos fiscalizadores.
				</p>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 font-mono">
				<div class="border-2 border-slate-900 bg-slate-50 p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
					<div class="text-2xl font-black text-blue-900 mb-1">Fila Zero</div>
					<div class="text-xs font-bold text-slate-900 mb-2">Na Madrugada</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						O cidadão é agendado diretamente na UBS de origem, sem necessidade de filas presenciais na madrugada para marcação de consultas.
					</p>
				</div>

				<div class="border-2 border-slate-900 bg-slate-50 p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
					<div class="text-2xl font-black text-emerald-700 mb-1">100% Digital</div>
					<div class="text-xs font-bold text-slate-900 mb-2">Sem Perda de Papel</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Encaminhamentos, laudos de exames e históricos clínicos trafegam digitalmente de ponta a ponta sem risco de extravio físico.
					</p>
				</div>

				<div class="border-2 border-slate-900 bg-slate-50 p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
					<div class="text-2xl font-black text-amber-700 mb-1">Menos Faltas</div>
					<div class="text-xs font-bold text-slate-900 mb-2">Avisos e Confirmação</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Comunicação direta com o cidadão e lembretes prévios que reduzem o absenteísmo e aproveitam integralmente a agenda de especialistas.
					</p>
				</div>

				<div class="border-2 border-slate-900 bg-slate-50 p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
					<div class="text-2xl font-black text-indigo-900 mb-1">Auditoria Total</div>
					<div class="text-xs font-bold text-slate-900 mb-2">Conformidade Legal</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Trilhas de auditoria imutáveis com registros de cada ação regulatória, atendendo plenamente às exigências do CFM e TCE/TCU.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- SEGURANÇA, LGPD & AUDITORIA                                           -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="seguranca" class="border-b border-slate-200 bg-slate-900 text-white py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-16">
				<div class="inline-flex items-center gap-2 border border-blue-700 bg-blue-950 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-blue-300 uppercase mb-3">
					Segurança e Integridade de Dados
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-white">
					Conformidade Rigorosa com LGPD, CFM e Ministério da Saúde
				</h2>
				<p class="text-slate-300 text-base sm:text-lg mt-3 font-medium">
					Proteção avançada em nível de arquitetura para garantir a privacidade do cidadão e a segurança jurídica do gestor público.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-emerald-400 text-2xl font-bold mb-2">01</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Trilhas de Auditoria Imutáveis</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Mecanismo no nível de banco de dados que impede alterações ou exclusões retroativas em prontuários e decisões regulatórias, conforme normas do Conselho Federal de Medicina.
					</p>
				</div>

				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-blue-400 text-2xl font-bold mb-2">02</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Armazenamento Seguro e Criptografado</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Laudos e anexos clínicos são escaneados em tempo real contra ameaças e armazenados em infraestrutura de nuvem com criptografia de ponta a ponta.
					</p>
				</div>

				<div class="border border-slate-800 bg-slate-950 p-6">
					<div class="text-amber-400 text-2xl font-bold mb-2">03</div>
					<h3 class="font-sans text-lg font-bold text-white mb-2">Rastreabilidade e Validação Digital</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Controle de permissões baseado em papéis (RBAC) com registro auditável de quem prescreveu, encaminhou, regulou ou dispensou cada atendimento.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- PERGUNTAS FREQUENTES (FAQ GOVERNAMENTAL)                              -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="faq" class="border-b border-slate-200 bg-slate-100/60 py-16 sm:py-24">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="text-center mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase mb-3">
					Tira-Dúvidas para Gestores
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Perguntas Frequentes de Gestores Públicos
				</h2>
			</div>

			<div class="space-y-4 font-mono">
				{#each faqs as faq, i}
					<div class="border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
						<button
							type="button"
							onclick={() => (faqAberta = faqAberta === i ? null : i)}
							class="w-full flex items-center justify-between p-5 text-left font-bold text-sm text-slate-950 hover:bg-slate-50 transition-colors cursor-pointer"
						>
							<span class="font-sans font-black text-base sm:text-lg">{faq.pergunta}</span>
							<span class="font-mono text-lg text-blue-900">{faqAberta === i ? '−' : '+'}</span>
						</button>

						{#if faqAberta === i}
							<div class="p-5 pt-0 border-t border-slate-200 text-xs sm:text-sm text-slate-600 leading-relaxed font-sans font-medium">
								{faq.resposta}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- CTA B2G: FORMULÁRIO DE APRESENTAÇÃO MUNICIPAL                         -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="demonstracao" class="border-b border-slate-200 bg-gradient-to-b from-white to-slate-100 py-16 sm:py-24">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="border-2 border-slate-950 bg-white p-8 sm:p-12 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
				<div class="text-center mb-8">
					<div class="inline-flex items-center gap-2 border border-blue-900/20 bg-blue-50 px-3 py-1 text-xs font-mono font-bold text-blue-900 uppercase mb-2">
						Apresentação Institucional B2G
					</div>
					<h2 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
						Leve o UniSISM para a sua Secretaria de Saúde
					</h2>
					<p class="text-slate-600 text-sm sm:text-base mt-2 font-medium">
						Preencha os dados institucionais abaixo para agendar uma demonstração executiva para a equipe de gestão do município.
					</p>
				</div>

				{#if formEnviado}
					<div class="border-2 border-emerald-900 bg-emerald-50 p-6 space-y-4 font-mono">
						<div class="text-center">
							<div class="text-3xl mb-1">🏛️</div>
							<div class="text-lg font-bold text-emerald-900">SOLICITAÇÃO REGISTRADA COM SUCESSO!</div>
							<div class="text-xs text-slate-700 mt-1">
								Protocolo Institucional: <strong class="text-slate-950 font-mono text-sm">{protocoloDemonstracao}</strong>
							</div>
						</div>

						<div class="border border-emerald-300 bg-white p-4 text-xs space-y-2 text-slate-800">
							<div class="font-bold text-blue-900 border-b border-slate-200 pb-1">DADOS DO AGENDAMENTO EXECUTIVO:</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
								<div>Município: <strong>{formMunicipio} / {formUf}</strong></div>
								<div>Solicitante: <strong>{formNome}</strong> ({formCargo})</div>
								<div>E-mail Institucional: <strong>{formEmail}</strong></div>
								<div>Telefone / WhatsApp: <strong>{formTelefone}</strong></div>
							</div>
							<div class="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 border border-slate-200">
								Nossa equipe técnica e de regulação entrará em contato para alinhar a apresentação online ou presencial e os detalhes de parametrização da rede municipal.
							</div>
						</div>

						<div class="text-center pt-2">
							<button
								type="button"
								onclick={() => (formEnviado = false)}
								class="border border-emerald-900 bg-emerald-800 text-white px-5 py-2 text-xs font-bold uppercase hover:bg-emerald-900 cursor-pointer"
							>
								Nova Solicitação
							</button>
						</div>
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
									Cargo / Função Pública *
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
									placeholder="Nome do seu município..."
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
									<option value="MG">Minas Gerais (MG)</option>
									<option value="SP">São Paulo (SP)</option>
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
									placeholder="saude@municipio.gov.br"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-900"
								/>
							</div>

							<div>
								<label for="telefone" class="block font-mono text-[11px] font-bold text-slate-700 uppercase mb-1">
									Telefone / WhatsApp Institucional *
								</label>
								<input
									id="telefone"
									type="tel"
									required
									bind:value={formTelefone}
									placeholder="(DDD) 99999-9999"
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
									<span>REGISTRANDO SOLICITAÇÃO...</span>
								{:else}
									<span>SOLICITAR APRESENTAÇÃO EXECUTIVA B2G</span>
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
					Sistema Integrado de Regulação e Atenção à Saúde Pública Municipal.
				</p>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3">Módulos da Rede</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li><a href="/login" class="hover:text-white transition-colors">SMS (Regulação & Gestão)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">UBS (Atenção Primária)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">CEM (Especialidades Médicas)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">CEO (Especialidades Odonto)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">TFD (Transporte & Frotas)</a></li>
					<li><a href="/tv" class="hover:text-white transition-colors">Smart TV (Painel de Espera)</a></li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3">Conformidade SUS</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li>e-SUS APS Cloud Sincronizado</li>
					<li>Tabela Unificada SIGTAP / MS</li>
					<li>Trilhas Imutáveis CFM & LGPD</li>
					<li>Certificação e Validação Digital</li>
					<li>Interoperabilidade em Saúde</li>
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
						Apresentação B2G
					</a>
				</div>
			</div>
		</div>

		<div class="mx-auto max-w-7xl border-t border-slate-800 pt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] text-slate-400">
			<div>
				© {new Date().getFullYear()} UniSISM · Governança e Tecnologia em Saúde Pública.
			</div>
			<div>
				Desenvolvido para Secretarias Municipais de Saúde · Brasil.
			</div>
		</div>
	</footer>
</div>
