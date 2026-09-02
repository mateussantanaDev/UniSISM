<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { rbac } from '$lib/presentation/contexts/authContext';

	// Estado de autenticação do usuário
	let usuarioLogado = $state<{ nome: string; role: string; email: string } | null>(null);
	let rotaDestino = $state('/login');

	// Estado do seletor de módulos
	let moduloAtivo = $state<'sms' | 'ubs' | 'cem' | 'ceo' | 'tfd' | 'motorista' | 'tv' | 'app'>('sms');

	// ─── ESPECIFICAÇÃO COMPLETA DOS MÓDULOS ─────────────────────────────────
	const modulos = {
		sms: {
			id: 'sms',
			tag: '[REGULAÇÃO MUNICIPAL · SMS]',
			titulo: 'Central de Regulação & Fila Única',
			subtitulo: 'Gestão equitativa de vagas para consultas e exames especializados',
			missao: 'Centralizar toda a demanda de média e alta complexidade do município, garantindo alocação de vagas por gravidade clínica, fim do direcionamento manual e cumprimento estrito da matriz de cotas.',
			gargaloResolvido: 'Acaba com o apadrinhamento, filas presenciais de madrugada e perdas de pedidos médicos em papel.',
			capacidades: [
				{
					num: '01',
					titulo: 'Classificação de Risco & Prioridade Clínica',
					desc: 'Médicos reguladores avaliam cada encaminhamento classificando entre Urgente, Alta e Eletiva com fundamentação clínica e CID-10.'
				},
				{
					num: '02',
					titulo: 'Matriz de Cotas por Unidade de Saúde',
					desc: 'Distribuição transparente e proporcional de vagas mensais por UBS, garantindo equidade no acesso para a zona urbana e rural.'
				},
				{
					num: '03',
					titulo: 'Despacho Eletrônico & Devolutiva Rápida',
					desc: 'Aprovação direta de vagas, solicitação de laudos complementares ou cancelamento fundamentado sem trânsito de papéis físicos.'
				},
				{
					num: '04',
					titulo: 'Fila Única Auditável em Tempo Real',
					desc: 'Algoritmo que organiza as solicitações por ordem cronológica e gravidade, registrando trilhas imutáveis para órgãos de controle.'
				}
			],
			entregaveis: [
				'Mapa diário de demanda reprimida por especialidade',
				'Trilha de auditoria com autor, data e justificativa de cada despacho',
				'Relatório de absenteísmo e faltas por unidade de saúde',
				'Comprovante digital de agendamento regulado'
			],
			fluxo: 'UBS emite solicitação digital ➔ Médico Regulador analisa gravidade ➔ Vaga é alocada no CEM/CEO/TFD ➔ Notificação automática ao paciente'
		},
		ubs: {
			id: 'ubs',
			tag: '[ATENÇÃO BÁSICA · POSTOS DE SAÚDE]',
			titulo: 'Acolhimento & Prontuário na Atenção Básica',
			subtitulo: 'Porta de entrada integrada da saúde com prontuário clínico individual',
			missao: 'Digitalizar o atendimento na Atenção Básica com acolhimento ágil, prontuário individualizado perpétuo e emissão direta de encaminhamentos para a rede regulada.',
			gargaloResolvido: 'Elimina fichas de papel rasuradas, duplicidade de cadastros e extravio de históricos clínicos prévios.',
			capacidades: [
				{
					num: '01',
					titulo: 'Recepção e Fila de Acolhimento',
					desc: 'Controle de fluxo de chegada na unidade básica com triagem rápida e chamada organizada para a equipe de enfermagem e médicos.'
				},
				{
					num: '02',
					titulo: 'Dossiê Clínico Perpétuo do Paciente',
					desc: 'Cadastro unificado com histórico de consultas, evolução de enfermagem, vacinas aplicadas e condições crônicas acompanhadas.'
				},
				{
					num: '03',
					titulo: 'Emissão Digital de Encaminhamentos',
					desc: 'O profissional de saúde prescreve e encaminha o paciente durante a consulta, anexando exames e laudos diretamente no sistema.'
				},
				{
					num: '04',
					titulo: 'Rastreabilidade da Linha de Cuidado',
					desc: 'A equipe da UBS acompanha o andamento de cada encaminhamento emitido até a realização da consulta no especialista.'
				}
			],
			entregaveis: [
				'Prontuário eletrônico completo e sincronizado em toda a rede',
				'Painel de acompanhamento de grupos prioritários (Hipertensos, Diabéticos, Gestantes)',
				'Histórico de vacinação municipal integrado',
				'Comprovante de atendimento com registro de profissional'
			],
			fluxo: 'Munícipe chega à UBS ➔ Acolhimento & Triagem ➔ Consulta Médica ➔ Encaminhamento emitido digitalmente para a Regulação'
		},
		cem: {
			id: 'cem',
			tag: '[ESPECIALIDADES MÉDICAS · CEM]',
			titulo: 'Centro de Especialidades Médicas',
			subtitulo: 'Ambulatório de especialidades, prontuário SOAP e produção médica',
			missao: 'Gerenciar o atendimento secundário municipal com escalas de médicos especialistas, prontuário clínico estruturado no padrão SOAP e faturamento por procedimento.',
			gargaloResolvido: 'Elimina o absenteísmo descontrolado de especialistas e a falta de retorno (contra-referência) para os médicos da família.',
			capacidades: [
				{
					num: '01',
					titulo: 'Gestão de Escalas e Consultórios',
					desc: 'Configuração flexível de agendas por especialista, dia da semana, consultório físico e tempo médio de consulta.'
				},
				{
					num: '02',
					titulo: 'Prontuário Estruturado SOAP',
					desc: 'Registro clínico padronizado em Subjetivo, Objetivo, Avaliação com CID-10 e Plano Terapêutico com indicação de procedimentos.'
				},
				{
					num: '03',
					titulo: 'Histórico Integrado da Rede',
					desc: 'O médico especialista visualiza exames e prescrições emitidas previamente pelas UBSs sem necessidade de reimpressão de documentos.'
				},
				{
					num: '04',
					titulo: 'Produção Ambulatorial & Contra-Referência',
					desc: 'Apuração automática de procedimentos realizados e emissão digital de orientações de continuidade de cuidado para a UBS de origem.'
				}
			],
			entregaveis: [
				'Relatório consolidado de produção médica por procedimento',
				'Prontuário estruturado no padrão SOAP com assinatura digital',
				'Índice de aproveitamento de agenda e tempo médio de atendimento',
				'Guia de contra-referência digital para a equipe da Atenção Básica'
			],
			fluxo: 'Paciente regulado chega ao CEM ➔ Confirmação de presença ➔ Chamada na TV ➔ Atendimento SOAP ➔ Contra-referência emitida'
		},
		ceo: {
			id: 'ceo',
			tag: '[ODONTOLOGIA ESPECIALIZADA · CEO]',
			titulo: 'Centro de Especialidades Odontológicas',
			subtitulo: 'Odontologia de média complexidade, odontograma e gestão de cadeiras',
			missao: 'Estruturar os serviços odontológicos especializados com odontograma gráfico dente a dente, gestão de cadeiras clínicas e apuração de procedimentos cirúrgicos.',
			gargaloResolvido: 'Substitui anotações manuais em fichas dentárias por prontuário gráfico digital interativo com histórico de intervenções.',
			capacidades: [
				{
					num: '01',
					titulo: 'Odontograma Digital Dente a Dente',
					desc: 'Mapeamento visual da arcada dentária (dentes 11 a 48) registrando procedimentos executados e planejados por elemento.'
				},
				{
					num: '02',
					titulo: 'Especialidades Odontológicas Avançadas',
					desc: 'Fluxos clínicos dedicados para Endodontia (Canal), Periodontia, Cirurgia Oral Menor, Estomatologia e Prótese Dentária.'
				},
				{
					num: '03',
					titulo: 'Gestão de Cadeiras Odontológicas',
					desc: 'Controle de ocupação e escalas de cirurgiões-dentistas por setor clínico, cadeira e turno de atendimento.'
				},
				{
					num: '04',
					titulo: 'Apuração de Produção Odontológica',
					desc: 'Consolidação de procedimentos realizados por profissional para prestação de contas e relatórios gerenciais.'
				}
			],
			entregaveis: [
				'Odontograma gráfico atualizado em tempo real',
				'Relatório de produção odontológica especializada',
				'Controle de tempo de cadeira e produtividade clínica',
				'Histórico de cirurgias orais e tratamentos endodônticos'
			],
			fluxo: 'Triagem na Atenção Básica ➔ Regulação para o CEO ➔ Alocação na Cadeira ➔ Registro no Odontograma ➔ Alta ou Retorno'
		},
		tfd: {
			id: 'tfd',
			tag: '[TRANSPORTE SANITÁRIO · TFD]',
			titulo: 'Gestão de Viagens, Frotas & Ajuda de Custo',
			subtitulo: 'Logística de transporte sanitário para polos de alta complexidade',
			missao: 'Planejar, regular e monitorar as viagens de pacientes que necessitam de atendimento fora do município, com controle de poltronas, despesas e auditoria de combustível.',
			gargaloResolvido: 'Elimina o controle precário de viagens em planilhas soltas e a falta de comprovação de despesas com ajuda de custo.',
			capacidades: [
				{
					num: '01',
					titulo: 'Roteirização para Polos Regionais',
					desc: 'Organização de viagens diárias para hospitais de alta complexidade, centros de oncologia e maternidades de referência.'
				},
				{
					num: '02',
					titulo: 'Mapa de Poltronas & Passageiros',
					desc: 'Alocação ordenada de munícipes e acompanhantes autorizados em veículos específicos (vans, micro-ônibus e ambulâncias).'
				},
				{
					num: '03',
					titulo: 'Ajuda de Custo & Diárias',
					desc: 'Controle financeiro e comprovação de concessão de ajuda de custo para alimentação e estadia conforme a legislação municipal.'
				},
				{
					num: '04',
					titulo: 'Controle de Frota & Abastecimento',
					desc: 'Registro de quilometragem, vistorias periódicas, consumo de combustível e manutenções preventivas dos veículos.'
				}
			],
			entregaveis: [
				'Manifesto oficial de viagem com relação de passageiros e hospitais',
				'Recibos e relatórios de prestação de contas de ajuda de custo',
				'Relatório gerencial de consumo de combustível e manutenção de frota',
				'Histórico individual de viagens sanitárias por paciente'
			],
			fluxo: 'Solicitação de transporte na regulação ➔ Alocação de poltrona e rota ➔ Emissão do manifesto ➔ Despacho com o motorista'
		},
		motorista: {
			id: 'motorista',
			tag: '[APP DO MOTORISTA · OFFLINE FIRST]',
			titulo: 'UniSISM Motorista (App Mobile)',
			subtitulo: 'Diário de bordo eletrônico, controle de KM e embarque offline',
			missao: 'Empoderar os motoristas da saúde com um aplicativo nativo que funciona mesmo sem sinal de internet em rodovias e estradas rurais, registrando a viagem do início ao fim.',
			gargaloResolvido: 'Elimina anotações em papel de KM e listas manuais de passageiros que se perdiam nas viagens intermunicipais.',
			capacidades: [
				{
					num: '01',
					titulo: 'Operação 100% Offline (SQLite Local)',
					desc: 'Funciona perfeitamente em trechos sem sinal de celular nas rodovias, realizando sincronização automática assim que reconectar.'
				},
				{
					num: '02',
					titulo: 'Diário de Bordo & KM Digital',
					desc: 'Registro obrigatório do KM Inicial na saída e KM Final no retorno para auditoria de rodagem e prestação de contas transparente.'
				},
				{
					num: '03',
					titulo: 'Check-in de Passageiros nos Pontos de Parada',
					desc: 'Marcação rápida de presença (Embarcou, Desembarcou ou Ausente) em cada hospital ou ponto de parada da rota.'
				},
				{
					num: '04',
					titulo: 'Comprovantes de Abastecimento em Trânsito',
					desc: 'Fotografia e anexação digital de notas fiscais de combustível e comprovantes de pedágio diretamente no celular.'
				}
			],
			entregaveis: [
				'Diário de bordo digital assinado pelo condutor ao final da viagem',
				'Manifesto de presença com horários exatos de embarque e desembarque',
				'Comprovantes fiscais digitalizados para ressarcimento contábil',
				'Relatório de consumo KM/litro por veículo'
			],
			fluxo: 'Motorista inicia viagem no app ➔ Registra KM Inicial ➔ Faz check-in dos passageiros nos pontos ➔ Registra KM Final e despesas'
		},
		tv: {
			id: 'tv',
			tag: '[SALA DE ESPERA · SMART TV]',
			titulo: 'Painel de Chamada com Voz Humanizada',
			subtitulo: 'Painel audiovisual para Smart TVs em salas de recepção',
			missao: 'Transformar a sala de espera em um ambiente organizado e humanizado, chamando os pacientes por sinal sonoro harmônico e sintetizador de voz em português brasileiro.',
			gargaloResolvido: 'Acaba com os gritos e chamadas manuais nos corredores, trazendo dignidade e acessibilidade para idosos e pacientes iletrados.',
			capacidades: [
				{
					num: '01',
					titulo: 'Sinal Sonoro Suave (Chime Hospitalar)',
					desc: 'Aviso sonoro harmônico que atrai a atenção da recepção de forma acolhedora, sem causar sustos ou poluição sonora.'
				},
				{
					num: '02',
					titulo: 'Síntese de Voz Humanizada em Português',
					desc: 'Pronúncia clara do nome do paciente, número do consultório ou cadeira odontológica e nome do profissional responsável.'
				},
				{
					num: '03',
					titulo: 'Exibição Visual de Alto Contraste',
					desc: 'Tipografia ampla de alta legibilidade para televisores de qualquer tamanho, com sinalização clara de prioridades legais.'
				},
				{
					num: '04',
					titulo: 'Isolamento por Setor de Atendimento',
					desc: 'Painéis independentes: o painel do CEM gerencia consultórios médicos; o painel do CEO gerencia cadeiras odontológicas.'
				}
			],
			entregaveis: [
				'Ambiente de recepção humanizado e livre de ruídos desnecessários',
				'Redução da ansiedade e do tempo de espera percebido pelos pacientes',
				'Acessibilidade plena para pacientes com dificuldades visuais ou analfabetos',
				'Fluxo de chamadas sincronizado com o prontuário do médico/dentista'
			],
			fluxo: 'Médico clica em "Chamar Próximo" no prontuário ➔ Smart TV toca o sinal ➔ Voz anuncia o paciente ➔ Paciente entra no consultório'
		},
		app: {
			id: 'app',
			tag: '[APP DO PACIENTE · UNISISM PACIENTE]',
			titulo: 'UniSISM Paciente (App do Paciente)',
			subtitulo: 'Transparência, agendamentos e carteira vacinal na mão do munícipe',
			missao: 'Conectar o paciente diretamente à rede municipal de saúde pelo smartphone, permitindo acompanhar o andamento de suas consultas, viagens do TFD e vacinas.',
			gargaloResolvido: 'Acaba com o munícipe sem saber se seu pedido foi aprovado, com viagens perdidas e com a perda de cartões de papel.',
			capacidades: [
				{
					num: '01',
					titulo: 'Consulta de Agendamentos e Exames',
					desc: 'Visualização da posição na regulação e confirmação de data, horário, médico e local da consulta especializada.'
				},
				{
					num: '02',
					titulo: 'Detalhes de Viagem e Transporte (TFD)',
					desc: 'Acesso antecipado ao horário de partida, ponto de embarque, veículo e poltrona designada para o deslocamento.'
				},
				{
					num: '03',
					titulo: 'Carteira Vacinal Digital Integrada',
					desc: 'Histórico completo de vacinas aplicadas nas unidades municipais com registro de doses, lotes e datas de aplicação.'
				},
				{
					num: '04',
					titulo: 'Lembretes & Confirmação de Presença',
					desc: 'Notificações que lembram o munícipe da consulta, permitindo confirmar presença ou liberar a vaga com antecedência.'
				}
			],
			entregaveis: [
				'Canal digital oficial e transparente entre o cidadão e a Secretaria de Saúde',
				'Comprovantes de agendamento sempre disponíveis no celular',
				'Histórico unificado de saúde acessível a qualquer momento',
				'Redução drástica do absenteísmo por esquecimento'
			],
			fluxo: 'Consulta é regulada ➔ Paciente recebe aviso no celular ➔ Confirma presença ➔ Realiza a consulta e acompanha seu histórico'
		}
	};

	let infoAtiva = $derived(modulos[moduloAtivo]);

	// FAQ
	let faqAberta = $state<number | null>(0);
	const faqs = [
		{
			pergunta: 'Como o UniSISM sincroniza os dados da rede municipal?',
			resposta: 'A integração ocorre por barramento digital unificado e seguro. O sistema mantém sincronizados os históricos clínicos, cadastros de pacientes, agendamentos e registros de vacinação entre todas as unidades de atendimento em tempo real.'
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

	// Formulário de Apresentação
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
			protocoloDemonstracao = `SOL-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
			enviandoForm = false;
			formEnviado = true;
		}, 800);
	}
</script>

<svelte:head>
	<title>UniSISM · Sistema Integrado de Saúde Municipal</title>
	<meta
		name="description"
		content="Plataforma integrada de regulação em saúde, prontuário digital e gestão clínica que conecta Unidades Básicas, Centros de Especialidades, Frotas de Transporte, Painéis de Espera e o App do Paciente (UniSISM Paciente)."
	/>
	<meta name="keywords" content="saúde pública municipal, regulação em saúde, prontuário eletrônico, gestão de saúde, atendimento especializado, regulação municipal" />
	<meta name="author" content="UniSISM - Sistema Integrado de Saúde Municipal" />
	<link rel="canonical" href="https://unisism.vercel.app/" />

	<!-- OpenGraph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://unisism.vercel.app/" />
	<meta property="og:title" content="UniSISM · Sistema Integrado de Saúde Municipal" />
	<meta property="og:description" content="Plataforma integrada de regulação em saúde, prontuário digital e atendimento clínico para secretarias de saúde municipais." />
	<meta property="og:image" content="https://unisism.vercel.app/favicon.png" />
	<meta property="og:locale" content="pt_BR" />

	<!-- Twitter Cards -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="UniSISM · Sistema Integrado de Saúde Municipal" />
	<meta name="twitter:description" content="Regulação em tempo real, matriz de cotas digitais, gestão de transporte e prontuário digital com conformidade e auditoria imutável." />
	<meta name="twitter:image" content="https://unisism.vercel.app/favicon.png" />
</svelte:head>

<div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased selection:bg-blue-900 selection:text-white pb-20 md:pb-0">
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- TOPBAR INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<aside class="border-b border-blue-950 bg-blue-950 px-4 py-2 text-xs text-blue-200">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
			<div class="flex items-center gap-2">
				<span class="inline-block h-2 w-2 bg-emerald-400"></span>
				<span class="font-bold text-white tracking-wider uppercase">UniSISM</span>
				<span class="text-blue-400">/</span>
				<span class="hidden sm:inline text-blue-200">Plataforma Integrada de Gestão e Regulação em Saúde Municipal</span>
				<span class="sm:hidden text-blue-200">Gestão em Saúde Municipal</span>
			</div>
			<div class="flex items-center gap-3 text-blue-300">
				<span class="font-mono text-[10px] uppercase tracking-wider">CFM / LGPD COMPLIANT</span>
			</div>
		</div>
	</aside>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- NAVBAR INSTITUCIONAL                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<header class="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
			<!-- Logo UniSISM Oficial -->
			<a href="/" class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center border-2 border-blue-900 bg-blue-900 font-mono text-lg font-bold text-white shadow-[2px_2px_0px_0px_#1e3a8a]"
				>
					U
				</div>
				<div class="flex flex-col">
					<div class="flex items-center gap-1.5">
						<span class="font-mono text-lg font-bold tracking-tight text-blue-900 uppercase">UniSISM</span>
					</div>
					<span class="font-mono text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Saúde Municipal
					</span>
				</div>
			</a>

			<!-- Navegação Desktop -->
			<nav class="hidden lg:flex items-center gap-6 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase">
				<a href="#solucao" class="hover:text-blue-900 transition-colors">O Que Resolvemos</a>
				<a href="#modulos" class="hover:text-blue-900 transition-colors">Módulos</a>
				<a href="#impacto" class="hover:text-blue-900 transition-colors">Impacto</a>
				<a href="#seguranca" class="hover:text-blue-900 transition-colors">Segurança</a>
				<a href="#faq" class="hover:text-blue-900 transition-colors">Dúvidas</a>
			</nav>

			<!-- Ações / Botões -->
			<div class="flex items-center gap-2">
				{#if usuarioLogado}
					<a
						href={rotaDestino}
						class="flex items-center gap-2 border-2 border-blue-900 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[2px_2px_0px_0px_#1e3a8a] transition-all hover:bg-blue-800"
					>
						<span>PAINEL ({usuarioLogado.role})</span>
						<span>→</span>
					</a>
				{:else}
					<a
						href="#demonstracao"
						class="hidden sm:inline-flex border-2 border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase shadow-[2px_2px_0px_0px_#cbd5e1] hover:bg-slate-50"
					>
						Apresentação
					</a>
					<a
						href="/login"
						class="flex items-center gap-2 border-2 border-blue-900 bg-blue-900 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white shadow-[2px_2px_0px_0px_#1e3a8a] transition-all hover:bg-blue-800"
					>
						<span>ACESSAR TERMINAL</span>
						<span>→</span>
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- HERO SECTION (MOBILE FIRST & PALETA UNISISM)                         -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section class="border-b border-slate-200 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
				<!-- Copy Principal -->
				<div class="lg:col-span-7 flex flex-col items-start gap-5">
					<div class="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-mono font-bold tracking-wider text-blue-900 uppercase">
						<span class="inline-block h-2 w-2 bg-blue-900"></span>
						Governança & Regulação em Saúde Municipal
					</div>

					<h1 class="font-sans text-3xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl leading-[1.1]">
						A Saúde Pública Municipal <span class="bg-blue-900 text-white px-2 py-0.5 inline-block my-1">Integrada</span>, Digital e Transparente.
					</h1>

					<p class="text-base sm:text-lg leading-relaxed text-slate-600 font-medium">
						O <strong class="text-blue-950 font-bold">UniSISM</strong> conecta toda a rede de saúde: do acolhimento na Atenção Básica à regulação de vagas especializadas, gestão de frotas sanitárias, aplicativos móveis e prontuário unificado sem perdas de papel.
					</p>

					<!-- Dual Call To Action -->
					<div class="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3 pt-2">
						<a
							href="/login"
							class="flex items-center justify-center gap-3 border-2 border-blue-900 bg-blue-900 px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-white shadow-[3px_3px_0px_0px_#172554] transition-all hover:bg-blue-800 cursor-pointer"
						>
							<span>ACESSAR TERMINAL</span>
							<span class="text-base leading-none">→</span>
						</a>

						<a
							href="#demonstracao"
							class="flex items-center justify-center gap-2 border-2 border-slate-300 bg-white px-6 py-3.5 font-mono text-sm font-bold tracking-wider text-slate-800 shadow-[3px_3px_0px_0px_#cbd5e1] transition-all hover:bg-slate-50 cursor-pointer"
						>
							<span>AGENDAR APRESENTAÇÃO</span>
						</a>
					</div>

					<!-- Pilares de Qualidade -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-200 w-full font-mono text-xs">
						<div class="border border-slate-200 bg-slate-50 p-3 shadow-sm">
							<div class="font-bold text-blue-900 text-sm">[01] REGULAÇÃO</div>
							<div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Critério Clínico Ágil</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3 shadow-sm">
							<div class="font-bold text-blue-900 text-sm">[02] INTEGRAÇÃO</div>
							<div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Rede Sincronizada</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3 shadow-sm">
							<div class="font-bold text-blue-900 text-sm">[03] AUDITORIA</div>
							<div class="text-[10px] text-slate-500 font-bold uppercase mt-1">Trilhas Imutáveis</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3 shadow-sm">
							<div class="font-bold text-blue-900 text-sm">[04] PACIENTE</div>
							<div class="text-[10px] text-slate-500 font-bold uppercase mt-1">UniSISM Paciente</div>
						</div>
					</div>
				</div>

				<!-- Diagrama da Arquitetura Integrada -->
				<div class="lg:col-span-5">
					<div class="border-2 border-blue-900 bg-blue-950 text-slate-100 shadow-[4px_4px_0px_0px_#1e3a8a] p-5 font-mono">
						<!-- Header do Terminal -->
						<div class="flex items-center justify-between border-b border-blue-800 pb-3 mb-4">
							<div class="flex items-center gap-2">
								<span class="inline-block h-2.5 w-2.5 bg-white"></span>
								<span class="text-xs font-bold text-blue-100">ARQUITETURA DA REDE MUNICIPAL</span>
							</div>
							<span class="text-[10px] text-emerald-400 font-bold uppercase">[ONLINE]</span>
						</div>

						<!-- Diagrama da Malha -->
						<div class="space-y-3 text-xs leading-relaxed">
							<div class="border border-blue-800 bg-blue-900/60 p-3">
								<div class="text-blue-200 text-[10px] uppercase font-bold">1. ATENÇÃO PRIMÁRIA</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>Unidades Básicas de Saúde</span>
									<span class="text-emerald-400 text-[10px] font-mono">Prontuário Digital</span>
								</div>
								<div class="text-blue-100 text-[11px] pt-1">Acolhimento, triagem e emissão de solicitações com histórico prévio unificado.</div>
							</div>

							<div class="flex justify-center text-blue-300 font-bold">↓ Regulação Eletrônica & Matriz de Cotas</div>

							<div class="border border-blue-700 bg-blue-800/80 p-3">
								<div class="text-blue-100 text-[10px] uppercase font-bold">2. NÓ CENTRAL DE REGULAÇÃO</div>
								<div class="text-white font-bold flex items-center justify-between pt-1">
									<span>Secretaria Municipal de Saúde</span>
									<span class="text-blue-200 text-[10px] font-mono">Fila Única</span>
								</div>
								<div class="text-blue-100 text-[11px] pt-1">Distribuição equitativa de vagas por prioridade clínica e controle de cotas.</div>
							</div>

							<div class="flex justify-center text-blue-300 font-bold">↓ Despacho e Atendimento</div>

							<div class="grid grid-cols-2 gap-2">
								<div class="border border-blue-800 bg-blue-900/60 p-2.5 text-[11px]">
									<div class="text-amber-300 font-bold">ESPECIALIDADES</div>
									<div class="text-blue-100 text-[10px] pt-1">Consultórios CEM & Odonto CEO.</div>
								</div>
								<div class="border border-blue-800 bg-blue-900/60 p-2.5 text-[11px]">
									<div class="text-emerald-300 font-bold">TRANSPORTE TFD</div>
									<div class="text-blue-100 text-[10px] pt-1">Frotas & App Motorista.</div>
								</div>
							</div>

							<div class="border border-blue-700 bg-blue-900/90 p-2.5 flex items-center justify-between text-[11px]">
								<span class="text-blue-200 font-bold">Painel TV & UniSISM Paciente</span>
								<span class="text-blue-300 text-[10px]">Acesso Multicanal</span>
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
	<section id="solucao" class="border-b border-slate-200 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-800 uppercase mb-3 shadow-sm">
					Eficiência & Resolução
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
					Transformando Gargalos Operacionais em Governança Transparente
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
				<!-- Item 1 -->
				<div class="border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-900 mb-2">Filas Presenciais de Madrugada & Marcação Manual</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Deslocamento de munícipes na madrugada para postos de saúde sem garantia de atendimento e sem visibilidade sobre as vagas reais da rede.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-800 text-xs sm:text-sm font-sans font-semibold">
							Matriz de Cotas Digital por unidade com Regulação Algorítmica por Prioridade Clínica. O munícipe sai da consulta com sua solicitação inserida na fila regulada.
						</p>
					</div>
				</div>

				<!-- Item 2 -->
				<div class="border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-900 mb-2">Extravio de Guias em Papel & Duplicidade de Exames</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Guias físicas rasuradas e perda de histórico clínico prévio, provocando repetição de exames e demora no diagnóstico.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-800 text-xs sm:text-sm font-sans font-semibold">
							Dossiê Clínico Digital Unificado. Todo o histórico, anexos de exames e evolução médica acessíveis ao especialista autorizado em tempo real.
						</p>
					</div>
				</div>

				<!-- Item 3 -->
				<div class="border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-900 mb-2">Falta de Rastreabilidade no Transporte TFD</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Controle manual de listas de passageiros em viagens intermunicipais de saúde e dificuldade de comprovação de atendimento para auditoria.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-800 text-xs sm:text-sm font-sans font-semibold">
							Módulo TFD Completo com controle de rotas, escalas de motoristas, lista de passageiros com acompanhantes e comprovação digital.
						</p>
					</div>
				</div>

				<!-- Item 4 -->
				<div class="border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
					<div>
						<div class="flex items-center gap-2 text-xs font-bold text-red-700 uppercase mb-2">
							<span>[x] GARGALO OPERACIONAL</span>
						</div>
						<h3 class="font-sans text-lg sm:text-xl font-bold text-slate-900 mb-2">Salas de Espera Desorganizadas</h3>
						<p class="text-slate-600 text-xs sm:text-sm font-sans leading-relaxed mb-4">
							Chamadas manuais nos corredores gerando ruído e desinformação para pacientes e equipe de recepção.
						</p>
					</div>
					<div class="border-t border-slate-200 pt-4 bg-blue-50/70 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-5 sm:p-6">
						<div class="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase mb-1">
							<span>[✓] RESPOSTA UNISISM</span>
						</div>
						<p class="text-slate-800 text-xs sm:text-sm font-sans font-semibold">
							Painel de Chamada com sinal sonoro suave e voz humanizada em português brasileiro, organizando o fluxo por consultório ou cadeira.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- ESPECIFICAÇÃO E ARQUITETURA DETALHADA DOS MÓDULOS                    -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="modulos" class="border-b border-slate-200 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-8 sm:mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-800 uppercase mb-3 shadow-sm">
					Arquitetura Modular da Rede
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
					O Que Cada Módulo do UniSISM Entrega
				</h2>
				<p class="text-slate-600 text-sm sm:text-base mt-2 font-medium">
					Entenda com profundidade o papel de cada nó do sistema na operação diária da Secretaria Municipal de Saúde.
				</p>
			</div>

			<!-- Seletor de Módulos em Tabs (Mobile First) -->
			<div class="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:justify-center">
				{#each Object.values(modulos) as m}
					<button
						type="button"
						onclick={() => (moduloAtivo = m.id as any)}
						class="shrink-0 border-2 px-3.5 py-2 font-mono text-xs font-bold uppercase transition-all cursor-pointer min-h-[44px]
						{moduloAtivo === m.id
							? 'border-blue-900 bg-blue-900 text-white shadow-[2px_2px_0px_0px_#172554]'
							: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
					>
						{m.id === 'sms' ? 'Regulação (SMS)' : m.id === 'ubs' ? 'Atenção Básica' : m.id === 'cem' ? 'Especialidades (CEM)' : m.id === 'ceo' ? 'Odontologia (CEO)' : m.id === 'tfd' ? 'Transporte (TFD)' : m.id === 'motorista' ? 'UniSISM Motorista' : m.id === 'tv' ? 'Painel de Espera' : 'UniSISM Paciente'}
					</button>
				{/each}
			</div>

			<!-- Card Detalhado do Módulo Ativo -->
			<div class="border-2 border-blue-900 bg-white shadow-[4px_4px_0px_0px_#1e3a8a] p-6 sm:p-8 font-mono">
				<!-- Cabeçalho do Módulo -->
				<div class="border-b border-slate-200 pb-6 mb-6">
					<div class="flex flex-wrap items-center justify-between gap-2 mb-2">
						<span class="text-xs font-bold text-blue-900 uppercase tracking-wider">{infoAtiva.tag}</span>
						<span class="border border-emerald-600 bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase">
							[MÓDULO TOTALMENTE INTEGRADO]
						</span>
					</div>
					<h3 class="font-sans text-2xl sm:text-3xl font-black text-slate-900">{infoAtiva.titulo}</h3>
					<p class="font-sans text-sm sm:text-base text-slate-600 font-medium mt-1">{infoAtiva.subtitulo}</p>
					
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-xs font-sans">
						<div class="bg-blue-50/70 p-3 border border-blue-200">
							<strong class="font-mono font-bold text-blue-950 block uppercase text-[11px] mb-1">Missão Operacional:</strong>
							<p class="text-slate-700 leading-relaxed">{infoAtiva.missao}</p>
						</div>
						<div class="bg-emerald-50/70 p-3 border border-emerald-200">
							<strong class="font-mono font-bold text-emerald-950 block uppercase text-[11px] mb-1">Gargalo Eliminado:</strong>
							<p class="text-slate-700 leading-relaxed">{infoAtiva.gargaloResolvido}</p>
						</div>
					</div>
				</div>

				<!-- Grid de Capacidades Chave -->
				<div class="mb-8">
					<div class="text-xs font-bold text-slate-700 uppercase mb-4 tracking-wider">
						[CAPACIDADES E FLUXOS OPERACIONAIS]:
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each infoAtiva.capacidades as cap}
							<div class="border border-slate-200 bg-slate-50 p-4 space-y-1.5 shadow-sm">
								<div class="flex items-center gap-2">
									<span class="border border-blue-900 bg-blue-900 text-white font-mono text-[10px] font-bold px-1.5 py-0.2">
										{cap.num}
									</span>
									<h4 class="font-sans font-bold text-sm text-slate-900">{cap.titulo}</h4>
								</div>
								<p class="text-xs text-slate-600 font-sans leading-relaxed pt-1">
									{cap.desc}
								</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Entregáveis & Fluxo na Rede -->
				<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 border-t border-slate-200 text-xs">
					<!-- Entregáveis da Gestão -->
					<div class="lg:col-span-6 border border-slate-200 bg-slate-50 p-4 space-y-3">
						<div class="text-xs font-bold text-blue-900 uppercase">[ENTREGÁVEIS & AUDITORIA]:</div>
						<ul class="space-y-2 font-sans text-xs text-slate-700">
							{#each infoAtiva.entregaveis as ent}
								<li class="flex items-start gap-2">
									<span class="text-emerald-700 font-mono font-bold">✓</span>
									<span>{ent}</span>
								</li>
							{/each}
						</ul>
					</div>

					<!-- Fluxo de Ponta a Ponta -->
					<div class="lg:col-span-6 border border-blue-900 bg-blue-950 p-4 text-white space-y-3">
						<div class="text-xs font-bold text-blue-200 uppercase">[ESTEIRA DE ATENDIMENTO NA REDE]:</div>
						<p class="font-sans text-xs leading-relaxed text-blue-100">
							{infoAtiva.fluxo}
						</p>
						<div class="pt-2 border-t border-blue-800 text-[10px] text-blue-300 font-mono">
							Status do Barramento: Sincronização em tempo real entre UBS, SMS, CEM, CEO, TFD, Motorista e Paciente.
						</div>
					</div>
				</div>
			</div>

			<!-- Matriz Resumo dos 8 Módulos (Visão Geral da Rede) -->
			<div class="mt-12">
				<div class="text-left sm:text-center mb-6">
					<div class="inline-flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-1 text-[10px] font-mono font-bold tracking-widest text-slate-700 uppercase">
						Visão Panorâmica
					</div>
					<h3 class="font-sans text-xl sm:text-2xl font-black text-slate-900 mt-1">
						A Malha Completa de Saúde do Município
					</h3>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
					{#each Object.values(modulos) as m}
						<button
							type="button"
							onclick={() => (moduloAtivo = m.id as any)}
							class="text-left border p-4 transition-all cursor-pointer flex flex-col justify-between
							{moduloAtivo === m.id
								? 'border-blue-900 bg-blue-50/80 shadow-[2px_2px_0px_0px_#1e3a8a]'
								: 'border-slate-200 bg-white hover:bg-slate-50'}"
						>
							<div>
								<div class="text-[10px] text-blue-900 font-bold uppercase">{m.tag.split('·')[0].replace('[', '')}</div>
								<h4 class="font-sans font-bold text-sm text-slate-900 mt-1">{m.titulo}</h4>
								<p class="text-[11px] text-slate-600 font-sans mt-2 leading-relaxed">{m.subtitulo}</p>
							</div>
							<div class="mt-4 pt-2 border-t border-slate-200 text-[10px] text-blue-900 font-bold flex items-center justify-between">
								<span>Ver Detalhes</span>
								<span>→</span>
							</div>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- IMPACTO NA GESTÃO & GOVERNANÇA                                        -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="impacto" class="border-b border-slate-200 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-800 uppercase mb-3 shadow-sm">
					Ganhos de Governança
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
					Impacto na Gestão da Saúde Municipal
				</h2>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 font-mono">
				<div class="border border-slate-200 bg-white p-5 shadow-sm">
					<div class="text-2xl font-black text-blue-900 mb-1">Fila Zero</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Na Madrugada</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						O paciente é agendado diretamente na unidade básica de origem, sem necessidade de filas presenciais na madrugada para marcação.
					</p>
				</div>

				<div class="border border-slate-200 bg-white p-5 shadow-sm">
					<div class="text-2xl font-black text-blue-900 mb-1">100% Digital</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Sem Perda de Papel</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Encaminhamentos, laudos de exames e históricos clínicos trafegam digitalmente de ponta a ponta sem extravios físicos.
					</p>
				</div>

				<div class="border border-slate-200 bg-white p-5 shadow-sm">
					<div class="text-2xl font-black text-blue-900 mb-1">Menos Faltas</div>
					<div class="text-xs font-bold text-slate-700 mb-2 uppercase">Avisos e Confirmação</div>
					<p class="text-xs text-slate-600 font-sans leading-relaxed">
						Lembretes prévios e confirmações de presença que reduzem o absenteísmo e otimizam a agenda de especialistas.
					</p>
				</div>

				<div class="border border-slate-200 bg-white p-5 shadow-sm">
					<div class="text-2xl font-black text-blue-900 mb-1">Auditoria Total</div>
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
	<section id="seguranca" class="border-b border-blue-950 bg-blue-950 text-white py-12 sm:py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<div class="text-left sm:text-center max-w-3xl mx-auto mb-10 sm:mb-14">
				<div class="inline-flex items-center gap-2 border border-blue-800 bg-blue-900 px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-blue-100 uppercase mb-3">
					Segurança de Dados
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-white">
					Conformidade Rigorosa com LGPD e CFM
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
				<div class="border border-blue-800 bg-blue-900/60 p-5 sm:p-6">
					<div class="text-emerald-400 text-xl font-bold mb-2">[01] IMUTABILIDADE</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Trilhas de Auditoria</h3>
					<p class="text-blue-100 text-xs leading-relaxed font-sans">
						Mecanismo no nível de banco de dados que impede alterações ou exclusões retroativas em prontuários e decisões regulatórias.
					</p>
				</div>

				<div class="border border-blue-800 bg-blue-900/60 p-5 sm:p-6">
					<div class="text-blue-300 text-xl font-bold mb-2">[02] CRIPTOGRAFIA</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Armazenamento Seguro</h3>
					<p class="text-blue-100 text-xs leading-relaxed font-sans">
						Laudos e anexos clínicos são escaneados contra ameaças e armazenados em infraestrutura de nuvem criptografada.
					</p>
				</div>

				<div class="border border-blue-800 bg-blue-900/60 p-5 sm:p-6">
					<div class="text-amber-300 text-xl font-bold mb-2">[03] CONTROLE DE ACESSO</div>
					<h3 class="font-sans text-base font-bold text-white mb-2">Permissões por Papéis</h3>
					<p class="text-blue-100 text-xs leading-relaxed font-sans">
						Controle de acesso por perfis operacionais com registro auditável de quem prescreveu, encaminhou ou regulou cada atendimento.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- PERGUNTAS FREQUENTES (FAQ)                                            -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<section id="faq" class="border-b border-slate-200 bg-slate-100 py-12 sm:py-20">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="text-left sm:text-center mb-8 sm:mb-12">
				<div class="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-mono font-bold tracking-widest text-slate-800 uppercase mb-3 shadow-sm">
					Tira-Dúvidas
				</div>
				<h2 class="font-sans text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
					Perguntas Frequentes
				</h2>
			</div>

			<div class="space-y-3 font-mono">
				{#each faqs as faq, i}
					<div class="border border-slate-200 bg-white shadow-sm">
						<button
							type="button"
							onclick={() => (faqAberta = faqAberta === i ? null : i)}
							class="w-full flex items-center justify-between p-4 sm:p-5 text-left font-bold text-sm text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer min-h-[48px]"
						>
							<span class="font-sans font-bold text-sm sm:text-base pr-2">{faq.pergunta}</span>
							<span class="font-mono text-base font-bold text-blue-900">{faqAberta === i ? '[−]' : '[+]'}</span>
						</button>

						{#if faqAberta === i}
							<div class="p-4 sm:p-5 pt-0 border-t border-slate-200 text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
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
	<section id="demonstracao" class="border-b border-slate-200 bg-white py-12 sm:py-20">
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="border-2 border-blue-900 bg-white p-6 sm:p-10 shadow-[4px_4px_0px_0px_#1e3a8a]">
				<div class="text-left sm:text-center mb-6 sm:mb-8">
					<div class="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-mono font-bold text-blue-900 uppercase mb-2">
						Apresentação
					</div>
					<h2 class="font-sans text-2xl sm:text-3xl font-black text-slate-900">
						Leve o UniSISM para o seu Município
					</h2>
					<p class="text-slate-600 text-xs sm:text-sm mt-2 font-medium">
						Preencha os dados institucionais abaixo para agendar uma apresentação executiva para a sua Secretaria de Saúde.
					</p>
				</div>

				{#if formEnviado}
					<div class="border border-blue-200 bg-blue-50 p-6 space-y-4 font-mono">
						<div class="text-center">
							<div class="text-lg font-black text-blue-950 uppercase">[SOLICITAÇÃO REGISTRADA COM SUCESSO]</div>
							<div class="text-xs text-slate-700 mt-1">
								Protocolo: <strong class="text-blue-900 font-mono text-sm">{protocoloDemonstracao}</strong>
							</div>
						</div>

						<div class="border border-slate-200 bg-white p-4 text-xs space-y-2 text-slate-800">
							<div class="font-bold text-slate-900 border-b border-slate-200 pb-1">DADOS DO AGENDAMENTO:</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
								<div>Município: <strong>{formMunicipio} / {formUf}</strong></div>
								<div>Solicitante: <strong>{formNome}</strong> ({formCargo})</div>
								<div>E-mail: <strong>{formEmail}</strong></div>
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
								class="border-2 border-blue-900 bg-blue-900 text-white px-5 py-2.5 text-xs font-bold uppercase hover:bg-blue-800 cursor-pointer min-h-[44px]"
							>
								Nova Solicitação
							</button>
						</div>
					</div>
				{:else}
					<form onsubmit={submeterDemonstracao} class="space-y-4 font-mono">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label for="nome" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									Nome do Solicitante *
								</label>
								<input
									id="nome"
									type="text"
									required
									bind:value={formNome}
									placeholder="Ex: Dr. Carlos Mendes"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
								/>
							</div>

							<div>
								<label for="cargo" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									Cargo / Função *
								</label>
								<select
									id="cargo"
									bind:value={formCargo}
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
								>
									<option>Secretário(a) Municipal de Saúde</option>
									<option>Prefeito(a) / Vice-Prefeito(a)</option>
									<option>Diretor(a) de Regulação</option>
									<option>Coordenador(a) da Atenção Básica</option>
									<option>Gestor(a) de Tecnologia da Informação</option>
									<option>Outro Cargo de Gestão</option>
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="sm:col-span-2">
								<label for="municipio" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									Município *
								</label>
								<input
									id="municipio"
									type="text"
									required
									bind:value={formMunicipio}
									placeholder="Nome do município..."
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
								/>
							</div>

							<div>
								<label for="uf" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									UF *
								</label>
								<select
									id="uf"
									bind:value={formUf}
									class="w-full border-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
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
								<label for="email" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									E-mail Institucional *
								</label>
								<input
									id="email"
									type="email"
									required
									bind:value={formEmail}
									placeholder="saude@municipio.gov.br"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
								/>
							</div>

							<div>
								<label for="telefone" class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
									Telefone / WhatsApp *
								</label>
								<input
									id="telefone"
									type="tel"
									required
									bind:value={formTelefone}
									placeholder="(DDD) 99999-9999"
									class="w-full border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-900 min-h-[44px]"
								/>
							</div>
						</div>

						<div class="pt-2">
							<button
								type="submit"
								disabled={enviandoForm}
								class="w-full flex items-center justify-center gap-2 border-2 border-blue-900 bg-blue-900 px-6 py-4 font-mono text-sm font-bold tracking-wider text-white shadow-[3px_3px_0px_0px_#172554] transition-all hover:bg-blue-800 disabled:opacity-50 cursor-pointer min-h-[48px]"
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
	<!-- FOOTER INSTITUCIONAL UNISISM                                          -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<footer class="border-t border-blue-950 bg-blue-950 text-blue-200 py-12 px-4 sm:px-6 font-mono text-xs">
		<div class="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<div class="h-7 w-7 bg-white text-blue-900 flex items-center justify-center font-bold border border-white">U</div>
					<span class="text-white font-bold text-sm tracking-wider uppercase">UniSISM</span>
				</div>
				<p class="text-[11px] leading-relaxed text-blue-200">
					Sistema Integrado de Regulação e Gestão da Saúde Municipal.
				</p>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-blue-800 pb-1">Módulos da Rede</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li><a href="/login" class="hover:text-white transition-colors">Regulação Municipal</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Atenção Básica</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Especialidades Médicas</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Odontologia Especializada</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">Transporte Sanitário (TFD)</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">UniSISM Motorista (App)</a></li>
					<li><a href="/tv" class="hover:text-white transition-colors">Painel de Sala de Espera</a></li>
					<li><a href="/login" class="hover:text-white transition-colors">UniSISM Paciente (App)</a></li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-blue-800 pb-1">Conformidade</h4>
				<ul class="space-y-1.5 text-[11px]">
					<li>Prontuário Digital Sincronizado</li>
					<li>Tabela Unificada de Procedimentos</li>
					<li>Trilhas de Auditoria Imutáveis</li>
					<li>Validação e Rastreabilidade</li>
					<li>Segurança e Privacidade LGPD</li>
				</ul>
			</div>

			<div>
				<h4 class="text-white font-bold text-xs uppercase mb-3 border-b border-blue-800 pb-1">Acesso Direto</h4>
				<div class="space-y-2">
					<a
						href="/login"
						class="block text-center border-2 border-blue-700 bg-blue-900 px-3 py-2 text-white font-bold hover:bg-blue-800 transition-colors shadow-sm"
					>
						Acessar Terminal →
					</a>
					<a
						href="#demonstracao"
						class="block text-center border border-slate-300 bg-white px-3 py-2 text-blue-950 font-bold hover:bg-slate-50 transition-colors shadow-sm"
					>
						Solicitar Apresentação
					</a>
				</div>
			</div>
		</div>

		<div class="mx-auto max-w-7xl border-t border-blue-900 pt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] text-blue-300">
			<div>
				© {new Date().getFullYear()} UniSISM · Governança e Tecnologia em Saúde Municipal.
			</div>
			<div>
				Desenvolvido para Secretarias Municipais de Saúde · Brasil.
			</div>
		</div>
	</footer>

	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<!-- BOTTOM BAR FIXA MOBILE FIRST                                          -->
	<!-- ═════════════════════════════════════════════════════════════════════ -->
	<div class="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-slate-200 bg-white p-2.5 flex items-center gap-2 shadow-lg">
		<a
			href="#demonstracao"
			class="flex-1 text-center border border-slate-300 bg-white py-2.5 font-mono text-xs font-bold text-slate-800 uppercase"
		>
			Apresentação
		</a>
		<a
			href="/login"
			class="flex-1 text-center border-2 border-blue-900 bg-blue-900 py-2.5 font-mono text-xs font-bold text-white uppercase shadow-[2px_2px_0px_0px_#172554]"
		>
			Acessar →
		</a>
	</div>
</div>
