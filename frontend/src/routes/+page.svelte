<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';

	// Estado de autenticação do usuário
	let usuarioLogado = $state<{ nome: string; role: string; email: string } | null>(null);
	let rotaDestino = $state('/login');

	// Estado do seletor interativo de módulos
	let moduloAtivo = $state<'sms' | 'ubs' | 'cem' | 'ceo' | 'tfd' | 'tv' | 'app'>('sms');

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
				<a href="#modulos" class="hover:text-blue-900 transition-colors">Módulos</a>
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
	<!-- VITRINE COMPLETA DE MÓDULOS (TABS INTERATIVAS)                        -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="modulos" class="border-b border-slate-200 bg-slate-100/70 py-16 sm:py-24">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-center max-w-3xl mx-auto mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-700 uppercase mb-3">
					Arquitetura Modular Integrada
				</div>
				<h2 class="font-sans text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
					Explore os Módulos Especializados do UniSISM
				</h2>
				<p class="text-slate-600 text-base sm:text-lg mt-3 font-medium">
					Cada face do sistema foi projetada especificamente para o fluxo de trabalho de cada ator da saúde pública municipal.
				</p>
			</div>

			<!-- Navegação por Abas dos Módulos -->
			<div class="flex flex-wrap items-center justify-center gap-2 mb-8">
				<button
					type="button"
					onclick={() => (moduloAtivo = 'sms')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'sms'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🏛️ SMS (Regulação & Gestão)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ubs')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'ubs'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🏥 UBS (Atenção Básica)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'cem')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'cem'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🩺 CEM (Especialidades Médicas)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'ceo')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'ceo'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🦷 CEO (Especialidades Odonto)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tfd')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'tfd'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					🚑 TFD (Transporte & Frotas)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'tv')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'tv'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					📺 Smart TV (Chamadas)
				</button>

				<button
					type="button"
					onclick={() => (moduloAtivo = 'app')}
					class="border-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider uppercase transition-all
					{moduloAtivo === 'app'
						? 'border-slate-950 bg-blue-900 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
						: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
				>
					📱 App do Cidadão
				</button>
			</div>

			<!-- Painel de Detalhe do Módulo Selecionado -->
			<div class="border-2 border-slate-950 bg-white p-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
				{#if moduloAtivo === 'sms'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-900 uppercase">
								<span>🏛️ MÓDULO SMS · SECRETARIA MUNICIPAL DE SAÚDE</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Central de Regulação Municipal, Gestão de Cotas e Auditoria em Tempo Real
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								Dá ao Secretário e à equipe de regulação visão 360° de todas as solicitações médicas do município. Permite balancear cotas mensais para as UBSs rurais e urbanas, aprovar encaminhamentos com justificativa clínica e gerar relatórios executivos para o Ministério da Saúde.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Matriz de Cotas por UBS
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Fila Única de Regulação SUS
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Auditoria Imutável de Decisões
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Exportação SIGTAP / BPA / APAC
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-slate-950 p-4 font-mono text-xs text-slate-300">
							<div class="border-b border-slate-800 pb-2 text-slate-400 font-bold flex justify-between">
								<span>DASHBOARD SMS REGULAÇÃO</span>
								<span class="text-emerald-400">ONLINE</span>
							</div>
							<div class="py-3 space-y-2">
								<div class="flex justify-between border-b border-slate-800/60 pb-1">
									<span class="text-slate-400">Total Pacientes Rede:</span>
									<span class="font-bold text-white">58.312</span>
								</div>
								<div class="flex justify-between border-b border-slate-800/60 pb-1">
									<span class="text-slate-400">Encaminhamentos Ativos:</span>
									<span class="font-bold text-amber-400">124 em análise</span>
								</div>
								<div class="flex justify-between border-b border-slate-800/60 pb-1">
									<span class="text-slate-400">Cotas Especialidades (Mês):</span>
									<span class="font-bold text-emerald-400">1.450 disponíveis</span>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-400">Taxa de Resolução Municipal:</span>
									<span class="font-bold text-blue-400">94.2%</span>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ubs'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-emerald-700 uppercase">
								<span>🏥 MÓDULO UBS · ATENÇÃO PRIMÁRIA À SAÚDE (APS)</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Recepção, Triagem e Prontuário Integrado com e-SUS Cloud
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								A recepção do posto de saúde identifica o cidadão em segundos por Nome, CPF ou Cartão SUS. O médico ou enfermeiro acessa o histórico prévio, emite solicitações de encaminhamento anexando exames e acompanha a posição do paciente na fila regulada.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-emerald-700">✓</span> Busca Instantânea em 58k Cidadãos
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-emerald-700">✓</span> Emissão de Guias com Anexo
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-emerald-700">✓</span> Gestão da Fila de Acolhimento
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-emerald-700">✓</span> Monitoramento HiperDia / Pré-Natal
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-slate-950 p-4 font-mono text-xs text-slate-300">
							<div class="border-b border-slate-800 pb-2 text-slate-400 font-bold flex justify-between">
								<span>RECEPÇÃO UBS ZILDA ARNS</span>
								<span class="text-emerald-400">13 UBSs CONECTADAS</span>
							</div>
							<div class="py-3 space-y-2">
								<div class="border border-slate-800 bg-slate-900 p-2">
									<div class="text-[10px] text-slate-400">PACIENTE EM ATENDIMENTO:</div>
									<div class="font-bold text-white text-sm">MARIA APARECIDA DA SILVA</div>
									<div class="text-[11px] text-emerald-400">CNS: 7061.0851.2525.560 · Hipertensa</div>
								</div>
								<div class="flex justify-between text-[11px]">
									<span class="text-slate-400">Fila na Recepção:</span>
									<span class="text-white font-bold">4 aguardando</span>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'cem'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-900 uppercase">
								<span>🩺 MÓDULO CEM · CENTRO DE ESPECIALIDADES MÉDICAS</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Escalas Médicas, Consultórios Especializados e Prontuário SOAP
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								Gestão clínica completa para Cardiologia, Ortopedia, Dermatologia, Ginecologia, Pediatria, Psiquiatria e pequenas cirurgias. Alocação dinâmica de consultórios, agendamento de balcão regulado e laudos imediatos.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> 6 Consultórios Configurados
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Prontuário SOAP & Prescrição
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Registro de Procedimentos SIGTAP
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-blue-900">✓</span> Disparo Direto para Smart TV
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-slate-950 p-4 font-mono text-xs text-slate-300">
							<div class="border-b border-slate-800 pb-2 text-slate-400 font-bold flex justify-between">
								<span>ESCALA CEM MÉDICA</span>
								<span class="text-blue-400">AMB / POLICLÍNICA</span>
							</div>
							<div class="py-3 space-y-2">
								<div class="border border-slate-800 bg-slate-900 p-2">
									<div class="text-[10px] text-blue-400">CONSULTÓRIO 01 — CARDIOLOGIA</div>
									<div class="font-bold text-white text-sm">Dr. Roberto Medeiros (CRM-PE 18492)</div>
									<div class="text-[11px] text-slate-400">Turno: Manhã (08:00–12:00) · 12 Vagas</div>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'ceo'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-teal-700 uppercase">
								<span>🦷 MÓDULO CEO · CENTRO DE ESPECIALIDADES ODONTOLÓGICAS</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Odontograma Interativo, Cadeiras Odontológicas e Cirurgia Bucomaxilofacial
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								Projetado para as exigências do Brasil Sorridente. Controle individualizado por cadeira odontológica, especialidades de Endodontia, Periodontia, Cirurgia Oral Menor, Odontopediatria e Pacientes com Necessidades Especiais (PNE).
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-teal-700">✓</span> 4 Cadeiras Odontológicas
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-teal-700">✓</span> Odontograma Gráfico Digital
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-teal-700">✓</span> Escalas por Especialista (CRO)
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-teal-700">✓</span> Faturamento SIA/SUS Odonto
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-slate-950 p-4 font-mono text-xs text-slate-300">
							<div class="border-b border-slate-800 pb-2 text-slate-400 font-bold flex justify-between">
								<span>CEO MUNICIPAL</span>
								<span class="text-teal-400">BRASIL SORRIDENTE</span>
							</div>
							<div class="py-3 space-y-2">
								<div class="border border-slate-800 bg-slate-900 p-2">
									<div class="text-[10px] text-teal-400">CADEIRA 01 — ENDODONTIA</div>
									<div class="font-bold text-white text-sm">Dra. Camila Ribeiro (CRO-PE 8912)</div>
									<div class="text-[11px] text-slate-400">Tratamento de Canal · Dentes Anteriores/Posteriores</div>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tfd'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-amber-700 uppercase">
								<span>🚑 MÓDULO TFD · TRATAMENTO FORA DO DOMICÍLIO</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Gestão Logística de Frotas, Viagens Intermunicipais e Ajuda de Custo
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								Organiza viagens de pacientes para hospitais de alta complexidade (Recife, Garanhuns, Caruaru). Montagem de lista de passageiros com acompanhantes, rastreio de abastecimentos e prestação de contas com assinatura digital.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-amber-700">✓</span> Escala de Veículos e Motoristas
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-amber-700">✓</span> Assinatura ICP-Brasil de Recibos
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-amber-700">✓</span> Rastreio de Saldo e Combustível
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-amber-700">✓</span> Notificação Push ao Passageiro
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-slate-950 p-4 font-mono text-xs text-slate-300">
							<div class="border-b border-slate-800 pb-2 text-slate-400 font-bold flex justify-between">
								<span>EXPEDIÇÃO TFD</span>
								<span class="text-amber-400">ROTA RECIFE/PE</span>
							</div>
							<div class="py-3 space-y-2">
								<div class="border border-slate-800 bg-slate-900 p-2">
									<div class="text-[10px] text-amber-400">VAN EXECUTIVA 16L · PLACA PE-2026</div>
									<div class="font-bold text-white text-sm">Saída: 03:30h · Destino: IMIP / HUOC</div>
									<div class="text-[11px] text-slate-400">14 Pacientes + 2 Acompanhantes</div>
								</div>
							</div>
						</div>
					</div>
				{:else if moduloAtivo === 'tv'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-indigo-700 uppercase">
								<span>📺 PAINEL SMART TV & CHAMADA SONORA</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								Chamada em Tela Cheia com Síntese de Voz Humanizada
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								Funciona em qualquer Smart TV ou navegador da sala de espera. Quando o médico ou dentista clica em "Chamar Paciente", a TV emite um sinal sonoro suave e pronuncia o nome do cidadão e o consultório em português brasileiro límpido.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-indigo-700">✓</span> Pareamento Rápido por PIN
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-indigo-700">✓</span> Voz Humanizada Suave
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-indigo-700">✓</span> Destaque de Prioridade (Idoso/PCD)
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-indigo-700">✓</span> Alta Resolução 4K / Full HD
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 border-2 border-slate-900 bg-blue-950 p-5 font-mono text-white text-center">
							<div class="text-[10px] text-blue-300 font-bold uppercase tracking-widest">PAINEL DE CHAMADA DE VOZ</div>
							<div class="my-4 border border-blue-800 bg-slate-950/80 p-4">
								<div class="text-xs text-amber-400 font-bold">● CHAMANDO AGORA</div>
								<div class="text-lg font-black text-white mt-1">SEVERINO RAMOS DE SOUZA</div>
								<div class="text-xs text-emerald-400 mt-2">CONSULTÓRIO 02 — ORTOPEDIA</div>
							</div>
							<div class="text-[10px] text-slate-400 font-mono">PIN: CEM-2026 · Áudio Ativo</div>
						</div>
					</div>
				{:else if moduloAtivo === 'app'}
					<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
						<div class="lg:col-span-7 space-y-4">
							<div class="inline-flex items-center gap-2 font-mono text-xs font-bold text-sky-700 uppercase">
								<span>📱 APP DO PACIENTE (ANDROID & IOS)</span>
							</div>
							<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-950">
								A Saúde Municipal na Palma da Mão do Cidadão
							</h3>
							<p class="text-slate-600 text-base leading-relaxed">
								O morador acessa com o CPF, visualiza datas de consultas no CEM/CEO, acompanha o andamento da fila de regulação, consulta o horário da van do TFD e recebe notificações push quando sua vaga for liberada.
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs text-slate-800">
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-sky-700">✓</span> Auto-Provisionamento pelo CPF
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-sky-700">✓</span> Carteira de Vacinação Digital
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-sky-700">✓</span> Notificações de Consulta no App
								</div>
								<div class="flex items-center gap-2 border border-slate-200 bg-slate-50 p-2.5 font-bold">
									<span class="text-sky-700">✓</span> Rastreio do Transporte TFD
								</div>
							</div>
						</div>
						<div class="lg:col-span-5 flex justify-center">
							<div class="w-64 border-4 border-slate-950 rounded-2xl bg-slate-950 p-3 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] text-white font-mono">
								<div class="border-b border-slate-800 pb-2 text-[10px] text-center text-slate-400">
									UNISISM CIDADÃO
								</div>
								<div class="py-4 space-y-2 text-xs">
									<div class="bg-blue-900/40 border border-blue-700 p-2 rounded">
										<div class="text-[9px] text-blue-300">CONSULTA CONFIRMADA</div>
										<div class="font-bold text-white text-[11px]">Cardiologista · CEM</div>
										<div class="text-[10px] text-slate-300">Amanhã às 08:30h</div>
									</div>
									<div class="bg-slate-900 border border-slate-800 p-2 rounded">
										<div class="text-[9px] text-amber-400">VIAGEM TFD MARCADA</div>
										<div class="font-bold text-white text-[11px]">Recife/PE · Van 02</div>
										<div class="text-[10px] text-slate-300">Saída: 03:30h (Praça)</div>
									</div>
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
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors
								{porteSelecionado === 'pequeno'
									? 'border-white bg-white text-slate-950'
									: 'border-blue-800 bg-blue-900/40 text-slate-300 hover:bg-blue-900'}"
							>
								1. Porte Pequeno (Até 30.000 hab.)
							</button>
							<button
								type="button"
								onclick={() => (porteSelecionado = 'medio')}
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors
								{porteSelecionado === 'medio'
									? 'border-white bg-white text-slate-950'
									: 'border-blue-800 bg-blue-900/40 text-slate-300 hover:bg-blue-900'}"
							>
								2. Porte Médio (30.000 a 100.000 hab. · Águas Belas)
							</button>
							<button
								type="button"
								onclick={() => (porteSelecionado = 'grande')}
								class="border px-4 py-2 font-mono text-xs font-bold text-left uppercase transition-colors
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
							class="border border-emerald-900 bg-emerald-800 text-white px-4 py-1.5 text-xs font-bold uppercase mt-2 hover:bg-emerald-900"
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
