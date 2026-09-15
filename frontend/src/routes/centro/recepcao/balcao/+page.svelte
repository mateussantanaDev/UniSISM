<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type {
		Paciente,
		SolicitacaoMedica,
		PrioridadeClinica,
		Sexo,
		RacaCor,
		EscalaMedicoCentro,
		CalcularSlotCentroResponse,
		DiaDisponibilidadeSlot,
		SlotHorarioItem,
		EspecialidadeSigtapCentro,
		Ubs,
		Prefeitura,
		CriarUbsRequest
	} from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconCheck,
		IconSearch,
		IconCalendar,
		IconClock,
		IconUser,
		IconBuildingHospital,
		IconBuildingCommunity,
		IconMapPin,
		IconPlus,
		IconX,
		IconBolt,
		IconRefresh,
		IconPrinter,
		IconStethoscope,
		IconDental,
		IconFlask
	} from '@tabler/icons-svelte';
	import {
		type TipoCentro,
		type AgendamentoOcupado,
		isEspecialidadeOdonto,
		pertenceAoOrgaoCentro
	} from '$lib/domain/centro/alocadorInteligenteEscala';

	// Centro Selecionado determinado pelo órgão / rota ou detecção de especialidade/profissional
	let centroManual = $state<TipoCentro | null>(null);
	let centroSelecionado: TipoCentro = $derived.by(() => {
		if (page.url.pathname.includes('/ceo')) return 'CEO';
		if (page.url.pathname.includes('/cem')) return 'CEM';
		if (centroManual) return centroManual;
		if (especialidade && isEspecialidadeOdonto(especialidade)) return 'CEO';
		if (medicoSelecionado && isEspecialidadeOdonto({ especialidade: medicoSelecionado.especialidade, crm: medicoSelecionado.registro, nome: medicoSelecionado.nome })) {
			return 'CEO';
		}
		return 'CEM';
	});
	let ehCeo = $derived(centroSelecionado === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived<'CEM' | 'CEO'>(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista');
	let rotuloConsulta = $derived(ehCeo ? 'CONSULTA ODONTOLÓGICA' : 'CONSULTA MÉDICA');

	// Dados do Paciente (sem valores mockados)
	let pacienteCpf = $state('');
	let pacienteId = $state<string | null>(null);
	let pacienteNome = $state('');
	let pacienteSus = $state('');
	let pacienteNasc = $state('');
	let pacienteSexo = $state<Sexo>('M');
	let pacienteTel = $state('');
	let pacienteNomeMae = $state('');
	let pacienteRacaCor = $state<RacaCor | ''>('');

	// Endereço Residencial Desmembrado (Etapa 5)
	let pacienteCep = $state('');
	let pacienteRua = $state('');
	let pacienteNumero = $state('');
	let semNumero = $state(false);
	let pacienteBairro = $state('');
	let pacienteComplemento = $state('');
	let pacienteMunicipio = $state('Águas Belas');
	let pacienteUf = $state('PE');
	let buscandoCep = $state(false);
	let erroCep = $state('');

	let pacienteUbsId = $state('');
	let pacienteUbsNome = $state('');
	let buscaUbs = $state('');
	let dropdownUbsAberto = $state(false);
	let listaUbs = $state<Ubs[]>([]);
	let carregandoUbs = $state(true);

	// Modal de Confirmação para Cadastro de Nova UBS on-the-fly
	let modalNovaUbsAberto = $state(false);
	let formNovaUbsNome = $state('');
	let formNovaUbsMunicipio = $state('Águas Belas');
	let formNovaUbsUf = $state('PE');
	let formNovaUbsCnes = $state('');
	let formNovaUbsBairro = $state('');
	let formNovaUbsEndereco = $state('');
	let salvandoNovaUbs = $state(false);
	let erroModalUbs = $state('');
	let prefeiturasDisponiveis = $state<Prefeitura[]>([]);

	const racaOpcoes: { v: RacaCor; l: string }[] = [
		{ v: 'BRANCA', l: 'Branca' },
		{ v: 'PRETA', l: 'Preta' },
		{ v: 'PARDA', l: 'Parda' },
		{ v: 'AMARELA', l: 'Amarela' },
		{ v: 'INDIGENA', l: 'Indígena' },
		{ v: 'NAO_INFORMADA', l: 'Não informada' }
	];

	// Estado de busca reativa por CPF
	let buscandoCpf = $state(false);
	let pacienteExiste = $state(false);
	let erroBusca = $state('');
	let ultimoCpfPesquisado = '';
	let timerMensagem: any = null;

	// Dados da Solicitação e Alocação
	let especialidade = $state('');
	let tipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let procedimentoSolicitado = $state('');
	let prioridade = $state<PrioridadeClinica>('ELETIVA');
	let recomendacoes = $state('');

	// Escalas e profissionais carregados 100% do Banco de Dados
	let escalasDoBanco = $state<EscalaMedicoCentro[]>([]);
	let carregandoEscalas = $state(true);

	// Catálogo Oficial de Serviços e Procedimentos SIGTAP habilitados no Centro
	let catalogoServicos = $state<EspecialidadeSigtapCentro[]>([]);
	let carregandoCatalogo = $state(true);

	// Estado da Alocação e Grade de Disponibilidade calculada no Backend
	let alocacaoOtimizadaBalcao = $state<CalcularSlotCentroResponse['alocacao'] | null>(null);
	let gradeDisponibilidade = $state<DiaDisponibilidadeSlot[]>([]);
	let diaSelecionadoGrade = $state<string | null>(null);
	let slotEscolhido = $state<{
		data: string;
		dataFormatada: string;
		hora: string;
		consultorio: string;
		diaSemana?: string;
		medicoNome?: string;
		isRecomendado?: boolean;
	} | null>(null);

	let calculandoSlotBackend = $state(false);
	let mensagemSlotBackend = $state('');
	let confirmarPresencaImediata = $state(false);

	// Especialidades obtidas 100% dos Serviços Habilitados no Centro e Escalas do Banco
	let especialidadesCadastradas = $derived.by(() => {
		const sets = new Set<string>();
		// 1. Serviços / Consultas cadastrados no catálogo oficial do Centro
		for (const s of catalogoServicos) {
			if (s.ativa !== false && s.tipoServico !== 'PROCEDIMENTO' && s.nome) {
				sets.add(s.nome.trim());
			}
		}
		// 2. Especialidades dos profissionais com escala cadastrada no Centro
		for (const e of escalasDoBanco) {
			if (e.especialidade) {
				sets.add(e.especialidade.trim());
			}
		}
		return Array.from(sets).sort();
	});

	// Procedimentos SIGTAP obtidos 100% do catálogo oficial cadastrado no Centro
	let procedimentosCadastrados = $derived.by(() => {
		const procs: string[] = [];
		for (const s of catalogoServicos) {
			if (s.ativa !== false && (s.tipoServico === 'PROCEDIMENTO' || s.codigoSigtap)) {
				const label = s.codigoSigtap ? `${s.codigoSigtap} - ${s.nome}` : s.nome;
				if (!procs.includes(label)) procs.push(label);
			}
		}
		return procs.sort();
	});

	interface MedicoEspecialistaItem {
		id?: string;
		medicoId?: string;
		nome: string;
		registro: string;
		especialidade: string;
		especialidades: string[];
		diasSemana?: string[];
		horarioInicio?: string;
		horarioFim?: string;
		duracaoMinutos?: number;
		tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
	}

	function normalizarTexto(txt?: string): string {
		if (!txt) return '';
		return txt
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]/g, ' ')
			.trim();
	}

	function especialidadeMatch(esp1?: string, esp2?: string): boolean {
		if (!esp1 || !esp2) return false;
		const n1 = normalizarTexto(esp1);
		const n2 = normalizarTexto(esp2);
		if (n1 === n2) return true;
		if (n1.includes(n2) || n2.includes(n1)) return true;
		const p1 = n1.split(' ').filter(x => x.length >= 4);
		const p2 = n2.split(' ').filter(x => x.length >= 4);
		for (const a of p1) {
			for (const b of p2) {
				if (a === b || (a.length >= 5 && b.startsWith(a)) || (b.length >= 5 && a.startsWith(b))) {
					return true;
				}
			}
		}
		return false;
	}

	// Especialistas consolidados a partir das escalas cadastradas no banco
	let medicosEspecialistas = $derived.by<MedicoEspecialistaItem[]>(() => {
		const mapa = new Map<string, MedicoEspecialistaItem>();

		for (const e of escalasDoBanco) {
			const chave = (e.medicoNome || '').toLowerCase().trim();
			if (!chave) continue;

			const esp = (e.especialidade || '').trim();
			const dias = Array.isArray(e.diasSemana) ? e.diasSemana : [];

			if (!mapa.has(chave)) {
				mapa.set(chave, {
					id: e.id,
					medicoId: e.medicoId,
					nome: e.medicoNome.trim(),
					registro: e.crm || '',
					especialidade: esp,
					especialidades: esp ? [esp] : [],
					diasSemana: [...dias],
					horarioInicio: e.horarioInicio || '08:00',
					horarioFim: e.horarioFim || '12:00',
					duracaoMinutos: e.duracaoMinutos || 20,
					tipoServico: e.tipoServico
				});
			} else {
				const existente = mapa.get(chave)!;
				if (esp && !existente.especialidades.some(x => especialidadeMatch(x, esp))) {
					existente.especialidades.push(esp);
				}
				for (const d of dias) {
					if (!existente.diasSemana?.includes(d)) {
						existente.diasSemana = [...(existente.diasSemana || []), d];
					}
				}
				if (!existente.registro && e.crm) existente.registro = e.crm;
				if (!existente.medicoId && e.medicoId) existente.medicoId = e.medicoId;
			}
		}

		return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
	});

	let buscaMedico = $state('');
	let dropdownAberto = $state(false);
	let medicoSelecionado = $state<MedicoEspecialistaItem | null>(null);

	// Filtra especialistas pela especialidade selecionada (se houver) e texto de busca
	let medicosFiltrados = $derived.by<MedicoEspecialistaItem[]>(() => {
		let lista = medicosEspecialistas;
		if (especialidade) {
			const comEspecialidade = lista.filter(m => {
				return m.especialidades.some(esp => especialidadeMatch(esp, especialidade));
			});
			if (comEspecialidade.length > 0) {
				lista = comEspecialidade;
			}
		}
		if (buscaMedico.trim()) {
			const b = normalizarTexto(buscaMedico);
			lista = lista.filter(m => {
				const nomeNorm = normalizarTexto(m.nome);
				const regNorm = normalizarTexto(m.registro);
				const espNorm = m.especialidades.map(normalizarTexto).join(' ');
				return nomeNorm.includes(b) || regNorm.includes(b) || espNorm.includes(b);
			});
		}
		return lista;
	});

	// Ao alterar a especialidade solicitada: refiltra os médicos e limpa/auto-seleciona conforme os médicos habilitados
	function handleEspecialidadeChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		especialidade = target.value;

		if (medicoSelecionado) {
			const atendeNovaEspecialidade = medicoSelecionado.especialidades?.some(esp => especialidadeMatch(esp, especialidade));
			if (!atendeNovaEspecialidade) {
				medicoSelecionado = null;
				buscaMedico = '';
			}
		}

		// Se houver apenas 1 médico especialista cadastrado para essa especialidade, auto-seleciona para agilizar
		if (especialidade) {
			const habilitados = medicosEspecialistas.filter(m => m.especialidades.some(esp => especialidadeMatch(esp, especialidade)));
			if (habilitados.length === 1 && (!medicoSelecionado || medicoSelecionado.nome !== habilitados[0].nome)) {
				selecionarMedico(habilitados[0]);
			}
		}
	}

	function selecionarMedico(med: MedicoEspecialistaItem) {
		medicoSelecionado = {
			...med,
			especialidade: especialidade || med.especialidade || med.especialidades[0] || ''
		};
		buscaMedico = med.nome;
		if (!especialidade) {
			especialidade = med.especialidade || med.especialidades[0] || '';
		}
		dropdownAberto = false;
	}

	function limparMedico() {
		medicoSelecionado = null;
		buscaMedico = '';
	}

	// Filtragem reativa das UBSs cadastradas da rede municipal
	let ubsFiltradas = $derived.by(() => {
		const q = normalizarTexto(buscaUbs);
		if (!q) return listaUbs;
		return listaUbs.filter(u => 
			normalizarTexto(u.nome).includes(q) || 
			normalizarTexto(u.cnes || '').includes(q) || 
			normalizarTexto(u.bairro || '').includes(q)
		);
	});

	let buscaUbsExisteExata = $derived.by(() => {
		const q = normalizarTexto(buscaUbs);
		if (!q) return false;
		return listaUbs.some(u => normalizarTexto(u.nome) === q);
	});

	function selecionarUbs(u: Ubs) {
		pacienteUbsId = u.id;
		pacienteUbsNome = u.nome;
		buscaUbs = u.nome;
		dropdownUbsAberto = false;
	}

	function limparUbs() {
		pacienteUbsId = '';
		pacienteUbsNome = '';
		buscaUbs = '';
	}

	function abrirModalNovaUbs(sugestaoNome?: string) {
		formNovaUbsNome = (sugestaoNome || buscaUbs || '').trim();
		formNovaUbsMunicipio = 'Águas Belas';
		formNovaUbsUf = 'PE';
		formNovaUbsCnes = '';
		formNovaUbsBairro = '';
		formNovaUbsEndereco = '';
		erroModalUbs = '';
		dropdownUbsAberto = false;
		modalNovaUbsAberto = true;
	}

	async function salvarNovaUbs() {
		if (!formNovaUbsNome.trim()) {
			erroModalUbs = 'Informe o nome da nova Unidade Básica de Saúde.';
			return;
		}

		salvandoNovaUbs = true;
		erroModalUbs = '';
		try {
			let prefId = prefeiturasDisponiveis[0]?.id;
			if (!prefId) {
				const prefs = await api.admin.listPrefeituras().catch(() => []);
				prefeiturasDisponiveis = prefs;
				prefId = prefs[0]?.id;
			}

			const payload: CriarUbsRequest = {
				nome: formNovaUbsNome.trim(),
				municipio: formNovaUbsMunicipio.trim() || 'Águas Belas',
				uf: formNovaUbsUf.trim().toUpperCase() || 'PE',
				prefeituraId: prefId || 'prefeitura-aguas-belas',
				cnes: formNovaUbsCnes.trim() || undefined,
				bairro: formNovaUbsBairro.trim() || undefined,
				endereco: formNovaUbsEndereco.trim() || undefined
			};

			const novaUbs = await api.admin.createUbs(payload);
			listaUbs = [...listaUbs, novaUbs];
			selecionarUbs(novaUbs);
			modalNovaUbsAberto = false;
			sucessoAgendamento = `✓ Nova UBS "${novaUbs.nome}" cadastrada com sucesso em Águas Belas e vinculada ao paciente!`;
			setTimeout(() => (sucessoAgendamento = ''), 6000);
		} catch (err: any) {
			console.error('Erro ao cadastrar UBS on-the-fly:', err);
			erroModalUbs = err?.message || 'Falha ao cadastrar a nova UBS. Verifique se o nome ou CNES já existem no município.';
		} finally {
			salvandoNovaUbs = false;
		}
	}

	// Alocação Automática e Busca da Grade de Disponibilidade da Escala via Backend
	async function calcularSlotBackend() {
		if (!especialidade && !medicoSelecionado) {
			alocacaoOtimizadaBalcao = null;
			gradeDisponibilidade = [];
			slotEscolhido = null;
			diaSelecionadoGrade = null;
			mensagemSlotBackend = '';
			return;
		}

		calculandoSlotBackend = true;
		mensagemSlotBackend = '';

		try {
			const res = await api.centroRecepcao.calcularSlot({
				centro: centroSelecionado,
				especialidade: especialidade || medicoSelecionado?.especialidade,
				medicoNome: medicoSelecionado?.nome,
				medicoId: medicoSelecionado?.medicoId,
				prioridade,
				tipoServico,
				procedimento: procedimentoSolicitado
			});

			if (res && res.sucesso && res.alocacao) {
				alocacaoOtimizadaBalcao = res.alocacao;
				gradeDisponibilidade = res.gradeDisponibilidade || [];
				mensagemSlotBackend = '';

				// Mantém ou define o slot escolhido
				if (!slotEscolhido || slotEscolhido.medicoNome !== res.alocacao.medicoNome) {
					slotEscolhido = {
						data: res.alocacao.data,
						dataFormatada: res.alocacao.dataFormatada,
						hora: res.alocacao.hora,
						consultorio: res.alocacao.consultorio,
						medicoNome: res.alocacao.medicoNome,
						isRecomendado: true
					};
					diaSelecionadoGrade = res.alocacao.data;
				}
			} else {
				alocacaoOtimizadaBalcao = null;
				gradeDisponibilidade = [];
				slotEscolhido = null;
				diaSelecionadoGrade = null;
				mensagemSlotBackend = res?.mensagem || 'Nenhum slot disponível com os critérios selecionados.';
			}
		} catch (err: any) {
			alocacaoOtimizadaBalcao = null;
			gradeDisponibilidade = [];
			slotEscolhido = null;
			diaSelecionadoGrade = null;
			mensagemSlotBackend = err?.message || 'Falha ao consultar grade de disponibilidade do especialista no servidor.';
		} finally {
			calculandoSlotBackend = false;
		}
	}

	$effect(() => {
		const _esp = especialidade;
		const _med = medicoSelecionado?.nome;
		const _prio = prioridade;
		const _serv = tipoServico;
		const _proc = procedimentoSolicitado;
		calcularSlotBackend();
	});

	// Dia selecionado atualmente na grade
	let diaGradeAtual = $derived(
		gradeDisponibilidade.find(d => d.data === diaSelecionadoGrade) || (gradeDisponibilidade.length > 0 ? gradeDisponibilidade[0] : null)
	);

	function selecionarSlotGrade(dia: DiaDisponibilidadeSlot, slot: SlotHorarioItem) {
		if (!slot.disponivel) return;
		diaSelecionadoGrade = dia.data;
		slotEscolhido = {
			data: dia.data,
			dataFormatada: dia.dataFormatada,
			hora: slot.hora,
			consultorio: alocacaoOtimizadaBalcao?.consultorio || (ehCeo ? 'CADEIRA ODONTOLÓGICA 01' : 'CONSULTÓRIO 01'),
			diaSemana: dia.diaSemana,
			medicoNome: medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome,
			isRecomendado: false
		};
	}

	function selecionarSlotRecomendado() {
		if (!alocacaoOtimizadaBalcao) return;
		diaSelecionadoGrade = alocacaoOtimizadaBalcao.data;
		slotEscolhido = {
			data: alocacaoOtimizadaBalcao.data,
			dataFormatada: alocacaoOtimizadaBalcao.dataFormatada,
			hora: alocacaoOtimizadaBalcao.hora,
			consultorio: alocacaoOtimizadaBalcao.consultorio,
			medicoNome: alocacaoOtimizadaBalcao.medicoNome,
			isRecomendado: true
		};
	}

	// Opção de Lançamento de Ficha Antiga (Retroativo)
	let habilitarRetroativo = $state(false);
	let dataRetroativa = $state(new Date().toISOString().substring(0, 10));
	let horaRetroativa = $state('08:00');
	let statusRetroativo = $state<'CONCLUIDO' | 'AGUARDANDO' | 'FALTOU'>('CONCLUIDO');

	let processandoAgendamento = $state(false);
	let sucessoAgendamento = $state('');
	let erroAgendamento = $state('');

	// Limpar e formatar CPF
	function formatarCpf(val: string) {
		const nums = val.replace(/\D/g, '').slice(0, 11);
		if (nums.length <= 3) return nums;
		if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`;
		if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`;
		return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`;
	}

	function formatarCep(val: string) {
		const nums = val.replace(/\D/g, '').slice(0, 8);
		if (nums.length <= 5) return nums;
		return `${nums.slice(0, 5)}-${nums.slice(5)}`;
	}

	async function buscarCep() {
		const cepLimpo = pacienteCep.replace(/\D/g, '');
		if (cepLimpo.length !== 8) return;
		buscandoCep = true;
		erroCep = '';
		try {
			const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
			if (res.ok) {
				const data = await res.json();
				if (!data.erro) {
					if (data.logradouro) pacienteRua = data.logradouro;
					if (data.bairro) pacienteBairro = data.bairro;
					if (data.localidade) pacienteMunicipio = data.localidade;
					if (data.uf) pacienteUf = data.uf;
				} else {
					erroCep = 'CEP não localizado na base nacional';
				}
			}
		} catch (err) {
			console.info('[UniSISM] Consulta ViaCEP offline:', err);
		} finally {
			buscandoCep = false;
		}
	}

	function handleCepInput(e: Event) {
		const target = e.target as HTMLInputElement;
		pacienteCep = formatarCep(target.value);
		erroCep = '';
		const sanitizado = pacienteCep.replace(/\D/g, '');
		if (sanitizado.length === 8) {
			buscarCep();
		}
	}

	function toggleSemNumero() {
		semNumero = !semNumero;
		if (semNumero) {
			pacienteNumero = 'S/N';
		} else if (pacienteNumero === 'S/N') {
			pacienteNumero = '';
		}
	}

	function handleCpfInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const sanitizado = target.value.replace(/\D/g, '');
		pacienteCpf = formatarCpf(target.value);

		if (sanitizado.length === 11 && sanitizado !== ultimoCpfPesquisado) {
			ultimoCpfPesquisado = sanitizado;
			pesquisarPaciente(sanitizado);
		} else if (sanitizado.length < 11) {
			pacienteExiste = false;
			pacienteId = null;
			pacienteUbsId = '';
			pacienteUbsNome = '';
			buscaUbs = '';
			pacienteRua = '';
			pacienteNumero = '';
			semNumero = false;
			pacienteBairro = '';
			pacienteComplemento = '';
			pacienteCep = '';
			pacienteMunicipio = 'Águas Belas';
			pacienteUf = 'PE';
			erroCep = '';
			ultimoCpfPesquisado = '';
			erroBusca = '';
		}
	}

	async function pesquisarPaciente(sanitizado: string) {
		buscandoCpf = true;
		erroBusca = '';
		sucessoAgendamento = '';
		erroAgendamento = '';

		try {
			const res = await api.centroRecepcao.buscarPacientePorCpf(sanitizado)
				.catch(() => api.pacientes.porCpf(sanitizado).catch(() => null));

			if (res && res.existe && res.paciente) {
				pacienteExiste = true;
				pacienteId = res.paciente.id || null;
				pacienteNome = res.paciente.nome || '';
				pacienteSus = res.paciente.cartaoSus || '';
				pacienteNasc = res.paciente.dataNascimento || '';
				pacienteSexo = (res.paciente.sexo as Sexo) || 'M';
				pacienteTel = res.paciente.telefone || '';
				pacienteNomeMae = res.paciente.nomeMae || '';
				pacienteRacaCor = (res.paciente.racaCor as RacaCor) || '';

				// Endereço Desmembrado
				pacienteBairro = res.paciente.bairro || '';
				pacienteMunicipio = res.paciente.municipio || 'Águas Belas';
				pacienteUf = res.paciente.uf || 'PE';
				pacienteCep = res.paciente.cep ? formatarCep(res.paciente.cep) : '';

				if (res.paciente.endereco) {
					const rawEnd = res.paciente.endereco;
					const partes = rawEnd.split(',');
					if (partes.length >= 2) {
						pacienteRua = partes[0].trim();
						const resto = partes.slice(1).join(',').trim();
						const restoPartes = resto.split('-');
						const numPart = restoPartes[0]?.trim() || '';
						if (numPart.toLowerCase() === 's/n' || numPart.toLowerCase() === 'sn' || numPart.toLowerCase() === 'sem número') {
							semNumero = true;
							pacienteNumero = 'S/N';
						} else {
							semNumero = false;
							pacienteNumero = numPart;
						}
						pacienteComplemento = restoPartes.slice(1).join('-').trim();
					} else {
						pacienteRua = rawEnd;
						pacienteNumero = '';
						pacienteComplemento = '';
						semNumero = false;
					}
				} else {
					pacienteRua = '';
					pacienteNumero = '';
					pacienteComplemento = '';
					semNumero = false;
				}

				pacienteUbsId = res.paciente.ubsId || '';
				const ubsNomeRetornada = (res.paciente as any).ubsNome || (res.paciente as any).ubs?.nome;
				if (ubsNomeRetornada) {
					pacienteUbsNome = ubsNomeRetornada;
					buscaUbs = ubsNomeRetornada;
				} else if (pacienteUbsId) {
					const ubsObj = listaUbs.find(u => u.id === pacienteUbsId);
					if (ubsObj) {
						pacienteUbsNome = ubsObj.nome;
						buscaUbs = ubsObj.nome;
					}
				} else {
					pacienteUbsNome = '';
					buscaUbs = '';
				}
			} else {
				pacienteExiste = false;
				pacienteId = null;
				pacienteUbsId = '';
				pacienteUbsNome = '';
				buscaUbs = '';
				pacienteRua = '';
				pacienteNumero = '';
				semNumero = false;
				pacienteBairro = '';
				pacienteComplemento = '';
				pacienteCep = '';
				pacienteMunicipio = 'Águas Belas';
				pacienteUf = 'PE';
				erroCep = '';
				erroBusca = 'CPF não localizado. Preencha os campos abaixo para cadastrar e agendar o paciente.';
			}
		} catch (e) {
			console.error(e);
			erroBusca = 'Erro ao consultar CPF na base de dados.';
		} finally {
			buscandoCpf = false;
		}
	}

	onMount(async () => {
		try {
			carregandoEscalas = true;
			carregandoCatalogo = true;
			carregandoUbs = true;
			const [escalasRecepcao, escalasGestao, servicos, salas, ubsList, prefeiturasList, profissionaisList] = await Promise.all([
				api.centroRecepcao.listEscalas({ centro: centroSelecionado }).catch(() => []),
				api.centroGestao.listEscalas({ centro: siglaOrgao }).catch(() => []),
				api.centroGestao.listEspecialidades({ centro: siglaOrgao }).catch(() => []),
				api.centroGestao.listSalas({ centro: siglaOrgao }).catch(() => []),
				api.admin.listUbs().catch(() => []),
				api.admin.listPrefeituras().catch(() => []),
				api.centroGestao.listProfissionais({ centro: siglaOrgao }).catch(() => [])
			]);

			listaUbs = Array.isArray(ubsList) ? ubsList : [];
			prefeiturasDisponiveis = Array.isArray(prefeiturasList) ? prefeiturasList : [];
			carregandoUbs = false;

			const mapaEscalas = new Map<string, EscalaMedicoCentro>();
			for (const esc of [...(Array.isArray(escalasRecepcao) ? escalasRecepcao : []), ...(Array.isArray(escalasGestao) ? escalasGestao : [])]) {
				const chave = `${esc.medicoNome}_${esc.especialidade}`.toLowerCase();
				if (!mapaEscalas.has(chave)) {
					mapaEscalas.set(chave, esc);
				}
			}

			// Adiciona também profissionais alocados em salas físicas da Etapa 1
			if (Array.isArray(salas)) {
				for (const s of salas) {
					if (Array.isArray(s.profissionaisAlocados)) {
						for (const p of s.profissionaisAlocados) {
							if (p.medicoNome && p.especialidade) {
								const chave = `${p.medicoNome}_${p.especialidade}`.toLowerCase();
								if (!mapaEscalas.has(chave)) {
									mapaEscalas.set(chave, {
										medicoId: p.medicoId,
										medicoNome: p.medicoNome,
										crm: p.medicoRegistro || (ehCeo ? 'CRO-PE' : 'CRM-PE'),
										especialidade: p.especialidade,
										diasSemana: Array.isArray(p.diasSemana) ? p.diasSemana : ['SEG', 'QUA'],
										horarioInicio: p.horario?.split(' ')[0] || '08:00',
										horarioFim: p.horario?.split(' ')[2] || '12:00',
										duracaoMinutos: 20,
										vagasPorTurno: 12,
										status: 'ATIVA',
										ativo: true
									});
								}
							}
						}
					}
				}
			}

			// Adiciona também profissionais cadastrados na equipe do Centro (Gestão de Usuários)
			if (Array.isArray(profissionaisList)) {
				for (const p of profissionaisList) {
					if (p.nome) {
						const esp = p.especialidade || (ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada');
						const chave = `${p.nome}_${esp}`.toLowerCase();
						if (!mapaEscalas.has(chave)) {
							mapaEscalas.set(chave, {
								medicoId: p.id,
								medicoNome: p.nome,
								crm: p.registroProfissional ? `${p.conselho} ${p.registroProfissional}` : (ehCeo ? 'CRO' : 'CRM'),
								especialidade: esp,
								diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
								horarioInicio: '08:00',
								horarioFim: '17:00',
								duracaoMinutos: 20,
								vagasPorTurno: 16,
								status: 'ATIVA',
								ativo: true
							});
						}
					}
				}
			}

			escalasDoBanco = Array.from(mapaEscalas.values());
			catalogoServicos = Array.isArray(servicos) ? servicos : [];
		} catch (err) {
			console.info('[UniSISM] Falha ao carregar dados do balcão.', err);
		} finally {
			carregandoEscalas = false;
			carregandoCatalogo = false;
		}
	});

	onDestroy(() => {
		if (timerMensagem) clearTimeout(timerMensagem);
	});

	async function agendarBalcao() {
		const sanitizadoCpf = pacienteCpf.replace(/\D/g, '');
		if (sanitizadoCpf.length !== 11) {
			erroAgendamento = 'CPF inválido. Digite um CPF válido com 11 dígitos.';
			return;
		}

		if (!pacienteNome.trim()) {
			erroAgendamento = 'Informe o nome completo do paciente.';
			return;
		}

		if (!pacienteNasc) {
			erroAgendamento = 'Informe a data de nascimento do paciente.';
			return;
		}

		if (!especialidade) {
			erroAgendamento = 'Selecione a especialidade solicitada.';
			return;
		}

		if (tipoServico === 'PROCEDIMENTO' && !procedimentoSolicitado) {
			erroAgendamento = 'Selecione o procedimento SIGTAP específico.';
			return;
		}

		if (!habilitarRetroativo && !slotEscolhido && !alocacaoOtimizadaBalcao) {
			erroAgendamento = 'Nenhum dia/horário da escala do especialista foi selecionado.';
			return;
		}

		processandoAgendamento = true;
		erroAgendamento = '';
		sucessoAgendamento = '';

		let dataCalculada = '';
		let horaCalculada = '';
		let consultorioCalculado = '';

		if (habilitarRetroativo) {
			if (!dataRetroativa) {
				erroAgendamento = 'Informe a data do agendamento retroativo.';
				processandoAgendamento = false;
				return;
			}
			dataCalculada = dataRetroativa;
			horaCalculada = horaRetroativa || '08:00';
			consultorioCalculado = ehCeo ? 'Cadeira 01' : 'Consultório 01';
		} else if (slotEscolhido) {
			dataCalculada = slotEscolhido.data;
			horaCalculada = slotEscolhido.hora;
			consultorioCalculado = slotEscolhido.consultorio;
		} else if (alocacaoOtimizadaBalcao) {
			dataCalculada = alocacaoOtimizadaBalcao.data;
			horaCalculada = alocacaoOtimizadaBalcao.hora;
			consultorioCalculado = alocacaoOtimizadaBalcao.consultorio;
		}

		const nomeProfissionalFinal = medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome || 'Especialista da Escala';
		const crmProfissionalFinal = medicoSelecionado?.registro || alocacaoOtimizadaBalcao?.crm || (ehCeo ? 'CRO 0000' : 'CRM 0000');

		const notaAgendamento = `Agendamento Presencial de Balcão [${nomeOrgao}] | Profissional: ${nomeProfissionalFinal} (${crmProfissionalFinal}) em ${dataCalculada} às ${horaCalculada} | Consultório: ${consultorioCalculado} | Prioridade: ${prioridade} | Obs: ${recomendacoes.trim() || 'Sem observações'}` + (habilitarRetroativo ? ` | [MIGRAÇÃO PAPEL RETROATIVO: ${dataCalculada} às ${horaCalculada} - Status: ${statusRetroativo}]` : '');

		const numFinal = semNumero || !pacienteNumero.trim() ? 'S/N' : pacienteNumero.trim();
		const endCompleto = [
			pacienteRua.trim(),
			numFinal,
			pacienteComplemento.trim()
		].filter(Boolean).join(', ');

		try {
			// 1. Prepara dados do Paciente
			const pacientePayload: Paciente = {
				nome: pacienteNome.trim(),
				cpf: sanitizadoCpf,
				cartaoSus: pacienteSus.trim(),
				dataNascimento: pacienteNasc,
				sexo: pacienteSexo,
				telefone: pacienteTel.trim(),
				endereco: endCompleto || pacienteRua.trim() || 'Águas Belas',
				bairro: pacienteBairro.trim() || undefined,
				municipio: pacienteMunicipio.trim() || 'Águas Belas',
				uf: pacienteUf.trim().toUpperCase() || 'PE',
				cep: pacienteCep.trim() ? pacienteCep.replace(/\D/g, '') : undefined,
				nomeMae: pacienteNomeMae.trim() || undefined,
				racaCor: (pacienteRacaCor as RacaCor) || undefined,
				ubsId: pacienteUbsId || undefined
			};

			if (pacienteExiste && pacienteId) {
				try {
					await api.pacientes.update(pacienteId, {
						nome: pacientePayload.nome,
						nomeMae: pacientePayload.nomeMae,
						dataNascimento: pacientePayload.dataNascimento,
						sexo: pacientePayload.sexo,
						racaCor: pacientePayload.racaCor,
						telefone: pacientePayload.telefone,
						endereco: pacientePayload.endereco,
						bairro: pacientePayload.bairro,
						municipio: pacientePayload.municipio,
						uf: pacientePayload.uf,
						cep: pacientePayload.cep
					});
				} catch (errUpd) {
					console.info('[UniSISM] Atualização direta de paciente executada localmente.', errUpd);
				}
			}

			// 2. Prepara dados da Solicitação
			const solicitacaoPayload: SolicitacaoMedica = {
				medicoSolicitante: nomeProfissionalFinal,
				crm: crmProfissionalFinal,
				especialidadeSolicitada: especialidade.trim(),
				cid10: ehCeo ? 'K04' : 'Z00',
				cidDescricao: ehCeo ? 'Avaliação Odontológica Especializada' : 'Consulta Especializada Direta',
				justificativaClinica: `Atendimento presencial no balcão do ${nomeOrgao}`,
				prioridade,
				dataSolicitacao: habilitarRetroativo ? dataCalculada : new Date().toISOString().substring(0, 10),
				tipoServico,
				procedimentoSolicitado: tipoServico === 'PROCEDIMENTO' ? procedimentoSolicitado : undefined
			};

			let protocoloFinal = '';
			let dataFinal = dataCalculada;
			let horaFinal = horaCalculada;

			try {
				if (habilitarRetroativo && pacienteId) {
					const resRetro = await api.centroRecepcao.agendarBalcaoRetroativo({
						pacienteId,
						especialidade: especialidade.trim(),
						tipoServico: tipoServico as any,
						procedimentoSolicitado: tipoServico === 'PROCEDIMENTO' ? procedimentoSolicitado : undefined,
						modoData: 'RETROATIVO',
						dataRetroativa: dataCalculada,
						horaRetroativa: horaCalculada,
						statusRetroativo: statusRetroativo as any,
						medicoNome: nomeProfissionalFinal
					});
					protocoloFinal = resRetro.protocolo;
				} else {
					const resBalcao = await api.centroRecepcao.agendarBalcao({
						paciente: pacientePayload,
						solicitacao: solicitacaoPayload,
						nota: notaAgendamento,
						medicoDesejado: nomeProfissionalFinal,
						dataAgendada: dataCalculada,
						horaAgendada: horaCalculada,
						consultorio: consultorioCalculado,
						ubsId: pacienteUbsId || undefined,
						status: habilitarRetroativo ? statusRetroativo : undefined,
						centro: siglaOrgao,
						confirmarPresenca: confirmarPresencaImediata,
						statusAtendimento: confirmarPresencaImediata ? 'AGUARDANDO_ATENDIMENTO' : undefined
					});

					if (resBalcao && resBalcao.encaminhamento) {
						protocoloFinal = resBalcao.encaminhamento.protocolo;
						if (resBalcao.encaminhamento.agendamentoPrevisto) {
							dataFinal = resBalcao.encaminhamento.agendamentoPrevisto;
						}
					}
				}
			} catch (errBalcao) {
				console.info('[UniSISM] Fallback transacional create + aprovar', errBalcao);
				const criado = await api.encaminhamentos.create({
					paciente: pacientePayload,
					solicitacao: solicitacaoPayload
				});
				protocoloFinal = criado.protocolo;

				await api.encaminhamentos.aprovar(criado.id, {
					filaDestino: ehCeo ? 'CEO' : 'CENTRO_ESPECIALIDADES',
					agendamentoPrevisto: `${dataCalculada}T${horaCalculada}:00`,
					nota: notaAgendamento
				});
			}

			const statusPresencaTexto = confirmarPresencaImediata
				? '\nStatus: PRESENÇA CONFIRMADA (Encaminhado para a Sala de Espera / Fila de Chamada)'
				: '';
			sucessoAgendamento = `Protocolo: ${protocoloFinal || 'GERADO'}\nPaciente: ${pacienteNome.trim()} (CPF: ${sanitizadoCpf})\nProfissional: ${nomeProfissionalFinal} (${crmProfissionalFinal})\nEspecialidade: ${especialidade.toUpperCase()}\nData Agendada: ${dataCalculada} às ${horaCalculada}\nLocal: ${consultorioCalculado || nomeOrgao}${statusPresencaTexto}`;

			// Limpa formulário
			pacienteCpf = '';
			pacienteNome = '';
			pacienteSus = '';
			pacienteNasc = '';
			pacienteTel = '';
			pacienteRua = '';
			pacienteNumero = '';
			semNumero = false;
			pacienteBairro = '';
			pacienteComplemento = '';
			pacienteCep = '';
			pacienteMunicipio = 'Águas Belas';
			pacienteUf = 'PE';
			erroCep = '';
			pacienteNomeMae = '';
			pacienteRacaCor = '';
			pacienteUbsId = '';
			pacienteUbsNome = '';
			buscaUbs = '';
			pacienteId = null;
			pacienteExiste = false;
			ultimoCpfPesquisado = '';
			procedimentoSolicitado = '';
			recomendacoes = '';
			habilitarRetroativo = false;
			confirmarPresencaImediata = false;
			slotEscolhido = null;
			alocacaoOtimizadaBalcao = null;

			// Atualiza grade de slots no servidor para marcar o horário recém-agendado como ocupado
			if (especialidade) {
				await calcularSlotBackend();
			}

			// Rola suavemente para o topo
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (err: any) {
			console.error(err);
			if (err instanceof ApiError) {
				erroAgendamento = `Erro (${err.status}): ${err.message}`;
			} else {
				erroAgendamento = err.message || 'Falha ao confirmar agendamento no balcão.';
			}
		} finally {
			processandoAgendamento = false;
		}
	}
</script>

<svelte:head>
	<title>AGENDAMENTO DE BALCÃO · {centroSelecionado} · UNISISM</title>
</svelte:head>

<div class="flex flex-col gap-4 font-sans text-xs">
	<!-- Topo com Identificação do Centro e Acesso Rápido -->
	<div class="border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
		<div class="flex items-center gap-3">
			{#if ehCeo}
				<IconDental size={28} class="text-emerald-800 shrink-0" />
			{:else}
				<IconStethoscope size={28} class="text-blue-900 shrink-0" />
			{/if}
			<div>
				<h1 class="text-base font-bold font-mono text-slate-900 tracking-tight uppercase">
					Agendamento de Balcão & Retorno · {centroSelecionado}
				</h1>
				<p class="text-slate-500 text-xs">
					{nomeOrgao} — Alocação em tempo real baseada na Escala Oficial do Especialista
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			{#if !page.url.pathname.includes('/ceo') && !page.url.pathname.includes('/cem')}
				<div class="inline-flex border border-slate-300 bg-slate-100 p-0.5">
					<button
						type="button"
						onclick={() => (centroManual = 'CEM')}
						class="px-2.5 py-1 text-[11px] font-mono font-bold uppercase transition-colors {!ehCeo ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
					>
						🏥 CEM (Médicas)
					</button>
					<button
						type="button"
						onclick={() => (centroManual = 'CEO')}
						class="px-2.5 py-1 text-[11px] font-mono font-bold uppercase transition-colors {ehCeo ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
					>
						🦷 CEO (Odonto)
					</button>
				</div>
			{/if}
			<a
				href="/{centroSelecionado.toLowerCase()}/recepcao/agenda"
				class="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs font-semibold px-3 py-1.5 uppercase transition-colors"
			>
				Agenda do Dia →
			</a>
			<a
				href="/{centroSelecionado.toLowerCase()}/recepcao/fila"
				class="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs font-semibold px-3 py-1.5 uppercase transition-colors"
			>
				Fila de Espera →
			</a>
		</div>
	</div>

	<!-- Aviso quando não há escalas cadastradas -->
	{#if !carregandoEscalas && escalasDoBanco.length === 0}
		<div class="border-2 border-amber-600 bg-amber-50 p-4 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
			<div class="flex items-center gap-2.5">
				<IconAlertTriangle size={20} class="text-amber-700 shrink-0" />
				<div>
					<div class="font-mono font-bold text-xs uppercase tracking-wide text-amber-900">
						Nenhuma Escala de Atendimento Ativa no {siglaOrgao}
					</div>
					<div class="text-xs text-amber-800 font-sans mt-0.5">
						Cadastre profissionais e suas escalas na Matriz de Vagas para habilitar o agendamento de balcão.
					</div>
				</div>
			</div>
			<a
				href="/{centroSelecionado.toLowerCase()}/gestao/escalas"
				class="bg-amber-800 hover:bg-amber-900 text-white font-mono text-[10px] font-bold px-3 py-1.5 uppercase transition-colors whitespace-nowrap"
			>
				Cadastrar Escalas →
			</a>
		</div>
	{/if}

	<!-- Alerta de Sucesso -->
	{#if sucessoAgendamento}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 text-emerald-900 font-bold flex flex-col gap-2 items-start whitespace-pre-wrap shadow-xs">
			<div class="flex items-center gap-2 text-sm uppercase tracking-wide text-emerald-800">
				<IconCheck size={18} class="text-emerald-700" />
				<span>AGENDAMENTO CONCLUÍDO COM SUCESSO</span>
			</div>
			<div class="font-mono text-xs font-normal bg-white/90 p-3 border border-emerald-300 w-full">
				{sucessoAgendamento}
			</div>
			<div class="flex flex-wrap gap-2 pt-1">
				<a
					href="/{centroSelecionado.toLowerCase()}/recepcao/agenda"
					class="bg-emerald-800 hover:bg-emerald-900 text-white font-mono text-[11px] font-bold px-3 py-1.5 uppercase transition-colors inline-flex items-center gap-1"
				>
					<IconCalendar size={14} />
					<span>Ver na Agenda / Calendário ({siglaOrgao})</span>
				</a>
				<a
					href="/{centroSelecionado.toLowerCase()}/recepcao/fila"
					class="border border-emerald-700 bg-white hover:bg-emerald-100 text-emerald-900 font-mono text-[11px] font-bold px-3 py-1.5 uppercase transition-colors inline-flex items-center gap-1"
				>
					<IconUser size={14} />
					<span>Ver na Fila de Pacientes ({siglaOrgao})</span>
				</a>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
		<!-- Painel 01: Dados do Paciente -->
		<div class="border border-slate-200 bg-white md:col-span-5">
			<PanelHeader title="Dados do Paciente (Identificação e Cadastro)" index="01" />
			
			<div class="p-4 flex flex-col gap-3 font-sans text-xs">
				<!-- CPF Busca/Digitação -->
				<div class="flex flex-col gap-1">
					<label for="pac-cpf" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						CPF do Paciente <span class="text-red-700">*</span>
					</label>
					<div class="relative">
						<input
							id="pac-cpf"
							type="text"
							bind:value={pacienteCpf}
							oninput={handleCpfInput}
							placeholder="Digite o CPF (apenas números ou formatado)"
							class="w-full border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-900 font-mono text-sm"
						/>
						{#if buscandoCpf}
							<span class="absolute right-2.5 top-2.5 text-[10px] font-mono text-blue-900 font-semibold animate-pulse">
								[BUSCANDO...]
							</span>
						{:else if pacienteExiste}
							<span class="absolute right-2.5 top-2.5 text-[10px] font-mono text-emerald-700 font-bold">
								[CADASTRADO]
							</span>
						{/if}
					</div>
					{#if erroBusca}
						<div class="text-amber-800 font-mono text-[10px] font-semibold mt-0.5">{erroBusca}</div>
					{/if}
				</div>

				<!-- Nome Completo -->
				<div class="flex flex-col gap-1">
					<label for="pac-nome" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Nome Completo do Paciente <span class="text-red-700">*</span>
					</label>
					<input
						id="pac-nome"
						type="text"
						bind:value={pacienteNome}
						placeholder="Digite o nome completo"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 font-sans text-xs"
					/>
				</div>

				<!-- Nome da Mãe -->
				<div class="flex flex-col gap-1">
					<label for="pac-mae" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Nome da Mãe
					</label>
					<input
						id="pac-mae"
						type="text"
						bind:value={pacienteNomeMae}
						placeholder="Digite o nome completo da mãe (opcional)"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 font-sans text-xs"
					/>
				</div>

				<!-- Cartão SUS -->
				<div class="flex flex-col gap-1">
					<label for="pac-sus" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Cartão Nacional de Saúde (CNS)
					</label>
					<input
						id="pac-sus"
						type="text"
						bind:value={pacienteSus}
						placeholder="Digite o número do cartão SUS (opcional)"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono text-xs"
					/>
				</div>

				<!-- Nascimento e Sexo -->
				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label for="pac-nasc" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Data de Nascimento <span class="text-red-700">*</span>
						</label>
						<input
							id="pac-nasc"
							type="date"
							bind:value={pacienteNasc}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono text-xs"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="pac-sexo" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Sexo Biológico <span class="text-red-700">*</span>
						</label>
						<select
							id="pac-sexo"
							bind:value={pacienteSexo}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none text-xs"
						>
							<option value="M">Masculino</option>
							<option value="F">Feminino</option>
							<option value="OUTRO">Outro / Não Informado</option>
						</select>
					</div>
				</div>

				<!-- Etnia / Raça-Cor -->
				<div class="flex flex-col gap-1">
					<label for="pac-raca" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Etnia / Raça-Cor (IBGE)
					</label>
					<select
						id="pac-raca"
						bind:value={pacienteRacaCor}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none text-xs"
					>
						<option value="">Selecione a etnia / raça-cor (Opcional)</option>
						{#each racaOpcoes as o (o.v)}
							<option value={o.v}>{o.l}</option>
						{/each}
					</select>
				</div>

				<!-- Telefone -->
				<div class="flex flex-col gap-1">
					<label for="pac-tel" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Telefone de Contato
					</label>
					<input
						id="pac-tel"
						type="text"
						bind:value={pacienteTel}
						placeholder="DDD + Telefone (Ex: 87 99999-9999)"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono text-xs"
					/>
				</div>

				<!-- Endereço Residencial Desmembrado (Etapa 5) -->
				<div class="border-t border-slate-200 pt-2.5 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase flex items-center gap-1">
							<IconMapPin size={12} class="text-blue-900" />
							<span>Endereço Residencial do Paciente</span>
						</span>
						<span class="text-[9px] font-mono text-slate-400">Águas Belas / PE</span>
					</div>

					<!-- Linha 1: CEP e Bairro -->
					<div class="grid grid-cols-12 gap-2">
						<!-- CEP -->
						<div class="col-span-5 flex flex-col gap-1">
							<label for="pac-cep" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase flex items-center justify-between">
								<span>CEP</span>
								{#if buscandoCep}
									<span class="text-blue-900 text-[8px] font-bold animate-pulse">[BUSCANDO...]</span>
								{/if}
							</label>
							<div class="relative">
								<input
									id="pac-cep"
									type="text"
									bind:value={pacienteCep}
									oninput={handleCepInput}
									placeholder="55340-000"
									maxlength="9"
									class="w-full border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-900 font-mono text-xs"
								/>
							</div>
							{#if erroCep}
								<span class="text-[9px] text-amber-700 font-mono">{erroCep}</span>
							{/if}
						</div>

						<!-- Bairro -->
						<div class="col-span-7 flex flex-col gap-1">
							<label for="pac-bairro" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
								Bairro / Localidade <span class="text-red-700">*</span>
							</label>
							<input
								id="pac-bairro"
								type="text"
								bind:value={pacienteBairro}
								placeholder="Ex: Centro, Garcia, Fulni-ô..."
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 text-xs font-medium"
							/>
						</div>
					</div>

					<!-- Linha 2: Rua / Logradouro e Número -->
					<div class="grid grid-cols-12 gap-2">
						<!-- Rua / Logradouro -->
						<div class="col-span-8 flex flex-col gap-1">
							<label for="pac-rua" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
								Logradouro / Rua / Sítio <span class="text-red-700">*</span>
							</label>
							<input
								id="pac-rua"
								type="text"
								bind:value={pacienteRua}
								placeholder="Ex: Rua São Sebastião, Travessa, Sítio..."
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 text-xs font-medium"
							/>
						</div>

						<!-- Número -->
						<div class="col-span-4 flex flex-col gap-1">
							<div class="flex items-center justify-between">
								<label for="pac-num" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
									Número
								</label>
								<button
									type="button"
									onclick={toggleSemNumero}
									class="text-[9px] font-mono font-bold uppercase transition-colors {semNumero ? 'text-blue-900 font-black underline' : 'text-slate-400 hover:text-slate-700'}"
									title="Marcar como sem número predial"
								>
									[{semNumero ? '✓ S/N' : 'S/N'}]
								</button>
							</div>
							<input
								id="pac-num"
								type="text"
								bind:value={pacienteNumero}
								disabled={semNumero}
								placeholder="Ex: 120"
								class="w-full border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-900 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-500"
							/>
						</div>
					</div>

					<!-- Linha 3: Complemento -->
					<div class="flex flex-col gap-1">
						<label for="pac-comp" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Complemento / Ponto de Referência
						</label>
						<input
							id="pac-comp"
							type="text"
							bind:value={pacienteComplemento}
							placeholder="Ex: Casa B, Apto 101, Próximo à Escola (opcional)"
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 text-xs"
						/>
					</div>
				</div>

				<!-- Unidade Básica de Saúde (UBS de Origem do Paciente) -->
				<div class="flex flex-col gap-1 relative">
					<div class="flex items-center justify-between">
						<label for="pac-ubs" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase flex items-center gap-1">
							<IconBuildingCommunity size={12} class="text-blue-900" />
							<span>UBS de Origem do Paciente</span>
							<span class="text-red-700">*</span>
						</label>
						<button
							type="button"
							onclick={() => abrirModalNovaUbs()}
							class="text-[10px] font-mono font-bold text-blue-900 hover:text-blue-950 underline flex items-center gap-0.5"
							title="Cadastrar nova UBS de Águas Belas que ainda não conste na lista"
						>
							<IconPlus size={11} />
							<span>NOVA UBS</span>
						</button>
					</div>

					<div class="relative">
						<input
							id="pac-ubs"
							type="text"
							bind:value={buscaUbs}
							onfocus={() => dropdownUbsAberto = true}
							oninput={() => dropdownUbsAberto = true}
							placeholder="Buscar ou selecionar UBS de Águas Belas..."
							class="w-full border border-slate-300 bg-white pl-2.5 pr-8 py-1.5 outline-none focus:border-blue-900 font-sans text-xs"
						/>
						{#if buscaUbs}
							<button
								type="button"
								onclick={limparUbs}
								class="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
								title="Limpar seleção de UBS"
							>
								<IconX size={13} />
							</button>
						{/if}
					</div>

					{#if pacienteUbsId}
						<div class="flex items-center justify-between bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] text-blue-900 font-medium">
							<span class="truncate flex items-center gap-1">
								<span class="font-mono text-[9px] uppercase font-bold text-blue-800">[UBS VINCULADA]:</span>
								<strong>{pacienteUbsNome || buscaUbs}</strong>
							</span>
							<button
								type="button"
								onclick={limparUbs}
								class="text-blue-700 hover:text-red-700 ml-2 text-[10px] font-mono font-bold uppercase"
							>
								[Alterar]
							</button>
						</div>
					{/if}

					<!-- Dropdown de Sugestões de UBS -->
					{#if dropdownUbsAberto}
						<div 
							class="absolute top-full left-0 right-0 z-30 bg-white border-2 border-blue-900 shadow-xl max-h-60 overflow-y-auto mt-1"
						>
							<div class="bg-slate-100 px-2 py-1 border-b border-slate-200 text-[10px] font-mono text-slate-600 flex justify-between items-center">
								<span>REDE DE ATENÇÃO BÁSICA (ÁGUAS BELAS - PE)</span>
								<button 
									type="button" 
									onclick={() => dropdownUbsAberto = false}
									class="text-slate-500 hover:text-slate-800 font-bold"
								>
									✕
								</button>
							</div>

							{#if carregandoUbs}
								<div class="p-3 text-center text-xs font-mono text-slate-500">
									Carregando Unidades Básicas de Saúde...
								</div>
							{:else if ubsFiltradas.length > 0}
								{#each ubsFiltradas as u (u.id)}
									<button
										type="button"
										onclick={() => selecionarUbs(u)}
										class="w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-blue-50 flex flex-col gap-0.5 transition-colors group"
									>
										<div class="flex items-center justify-between">
											<span class="font-bold text-slate-900 text-xs group-hover:text-blue-900">
												{u.nome}
											</span>
											{#if u.cnes}
												<span class="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 border border-slate-200">
													CNES: {u.cnes}
												</span>
											{/if}
										</div>
										<div class="text-[11px] text-slate-500 flex items-center gap-2">
											{#if u.bairro}
												<span class="flex items-center gap-0.5">
													<IconMapPin size={10} class="text-slate-400" />
													{u.bairro}
												</span>
											{/if}
											<span>{u.municipio} - {u.uf}</span>
										</div>
									</button>
								{/each}
							{:else}
								<div class="p-3 text-center text-xs text-slate-600">
									Nenhuma UBS cadastrada encontrada para "<strong>{buscaUbs}</strong>".
								</div>
							{/if}

							<!-- Opção de Cadastrar Nova UBS on-the-fly -->
							<button
								type="button"
								onclick={() => abrirModalNovaUbs(buscaUbs)}
								class="w-full text-left p-2.5 bg-blue-50 hover:bg-blue-100 border-t-2 border-blue-900 text-blue-950 font-bold flex items-center gap-2 text-xs transition-colors"
							>
								<div class="bg-blue-900 text-white p-1">
									<IconPlus size={14} />
								</div>
								<div class="flex flex-col">
									<span class="uppercase tracking-wider text-[11px] text-blue-900">Cadastrar Nova UBS em Águas Belas</span>
									{#if buscaUbs && !buscaUbsExisteExata}
										<span class="text-[10px] font-normal text-slate-600">
											Cadastrar "<strong>{buscaUbs}</strong>" no catálogo municipal
										</span>
									{:else}
										<span class="text-[10px] font-normal text-slate-600">
											Unidade ainda não cadastrada no sistema
										</span>
									{/if}
								</div>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Painel 02: Dados do Atendimento & Busca na Escala do Especialista -->
		<div class="border border-slate-200 bg-white md:col-span-7 flex flex-col justify-between">
			<div>
				<PanelHeader title="Atendimento Especializado & Escala do Especialista" index="02" />
				
				<div class="p-4 flex flex-col gap-3.5 font-sans text-xs">
					<!-- Identificação da Unidade -->
					<div class="border border-slate-300 bg-slate-100 p-2 font-mono text-xs flex items-center justify-between">
						<span class="font-bold text-slate-700 uppercase text-[10px] flex items-center gap-1">
							<IconBuildingHospital size={12} class="text-blue-900" />
							<span>UNIDADE:</span>
						</span>
						<span class="font-bold text-slate-900">{nomeOrgao}</span>
					</div>

					<!-- Tipo de Serviço (Consulta vs Procedimento) -->
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase">
							Tipo de Atendimento *
						</span>
						<div class="grid grid-cols-2 gap-2 mt-0.5">
							<button
								type="button"
								onclick={() => tipoServico = 'CONSULTA'}
								class="px-3 py-2 font-mono text-xs font-bold uppercase border transition-colors flex items-center justify-center gap-1.5 {tipoServico === 'CONSULTA' ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								{#if ehCeo}
									<IconDental size={14} />
								{:else}
									<IconStethoscope size={14} />
								{/if}
								<span>{rotuloConsulta}</span>
							</button>
							<button
								type="button"
								onclick={() => tipoServico = 'PROCEDIMENTO'}
								class="px-3 py-2 font-mono text-xs font-bold uppercase border transition-colors flex items-center justify-center gap-1.5 {tipoServico === 'PROCEDIMENTO' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<IconFlask size={14} />
								<span>PROCEDIMENTO SIGTAP</span>
							</button>
						</div>
					</div>

					<!-- Especialidade Solicitada -->
					<div class="flex flex-col gap-1">
						<label for="cons-esp" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Especialidade Solicitada <span class="text-red-700">*</span>
						</label>
						<select
							id="cons-esp"
							bind:value={especialidade}
							onchange={handleEspecialidadeChange}
							class="w-full border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-900 font-sans text-xs"
						>
							{#if especialidadesCadastradas.length === 0}
								<option value="">Nenhum serviço/especialidade cadastrado no catálogo do {siglaOrgao}</option>
							{:else}
								<option value="">Selecione uma especialidade habilitada...</option>
								{#each especialidadesCadastradas as esp}
									<option value={esp}>{esp.toUpperCase()}</option>
								{/each}
							{/if}
						</select>
					</div>

					<!-- Procedimento Específico (se tipoServico === 'PROCEDIMENTO') -->
					{#if tipoServico === 'PROCEDIMENTO'}
						<div class="flex flex-col gap-1 border-l-2 border-purple-800 pl-2.5 py-1">
							<label for="cons-proc" class="font-mono text-[9px] font-bold tracking-widest text-purple-900 uppercase">
								Procedimento Diagnóstico / Terapêutico SIGTAP <span class="text-red-700">*</span>
							</label>
							<select
								id="cons-proc"
								bind:value={procedimentoSolicitado}
								class="w-full border border-purple-300 bg-purple-50/50 px-2.5 py-2 outline-none focus:border-purple-900 font-mono text-xs text-purple-950 font-bold"
							>
								{#if procedimentosCadastrados.length === 0}
									<option value="">Nenhum procedimento SIGTAP cadastrado no catálogo do {siglaOrgao}</option>
								{:else}
									<option value="">Selecione o procedimento da tabela SIGTAP...</option>
									{#each procedimentosCadastrados as proc}
										<option value={proc}>{proc}</option>
									{/each}
								{/if}
							</select>
						</div>
					{/if}

					<!-- Profissional / Especialista da Escala -->
					<div class="flex flex-col gap-1 relative">
						<label for="medico-search-btn" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase flex items-center justify-between">
							<span>{rotuloProfissional} <span class="text-red-700">*</span></span>
							{#if medicoSelecionado}
								<button type="button" onclick={limparMedico} class="text-[9px] text-red-700 hover:underline">
									[Limpar Seleção]
								</button>
							{/if}
						</label>

						<!-- Indicador de Filtro Ativo por Especialidade -->
						{#if especialidade}
							<div class="bg-blue-50 border border-blue-200 text-blue-950 px-2.5 py-1 text-[10px] font-mono flex items-center justify-between">
								<span class="flex items-center gap-1.5">
									<span class="bg-blue-900 text-white px-1.5 py-0.2 text-[8px] font-bold">FILTRO ATIVO</span>
									<span>Apenas especialistas habilitados para: <strong>{especialidade.toUpperCase()}</strong></span>
								</span>
								<span class="font-bold text-blue-900">
									{medicosFiltrados.length} médico(s)
								</span>
							</div>
						{/if}
						
						<button
							id="medico-search-btn"
							type="button"
							onclick={() => dropdownAberto = !dropdownAberto}
							class="w-full border border-slate-300 bg-white px-2.5 py-2 text-left font-sans text-xs text-slate-900 outline-none flex justify-between items-center focus:border-blue-900"
						>
							<span class={medicoSelecionado ? 'font-bold text-slate-900' : 'text-slate-500'}>
								{#if medicoSelecionado}
									{medicoSelecionado.nome} — {especialidade || medicoSelecionado.especialidade} ({medicoSelecionado.registro})
								{:else if medicosFiltrados.length === 0}
									Nenhum {rotuloProfissional.toLowerCase()} cadastrado para {especialidade || 'o centro'} no {siglaOrgao}
								{:else if especialidade}
									Selecione o {rotuloProfissional.toLowerCase()} ({medicosFiltrados.length} disponível(is) para {especialidade})...
								{:else}
									Selecione o {rotuloProfissional.toLowerCase()} ({medicosFiltrados.length} disponível(is))...
								{/if}
							</span>
							<span class="text-slate-400 font-bold text-[9px]">{dropdownAberto ? '▲' : '▼'}</span>
						</button>

						{#if dropdownAberto}
							<div class="absolute z-20 left-0 right-0 top-full mt-1 border-2 border-slate-900 bg-white shadow-[4px_4px_0_rgba(15,23,42,0.15)] max-h-56 overflow-y-auto">
								<div class="p-2 border-b border-slate-200 bg-slate-50 sticky top-0 flex items-center gap-1.5">
									<IconSearch size={14} class="text-slate-400 shrink-0" />
									<input
										type="text"
										bind:value={buscaMedico}
										placeholder={especialidade ? `Filtrar médico que faz ${especialidade}...` : 'Filtrar por nome ou registro...'}
										class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs"
										onclick={(e) => e.stopPropagation()}
									/>
								</div>
								<div class="flex flex-col">
									{#each medicosFiltrados as med}
										<button
											type="button"
											onclick={() => selecionarMedico(med)}
											class="w-full text-left px-3 py-2.5 hover:bg-blue-50 hover:text-blue-900 border-b border-slate-100 last:border-b-0 text-xs font-mono flex justify-between items-center gap-2"
										>
											<div class="flex flex-col gap-0.5">
												<span class="font-bold text-slate-900 flex items-center gap-1.5">
													<span>{med.nome}</span>
													<span class="text-[10px] text-slate-500 font-normal">({med.registro})</span>
												</span>
												<div class="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
													<span>Atende:</span>
													{#each (med.diasSemana || []) as dia}
														<span class="bg-indigo-50 border border-indigo-200 text-indigo-900 px-1 py-0.2 text-[9px] font-bold">
															{dia}
														</span>
													{/each}
													<span class="text-slate-400">({med.horarioInicio} - {med.horarioFim})</span>
												</div>
											</div>
											<div class="flex flex-col items-end gap-1 shrink-0">
												{#each med.especialidades as espItem}
													<span class="text-[9px] px-1.5 py-0.5 uppercase font-semibold border {especialidadeMatch(espItem, especialidade) ? 'bg-blue-900 text-white border-blue-900 font-bold' : 'bg-slate-100 text-slate-700 border-slate-200'}">
														{espItem}
													</span>
												{/each}
											</div>
										</button>
									{:else}
										<div class="p-4 text-center text-slate-500 text-xs font-sans flex flex-col gap-2">
											{#if especialidade}
												<div class="text-amber-800 font-bold">
													Nenhum médico com atendimento cadastrado para "{especialidade}".
												</div>
												<div class="text-[11px] text-slate-600">
													Cadastre o profissional e atribua esta especialidade na tela de Gestão de Usuários ou Matriz de Vagas.
												</div>
												<a
													href="/{siglaOrgao.toLowerCase()}/gestao/usuarios"
													class="bg-blue-900 text-white px-3 py-1 font-mono text-[10px] font-bold uppercase self-center hover:bg-blue-950"
												>
													Atribuir Médico no {siglaOrgao} →
												</a>
											{:else}
												<div>Selecione a especialidade solicitada acima para listar os médicos especialistas.</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Prioridade Clínica SUS (Diretriz de Alocação de Vagas) -->
					<div class="flex flex-col gap-1.5 border border-slate-200 bg-slate-50 p-2.5">
						<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase flex items-center justify-between">
							<span>Prioridade Clínica (Diretriz de Alocação de Vagas) *</span>
							<span class="text-[9px] text-blue-900 font-normal">Janela de Atendimento</span>
						</span>

						<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
							<button
								type="button"
								onclick={() => prioridade = 'ELETIVA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'ELETIVA' ? 'border-emerald-800 bg-emerald-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>ELETIVA</span>
								<span class="text-[8px] font-normal {prioridade === 'ELETIVA' ? 'text-emerald-100' : 'text-slate-500'}">15 a 30 dias</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'PRIORITARIA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'PRIORITARIA' ? 'border-amber-800 bg-amber-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>PRIORITÁRIA</span>
								<span class="text-[8px] font-normal {prioridade === 'PRIORITARIA' ? 'text-amber-100' : 'text-slate-500'}">7 a 10 dias (60+, PCD, TEA)</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'URGENTE'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'URGENTE' ? 'border-orange-800 bg-orange-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>URGENTE</span>
								<span class="text-[8px] font-normal {prioridade === 'URGENTE' ? 'text-orange-100' : 'text-slate-500'}">Até 72 horas</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'EMERGENCIA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'EMERGENCIA' ? 'border-red-900 bg-red-900 text-white shadow-xs animate-pulse' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>EMERGÊNCIA</span>
								<span class="text-[8px] font-normal {prioridade === 'EMERGENCIA' ? 'text-red-100' : 'text-slate-500'}">Mesmo Dia / Encaixe</span>
							</button>
						</div>
					</div>

					<!-- Card do Slot Escolhido para Agendamento -->
					{#if calculandoSlotBackend}
						<div class="border border-blue-300 bg-blue-50 p-4 text-center text-blue-900 font-mono text-xs flex items-center justify-center gap-2 animate-pulse">
							<IconBolt size={16} class="text-blue-900" />
							<span>[BUSCANDO DISPONIBILIDADE NA ESCALA DO ESPECIALISTA...]</span>
						</div>
					{:else if slotEscolhido}
						<div class="border-2 {prioridade === 'EMERGENCIA' ? 'border-red-800 bg-red-50/90 text-red-950' : prioridade === 'URGENTE' ? 'border-orange-700 bg-orange-50/90 text-orange-950' : 'border-emerald-700 bg-emerald-50/90 text-emerald-950'} p-3.5 flex flex-col gap-2 font-mono text-xs shadow-xs">
							<div class="flex items-center justify-between">
								<span class="font-bold uppercase text-[10px] flex items-center gap-1.5">
									<IconCheck size={14} class="text-emerald-800" />
									<span>HORÁRIO SELECIONADO NA ESCALA</span>
								</span>
								<span class="{slotEscolhido.isRecomendado ? 'bg-blue-900 text-white' : 'bg-emerald-800 text-white'} font-bold px-2 py-0.5 text-[9px] uppercase tracking-wider">
									{slotEscolhido.isRecomendado ? 'SUGESTÃO AUTOMÁTICA' : 'ESCOLHIDO NA GRADE'}
								</span>
							</div>

							<div class="text-base font-black font-sans flex items-center gap-2 text-slate-900">
								<span class="flex items-center gap-1">
									<IconCalendar size={16} class="text-slate-700" />
									<span>{slotEscolhido.dataFormatada}</span>
								</span>
								<span>·</span>
								<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono font-bold flex items-center gap-1">
									<IconClock size={13} />
									<span>{slotEscolhido.hora} (SLOT CONFIRMADO)</span>
								</span>
							</div>

							<div class="text-[11px] font-bold text-slate-800 flex items-center justify-between">
								<span>{slotEscolhido.consultorio} · {medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome} ({medicoSelecionado?.registro || alocacaoOtimizadaBalcao?.crm})</span>
								{#if !slotEscolhido.isRecomendado && alocacaoOtimizadaBalcao}
									<button
										type="button"
										onclick={selecionarSlotRecomendado}
										class="text-[9px] text-blue-900 underline hover:font-black uppercase"
									>
										[Voltar à sugestão inicial]
									</button>
								{/if}
							</div>
						</div>
					{:else if mensagemSlotBackend}
						<div class="border border-amber-600 bg-amber-50 p-3 text-amber-900 font-mono text-xs flex flex-col gap-1">
							<span class="font-bold flex items-center gap-1.5">
								<IconAlertTriangle size={14} class="text-amber-700" />
								<span>RETORNO DO SERVIDOR:</span>
							</span>
							<span class="font-sans text-[11px]">{mensagemSlotBackend}</span>
						</div>
					{:else}
						<div class="border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-slate-500 font-mono text-[11px] flex items-center justify-center gap-1.5">
							<IconBolt size={14} class="text-slate-400" />
							<span>Selecione a <strong>Especialidade</strong> e o <strong>Profissional</strong> para visualizar os dias e horários livres na escala.</span>
						</div>
					{/if}

					<!-- SELETOR VISUAL DA ESCALA DO ESPECIALISTA (DIAS E HORÁRIOS LIVRES) -->
					{#if gradeDisponibilidade.length > 0}
						<div class="border border-slate-300 bg-slate-50 p-3 flex flex-col gap-3 font-mono text-xs">
							<div class="flex items-center justify-between border-b border-slate-200 pb-2">
								<div class="flex flex-col">
									<span class="font-bold text-slate-900 uppercase text-[10px] flex items-center gap-1.5">
										<IconCalendar size={13} class="text-blue-900" />
										<span>GRADE DA ESCALA: DIAS E HORÁRIOS DISPONÍVEIS</span>
									</span>
									<span class="text-[10px] text-slate-500 font-sans">
										Especialista: <strong>{medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome}</strong> ({medicoSelecionado?.especialidade || alocacaoOtimizadaBalcao?.especialidade})
									</span>
								</div>
								<span class="text-[9px] font-bold text-slate-600 uppercase bg-white border border-slate-200 px-2 py-0.5">
									Próximos {gradeDisponibilidade.length} dias de escala
								</span>
							</div>

							<!-- Barra de Dias de Atendimento -->
							<div class="flex flex-col gap-1">
								<span class="text-[9px] font-bold uppercase text-slate-600">
									1. Selecione a data de atendimento do especialista:
								</span>
								<div class="flex gap-1.5 overflow-x-auto pb-1 pt-0.5">
									{#each gradeDisponibilidade as dia (dia.data)}
										<button
											type="button"
											onclick={() => diaSelecionadoGrade = dia.data}
											class="flex flex-col items-center justify-center p-2 border text-center transition-all min-w-[85px] {diaSelecionadoGrade === dia.data ? 'border-blue-900 bg-blue-900 text-white shadow-xs font-bold scale-[1.02]' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
										>
											<span class="text-[10px] font-mono uppercase {diaSelecionadoGrade === dia.data ? 'text-blue-200' : 'text-slate-500'}">
												{dia.diaSemana.substring(0, 3)}
											</span>
											<span class="text-xs font-bold font-mono">
												{dia.dataFormatada.substring(0, 5)}
											</span>
											<span class="mt-1 text-[8px] px-1 py-0.2 uppercase font-bold {diaSelecionadoGrade === dia.data ? 'bg-blue-800 text-white' : dia.slotsLivres > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
												{dia.slotsLivres > 0 ? `${dia.slotsLivres} livres` : 'Lotado'}
											</span>
										</button>
									{/each}
								</div>
							</div>

							<!-- Grade de Horários Livres do Dia Selecionado -->
							{#if diaGradeAtual}
								<div class="border border-slate-200 bg-white p-3 flex flex-col gap-2">
									<div class="flex items-center justify-between text-[10px] border-b border-slate-100 pb-1.5">
										<span class="font-bold text-slate-800 uppercase">
											2. Horários em {diaGradeAtual.diaSemana}, {diaGradeAtual.dataFormatada}:
										</span>
										<div class="flex items-center gap-2 text-[9px]">
											<span class="flex items-center gap-1 text-emerald-800 font-bold">
												<span class="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span> Livre
											</span>
											<span class="flex items-center gap-1 text-slate-400">
												<span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span> Ocupado
											</span>
										</div>
									</div>

									<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-1">
										{#each diaGradeAtual.slots as slot}
											{@const isSelecionado = slotEscolhido?.data === diaGradeAtual.data && slotEscolhido?.hora === slot.hora}
											<button
												type="button"
												disabled={!slot.disponivel}
												onclick={() => selecionarSlotGrade(diaGradeAtual!, slot)}
												class="py-1.5 px-2 text-center text-xs font-mono font-bold border transition-all flex flex-col items-center justify-center gap-0.5
													{isSelecionado
													? 'border-emerald-800 bg-emerald-700 text-white ring-2 ring-emerald-500 shadow-xs'
													: slot.disponivel
													? 'border-emerald-300 bg-emerald-50/60 text-emerald-950 hover:bg-emerald-100 hover:border-emerald-500 cursor-pointer'
													: 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'}"
												title={slot.disponivel ? `Selecionar horário ${slot.hora}` : slot.motivo || 'Horário ocupado'}
											>
												<span>{slot.hora}</span>
												<span class="text-[8px] uppercase tracking-tighter {isSelecionado ? 'text-emerald-100 font-black' : slot.disponivel ? 'text-emerald-700' : 'text-slate-400'}">
													{isSelecionado ? '✓ ATUAL' : slot.disponivel ? 'Livre' : 'Ocupado'}
												</span>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Checkbox Discreto: Lançamento de Ficha Antiga (Retroativo) -->
					<div class="flex flex-col gap-2 border-t border-slate-200 pt-2.5">
						<label class="flex items-center gap-2 cursor-pointer select-none font-mono text-xs text-slate-700 hover:text-slate-900">
							<input
								type="checkbox"
								bind:checked={habilitarRetroativo}
								class="w-4 h-4 text-blue-900 border-slate-300 focus:ring-0"
							/>
							<span class="font-bold">Lançar Ficha Antiga de Papel (Registro Histórico Retroativo)</span>
						</label>

						{#if habilitarRetroativo}
							<div class="flex flex-col gap-2.5 bg-amber-50/60 border border-amber-300 p-3 font-mono text-xs mt-1">
								<div class="text-[10px] font-bold text-amber-900 uppercase">
									🔙 Digitalização de Ficha Antiga de Papel (Data Histórica)
								</div>
								<div class="grid grid-cols-3 gap-2 pt-1 font-mono">
									<div class="flex flex-col gap-1">
										<label for="ret-dt" class="text-[9px] font-bold text-slate-700 uppercase">Data do Atendimento *</label>
										<input
											id="ret-dt"
											type="date"
											bind:value={dataRetroativa}
											class="border border-slate-300 bg-white px-2 py-1.5 outline-none text-xs font-mono font-bold"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="ret-hr" class="text-[9px] font-bold text-slate-700 uppercase">Horário</label>
										<input
											id="ret-hr"
											type="time"
											bind:value={horaRetroativa}
											class="border border-slate-300 bg-white px-2 py-1.5 outline-none text-xs font-mono font-bold"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="ret-st" class="text-[9px] font-bold text-slate-700 uppercase">Status do Registro</label>
										<select
											id="ret-st"
											bind:value={statusRetroativo}
											class="border border-slate-300 bg-white px-1.5 py-1.5 outline-none text-xs font-mono font-bold"
										>
											<option value="CONCLUIDO">✓ Concluído</option>
											<option value="AGUARDANDO">⏳ Aguardando</option>
											<option value="FALTOU">❌ Faltou</option>
										</select>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Recomendações ao Paciente -->
					<div class="flex flex-col gap-1">
						<label for="cons-rec" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Recomendações ao Paciente / Observações
						</label>
						<textarea
							id="cons-rec"
							rows="2"
							bind:value={recomendacoes}
							placeholder="Instruções de preparo, exames a trazer ou recomendações da recepção (opcional)..."
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none resize-none focus:border-blue-900 font-sans text-xs"
						></textarea>
					</div>

					<!-- Confirmação Imediata de Presença (Paciente no Balcão) -->
					<div class="border border-emerald-300 bg-emerald-50/70 p-3 flex items-start gap-3 transition-colors">
						<input
							type="checkbox"
							id="chk-presenca"
							bind:checked={confirmarPresencaImediata}
							class="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-800 focus:ring-emerald-700 cursor-pointer"
						/>
						<label for="chk-presenca" class="cursor-pointer select-none">
							<div class="font-mono text-xs font-bold text-emerald-950 uppercase tracking-tight flex items-center gap-1.5">
								<span class="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
								Confirmar presença imediata (Paciente já está na recepção / sala de espera)
							</div>
							<p class="font-sans text-[11px] text-emerald-800 leading-snug mt-0.5">
								Ao marcar esta opção, o paciente será encaminhado com status <strong>AGUARDANDO ATENDIMENTO</strong> para a fila da recepção e lista de chamada do especialista / Painel TV.
							</p>
						</label>
					</div>
				</div>
			</div>

			<!-- Rodapé de Ação -->
			<div class="bg-slate-50 p-4 border-t border-slate-200 flex flex-col gap-3 font-mono text-xs">
				{#if erroAgendamento}
					<div class="border border-red-700 bg-red-50 px-3 py-2 text-red-800 font-bold">
						{erroAgendamento}
					</div>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						onclick={agendarBalcao}
						disabled={processandoAgendamento || (!habilitarRetroativo && !slotEscolhido)}
						class="bg-blue-900 hover:bg-blue-950 text-white border border-blue-900 px-6 py-2.5 font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
					>
						{processandoAgendamento ? 'PROCESSANDO...' : 'CONFIRMAR E AGENDAR NO BALCÃO ↵'}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Modal de Confirmação para Cadastro de Nova UBS On-the-Fly -->
{#if modalNovaUbsAberto}
	<div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
		<div class="bg-white border-2 border-blue-900 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
			<!-- Header do Modal -->
			<div class="bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<IconBuildingCommunity size={18} class="text-blue-200" />
					<h3 class="font-mono text-xs font-bold uppercase tracking-wider">
						Nova Unidade Básica de Saúde (UBS)
					</h3>
				</div>
				<button
					type="button"
					onclick={() => (modalNovaUbsAberto = false)}
					class="text-white hover:text-red-300 font-bold p-1"
					title="Fechar"
				>
					<IconX size={18} />
				</button>
			</div>

			<!-- Corpo do Modal -->
			<div class="p-5 flex flex-col gap-3 font-sans text-xs">
				<div class="border-l-4 border-blue-900 bg-blue-50 p-3 text-slate-700 text-[11px]">
					<p class="font-bold text-blue-950 mb-1">Confirmação de Cadastro Municipal:</p>
					<p>
						Esta UBS será cadastrada permanentemente na rede municipal de <strong>Águas Belas / PE</strong> e automaticamente vinculada como a unidade de referência deste paciente.
					</p>
				</div>

				{#if erroModalUbs}
					<div class="border border-red-700 bg-red-50 p-2 text-red-800 font-mono text-[11px] font-bold">
						{erroModalUbs}
					</div>
				{/if}

				<!-- Nome da UBS -->
				<div class="flex flex-col gap-1">
					<label for="modal-ubs-nome" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
						Nome Oficial da Unidade Básica <span class="text-red-700">*</span>
					</label>
					<input
						id="modal-ubs-nome"
						type="text"
						bind:value={formNovaUbsNome}
						placeholder="Ex: UBS DR. JOSÉ CARDOSO ou UBS SÍTIO CURRAL NOVO"
						class="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-900 text-xs font-semibold"
					/>
				</div>

				<!-- Município e UF -->
				<div class="grid grid-cols-3 gap-2">
					<div class="col-span-2 flex flex-col gap-1">
						<label for="modal-ubs-mun" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
							Município
						</label>
						<input
							id="modal-ubs-mun"
							type="text"
							bind:value={formNovaUbsMunicipio}
							class="w-full border border-slate-300 bg-slate-100 px-3 py-1.5 outline-none text-xs font-bold text-slate-800"
							readonly
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="modal-ubs-uf" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
							UF
						</label>
						<input
							id="modal-ubs-uf"
							type="text"
							bind:value={formNovaUbsUf}
							class="w-full border border-slate-300 bg-slate-100 px-3 py-1.5 outline-none text-xs font-bold text-slate-800"
							readonly
						/>
					</div>
				</div>

				<!-- CNES e Bairro -->
				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label for="modal-ubs-cnes" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
							Código CNES (Opcional)
						</label>
						<input
							id="modal-ubs-cnes"
							type="text"
							bind:value={formNovaUbsCnes}
							placeholder="Ex: 2345678"
							maxlength="7"
							class="w-full border border-slate-300 bg-white px-3 py-1.5 outline-none focus:border-blue-900 font-mono text-xs"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="modal-ubs-bairro" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
							Bairro / Comunidade
						</label>
						<input
							id="modal-ubs-bairro"
							type="text"
							bind:value={formNovaUbsBairro}
							placeholder="Ex: Comunidade Garcia, Centro..."
							class="w-full border border-slate-300 bg-white px-3 py-1.5 outline-none focus:border-blue-900 text-xs"
						/>
					</div>
				</div>

				<!-- Endereço / Localidade -->
				<div class="flex flex-col gap-1">
					<label for="modal-ubs-end" class="font-mono text-[9px] font-semibold tracking-widest text-slate-600 uppercase">
						Endereço / Referência
					</label>
					<input
						id="modal-ubs-end"
						type="text"
						bind:value={formNovaUbsEndereco}
						placeholder="Ex: Rua Projetada, s/n, Povoado..."
						class="w-full border border-slate-300 bg-white px-3 py-1.5 outline-none focus:border-blue-900 text-xs"
					/>
				</div>
			</div>

			<!-- Rodapé do Modal -->
			<div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (modalNovaUbsAberto = false)}
					disabled={salvandoNovaUbs}
					class="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold uppercase text-xs transition-colors"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={salvarNovaUbs}
					disabled={salvandoNovaUbs || !formNovaUbsNome.trim()}
					class="px-5 py-2 border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white font-bold uppercase text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
				>
					{#if salvandoNovaUbs}
						<IconRefresh size={14} class="animate-spin" />
						<span>CADASTRANDO...</span>
					{:else}
						<IconPlus size={14} />
						<span>CONFIRMAR E VINCULAR UBS</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	select, input, textarea, button {
		border-radius: 0 !important;
	}
</style>
