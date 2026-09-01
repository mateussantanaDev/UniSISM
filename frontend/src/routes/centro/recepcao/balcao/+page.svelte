<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type { Paciente, SolicitacaoMedica, PrioridadeClinica, Sexo, RacaCor } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		alocarVagaPorProfissionalEEscala,
		ESPECIALIDADES_CEM,
		ESPECIALIDADES_CEO,
		ESCALAS_PADRAO_CEM,
		ESCALAS_PADRAO_CEO,
		type TipoCentro,
		type AgendamentoOcupado
	} from '$lib/domain/centro/alocadorInteligenteEscala';

	// Centro Selecionado determinado 100% pelo órgão / rota (CEM vs CEO)
	let centroSelecionado = $derived<TipoCentro>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroSelecionado === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)');

	// Dados do Paciente (existente ou novo)
	let pacienteCpf = $state('');
	let pacienteId = $state<string | null>(null);
	let pacienteNome = $state('');
	let pacienteSus = $state('');
	let pacienteNasc = $state('');
	let pacienteSexo = $state<Sexo>('M');
	let pacienteTel = $state('');
	let pacienteEnd = $state('');
	let pacienteNomeMae = $state('');
	let pacienteRacaCor = $state<RacaCor | ''>('');

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

	// Dados da Solicitacao Médica / Odontológica
	let medicoNome = $state('Profissional do Balcão');
	let medicoCrm = $state('000000');
	let especialidade = $state('Cardiologia');
	let tipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let procedimentoSolicitado = $state('');
	let cid10 = $state('Z00');
	let cidDescricao = $state('Consulta Direta / Exame Geral');
	let justificativa = $state('Atendimento presencial no balcão da unidade especializada');
	let prioridade = $state<PrioridadeClinica>('ELETIVA');
	let recomendacoes = $state('');

	const procedimentosCem = [
		'02.11.02.003-6 - Eletrocardiograma (ECG)',
		'02.05.02.009-7 - Ecocardiograma Transtorácico',
		'04.04.01.001-2 - Biópsia de Pele e Subcutâneo',
		'03.01.01.004-0 - Lavagem Otológica',
		'04.08.01.004-7 - Infiltração Articular',
		'02.11.05.008-3 - Holter 24 Horas',
		'04.01.01.002-3 - Curativo Especial',
		'02.06.01.007-9 - Endoscopia Digestiva Alta'
	];

	const procedimentosCeo = [
		'03.07.02.006-1 - Tratamento Endodôntico Dente Permanente',
		'03.07.01.004-0 - Raspagem e Alisamento Periodontal',
		'04.14.01.014-9 - Exodontia de Dente Incluso / Semi-incluso',
		'03.07.03.003-2 - Condicionamento Odontopediátrico',
		'03.07.04.004-6 - Atendimento Odontológico a Pacientes Especiais',
		'07.01.07.012-9 - Moldagem e Instalação de Prótese Dentária',
		'02.01.01.042-8 - Biópsia de Glândula Salivar / Lesão Bucal'
	];

	let especialidadesCadastradas = $derived(
		ehCeo ? [...ESPECIALIDADES_CEO] : [...ESPECIALIDADES_CEM]
	);

	let procedimentosCadastrados = $derived(
		ehCeo ? procedimentosCeo : procedimentosCem
	);

	// Dropdown de Especialistas exclusivos do órgão
	let medicosEspecialistas = $derived<{ nome: string, especialidade: string, registro: string }[]>(
		ehCeo
			? ESCALAS_PADRAO_CEO.map(e => ({ nome: e.nome, especialidade: e.especialidade, registro: e.registro }))
			: ESCALAS_PADRAO_CEM.map(e => ({ nome: e.nome, especialidade: e.especialidade, registro: e.registro }))
	);
	let buscaMedico = $state('');
	let dropdownAberto = $state(false);
	let medicoSelecionado = $state<{ nome: string, especialidade: string, registro: string } | null>(null);

	// Inicializa e sincroniza especialista e especialidade padrão
	$effect(() => {
		if (ehCeo) {
			if (!especialidade || !ESPECIALIDADES_CEO.includes(especialidade as any)) {
				especialidade = 'Endodontia';
			}
			if (!medicoSelecionado || medicoSelecionado.registro.startsWith('CRM')) {
				medicoSelecionado = medicosEspecialistas[0] || null;
			}
		} else {
			if (!especialidade || !ESPECIALIDADES_CEM.includes(especialidade as any)) {
				especialidade = 'Cardiologia';
			}
			if (!medicoSelecionado || medicoSelecionado.registro.startsWith('CRO')) {
				medicoSelecionado = medicosEspecialistas[0] || null;
			}
		}
	});

	let alocacaoOtimizadaBalcao = $derived.by(() => {
		return alocarVagaPorProfissionalEEscala({
			centro: centroSelecionado,
			medicoNome: medicoSelecionado?.nome,
			especialidade,
			prioridade,
			dataBase: new Date()
		});
	});

	let medicosFiltrados = $derived(
		medicosEspecialistas.filter(m =>
			m.nome.toLowerCase().includes(buscaMedico.toLowerCase()) ||
			m.especialidade.toLowerCase().includes(buscaMedico.toLowerCase())
		)
	);

	// Modo de Agendamento (Otimização Automática vs Manual vs Retroativo)
	let modoData = $state<'AUTODATA' | 'MANUAL' | 'RETROATIVO'>('AUTODATA');
	let dataManual = $state(new Date().toISOString().substring(0, 10));
	let horaManual = $state('08:00');
	let dataRetroativa = $state(new Date().toISOString().substring(0, 10));
	let horaRetroativa = $state('08:00');
	let statusRetroativo = $state<'CONCLUIDO' | 'AGUARDANDO' | 'FALTOU'>('CONCLUIDO');

	onDestroy(() => {
		if (timerMensagem) clearTimeout(timerMensagem);
	});

	function calcularDataOtimizadaRegulacao(prio: PrioridadeClinica): { data: string; hora: string } {
		const hoje = new Date();
		let dias = 15;
		let horaStr = '09:00';
		if (prio === 'EMERGENCIA') {
			dias = 1;
			horaStr = '08:00';
		} else if (prio === 'URGENTE') {
			dias = 3;
			horaStr = '08:30';
		} else if (prio === 'PRIORITARIA') {
			dias = 7;
			horaStr = '09:00';
		} else {
			dias = 15;
			horaStr = '09:30';
		}
		
		hoje.setDate(hoje.getDate() + dias);
		if (hoje.getDay() === 0) hoje.setDate(hoje.getDate() + 1);
		else if (hoje.getDay() === 6) hoje.setDate(hoje.getDate() + 2);

		const dataStr = hoje.toISOString().substring(0, 10);
		return { data: dataStr, hora: horaStr };
	}

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
			ultimoCpfPesquisado = '';
			erroBusca = '';
		}
	}

	function selecionarMedico(med: { nome: string, especialidade: string, registro: string }) {
		medicoSelecionado = med;
		buscaMedico = med.nome;
		dropdownAberto = false;
		if (!especialidade || especialidade === 'Clínica Geral') {
			especialidade = med.especialidade;
		}
	}

	function limparMedico() {
		medicoSelecionado = null;
		buscaMedico = '';
	}

	function calcularDataOtimizada(prio: PrioridadeClinica, esp: string): { data: string, hora: string } {
		const hoje = new Date();
		let dias = 15;
		if (prio === 'URGENTE' || (prio as string) === 'EMERGENCIA') dias = 1;
		else if (prio === 'PRIORITARIA') dias = 7;
		hoje.setDate(hoje.getDate() + dias);
		
		const horasPossiveis = ['08:00', '08:45', '09:30', '10:15', '11:00', '13:30', '14:15', '15:00', '15:45'];
		const seed = (esp.length + dias) % horasPossiveis.length;
		const horaStr = horasPossiveis[seed];
		const dataStr = hoje.toISOString().substring(0, 10);
		return { data: dataStr, hora: horaStr };
	}

	async function pesquisarPaciente(sanitizado: string) {
		buscandoCpf = true;
		erroBusca = '';
		sucessoAgendamento = '';
		erroAgendamento = '';

		try {
			// Busca de paciente no PEC
			const res = await api.centroRecepcao.buscarPacientePorCpf(sanitizado)
				.catch(() => api.pacientes.porCpf(sanitizado).catch(() => null));

			if (res && res.existe && res.paciente) {
				pacienteExiste = true;
				pacienteId = res.paciente.id || null;
				pacienteNome = res.paciente.nome;
				pacienteSus = res.paciente.cartaoSus || '';
				pacienteNasc = res.paciente.dataNascimento || '';
				pacienteSexo = (res.paciente.sexo as Sexo) || 'M';
				pacienteTel = res.paciente.telefone || '';
				pacienteEnd = res.paciente.endereco || '';
				pacienteNomeMae = res.paciente.nomeMae || '';
				pacienteRacaCor = (res.paciente.racaCor as RacaCor) || '';
			} else {
				pacienteExiste = false;
				pacienteId = null;
				erroBusca = 'CPF não cadastrado. Preencha os campos abaixo para registrar um novo paciente.';
			}
		} catch (e) {
			console.error(e);
			erroBusca = 'Erro ao consultar CPF no banco de dados.';
		} finally {
			buscandoCpf = false;
		}
	}

	onMount(async () => {
		try {
			const usuarios = await api.admin.listUsuarios();
			const medicos = usuarios.filter(u => (u as any).perfil === 'MEDICO' || (u as any).perfil === 'REGULADOR_SMS');
			medicosEspecialistas = medicos.map(m => ({
				nome: m.nome,
				especialidade: (m as any).especialidade || 'Especialista',
				registro: m.cpf ? `CRM/REG ${m.cpf.substring(0, 6)}` : 'CRM 10000'
			}));
		} catch (eMed) {
			console.info('[UniSISM] Não foi possível carregar lista de médicos do admin.', eMed);
		}
	});

	// Reatividade do CPF
	$effect(() => {
		const sanitizado = pacienteCpf.replace(/\D/g, '');
		if (sanitizado.length === 11) {
			if (sanitizado !== ultimoCpfPesquisado) {
				ultimoCpfPesquisado = sanitizado;
				pesquisarPaciente(sanitizado);
			}
		} else {
			if (pacienteExiste || erroBusca) {
				pacienteExiste = false;
				pacienteId = null;
				erroBusca = '';
				pacienteNome = '';
				pacienteSus = '';
				pacienteNasc = '';
				pacienteSexo = 'M';
				pacienteTel = '';
				pacienteEnd = '';
				pacienteNomeMae = '';
				pacienteRacaCor = '';
				ultimoCpfPesquisado = '';
			}
		}
	});

	async function agendarBalcao() {
		const sanitizadoCpf = pacienteCpf.replace(/\D/g, '');
		if (sanitizadoCpf.length !== 11) {
			erroAgendamento = 'CPF inválido. Certifique-se de que digitou 11 dígitos.';
			return;
		}

		// REGRA 1: Precisa de todos os campos cadastrais e clínicos preenchidos para poder alocação automática da vaga
		const camposObrigatoriosCompletos = !!(
			pacienteNome.trim() &&
			sanitizadoCpf.length === 11 &&
			pacienteNasc &&
			pacienteTel.trim() &&
			pacienteEnd.trim() &&
			pacienteNomeMae.trim() &&
			pacienteRacaCor &&
			especialidade.trim() &&
			medicoSelecionado
		);

		if (!camposObrigatoriosCompletos) {
			erroAgendamento = '⚠ ALOCAÇÃO AUTOMÁTICA BLOQUEADA: Todos os campos do paciente (Nome, CPF, Nasc., Telefone, Endereço, Nome da Mãe e Etnia) e da Consulta devem estar 100% preenchidos.';
			return;
		}

		processandoAgendamento = true;
		erroAgendamento = '';
		sucessoAgendamento = '';

		let dataCalculada = '';
		let horaCalculada = '';
		if (modoData === 'RETROATIVO') {
			if (!dataRetroativa) {
				erroAgendamento = 'Informe a data do agendamento retroativo.';
				processandoAgendamento = false;
				return;
			}
			dataCalculada = dataRetroativa;
			horaCalculada = horaRetroativa || '09:00';
		} else if (modoData === 'MANUAL') {
			dataCalculada = dataManual;
			horaCalculada = horaManual || '08:00';
		} else if (alocacaoOtimizadaBalcao) {
			dataCalculada = alocacaoOtimizadaBalcao.data;
			horaCalculada = alocacaoOtimizadaBalcao.hora;
		} else {
			dataCalculada = new Date().toISOString().substring(0, 10);
			horaCalculada = '08:30';
		}

		const nomeMedicoFinal = medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome || 'Especialista';
		const notaAgendamento = `Agendamento Presencial de Balcão [${nomeOrgao}] | Especialista: ${nomeMedicoFinal} às ${horaCalculada} | [ESCALA ${centroSelecionado}]: ${alocacaoOtimizadaBalcao?.justificativaEscala || 'Alocação programada'} | Obs: ${recomendacoes.trim() || 'Nenhuma'}` + (modoData === 'RETROATIVO' ? ` | [MIGRAÇÃO PAPEL RETROATIVO: ${dataCalculada} às ${horaCalculada} - Status: ${statusRetroativo}]` : '');

		try {
			// 1. Prepara dados do Paciente
			const pacientePayload: Paciente = {
				nome: pacienteNome.trim(),
				cpf: sanitizadoCpf,
				cartaoSus: pacienteSus.trim(),
				dataNascimento: pacienteNasc,
				sexo: pacienteSexo,
				telefone: pacienteTel.trim(),
				endereco: pacienteEnd.trim(),
				nomeMae: pacienteNomeMae.trim() || undefined,
				racaCor: (pacienteRacaCor as RacaCor) || undefined
			};

			// Se o paciente já existe no banco, atualiza explicitamente os dados alterados pelo atendente
			if (pacienteExiste && pacienteId) {
				try {
					await api.pacientes.update(pacienteId, {
						nome: pacientePayload.nome,
						nomeMae: pacientePayload.nomeMae,
						dataNascimento: pacientePayload.dataNascimento,
						sexo: pacientePayload.sexo,
						racaCor: pacientePayload.racaCor,
						telefone: pacientePayload.telefone,
						endereco: pacientePayload.endereco
					});
				} catch (errUpd) {
					console.info('[UniSISM] Atualização direta do paciente via PATCH /v1/pacientes/:id em fallback', errUpd);
				}
			}

			// 2. Prepara dados da Solicitação
			const solicitacaoPayload: SolicitacaoMedica = {
				medicoSolicitante: medicoNome.trim(),
				crm: medicoCrm.trim(),
				especialidadeSolicitada: especialidade.trim(),
				cid10: cid10.trim().toUpperCase(),
				cidDescricao: cidDescricao.trim(),
				justificativaClinica: justificativa.trim(),
				prioridade,
				dataSolicitacao: modoData === 'RETROATIVO' ? dataCalculada : new Date().toISOString().substring(0, 10),
				tipoServico,
				procedimentoSolicitado: tipoServico === 'PROCEDIMENTO' ? procedimentoSolicitado : undefined
			};

			let protocoloFinal = '';
			let dataFinal = dataCalculada;
			let horaFinal = horaCalculada;

			try {
				if (modoData === 'RETROATIVO' && pacienteId) {
					const resRetro = await api.centroRecepcao.agendarBalcaoRetroativo({
						pacienteId,
						especialidade: especialidade.trim(),
						tipoServico: tipoServico as any,
						procedimentoSolicitado: tipoServico === 'PROCEDIMENTO' ? procedimentoSolicitado : undefined,
						modoData: 'RETROATIVO',
						dataRetroativa: dataCalculada,
						horaRetroativa: horaCalculada,
						statusRetroativo: statusRetroativo as any,
						medicoNome: nomeMedicoFinal
					});
					protocoloFinal = resRetro.protocolo;
				} else {
					const resBalcao = await api.centroRecepcao.agendarBalcao({
						paciente: pacientePayload,
						solicitacao: solicitacaoPayload,
						nota: recomendacoes.trim(),
						medicoDesejado: nomeMedicoFinal,
						dataAgendamento: dataCalculada,
						horaAgendamento: horaCalculada,
						status: modoData === 'RETROATIVO' ? statusRetroativo : undefined
					} as any);
					if (resBalcao && resBalcao.encaminhamento) {
						protocoloFinal = resBalcao.encaminhamento.protocolo;
						if (resBalcao.encaminhamento.agendamentoPrevisto) {
							dataFinal = resBalcao.encaminhamento.agendamentoPrevisto;
						}
					}
				}
			} catch (errBalcao) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/balcao em transição — usando fallback transacional create + aprovar', errBalcao);
				// 3. Cria o encaminhamento no backend
				const criado = await api.encaminhamentos.create({
					paciente: pacientePayload,
					solicitacao: solicitacaoPayload
				});
				protocoloFinal = criado.protocolo;

				// 4. Aprova e agenda no Centro
				await api.encaminhamentos.aprovar(criado.id, {
					filaDestino: 'CENTRO_ESPECIALIDADES',
					agendamentoPrevisto: dataCalculada,
					nota: `Médico: ${nomeMedicoFinal} às ${horaCalculada} | Obs: ${recomendacoes.trim() || 'Nenhuma'}`
				});
			}

			sucessoAgendamento = `Agendamento realizado com sucesso pelo algoritmo de otimização!\n\nProtocolo: ${protocoloFinal}\nData Calculada: ${new Date(dataFinal + 'T12:00:00').toLocaleDateString('pt-BR')}\nHorário: ${horaFinal}\nMédico: ${nomeMedicoFinal}`;
			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { sucessoAgendamento = ''; }, 6000);
			
			// Limpa o formulário
			pacienteCpf = '';
			pacienteNome = '';
			pacienteSus = '';
			pacienteNasc = '';
			pacienteSexo = 'M';
			pacienteTel = '';
			pacienteEnd = '';
			pacienteNomeMae = '';
			pacienteRacaCor = '';
			especialidade = '';
			medicoSelecionado = null;
			buscaMedico = '';
			dropdownAberto = false;
			recomendacoes = '';
			ultimoCpfPesquisado = '';
		} catch (e) {
			console.error(e);
			if (e instanceof ApiError) {
				erroAgendamento = e.message || 'Falha ao processar agendamento.';
			} else {
				erroAgendamento = 'Falha na conexão com o servidor.';
			}
		} finally {
			processandoAgendamento = false;
		}
	}

	onDestroy(() => {
		if (timerMensagem) clearTimeout(timerMensagem);
	});
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Sucesso -->
	{#if sucessoAgendamento}
		<div class="border border-emerald-700 bg-emerald-50 p-4 text-emerald-800 font-bold flex flex-col gap-1 items-start whitespace-pre-wrap">
			<span class="text-sm">✓ AGENDAMENTO CONCLUÍDO</span>
			<span class="font-mono text-xs font-normal">{sucessoAgendamento}</span>
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
		<!-- Cadastro/Dados do Paciente -->
		<div class="border border-slate-200 bg-white md:col-span-6">
			<PanelHeader title="Dados do Paciente (Identificação e Cadastro)" index="01" />
			
			<div class="p-4 flex flex-col gap-3 font-sans text-xs">
				<!-- CPF Busca/Digitação -->
				<div class="flex flex-col gap-1">
					<label for="pac-cpf" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						CPF do Paciente (Digite para pesquisar automaticamente) <span class="text-red-700">*</span>
					</label>
					<div class="relative">
						<input
							id="pac-cpf"
							type="text"
							bind:value={pacienteCpf}
							placeholder="Apenas números ou formatado (11 dígitos)"
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 font-mono text-sm"
						/>
						{#if buscandoCpf}
							<span class="absolute right-2.5 top-2 text-[10px] font-mono text-blue-900 font-semibold animate-pulse">
								[BUSCANDO...]
							</span>
						{:else if pacienteExiste}
							<span class="absolute right-2.5 top-2 text-[10px] font-mono text-emerald-700 font-bold">
								[CADASTRADO — DADOS EDITÁVEIS]
							</span>
						{/if}
					</div>
					{#if erroBusca}
						<div class="text-amber-800 font-mono text-[10px] font-semibold mt-0.5">{erroBusca}</div>
					{/if}
				</div>

				<!-- Nome -->
				<div class="flex flex-col gap-1">
					<label for="pac-nome" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Nome Completo <span class="text-red-700">*</span>
					</label>
					<input
						id="pac-nome"
						type="text"
						bind:value={pacienteNome}
						placeholder="Nome do paciente"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900"
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
						placeholder="Nome completo da mãe"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900"
					/>
				</div>

				<!-- Cartão SUS -->
				<div class="flex flex-col gap-1">
					<label for="pac-sus" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Cartão SUS
					</label>
					<input
						id="pac-sus"
						type="text"
						bind:value={pacienteSus}
						placeholder="0000 0000 0000 0000"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono"
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
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="pac-sexo" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Sexo <span class="text-red-700">*</span>
						</label>
						<select
							id="pac-sexo"
							bind:value={pacienteSexo}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none"
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
						Etnia / Raça-Cor
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
						Telefone Contato
					</label>
					<input
						id="pac-tel"
						type="text"
						bind:value={pacienteTel}
						placeholder="(00) 00000-0000"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono"
					/>
				</div>

				<!-- Endereço -->
				<div class="flex flex-col gap-1">
					<label for="pac-end" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Endereço Residencial
					</label>
					<input
						id="pac-end"
						type="text"
						bind:value={pacienteEnd}
						placeholder="Rua, Número, Bairro"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none"
					/>
				</div>
			</div>
		</div>

		<!-- Dados da Consulta e Agendamento -->
		<div class="border border-slate-200 bg-white md:col-span-6 flex flex-col gap-px">
			<div class="border-b border-slate-200 bg-white">
				<PanelHeader title="Dados do Agendamento Especializado" index="02" />
				
				<div class="p-4 flex flex-col gap-3 font-sans text-xs">
					<!-- Identificação do Órgão -->
					<div class="border border-slate-300 bg-slate-100 p-2 font-mono text-xs flex items-center justify-between">
						<span class="font-bold text-slate-700 uppercase text-[10px]">🏢 UNIDADE ASSISTENCIAL:</span>
						<span class="font-bold text-slate-900">{nomeOrgao}</span>
					</div>

					<!-- Especialidade (Dropdown de especialidades cadastradas no Centro selecionado) -->
					<div class="flex flex-col gap-1">
						<label for="cons-esp" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Especialidade Solicitada <span class="text-red-700">*</span>
						</label>
						<select
							id="cons-esp"
							bind:value={especialidade}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 font-sans"
						>
							{#each especialidadesCadastradas as esp}
								<option value={esp}>{esp.toUpperCase()}</option>
							{/each}
						</select>
					</div>

					<!-- Médico especialista dropdown com busca -->
					<div class="flex flex-col gap-1 relative">
						<label for="medico-search" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Profissional / Especialista da Escala <span class="text-red-700">*</span>
						</label>
						
						<button
							id="medico-search"
							type="button"
							onclick={() => dropdownAberto = !dropdownAberto}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-left font-sans text-sm text-slate-900 outline-none flex justify-between items-center"
						>
							<span>{medicoSelecionado ? `${medicoSelecionado.nome} (${medicoSelecionado.especialidade} - ${medicoSelecionado.registro})` : 'Selecione um Profissional da Escala...'}</span>
							<span class="text-slate-400 font-bold text-[9px]">{dropdownAberto ? '▲' : '▼'}</span>
						</button>

						{#if dropdownAberto}
							<div class="absolute z-10 left-0 right-0 top-full mt-1 border-2 border-slate-900 bg-white shadow-[4px_4px_0_rgba(15,23,42,0.15)] max-h-48 overflow-y-auto">
								<div class="p-2 border-b border-slate-200 bg-slate-50 sticky top-0">
									<input
										type="text"
										bind:value={buscaMedico}
										placeholder="🔍 Digite para pesquisar..."
										class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs"
										onclick={(e) => e.stopPropagation()}
									/>
								</div>
								<div class="flex flex-col">
									{#each medicosFiltrados as med}
										<button
											type="button"
											onclick={() => {
												medicoSelecionado = med;
												especialidade = med.especialidade; // Autocompleta a especialidade!
												dropdownAberto = false;
												buscaMedico = '';
											}}
											class="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-900 border-b border-slate-100 last:border-b-0 text-xs font-mono flex justify-between"
										>
											<span class="font-bold">{med.nome}</span>
											<span class="text-slate-500 text-[10px] uppercase font-semibold">{med.especialidade}</span>
										</button>
									{:else}
										<div class="px-3 py-3 text-center text-slate-500 text-xs font-sans">
											Nenhum médico encontrado.
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Tipo de Serviço (Consulta vs Procedimento) -->
					<div class="flex flex-col gap-1 border border-slate-200 bg-slate-50 p-2.5">
						<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase">
							Tipo de Atendimento / Serviço *
						</span>
						<div class="grid grid-cols-2 gap-2 mt-0.5">
							<button
								type="button"
								onclick={() => tipoServico = 'CONSULTA'}
								class="px-3 py-1.5 font-mono text-xs font-bold uppercase border transition-colors flex items-center justify-center gap-1.5 {tipoServico === 'CONSULTA' ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🩺</span>
								<span>CONSULTA MÉDICA</span>
							</button>
							<button
								type="button"
								onclick={() => tipoServico = 'PROCEDIMENTO'}
								class="px-3 py-1.5 font-mono text-xs font-bold uppercase border transition-colors flex items-center justify-center gap-1.5 {tipoServico === 'PROCEDIMENTO' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🔬</span>
								<span>PROCEDIMENTO</span>
							</button>
						</div>
					</div>

					<!-- Especialidade (Dropdown de especialidades cadastradas no Centro) -->
					<div class="flex flex-col gap-1">
						<label for="cons-esp" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Especialidade Solicitada <span class="text-red-700">*</span>
						</label>
						<select
							id="cons-esp"
							bind:value={especialidade}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 font-sans"
						>
							<option value="">Selecione uma especialidade...</option>
							{#each especialidadesCadastradas as esp}
								<option value={esp}>{esp.toUpperCase()}</option>
							{/each}
						</select>
					</div>

					<!-- Procedimento Específico (se tipoServico === 'PROCEDIMENTO') -->
					{#if tipoServico === 'PROCEDIMENTO'}
						<div class="flex flex-col gap-1 border-l-2 border-purple-800 pl-2.5 py-1">
							<label for="cons-proc" class="font-mono text-[9px] font-bold tracking-widest text-purple-900 uppercase">
								Procedimento Diagnóstico / Terapêutico SIGTAP
							</label>
							<select
								id="cons-proc"
								bind:value={procedimentoSolicitado}
								class="w-full border border-purple-300 bg-purple-50/50 px-2.5 py-1.5 outline-none focus:border-purple-900 font-mono text-xs text-purple-950 font-bold"
							>
								<option value="">Selecione o procedimento da tabela SIGTAP...</option>
								{#each procedimentosCadastrados as proc}
									<option value={proc}>{proc}</option>
								{/each}
							</select>
						</div>
					{/if}

					<!-- Modo de Agendamento (Data Futura Otimizada vs Retorno/Data Manual vs Retroativo / Migração de Papel) -->
					<div class="flex flex-col gap-2 border border-slate-200 bg-slate-50 p-2.5">
						<span class="font-mono text-[9px] font-bold tracking-widest text-slate-700 uppercase flex items-center justify-between">
							<span>📅 MODO DE AGENDAMENTO / SELEÇÃO DE DATA</span>
							<span class="text-[9px] text-purple-800 font-normal">Realocação & Data Manual</span>
						</span>

						<div class="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
							<button
								type="button"
								onclick={() => modoData = 'AUTODATA'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {modoData === 'AUTODATA' ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>⚡ AUTO (PRÓXIMA)</span>
							</button>
							<button
								type="button"
								onclick={() => modoData = 'MANUAL'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {modoData === 'MANUAL' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>📅 RETORNO / MANUAL</span>
							</button>
							<button
								type="button"
								onclick={() => modoData = 'RETROATIVO'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {modoData === 'RETROATIVO' ? 'border-amber-900 bg-amber-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🔙 PAPEL / RETRO</span>
							</button>
						</div>

						{#if modoData === 'AUTODATA' && alocacaoOtimizadaBalcao}
							<div class="border-2 border-emerald-700 bg-emerald-50/80 p-3 flex flex-col gap-1.5 font-mono text-xs shadow-xs">
								<div class="flex items-center justify-between">
									<span class="font-bold text-emerald-950 uppercase text-[10px] flex items-center gap-1">
										<span>⚡ ALOCAÇÃO DETERMINÍSTICA DE ESCALA ({centroSelecionado})</span>
									</span>
									<span class="bg-emerald-700 text-white font-bold px-1.5 py-0.5 text-[9px] uppercase">{alocacaoOtimizadaBalcao.prazoLegalSus}</span>
								</div>
								<div class="text-sm font-black text-emerald-900 font-sans mt-0.5">
									📅 {alocacaoOtimizadaBalcao.dataFormatada} às {alocacaoOtimizadaBalcao.hora}
								</div>
								<div class="text-[11px] text-emerald-950 font-bold">
									📍 {alocacaoOtimizadaBalcao.consultorio} · {alocacaoOtimizadaBalcao.medicoNome} ({alocacaoOtimizadaBalcao.registro})
								</div>
								<div class="text-[10px] text-emerald-800 border-t border-emerald-200 pt-1 font-sans leading-tight">
									{alocacaoOtimizadaBalcao.justificativaEscala}
								</div>
							</div>
						{/if}

						{#if modoData === 'MANUAL'}
							<div class="flex flex-col gap-2 border-t border-purple-300 pt-2 font-mono text-xs">
								<div class="bg-purple-100/70 border border-purple-300 p-2 text-[10px] text-purple-950 font-sans">
									<strong>💡 Agendamento Direto sem Fila Automática:</strong> Escolha manualmente a data e o horário para agendar consultas de retorno ou realocar o paciente sem passar pelo algoritmo automático.
								</div>

								<div class="grid grid-cols-2 gap-2">
									<div class="flex flex-col gap-1">
										<label for="man-dt-balcao" class="text-[9px] font-bold text-purple-950 uppercase">Data Escolhida *</label>
										<input
											id="man-dt-balcao"
											type="date"
											bind:value={dataRetroativa}
											class="border border-purple-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="man-hr-balcao" class="text-[9px] font-bold text-purple-950 uppercase">Horário da Consulta *</label>
										<input
											id="man-hr-balcao"
											type="time"
											bind:value={horaRetroativa}
											class="border border-purple-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
										/>
									</div>
								</div>
							</div>
						{/if}

						{#if modoData === 'RETROATIVO'}
							<div class="flex flex-col gap-2 border-t border-amber-300 pt-2 font-mono text-xs">
								<div class="bg-amber-100 border border-amber-300 p-2 text-[10px] text-amber-950 font-sans">
									<strong>💡 Migração de Fichas de Papel:</strong> Informe a data em que o paciente efetivamente veio ou foi agendado no papel para registrar o histórico com precisão no sistema.
								</div>

								<div class="grid grid-cols-3 gap-2">
									<div class="flex flex-col gap-1">
										<label for="ret-data" class="text-[9px] font-bold text-amber-950 uppercase">Data do Atendimento *</label>
										<input
											id="ret-data"
											type="date"
											bind:value={dataRetroativa}
											class="border border-amber-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="ret-hora" class="text-[9px] font-bold text-amber-950 uppercase">Horário</label>
										<input
											id="ret-hora"
											type="time"
											bind:value={horaRetroativa}
											class="border border-amber-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="ret-status" class="text-[9px] font-bold text-amber-950 uppercase">Status Registrado</label>
										<select
											id="ret-status"
											bind:value={statusRetroativo}
											class="border border-amber-400 bg-white px-1.5 py-1 outline-none text-xs font-bold font-mono"
										>
											<option value="CONCLUIDO">✓ ATENDIDO (CONCLUÍDO)</option>
											<option value="AGUARDANDO">⏳ AGUARDANDO</option>
											<option value="FALTOU">❌ FALTOU / ABSENTEÍSMO</option>
										</select>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Recomendações -->
					<div class="flex flex-col gap-1">
						<label for="cons-rec" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Recomendações ao Paciente
						</label>
						<textarea
							id="cons-rec"
							rows="3"
							bind:value={recomendacoes}
							placeholder="Ex: Comparecer 15 minutos antes trazendo documento oficial."
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none resize-none focus:border-blue-900"
						></textarea>
					</div>
				</div>
			</div>

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
						disabled={processandoAgendamento}
						class="bg-blue-900 hover:bg-blue-950 text-white border border-blue-900 px-6 py-2.5 font-bold uppercase tracking-wider disabled:opacity-50"
					>
						{processandoAgendamento ? 'Processando...' : 'Confirmar e Otimizar'}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	select, input, textarea, button {
		border-radius: 0 !important;
	}
</style>
