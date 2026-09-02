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
		{ id: 'REG-01', paciente: 'MARIA APARECIDA DA SILVA', ubs: 'Unidade Central', especialidade: 'Cardiologia', prioridade: 'URGENTE', status: 'PENDENTE', cid: 'I10 (Hipertensão)' },
		{ id: 'REG-02', paciente: 'JOSE CARLOS RODRIGUES', ubs: 'Unidade Rural', especialidade: 'Ortopedia', prioridade: 'ALTA', status: 'PENDENTE', cid: 'M54.5 (Lombalgia Crônica)' },
		{ id: 'REG-03', paciente: 'SEVERINA FERREIRA SANTOS', ubs: 'Unidade Distrito Norte', especialidade: 'Dermatologia', prioridade: 'ELETIVA', status: 'PENDENTE', cid: 'L70.0 (Acne Vulgar)' },
		{ id: 'REG-04', paciente: 'ANTONIO PEREIRA LIMA', ubs: 'Unidade Distrito Sul', especialidade: 'Neurologia', prioridade: 'URGENTE', status: 'APROVADO', cid: 'G40.9 (Epilepsia)' }
	]);

	function aprovarEncaminhamentoSms(id: string) {
		listaRegulacaoSms = listaRegulacaoSms.map((item) =>
			item.id === id ? { ...item, status: 'APROVADO' } : item
		);
	}

	// ─── INTERATIVIDADE MÓDULO UBS ───────────────────────────────────────────
	let buscaUbs = $state('MARIA');
	const pacientesExemploUbs = [
		{ nome: 'MARIA APARECIDA DA SILVA', cpf: '042.***.***-09', cartao: '7061.****.****.560', condicoes: ['Hipertensão', 'Diabética'], ubs: 'Unidade Central', status: 'Acolhida' },
		{ nome: 'MARIA DAS DORES GOMES', cpf: '019.***.***-22', cartao: '7004.****.****.190', condicoes: ['Gestante 24 semanas', 'Pré-Natal Ativo'], ubs: 'Unidade Central', status: 'Aguardando Atendimento' },
		{ nome: 'JOSEFA MARIA DE SOUZA', cpf: '055.***.***-30', cartao: '7028.****.****.763', condicoes: ['Idosa 78 anos', 'Asma'], ubs: 'Unidade Rural', status: 'Encaminhamento Emitido' },
		{ nome: 'JOSE CARLOS DOS SANTOS', cpf: '491.***.***-53', cartao: '7085.****.****.377', condicoes: ['Lombalgia'], ubs: 'Unidade Distrito Norte', status: 'Acolhido' }
	];

	let pacientesFiltradosUbs = $derived(
		pacientesExemploUbs.filter((p) =>
			p.nome.toLowerCase().includes(buscaUbs.toLowerCase()) ||
			p.cpf.includes(buscaUbs) ||
			p.cartao.includes(buscaUbs)
		)
	);

	// ─── INTERATIVIDADE MÓDULO CEM ───────────────────────────────────────────
	let consultorioCemAtivo = $state('CONS-01');
	let abaSoapAtiva = $state<'S' | 'O' | 'A' | 'P'>('A');

	// ─── INTERATIVIDADE MÓDULO CEO ───────────────────────────────────────────
	let denteSelecionado = $state<number>(16);
	let statusDentes = $state<Record<number, { status: string; procedimento: string }>>({
		16: { status: 'TRATAMENTO_CANAL', procedimento: 'Endodontia Molar' },
		21: { status: 'RESTAURADO', procedimento: 'Restauração Resina' },
		36: { status: 'EXTRACAO_RECOMENDADA', procedimento: 'Cirurgia Oral Menor' },
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

	// ─── INTERATIVIDADE PAINEL DE ESPERA COM VOZ ─────────────────────────────
	let testandoVoz = $state(false);
	let feedbackVoz = $state('');

	function tocarChimeHospitalar(): void {
		try {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();
			const now = ctx.currentTime;

			const osc1 = ctx.createOscillator();
			const gain1 = ctx.createGain();
			osc1.type = 'sine';
			osc1.frequency.setValueAtTime(587.33, now);
			gain1.gain.setValueAtTime(0.18, now);
			gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
			osc1.connect(gain1);
			gain1.connect(ctx.destination);
			osc1.start(now);
			osc1.stop(now + 0.5);

			const osc2 = ctx.createOscillator();
			const gain2 = ctx.createGain();
			osc2.type = 'sine';
			osc2.frequency.setValueAtTime(880.0, now + 0.15);
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
			pergunta: 'Como o UniSISM sincroniza os dados da rede municipal?',
			resposta: 'A integração ocorre por barramento digital unificado e seguro. O sistema mantém sincronizados os históricos clínicos, cadastros de cidadãos, agendamentos e registros de vacinação entre todas as unidades de atendimento em tempo real.'
		},
		{
			pergunta: 'É necessário adquirir servidores locais ou novos equipamentos?',
			resposta: 'Não. O UniSISM opera 100% em nuvem de alta confiabilidade, projetado para funcionar com fluidez em computadores existentes, tablets e smartphones conectados à internet, sem necessidade de servidores locais dedicados.'
		},
		{
			pergunta: 'O sistema atende às diretrizes de conformidade e auditoria pública?',
			resposta: 'Sim. Todas as transações médicas e despachos de regulação geram trilhas de auditoria imutáveis com registros de data, hora e responsável, atendendo plenamente às exigências do Conselho Federal de Medicina e órgãos de controle.'
		},
		{
			pergunta: 'Como é realizado o processo de implantação e capacitação das equipes?',
			resposta: 'A implantação é estruturada e ágil. Nossa equipe realiza a parametrização das unidades de saúde, alocação da matriz de cotas e capacitação presencial e remota de recepcionistas, médicos, especialistas e gestores.'
		}
	];

	// Formulário de Demonstração Institucional
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
			protocoloDemonstracao = `GOV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
			enviandoForm = false;
			formEnviado = true;
		}, 800);
	}
</script>

<svelte:head>
	<title>UniSISM · Sistema Integrado de Saúde Pública Municipal</title>
	<meta
		name="description"
		content="Plataforma governamental de regulação em saúde, prontuário digital e gestão clínica que conecta Unidades Básicas, Centros de Especialidades, Frotas de Transporte, Painéis de Espera e o Cidadão."
	/>
	<meta name="keywords" content="saúde pública municipal, regulação em saúde, prontuário eletrônico, gestão de saúde, atendimento especializado, regulação municipal" />
	<meta name="author" content="UniSISM Governança em Saúde" />
	<link rel="canonical" href="https://unisism.vercel.app/" />

	<!-- OpenGraph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://unisism.vercel.app/" />
	<meta property="og:title" content="UniSISM · Sistema Integrado de Saúde Pública Municipal" />
	<meta property="og:description" content="Plataforma integrada de regulação em saúde, prontuário digital e atendimento clínico para secretarias de saúde municipais." />
	<meta property="og:image" content="https://unisism.vercel.app/og-unisism.png" />
	<meta property="og:locale" content="pt_BR" />

	<!-- Twitter Cards -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="UniSISM · Sistema Integrado de Saúde Pública Municipal" />
	<meta name="twitter:description" content="Regulação em tempo real, matriz de cotas digitais, gestão de transporte e prontuário digital com conformidade e auditoria imutável." />
	<meta name="twitter:image" content="https://unisism.vercel.app/og-unisism.png" />

	<!-- JSON-LD Structured Data -->
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "SoftwareApplication",
			"name": "UniSISM",
			"applicationCategory": "HealthApplication",
			"operatingSystem": "Web, iOS, Android",
			"description": "Sistema Integrado de Regulação e Atenção à Saúde Pública Municipal.",
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

<div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased selection:bg-slate-900 selection:text-white pb-20 md:pb-0">
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- TOPBAR INSTITUCIONAL BRUTALISTA                                       -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<aside class="border-b-2 border-slate-950 bg-slate-950 px-4 py-2 text-xs text-slate-400">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
			<div class="flex items-center gap-2 text-slate-300">
				<span class="inline-block h-2 w-2 bg-emerald-400"></span>
				<span class="font-bold text-white tracking-wider uppercase">UniSISM GOV</span>
				<span class="text-slate-600">/</span>
				<span class="hidden sm:inline">Plataforma Integrada de Gestão e Regulação em Saúde Municipal</span>
				<span class="sm:hidden">Gestão em Saúde</span>
			</div>
			<div class="flex items-center gap-3 text-slate-400">
				<span class="font-mono text-[10px] uppercase tracking-wider text-slate-300">CFM / LGPD COMPLIANT</span>
			</div>
		</div>
	</aside>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- NAVBAR INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<header class="sticky top-0 z-50 border-b-2 border-slate-950 bg-white">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
			<!-- Logo Brutalista Oficial -->
			<a href="/" class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center border-2 border-slate-950 bg-slate-950 text-white shadow-[2px_2px_0px_0px_#020617]"
				>
					<span class="font-mono text-xl font-black">U</span>
				</div>
				<div class="flex flex-col">
					<div class="flex items-center gap-1.5">
						<span class="font-mono text-lg font-black tracking-tight text-slate-950 uppercase">UniSISM</span>
						<span class="border border-slate-950 bg-blue-900 px-1.5 py-0.2 font-mono text-[9px] font-bold text-white uppercase">GOV</span>
					</div>
					<span class="font-mono text-[9px] font-bold tracking-widest text-slate-600 uppercase">
						Saúde Pública Municipal
					</span>
				</div>
			</a>

			<!-- Navegação Desktop -->
			<nav class="hidden lg:flex items-center gap-6 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase">
				<a href="#solucao" class="hover:text-blue-900 hover:underline transition-all">O Que Resolvemos</a>
				<a href="#modulos" class="hover:text-blue-900 hover:underline transition-all">Módulos</a>
				<a href="#impacto" class="hover:text-blue-900 hover:underline transition-all">Impacto</a>
				<a href="#seguranca" class="hover:text-blue-900 hover:underline transition-all">Segurança</a>
				<a href="#faq" class="hover:text-blue-900 hover:underline transition-all">Dúvidas</a>
			</nav>

			<!-- Ações / Botões -->
			<div class="flex items-center gap-2">
				{#if usuarioLogado}
					<a
						href={rotaDestino}
						class="flex items-center gap-2 border-2 border-slate-950 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[3px_3px_0px_0px_#020617] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
					>
						<span>PAINEL ({usuarioLogado.role})</span>
						<span>→</span>
					</a>
				{:else}
					<a
						href="#demonstracao"
						class="hidden sm:inline-flex border-2 border-slate-950 bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-900 uppercase shadow-[2px_2px_0px_0px_#020617] hover:bg-slate-100"
					>
						Solicitar Demo
					</a>
					<a
						href="/login"
						class="flex items-center gap-2 border-2 border-slate-950 bg-slate-950 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[3px_3px_0px_0px_#020617] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
					>
						<span>ACESSAR TERMINAL</span>
						<span>→</span>
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- HERO SECTION (MOBILE FIRST & BRUTALISTA)                              -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section class="border-b-2 border-slate-950 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
				<!-- Copy Principal -->
				<div class="lg:col-span-7 flex flex-col items-start gap-5">
					<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-blue-50 px-3 py-1 text-xs font-mono font-bold tracking-wider text-blue-950 uppercase shadow-[2px_2px_0px_0px_#020617]">
						<span class="inline-block h-2 w-2 bg-blue-900"></span>
						Governança & Regulação em Saúde Municipal
					</div>

					<h1 class="font-sans text-3xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl leading-[1.08]">
						A Saúde Pública Municipal <span class="bg-blue-900 text-white px-2 py-0.5 inline-block my-1">Integrada</span>, Digital e Transparente.
					</h1>

					<p class="text-base sm:text-lg leading-relaxed text-slate-700 font-medium">
						O <strong class="text-slate-950 font-bold">UniSISM</strong> conecta toda a rede de saúde: do acolhimento na Atenção Primária à regulação de vagas especializadas, gestão de frotas e prontuário unificado sem perdas de papel.
					</p>

					<!-- Dual Call To Action -->
					<div class="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3 pt-2">
						<a
							href="/login"
							class="flex items-center justify-center gap-3 border-2 border-slate-950 bg-slate-950 px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-white shadow-[4px_4px_0px_0px_#020617] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none cursor-pointer"
						>
							<span>ACESSAR TERMINAL</span>
							<span class="text-base leading-none">→</span>
						</a>

						<a
							href="#demonstracao"
							class="flex items-center justify-center gap-2 border-2 border-slate-950 bg-white px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-slate-950 shadow-[4px_4px_0px_0px_#020617] transition-all hover:bg-slate-100 cursor-pointer"
						>
							<span>AGENDAR APRESENTAÇÃO</span>
						</a>
					</div>

					<!-- Pilares de Qualidade -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t-2 border-slate-950 w-full font-mono text-xs">
						<div class="border-2 border-slate-950 bg-slate-50 p-3 shadow-[2px_2px_0px_0px_#020617]">
							<div class="font-black text-slate-950 text-sm">[01] REGULAÇÃO</div>
							<div class="text-[10px] text-slate-600 font-bold uppercase mt-1">Critério Clínico Ágil</div>
						</div>
						<div class="border-2 border-slate-950 bg-slate-50 p-3 shadow-[2px_2px_0px_0px_#020617]">
							<div class="font-black text-slate-950 text-sm">[02] INTEGRAÇÃO</div>
							<div class="text-[10px] text-slate-600 font-bold uppercase mt-1">Rede Sincronizada</div>
						</div>
						<div class="border-2 border-slate-950 bg-slate-50 p-3 shadow-[2px_2px_0px_0px_#020617]">
							<div class="font-black text-slate-950 text-sm">[03] AUDITORIA</div>
							<div class="text-[10px] text-slate-600 font-bold uppercase mt-1">Trilhas Imutáveis</div>
						</div>
						<div class="border-2 border-slate-950 bg-slate-50 p-3 shadow-[2px_2px_0px_0px_#020617]">
							<div class="font-black text-slate-950 text-sm">[04] CIDADÃO</div>
							<div class="text-[10px] text-slate-600 font-bold uppercase mt-1">Portal Digital</div>
						</div>
					</div>
				</div>

				<!-- Diagrama da Arquitetura Integrada -->
				<div class="lg:col-span-5">
					<div class="border-2 border-slate-950 bg-slate-950 text-slate-100 shadow-[6px_6px_0px_0px_#020617] p-5 font-mono">
						<!-- Header do Terminal -->
						<div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
							<div class="flex items-center gap-2">
								<span class="inline-block h-2.5 w-2.5 bg-white"></span>
								<span class="text-xs font-bold text-slate-300">ARQUITETURA DA REDE MUNICIPAL</span>
							</div>
							<span class="text-[10px] text-emerald-400 font-bold uppercase">[ONLINE]</span>
						</div>

						<!-- Diagrama Brutalista da Malha -->
						<div class="space-y-3 text-xs leading-relaxed">
							<div class="border border-slate-700 bg-slate-900 p-3">
								<div class="text-slate-400 text-[10px] uppercase font-bold">1. ATENÇÃO PRIMÁRIA</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>Unidades Básicas de Saúde</span>
									<span class="text-emerald-400 text-[10px] font-mono">Prontuário Digital</span>
								</div>
								<div class="text-slate-400 text-[11px] pt-1">Acolhimento, triagem e emissão de solicitações com histórico prévio unificado.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Regulação Eletrônica & Matriz de Cotas</div>

							<div class="border border-blue-800 bg-blue-950/60 p-3">
								<div class="text-blue-300 text-[10px] uppercase font-bold">2. NÓ CENTRAL DE REGULAÇÃO</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>Secretaria Municipal de Saúde</span>
									<span class="text-blue-300 text-[10px] font-mono">Fila Única</span>
								</div>
								<div class="text-slate-300 text-[11px] pt-1">Distribuição equitativa de vagas por prioridade clínica e controle de cotas.</div>
							</div>

							<div class="flex justify-center text-blue-400 font-bold">↓ Despacho e Atendimento</div>

							<div class="grid grid-cols-2 gap-2">
								<div class="border border-slate-700 bg-slate-900 p-2.5 text-[11px]">
									<div class="text-amber-400 font-bold">ESPECIALIDADES</div>
									<div class="text-slate-300 text-[10px] pt-1">Consultórios médicos e odontologia.</div>
								</div>
								<div class="border border-slate-700 bg-slate-900 p-2.5 text-[11px]">
									<div class="text-emerald-400 font-bold">TRANSPORTE TFD</div>
									<div class="text-slate-300 text-[10px] pt-1">Frotas, viagens e passageiros.</div>
								</div>
							</div>

							<div class="border border-indigo-800 bg-indigo-950/50 p-2.5 flex items-center justify-between text-[11px]">
								<span class="text-indigo-300 font-bold">Painel de Chamada & App do Cidadão</span>
								<span class="text-slate-400 text-[10px]">Acesso Multicanal</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- O QUE O UNISISM RESOLVE (DORES × SOLUÇÃO UNISISM)                     -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="solucao" class="border-b-2 border-slate-950 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-900 uppercase mb-3 shadow-[2px_2px_0px_0px_#020617]">
					Eficiência & Resolução
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-950">
					Transformando Gargalos Operacionais em Governança Transparente
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
				<!-- Item 1 -->
				<div class="border-2 border-slate-950 bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#020617] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-950 mb-2">Filas Presenciais de Madrugada & Marcação Manual</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Deslocamento de munícipes na madrugada para postos de saúde sem garantia de atendimento e sem visibilidade sobre as vagas reais da rede.
						</p>
					</div>
					<div class="border-t-2 border-slate-950 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-950 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-900 text-xs sm:text-sm font-sans font-semibold">
							Matriz de Cotas Digital por unidade com Regulação Algorítmica por Prioridade Clínica. O munícipe sai da consulta com sua solicitação inserida na fila regulada.
						</p>
					</div>
				</div>

				<!-- Item 2 -->
				<div class="border-2 border-slate-950 bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#020617] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-950 mb-2">Extravio de Guias em Papel & Duplicidade de Exames</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Guias físicas rasuradas e perda de histórico clínico prévio, provocando repetição de exames e demora no diagnóstico.
						</p>
					</div>
					<div class="border-t-2 border-slate-950 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-950 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-900 text-xs sm:text-sm font-sans font-semibold">
							Dossiê Clínico Digital Unificado. Todo o histórico, anexos de exames e evolução médica acessíveis ao especialista autorizado em tempo real.
						</p>
					</div>
				</div>

				<!-- Item 3 -->
				<div class="border-2 border-slate-950 bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#020617] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-950 mb-2">Falta de Rastreabilidade no Transporte TFD</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Controle manual de listas de passageiros em viagens intermunicipais de saúde e dificuldade de comprovação de atendimento para auditoria.
						</p>
					</div>
					<div class="border-t-2 border-slate-950 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-950 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-900 text-xs sm:text-sm font-sans font-semibold">
							Módulo TFD Completo com controle de rotas, escalas de motoristas, lista de passageiros com acompanhantes e comprovação digital.
						</p>
					</div>
				</div>

				<!-- Item 4 -->
				<div class="border-2 border-slate-950 bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#020617] flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-950 mb-2">Salas de Espera Desorganizadas</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Chamadas manuais nos corredores gerando ruído e desinformação para pacientes e equipe de recepção.
						</p>
					</div>
					<div class="border-t-2 border-slate-950 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-950 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-900 text-xs sm:text-sm font-sans font-semibold">
							Painel de Chamada com sinal sonoro suave e voz humanizada em português brasileiro, organizando o fluxo por consultório ou cadeira.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- VITRINE DE MÓDULOS (MOBILE FIRST COM TABS DINÂMICAS)                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="modulos" class="border-b-2 border-slate-950 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-8 sm:mb-12">
				<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-slate-100 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-900 uppercase mb-3 shadow-[2px_2px_0px_0px_#020617]">
					Módulos Especializados
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-950">
					Explore as Funcionalidades do Sistema
				</h2>
			</div>

			<!-- Tabs com Scroll Horizontal Fluído no Mobile -->
			<div class="flex items-center gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:justify-center">
				<button
					type="button"
					onclick={() => (moduloAtivo = 'sms')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'sms'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Regulação SMS
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ubs')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'ubs'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Atenção Básica
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'cem')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'cem'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Especialidades Médicas
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ceo')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'ceo'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Odontologia
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tfd')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'tfd'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Transporte TFD
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tv')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'tv'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					Painel de Espera
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'app')}
					class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
					{moduloAtivo === 'app'
						? 'border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0px_0px_#020617]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					App do Cidadão
				</button>
			</div>

			<!-- Painel de Demonstração Interativo -->
			<div class="border-2 border-slate-950 bg-white p-4 sm:p-8 shadow-[6px_6px_0px_0px_#020617]">
				{#if moduloAtivo === 'sms'}
					<div class="space-y-6">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="font-mono text-xs font-bold text-blue-950 uppercase">[REGULAÇÃO MUNICIPAL]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Fila Única e Despacho de Vagas</h3>
							</div>
							<div class="flex flex-wrap items-center gap-1.5 font-mono text-xs">
								<span class="text-slate-600 font-bold text-[10px]">PRIORIDADE:</span>
								{#each ['TODAS', 'URGENTE', 'ALTA', 'ELETIVA'] as p}
									<button
										type="button"
										onclick={() => (filtroPrioridadeSms = p as any)}
										class="border px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer
										{filtroPrioridadeSms === p ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
									>
										{p}
									</button>
								{/each}
							</div>
						</div>

						<div class="overflow-x-auto -mx-4 sm:mx-0">
							<table class="w-full text-left font-mono text-xs border border-slate-200">
								<thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
									<tr>
										<th class="p-2.5">ID</th>
										<th class="p-2.5">PACIENTE</th>
										<th class="p-2.5">ORIGEM</th>
										<th class="p-2.5">ESPECIALIDADE</th>
										<th class="p-2.5">PRIORIDADE</th>
										<th class="p-2.5">STATUS</th>
										<th class="p-2.5 text-right">AÇÃO</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-200 bg-white">
									{#each listaRegulacaoSms.filter(i => filtroPrioridadeSms === 'TODAS' || i.prioridade === filtroPrioridadeSms) as enc}
										<tr class="hover:bg-slate-50">
											<td class="p-2.5 font-bold text-blue-950">{enc.id}</td>
											<td class="p-2.5 font-bold text-slate-900">{enc.paciente}</td>
											<td class="p-2.5 text-slate-600">{enc.ubs}</td>
											<td class="p-2.5">
												<span class="font-bold text-slate-900">{enc.especialidade}</span>
												<span class="block text-[10px] text-slate-500">{enc.cid}</span>
											</td>
											<td class="p-2.5">
												<span class="border px-1.5 py-0.5 text-[9px] font-bold uppercase
												{enc.prioridade === 'URGENTE' ? 'border-red-700 bg-red-50 text-red-700' : enc.prioridade === 'ALTA' ? 'border-amber-700 bg-amber-50 text-amber-700' : 'border-emerald-700 bg-emerald-50 text-emerald-700'}">
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
														class="border border-slate-950 bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-white uppercase hover:bg-slate-800 cursor-pointer"
													>
														Aprovar Vaga ✓
													</button>
												{:else}
													<span class="text-emerald-700 font-bold text-[10px]">[VAGA ALOCADA]</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else if moduloAtivo === 'ubs'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[ATENÇÃO BÁSICA]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Busca Rápida de Prontuário</h3>
							</div>
							<div class="flex items-center gap-2">
								<label for="buscaSimulada" class="text-xs font-bold text-slate-600">BUSCA:</label>
								<input
									id="buscaSimulada"
									type="text"
									bind:value={buscaUbs}
									placeholder="Nome, CPF ou Cartão..."
									class="border-2 border-slate-950 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none w-full sm:w-64"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each pacientesFiltradosUbs as p}
								<div class="border-2 border-slate-950 bg-white p-4 shadow-[3px_3px_0px_0px_#020617]">
									<div class="flex justify-between items-start">
										<div>
											<span class="font-bold text-sm text-slate-950">{p.nome}</span>
											<div class="text-[10px] text-slate-500 mt-0.5">CPF: {p.cpf} · Reg: {p.cartao}</div>
										</div>
										<span class="border border-slate-950 bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-900 uppercase">
											{p.status}
										</span>
									</div>

									<div class="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-1.5">
										{#each p.condicoes as c}
											<span class="bg-slate-100 text-slate-800 px-2 py-0.5 text-[9px] font-bold">
												[●] {c}
											</span>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else if moduloAtivo === 'cem'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[CENTRO DE ESPECIALIDADES]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Consultórios & Prontuário SOAP</h3>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-bold text-slate-600">CONSULTÓRIO:</span>
								<select
									bind:value={consultorioCemAtivo}
									class="border-2 border-slate-950 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none"
								>
									<option value="CONS-01">01 — Cardiologia</option>
									<option value="CONS-02">02 — Ortopedia</option>
									<option value="CONS-03">03 — Ginecologia</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<div class="lg:col-span-5 border-2 border-slate-950 bg-slate-50 p-4 space-y-3">
								<div class="text-[10px] text-slate-600 uppercase font-bold">PACIENTE EM ATENDIMENTO</div>
								<div class="bg-white border-2 border-slate-950 p-3 shadow-[2px_2px_0px_0px_#020617]">
									<div class="font-bold text-base text-slate-950">SEVERINO RAMOS DE SOUZA</div>
									<div class="text-xs text-slate-600 mt-0.5">64 anos · Masculino</div>
									<div class="text-[11px] text-blue-950 font-bold mt-2">Motivo: Avaliação Cardiológica</div>
								</div>

								<button
									type="button"
									onclick={() => dispararChamadaVozDemo('SEVERINO RAMOS DE SOUZA', 'CONSULTÓRIO ZERO UM, CARDIOLOGIA')}
									disabled={testandoVoz}
									class="w-full border-2 border-slate-950 bg-slate-950 text-white font-bold py-2.5 text-xs uppercase flex items-center justify-center gap-2 hover:bg-slate-800 cursor-pointer disabled:opacity-50 min-h-[44px]"
								>
									<span>CHAMAR NO PAINEL DE ESPERA</span>
								</button>
								{#if feedbackVoz}
									<div class="text-[10px] text-emerald-800 font-bold text-center">
										{feedbackVoz}
									</div>
								{/if}
							</div>

							<div class="lg:col-span-7 border-2 border-slate-950 bg-white p-4">
								<div class="flex items-center gap-2 border-b-2 border-slate-950 pb-2 mb-3">
									<span class="text-xs font-bold text-slate-800 uppercase">REGISTRO SOAP:</span>
									{#each ['S', 'O', 'A', 'P'] as tab}
										<button
											type="button"
											onclick={() => (abaSoapAtiva = tab as any)}
											class="border-2 px-2.5 py-0.5 text-xs font-bold uppercase transition-colors cursor-pointer
											{abaSoapAtiva === tab ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-50 text-slate-800'}"
										>
											{tab === 'S' ? 'Subjetivo' : tab === 'O' ? 'Objetivo' : tab === 'A' ? 'Avaliação' : 'Plano'}
										</button>
									{/each}
								</div>

								<div class="text-xs leading-relaxed text-slate-800">
									{#if abaSoapAtiva === 'S'}
										<p><strong>Queixa Principal:</strong> Paciente relata dispneia aos médios esforços. Sem queixas de dor torácica aguda em repouso. Uso contínuo de anti-hipertensivo.</p>
									{:else if abaSoapAtiva === 'O'}
										<p><strong>Exame Físico:</strong> PA: 130x85 mmHg. FC: 72 bpm. Ausculta cardíaca com ritmo regular em dois tempos. Murmúrio vesicular presente bilateralmente.</p>
									{:else if abaSoapAtiva === 'A'}
										<p><strong>Hipótese Diagnóstica (CID-10):</strong> I35.0 (Estenose Valvar Aórtica) + I10 (Hipertensão Arterial Sistêmica).</p>
									{:else if abaSoapAtiva === 'P'}
										<p><strong>Conduta:</strong> Solicitado Ecocardiograma Transtorácico. Mantida medicação e agendado retorno ambulatorial.</p>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ceo'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[ODONTOLOGIA ESPECIALIZADA]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Odontograma Digital</h3>
							</div>
							<div class="text-xs font-bold text-slate-600">
								CADEIRA 01 · ENDODONTIA
							</div>
						</div>

						<div class="border-2 border-slate-950 bg-slate-50 p-4">
							<div class="text-[10px] text-slate-600 uppercase font-bold mb-3">SELEÇÃO DE ELEMENTO DENTÁRIO:</div>
							<div class="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
								{#each [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as d}
									<button
										type="button"
										onclick={() => (denteSelecionado = d)}
										class="border-2 p-2 font-bold text-xs transition-all cursor-pointer min-h-[44px]
										{denteSelecionado === d ? 'border-slate-950 bg-slate-950 text-white shadow-[2px_2px_0px_0px_#020617]' : 'border-slate-300 bg-white text-slate-800'}"
									>
										<div>#{d}</div>
										<div class="text-[8px] uppercase mt-1">
											{statusDentes[d]?.status === 'TRATAMENTO_CANAL' ? 'CANAL' : statusDentes[d]?.status === 'RESTAURADO' ? 'REST.' : statusDentes[d]?.status === 'EXTRACAO_RECOMENDADA' ? 'EXTRAIR' : 'HÍGIDO'}
										</div>
									</button>
								{/each}
							</div>
						</div>

						<div class="border-2 border-slate-950 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
							<div>
								<div class="text-xs text-slate-600 font-bold">ELEMENTO: <strong class="text-slate-950 text-sm">DENTE #{denteSelecionado}</strong></div>
								<div class="text-xs text-slate-800 mt-1">Procedimento: <strong>{statusDentes[denteSelecionado]?.procedimento || 'Hígido / Sem Alteração'}</strong></div>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onclick={() => alterarStatusDente('TRATAMENTO_CANAL', 'Tratamento Endodôntico (Canal)')}
									class="border-2 border-slate-950 bg-slate-950 text-white px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-slate-800 cursor-pointer min-h-[40px]"
								>
									+ Indicar Canal
								</button>
								<button
									type="button"
									onclick={() => alterarStatusDente('RESTAURADO', 'Restauração Estética')}
									class="border-2 border-slate-950 bg-slate-100 text-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-slate-200 cursor-pointer min-h-[40px]"
								>
									+ Restaurar
								</button>
								<button
									type="button"
									onclick={() => alterarStatusDente('HIGIDO', 'Hígido / Sem Alteração')}
									class="border-2 border-slate-300 bg-white text-slate-600 px-3 py-1.5 text-[10px] font-bold uppercase hover:bg-slate-50 cursor-pointer min-h-[40px]"
								>
									Limpar
								</button>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tfd'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[TRANSPORTE TFD]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Manifesto de Viagem & Frotas</h3>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'polo1')}
									class="border-2 px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer min-h-[40px]
									{rotaTfdAtiva === 'polo1' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Polo Regional
								</button>
								<button
									type="button"
									onclick={() => (rotaTfdAtiva = 'polo2')}
									class="border-2 px-3 py-1 text-xs font-bold uppercase transition-colors cursor-pointer min-h-[40px]
									{rotaTfdAtiva === 'polo2' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-700'}"
								>
									Polo Alta Complexidade
								</button>
							</div>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
							<div class="lg:col-span-5 border-2 border-slate-950 bg-slate-50 p-4">
								<div class="text-[10px] text-slate-600 font-bold uppercase mb-3">VEÍCULO DE TRANSPORTE (16 LUGARES)</div>
								<div class="grid grid-cols-4 gap-2 text-center text-xs">
									{#each Array.from({ length: 16 }, (_, i) => i + 1) as assento}
										<button
											type="button"
											onclick={() => (assentoSelecionado = assento)}
											class="border-2 p-2 font-bold transition-all cursor-pointer min-h-[44px]
											{assentoSelecionado === assento ? 'border-slate-950 bg-slate-950 text-white shadow-[2px_2px_0px_0px_#020617]' : assento <= 5 ? 'border-slate-950 bg-blue-50 text-blue-950' : 'border-slate-300 bg-white text-slate-400'}"
										>
											<div>P{assento}</div>
											<div class="text-[8px] uppercase mt-0.5">{assento <= 5 ? 'OCUPADO' : 'LIVRE'}</div>
										</button>
									{/each}
								</div>
							</div>

							<div class="lg:col-span-7 border-2 border-slate-950 bg-white p-4 text-xs space-y-3">
								<div class="font-bold text-slate-950 flex justify-between">
									<span>PASSAGEIRO POLTRONA #{assentoSelecionado}</span>
									<span class="text-emerald-700 font-bold">[CONFIRMADO]</span>
								</div>

								{#if assentoSelecionado <= 5}
									{@const pas = passageirosTfd[assentoSelecionado - 1]}
									<div class="border-2 border-slate-950 bg-slate-50 p-3 space-y-1.5">
										<div>Identificação: <strong class="text-slate-950">{pas.nome}</strong></div>
										<div>Destino: <strong>{pas.dest}</strong></div>
										<div>Acompanhante: <strong>{pas.acom}</strong></div>
										<div>Status: <strong class="text-emerald-800">{pas.status}</strong></div>
									</div>
								{:else}
									<div class="border-2 border-dashed border-slate-300 p-6 text-center text-slate-500">
										Assento disponível para alocação na regulação do TFD.
									</div>
								{/if}
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tv'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[PAINEL DE SALA DE ESPERA]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Chamador Visual & Voz</h3>
							</div>
							<button
								type="button"
								onclick={() => dispararChamadaVozDemo('MARIA DAS DORES GOMES', 'CONSULTÓRIO ZERO TRÊS, GINECOLOGIA')}
								disabled={testandoVoz}
								class="border-2 border-slate-950 bg-slate-950 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-800 cursor-pointer disabled:opacity-50 min-h-[44px]"
							>
								TESTAR CHAMADA DE VOZ
							</button>
						</div>

						<div class="border-2 border-slate-950 bg-slate-950 p-6 text-white text-center shadow-[4px_4px_0px_0px_#020617]">
							<div class="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-2">
								<span>CENTRO DE ESPECIALIDADES</span>
								<span class="text-emerald-400 font-bold">[PAINEL ATIVO]</span>
							</div>

							<div class="my-6 border-2 border-blue-600 bg-blue-950/40 p-6">
								<div class="text-xs text-blue-300 font-bold tracking-widest uppercase">CHAMANDO AGORA</div>
								<div class="text-xl sm:text-3xl font-black text-white mt-2">SEVERINO RAMOS DE SOUZA</div>
								<div class="text-sm font-bold text-emerald-400 mt-3">CONSULTÓRIO 02 — ORTOPEDIA</div>
							</div>

							<div class="flex justify-between items-center text-[10px] text-slate-400">
								<span>Atendimento Regulado</span>
								<span>Prioridade Legal Atendida</span>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'app'}
					<div class="space-y-6 font-mono">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-950 pb-4">
							<div>
								<span class="text-xs font-bold text-slate-950 uppercase">[APP DO CIDADÃO]</span>
								<h3 class="font-sans text-lg sm:text-xl font-black text-slate-950">Acompanhamento Transparente</h3>
							</div>
							<div class="flex items-center gap-1.5">
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'consultas')}
									class="border-2 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[36px]
									{telaAppAtiva === 'consultas' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-800'}"
								>
									Consultas
								</button>
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'viagens')}
									class="border-2 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[36px]
									{telaAppAtiva === 'viagens' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-800'}"
								>
									Viagens
								</button>
								<button
									type="button"
									onclick={() => (telaAppAtiva = 'vacinas')}
									class="border-2 px-2.5 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[36px]
									{telaAppAtiva === 'vacinas' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-slate-100 text-slate-800'}"
								>
									Vacinas
								</button>
							</div>
						</div>

						<div class="flex justify-center">
							<div class="w-full max-w-sm border-2 border-slate-950 bg-slate-950 p-4 text-white shadow-[4px_4px_0px_0px_#020617]">
								<div class="text-[10px] text-slate-400 text-center pb-2 border-b border-slate-800 font-bold uppercase">
									PORTAL DO CIDADÃO
								</div>

								<div class="py-4 space-y-3 text-xs">
									{#if telaAppAtiva === 'consultas'}
										<div class="bg-slate-900 border border-slate-700 p-3">
											<div class="text-[9px] text-emerald-400 font-bold uppercase">[CONSULTA CONFIRMADA]</div>
											<div class="font-bold text-sm text-white mt-0.5">Cardiologia · Centro Médico</div>
											<div class="text-[10px] text-slate-300 mt-1">Horário: 08:30h · Consultório 01</div>
										</div>
									{:else if telaAppAtiva === 'viagens'}
										<div class="bg-slate-900 border border-slate-700 p-3">
											<div class="text-[9px] text-blue-400 font-bold uppercase">[TRANSPORTE CONFIRMADO]</div>
											<div class="font-bold text-sm text-white mt-0.5">Hospital Regional</div>
											<div class="text-[10px] text-slate-300 mt-1">Saída: 05:00h · Ponto Central</div>
										</div>
									{:else if telaAppAtiva === 'vacinas'}
										<div class="bg-slate-900 border border-slate-700 p-3 space-y-1">
											<div class="text-[9px] text-emerald-400 font-bold uppercase">[CARTEIRA VACINAL DIGITAL]</div>
											<div class="text-[11px] text-white">✓ Covid Bivalente (Registrada)</div>
											<div class="text-[11px] text-white">✓ Influenza Trivalente (Campanha)</div>
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
	<section id="impacto" class="border-b-2 border-slate-950 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-900 uppercase mb-3 shadow-[2px_2px_0px_0px_#020617]">
					Ganhos de Governança
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-950">
					Impacto na Gestão da Saúde Municipal
				</h2>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 font-mono">
				<div class="border-2 border-slate-950 bg-white p-5 shadow-[4px_4px_0px_0px_#020617]">
					<div class="text-2xl font-black text-slate-950 mb-1">Fila Zero</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Na Madrugada</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						O cidadão é agendado diretamente na unidade básica de origem, sem necessidade de filas presenciais na madrugada para marcação.
					</p>
				</div>

				<div class="border-2 border-slate-950 bg-white p-5 shadow-[4px_4px_0px_0px_#020617]">
					<div class="text-2xl font-black text-slate-950 mb-1">100% Digital</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Sem Perda de Papel</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Encaminhamentos, laudos de exames e históricos clínicos trafegam digitalmente de ponta a ponta sem extravios físicos.
					</p>
				</div>

				<div class="border-2 border-slate-950 bg-white p-5 shadow-[4px_4px_0px_0px_#020617]">
					<div class="text-2xl font-black text-slate-950 mb-1">Menos Faltas</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Avisos e Confirmação</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Lembretes prévios e confirmações de presença que reduzem o absenteísmo e otimizam a agenda de especialistas.
					</p>
				</div>

				<div class="border-2 border-slate-950 bg-white p-5 shadow-[4px_4px_0px_0px_#020617]">
					<div class="text-2xl font-black text-slate-950 mb-1">Auditoria Total</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Conformidade Legal</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Trilhas de auditoria imutáveis com registros de cada ação regulatória, atendendo plenamente às diretrizes do CFM.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- SEGURANÇA, LGPD & AUDITORIA                                           -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="seguranca" class="border-b-2 border-slate-950 bg-slate-950 text-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-300 uppercase mb-3">
					Segurança de Dados
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-white">
					Conformidade Rigorosa com LGPD e CFM
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
				<div class="border-2 border-slate-800 bg-slate-900 p-5 sm:p-6">
					<div class="text-emerald-400 text-xl font-bold mb-2">[01] IMUTABILIDADE</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Trilhas de Auditoria</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Mecanismo no nível de banco de dados que impede alterações ou exclusões retroativas em prontuários e decisões regulatórias.
					</p>
				</div>

				<div class="border-2 border-slate-800 bg-slate-900 p-5 sm:p-6">
					<div class="text-blue-400 text-xl font-bold mb-2">[02] CRIPTOGRAFIA</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Armazenamento Seguro</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Laudos e anexos clínicos são escaneados contra ameaças e armazenados em infraestrutura de nuvem criptografada.
					</p>
				</div>

				<div class="border-2 border-slate-800 bg-slate-900 p-5 sm:p-6">
					<div class="text-amber-400 text-xl font-bold mb-2">[03] CONTROLE DE ACESSO</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Permissões Baseadas em Papéis</h3>
					<p class="text-slate-400 text-xs leading-relaxed font-sans">
						Controle de acesso por perfis operacionais com registro auditável de quem prescreveu, encaminhou ou regulou cada atendimento.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- PERGUNTAS FREQUENTES (FAQ)                                            -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="faq" class="border-b-2 border-slate-950 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="text-left sm:text-center mb-8 sm:mb-12">
				<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-900 uppercase mb-3 shadow-[2px_2px_0px_0px_#020617]">
					Tira-Dúvidas
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-950">
					Perguntas Frequentes
				</h2>
			</div>

			<div class="space-y-3 font-mono">
				{#each faqs as faq, i}
					<div class="border-2 border-slate-950 bg-white shadow-[3px_3px_0px_0px_#020617]">
						<button
							type="button"
							onclick={() => (faqAberta = faqAberta === i ? null : i)}
							class="w-full flex items-center justify-between p-4 sm:p-5 text-left font-bold text-sm text-slate-950 hover:bg-slate-50 transition-colors cursor-pointer min-h-[48px]"
						>
							<span class="font-sans font-bold text-sm sm:text-base pr-2">{faq.pergunta}</span>
							<span class="font-mono text-base font-black text-slate-950">{faqAberta === i ? '[−]' : '[+]'}</span>
						</button>

						{#if faqAberta === i}
							<div class="p-4 sm:p-5 pt-0 border-t-2 border-slate-950 text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
								{faq.resposta}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- CTA: FORMULÁRIO DE APRESENTAÇÃO INSTITUCIONAL                         -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="demonstracao" class="border-b-2 border-slate-950 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="border-2 border-slate-950 bg-white p-6 sm:p-10 shadow-[6px_6px_0px_0px_#020617]">
				<div class="text-left sm:text-center mb-6 sm:mb-8">
					<div class="inline-flex items-center gap-2 border-2 border-slate-950 bg-blue-50 px-3 py-1 text-xs font-mono font-bold text-blue-950 uppercase mb-2 shadow-[2px_2px_0px_0px_#020617]">
						Apresentação Institucional
					</div>
					<h2 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
						Leve o UniSISM para o seu Município
					</h2>
					<p class="text-slate-600 text-xs sm:text-sm mt-2 font-medium">
						Preencha os dados institucionais abaixo para agendar uma apresentação executiva para a sua Secretaria de Saúde.
					</p>
				</div>

				{#if formEnviado}
					<div class="border-2 border-slate-950 bg-slate-50 p-6 space-y-4 font-mono">
						<div class="text-center">
							<div class="text-lg font-black text-slate-950 uppercase">[SOLICITAÇÃO REGISTRADA COM SUCESSO]</div>
							<div class="text-xs text-slate-700 mt-1">
								Protocolo Oficial: <strong class="text-slate-950 font-mono text-sm">{protocoloDemonstracao}</strong>
							</div>
						</div>

						<div class="border-2 border-slate-950 bg-white p-4 text-xs space-y-2 text-slate-800">
							<div class="font-bold text-slate-950 border-b border-slate-200 pb-1">DADOS DO AGENDAMENTO EXECUTIVO:</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
								<div>Município: <strong>{formMunicipio} / {formUf}</strong></div>
								<div>Solicitante: <strong>{formNome}</strong> ({formCargo})</div>
								<div>E-mail Institucional: <strong>{formEmail}</strong></div>
								<div>Telefone / WhatsApp: <strong>{formTelefone}</strong></div>
							</div>
							<div class="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 border border-slate-200">
								Nossa equipe entrará em contato para alinhar a apresentação online ou presencial e os detalhes de parametrização da rede municipal.
							</div>
						</div>

						<div class="text-center pt-2">
							<button
								type="button"
								onclick={() => (formEnviado = false)}
								class="border-2 border-slate-950 bg-slate-950 text-white px-5 py-2.5 text-xs font-bold uppercase hover:bg-slate-800 cursor-pointer min-h-[44px]"
							>
								Nova Solicitação
							</button>
						</div>
					</div>
				{:else}
					<form onsubmit={submeterDemonstracao} class="space-y-4 font-mono">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label for="nome" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									Nome do Solicitante *
								</label>
								<input
									id="nome"
									type="text"
									required
									bind:value={formNome}
									placeholder="Ex: Dr. Carlos Mendes"
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
								/>
							</div>

							<div>
								<label for="cargo" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									Cargo / Função Pública *
								</label>
								<select
									id="cargo"
									bind:value={formCargo}
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
								>
									<option>Secretário(a) Municipal de Saúde</option>
									<option>Prefeito(a) / Vice-Prefeito(a)</option>
									<option>Diretor(a) de Regulação</option>
									<option>Coordenador(a) da Atenção Básica</option>
									<option>Gestor(a) de Tecnologia da Informação</option>
									<option>Outro Cargo Público</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="sm:col-span-2">
								<label for="municipio" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									Município *
								</label>
								<input
									id="municipio"
									type="text"
									required
									bind:value={formMunicipio}
									placeholder="Nome do município..."
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
								/>
							</div>

							<div>
								<label for="uf" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									UF *
								</label>
								<select
									id="uf"
									bind:value={formUf}
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
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
								<label for="email" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									E-mail Institucional *
								</label>
								<input
									id="email"
									type="email"
									required
									bind:value={formEmail}
									placeholder="saude@municipio.gov.br"
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
								/>
							</div>

							<div>
								<label for="telefone" class="block text-[11px] font-bold text-slate-800 uppercase mb-1">
									Telefone / WhatsApp *
								</label>
								<input
									id="telefone"
									type="tel"
									required
									bind:value={formTelefone}
									placeholder="(DDD) 99999-9999"
									class="w-full border-2 border-slate-950 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white min-h-[44px]"
								/>
							</div>
						</div>

						<div class="pt-2">
							<button
								type="submit"
								disabled={enviandoForm}
								class="w-full flex items-center justify-center gap-2 border-2 border-slate-950 bg-slate-950 px-6 py-4 font-mono text-sm font-bold tracking-wider text-white shadow-[4px_4px_0px_0px_#020617] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 cursor-pointer min-h-[48px]"
							>
								{#if enviandoForm}
									<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
									<span>REGISTRANDO...</span>
								{:else}
									<span>SOLICITAR APRESENTAÇÃO EXECUTIVA</span>
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
	<!-- FOOTER INSTITUCIONAL BRUTALISTA                                       -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<footer class="border-t-2 border-slate-950 bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 font-mono text-xs">
		<div class="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<div class="h-6 w-6 bg-white text-slate-950 flex items-center justify-center font-bold border border-white">U</div>
					<span class="text-white font-bold text-sm tracking-wider uppercase">UniSISM</span>
				</div>
				<p class="text-[11px] leading-relaxed text-slate-400">
					Sistema Integrado de Regulação e Gestão da Saúde Pública Municipal.
				</p>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-slate-800 pb-1">Módulos da Rede</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li><a href="/login" class="hover:text-white transition-colors">Regulação Municipal (SMS)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Atenção Básica</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Especialidades Médicas</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Odontologia Especializada</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Transporte Sanitário (TFD)</a></li>
					<li><a href="/tv" class="hover:text-white transition-colors">Painel de Sala de Espera</a></li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-slate-800 pb-1">Conformidade</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li>Prontuário Digital Sincronizado</li>
					<li>Tabela Unificada de Procedimentos</li>
					<li>Trilhas de Auditoria Imutáveis</li>
					<li>Validação e Rastreabilidade</li>
					<li>Segurança e Privacidade LGPD</li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-slate-800 pb-1">Acesso Direto</h4>
				<div class="space-y-2">
					<a
						href="/login"
						class="block text-center border-2 border-slate-700 bg-slate-900 px-3 py-2 text-white font-bold hover:bg-slate-800 transition-colors"
					>
						Acessar Terminal →
					</a>
					<a
						href="#demonstracao"
						class="block text-center border-2 border-slate-700 bg-white px-3 py-2 text-slate-950 font-bold hover:bg-slate-100 transition-colors"
					>
						Solicitar Apresentação
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

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- BOTTOM BAR FIXA MOBILE FIRST                                          -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<div class="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t-2 border-slate-950 bg-white p-2.5 flex items-center gap-2 shadow-lg">
		<a
			href="#demonstracao"
			class="flex-1 text-center border-2 border-slate-950 bg-white py-2.5 font-mono text-xs font-bold text-slate-950 uppercase"
		>
			Apresentação
		</a>
		<a
			href="/login"
			class="flex-1 text-center border-2 border-slate-950 bg-slate-950 py-2.5 font-mono text-xs font-bold text-white uppercase shadow-[2px_2px_0px_0px_#020617]"
		>
			Acessar →
		</a>
	</div>
</div>
