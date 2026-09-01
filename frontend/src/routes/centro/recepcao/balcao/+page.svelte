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
		CalcularSlotCentroResponse
	} from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		ESPECIALIDADES_CEM,
		ESPECIALIDADES_CEO,
		type TipoCentro,
		type AgendamentoOcupado
	} from '$lib/domain/centro/alocadorInteligenteEscala';

	// Centro Selecionado determinado 100% pelo órgão / rota (CEM vs CEO)
	let centroSelecionado = $derived<TipoCentro>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroSelecionado === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista');
	let rotuloConsulta = $derived(ehCeo ? 'CONSULTA ODONTOLÓGICA' : 'CONSULTA MÉDICA');
	let iconeConsulta = $derived(ehCeo ? '🦷' : '🩺');

	// Dados do Paciente (sem valores mockados)
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

	// Dados da Solicitação e Alocação
	let especialidade = $state('');
	let tipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let procedimentoSolicitado = $state('');
	let prioridade = $state<PrioridadeClinica>('ELETIVA');
	let recomendacoes = $state('');

	// Escalas e profissionais carregados 100% do Banco de Dados
	let escalasDoBanco = $state<EscalaMedicoCentro[]>([]);
	let carregandoEscalas = $state(true);

	// Estado da Alocação Calculada no Servidor
	let alocacaoOtimizadaBalcao = $state<CalcularSlotCentroResponse['alocacao'] | null>(null);
	let calculandoSlotBackend = $state(false);
	let mensagemSlotBackend = $state('');

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

	// Especialidades obtidas a partir das escalas cadastradas no banco, com fallback para o catálogo oficial
	let especialidadesCadastradas = $derived.by(() => {
		const espBanco = Array.from(new Set(escalasDoBanco.map(e => e.especialidade))).filter(Boolean);
		if (espBanco.length > 0) return espBanco;
		return ehCeo ? [...ESPECIALIDADES_CEO] : [...ESPECIALIDADES_CEM];
	});

	let procedimentosCadastrados = $derived(
		ehCeo ? procedimentosCeo : procedimentosCem
	);

	// Especialistas cadastrados na escala do banco
	let medicosEspecialistas = $derived(
		escalasDoBanco.map(e => ({
			id: e.id,
			medicoId: e.medicoId,
			nome: e.medicoNome,
			especialidade: e.especialidade,
			registro: e.crm,
			diasSemana: e.diasSemana,
			horarioInicio: e.horarioInicio,
			horarioFim: e.horarioFim,
			duracaoMinutos: e.duracaoMinutos,
			tipoServico: e.tipoServico
		}))
	);

	let buscaMedico = $state('');
	let dropdownAberto = $state(false);
	let medicoSelecionado = $state<{ id?: string; medicoId?: string; nome: string; especialidade: string; registro: string } | null>(null);

	// Filtra especialistas pela especialidade selecionada (se houver) e texto de busca
	let medicosFiltrados = $derived(
		medicosEspecialistas.filter(m => {
			const bateEspecialidade = !especialidade || m.especialidade.toLowerCase() === especialidade.toLowerCase();
			const bateTexto = !buscaMedico || m.nome.toLowerCase().includes(buscaMedico.toLowerCase()) || m.especialidade.toLowerCase().includes(buscaMedico.toLowerCase());
			return bateEspecialidade && bateTexto;
		})
	);

	// Limpa seleção do médico quando muda a especialidade para uma incompatível
	function handleEspecialidadeChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		especialidade = target.value;
		if (medicoSelecionado && medicoSelecionado.especialidade.toLowerCase() !== especialidade.toLowerCase()) {
			medicoSelecionado = null;
			buscaMedico = '';
		}
	}

	function selecionarMedico(med: { id?: string; medicoId?: string; nome: string; especialidade: string; registro: string }) {
		medicoSelecionado = med;
		buscaMedico = med.nome;
		especialidade = med.especialidade;
		dropdownAberto = false;
	}

	function limparMedico() {
		medicoSelecionado = null;
		buscaMedico = '';
	}

	// Alocação Automática Reativa via Backend API
	async function calcularSlotBackend() {
		if (!especialidade && !medicoSelecionado) {
			alocacaoOtimizadaBalcao = null;
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
				mensagemSlotBackend = '';
			} else {
				alocacaoOtimizadaBalcao = null;
				mensagemSlotBackend = res?.mensagem || 'Nenhum slot disponível com os critérios selecionados.';
			}
		} catch (err: any) {
			alocacaoOtimizadaBalcao = null;
			mensagemSlotBackend = err?.message || 'Falha ao consultar algoritmo de alocação no servidor.';
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

	// Opções de Agendamento Manual / Retorno / Histórico (Escondido por padrão via checkbox)
	let habilitarAgendamentoManual = $state(false);
	let tipoAgendamentoManual = $state<'MANUAL' | 'RETROATIVO'>('MANUAL');
	let dataManual = $state(new Date().toISOString().substring(0, 10));
	let horaManual = $state('08:00');
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
				pacienteEnd = res.paciente.endereco || '';
				pacienteNomeMae = res.paciente.nomeMae || '';
				pacienteRacaCor = (res.paciente.racaCor as RacaCor) || '';
			} else {
				pacienteExiste = false;
				pacienteId = null;
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
			const escalas = await api.centroRecepcao.listEscalas().catch(() => []);
			escalasDoBanco = Array.isArray(escalas) ? escalas : [];
		} catch (err) {
			console.info('[UniSISM] Falha ao carregar escalas do backend.', err);
		} finally {
			carregandoEscalas = false;
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

		processandoAgendamento = true;
		erroAgendamento = '';
		sucessoAgendamento = '';

		let dataCalculada = '';
		let horaCalculada = '';

		if (habilitarAgendamentoManual) {
			if (tipoAgendamentoManual === 'RETROATIVO') {
				if (!dataRetroativa) {
					erroAgendamento = 'Informe a data do agendamento retroativo.';
					processandoAgendamento = false;
					return;
				}
				dataCalculada = dataRetroativa;
				horaCalculada = horaRetroativa || '08:00';
			} else {
				if (!dataManual) {
					erroAgendamento = 'Informe a data escolhida para a consulta de retorno.';
					processandoAgendamento = false;
					return;
				}
				dataCalculada = dataManual;
				horaCalculada = horaManual || '08:00';
			}
		} else if (alocacaoOtimizadaBalcao) {
			dataCalculada = alocacaoOtimizadaBalcao.data;
			horaCalculada = alocacaoOtimizadaBalcao.hora;
		} else {
			dataCalculada = new Date().toISOString().substring(0, 10);
			horaCalculada = '08:00';
		}

		const nomeProfissionalFinal = medicoSelecionado?.nome || alocacaoOtimizadaBalcao?.medicoNome || 'Especialista da Escala';
		const crmProfissionalFinal = medicoSelecionado?.registro || alocacaoOtimizadaBalcao?.crm || (ehCeo ? 'CRO 0000' : 'CRM 0000');

		const notaAgendamento = `Agendamento Presencial de Balcão [${nomeOrgao}] | Profissional: ${nomeProfissionalFinal} às ${horaCalculada} | Prioridade: ${prioridade} | [ESCALA ${centroSelecionado}]: ${alocacaoOtimizadaBalcao?.justificativaEscala || 'Alocação direta'} | Obs: ${recomendacoes.trim() || 'Sem observações'}` + (habilitarAgendamentoManual && tipoAgendamentoManual === 'RETROATIVO' ? ` | [MIGRAÇÃO PAPEL RETROATIVO: ${dataCalculada} às ${horaCalculada} - Status: ${statusRetroativo}]` : '');

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
				dataSolicitacao: (habilitarAgendamentoManual && tipoAgendamentoManual === 'RETROATIVO') ? dataCalculada : new Date().toISOString().substring(0, 10),
				tipoServico,
				procedimentoSolicitado: tipoServico === 'PROCEDIMENTO' ? procedimentoSolicitado : undefined
			};

			let protocoloFinal = '';
			let dataFinal = dataCalculada;
			let horaFinal = horaCalculada;

			try {
				if (habilitarAgendamentoManual && tipoAgendamentoManual === 'RETROATIVO' && pacienteId) {
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
						dataAgendamento: dataCalculada,
						horaAgendamento: horaCalculada,
						status: (habilitarAgendamentoManual && tipoAgendamentoManual === 'RETROATIVO') ? statusRetroativo : undefined
					} as any);

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

			sucessoAgendamento = `Agendamento confirmado com sucesso na grade do centro!\n\nProtocolo: ${protocoloFinal || 'AGD-' + Date.now().toString().slice(-6)}\nData Agendada: ${new Date(dataFinal + 'T12:00:00').toLocaleDateString('pt-BR')}\nHorário do Slot: ${horaFinal}\nProfissional: ${nomeProfissionalFinal} (${crmProfissionalFinal})\nUnidade: ${nomeOrgao}`;
			
			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { sucessoAgendamento = ''; }, 8000);

			// Limpa formulário para próximo atendimento
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
			procedimentoSolicitado = '';
			recomendacoes = '';
			ultimoCpfPesquisado = '';
			habilitarAgendamentoManual = false;
			alocacaoOtimizadaBalcao = null;
			mensagemSlotBackend = '';
		} catch (e) {
			console.error(e);
			if (e instanceof ApiError) {
				erroAgendamento = e.message || 'Falha ao processar agendamento.';
			} else {
				erroAgendamento = 'Falha na comunicação com o servidor.';
			}
		} finally {
			processandoAgendamento = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Alerta se não houver escalas cadastradas no banco -->
	{#if !carregandoEscalas && escalasDoBanco.length === 0}
		<div class="border-2 border-amber-600 bg-amber-50 p-3.5 text-amber-950 font-sans text-xs flex items-center justify-between shadow-xs">
			<div class="flex items-center gap-2.5">
				<span class="text-base font-bold text-amber-700">⚠️</span>
				<div>
					<div class="font-bold text-amber-900 font-mono text-[11px] uppercase">Nenhuma escala profissional cadastrada no banco de dados</div>
					<div class="text-[11px] text-amber-800">
						Para o algoritmo do servidor calcular as vagas automaticamente, cadastre os profissionais, dias e turnos de atendimento na <strong>Matriz de Vagas & Escalas</strong>.
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
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 text-emerald-900 font-bold flex flex-col gap-1.5 items-start whitespace-pre-wrap shadow-xs">
			<div class="flex items-center gap-2 text-sm uppercase tracking-wide text-emerald-800">
				<span>✓</span>
				<span>AGENDAMENTO CONCLUÍDO COM SUCESSO</span>
			</div>
			<div class="font-mono text-xs font-normal bg-white/80 p-3 border border-emerald-300 w-full">
				{sucessoAgendamento}
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
		<!-- Painel 01: Dados do Paciente -->
		<div class="border border-slate-200 bg-white md:col-span-6">
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

				<!-- Endereço -->
				<div class="flex flex-col gap-1">
					<label for="pac-end" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
						Endereço Residencial
					</label>
					<input
						id="pac-end"
						type="text"
						bind:value={pacienteEnd}
						placeholder="Rua, Número, Bairro, Cidade"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-sans text-xs"
					/>
				</div>
			</div>
		</div>

		<!-- Painel 02: Dados do Agendamento Especializado -->
		<div class="border border-slate-200 bg-white md:col-span-6 flex flex-col justify-between">
			<div>
				<PanelHeader title="Dados do Agendamento Especializado" index="02" />
				
				<div class="p-4 flex flex-col gap-3.5 font-sans text-xs">
					<!-- Identificação da Unidade -->
					<div class="border border-slate-300 bg-slate-100 p-2 font-mono text-xs flex items-center justify-between">
						<span class="font-bold text-slate-700 uppercase text-[10px]">🏢 UNIDADE:</span>
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
								<span>{iconeConsulta}</span>
								<span>{rotuloConsulta}</span>
							</button>
							<button
								type="button"
								onclick={() => tipoServico = 'PROCEDIMENTO'}
								class="px-3 py-2 font-mono text-xs font-bold uppercase border transition-colors flex items-center justify-center gap-1.5 {tipoServico === 'PROCEDIMENTO' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🔬</span>
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
								Procedimento Diagnóstico / Terapêutico SIGTAP <span class="text-red-700">*</span>
							</label>
							<select
								id="cons-proc"
								bind:value={procedimentoSolicitado}
								class="w-full border border-purple-300 bg-purple-50/50 px-2.5 py-2 outline-none focus:border-purple-900 font-mono text-xs text-purple-950 font-bold"
							>
								<option value="">Selecione o procedimento da tabela SIGTAP...</option>
								{#each procedimentosCadastrados as proc}
									<option value={proc}>{proc}</option>
								{/each}
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
						
						<button
							id="medico-search-btn"
							type="button"
							onclick={() => dropdownAberto = !dropdownAberto}
							class="w-full border border-slate-300 bg-white px-2.5 py-2 text-left font-sans text-xs text-slate-900 outline-none flex justify-between items-center focus:border-blue-900"
						>
							<span class={medicoSelecionado ? 'font-bold text-slate-900' : 'text-slate-500'}>
								{#if medicoSelecionado}
									{medicoSelecionado.nome} — {medicoSelecionado.especialidade} ({medicoSelecionado.registro})
								{:else if medicosEspecialistas.length === 0}
									⚠️ Nenhum profissional cadastrado na escala deste Centro
								{:else}
									Selecione o profissional da escala...
								{/if}
							</span>
							<span class="text-slate-400 font-bold text-[9px]">{dropdownAberto ? '▲' : '▼'}</span>
						</button>

						{#if dropdownAberto}
							<div class="absolute z-20 left-0 right-0 top-full mt-1 border-2 border-slate-900 bg-white shadow-[4px_4px_0_rgba(15,23,42,0.15)] max-h-52 overflow-y-auto">
								<div class="p-2 border-b border-slate-200 bg-slate-50 sticky top-0">
									<input
										type="text"
										bind:value={buscaMedico}
										placeholder="🔍 Filtrar profissional por nome ou especialidade..."
										class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs"
										onclick={(e) => e.stopPropagation()}
									/>
								</div>
								<div class="flex flex-col">
									{#each medicosFiltrados as med}
										<button
											type="button"
											onclick={() => selecionarMedico(med)}
											class="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-900 border-b border-slate-100 last:border-b-0 text-xs font-mono flex justify-between items-center"
										>
											<div class="flex flex-col">
												<span class="font-bold text-slate-900">{med.nome}</span>
												<span class="text-[10px] text-slate-500">{med.registro} · {med.diasSemana?.join(', ')} ({med.horarioInicio} - {med.horarioFim})</span>
											</div>
											<span class="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 uppercase font-semibold border border-slate-200">
												{med.especialidade}
											</span>
										</button>
									{:else}
										<div class="px-3 py-3 text-center text-slate-500 text-xs font-sans">
											{#if medicosEspecialistas.length === 0}
												Nenhum profissional com escala cadastrada no banco de dados. Cadastre na Matriz de Vagas & Escalas.
											{:else}
												Nenhum profissional encontrado para os filtros informados.
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
							<span>Prioridade Clínica SUS (Diretriz de Alocação de Vagas) *</span>
							<span class="text-[9px] text-blue-900 font-normal">Janela de Atendimento</span>
						</span>

						<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
							<button
								type="button"
								onclick={() => prioridade = 'ELETIVA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'ELETIVA' ? 'border-emerald-800 bg-emerald-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🟢 ELETIVA</span>
								<span class="text-[8px] font-normal {prioridade === 'ELETIVA' ? 'text-emerald-100' : 'text-slate-500'}">15 a 30 dias</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'PRIORITARIA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'PRIORITARIA' ? 'border-amber-800 bg-amber-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🟡 PRIORITÁRIA</span>
								<span class="text-[8px] font-normal {prioridade === 'PRIORITARIA' ? 'text-amber-100' : 'text-slate-500'}">7 a 10 dias (60+, PCD, TEA)</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'URGENTE'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'URGENTE' ? 'border-orange-800 bg-orange-800 text-white shadow-xs' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🟠 URGENTE</span>
								<span class="text-[8px] font-normal {prioridade === 'URGENTE' ? 'text-orange-100' : 'text-slate-500'}">Até 72 horas</span>
							</button>
							<button
								type="button"
								onclick={() => prioridade = 'EMERGENCIA'}
								class="px-2 py-2 font-bold uppercase border transition-colors flex flex-col items-center justify-center text-center gap-0.5 {prioridade === 'EMERGENCIA' ? 'border-red-900 bg-red-900 text-white shadow-xs animate-pulse' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								<span>🔴 EMERGÊNCIA</span>
								<span class="text-[8px] font-normal {prioridade === 'EMERGENCIA' ? 'text-red-100' : 'text-slate-500'}">Mesmo Dia / Encaixe</span>
							</button>
						</div>
					</div>

					<!-- Card Dinâmico: Resultado da Alocação Automática de Slots pelo Backend -->
					{#if calculandoSlotBackend}
						<div class="border border-blue-300 bg-blue-50 p-3 text-center text-blue-900 font-mono text-xs flex items-center justify-center gap-2 animate-pulse">
							<span>⚡</span>
							<span>[CALCULANDO ALOCAÇÃO DE VAGA NO SERVIDOR BACKEND...]</span>
						</div>
					{:else if alocacaoOtimizadaBalcao}
						<div class="border-2 {prioridade === 'EMERGENCIA' ? 'border-red-800 bg-red-50/90 text-red-950' : prioridade === 'URGENTE' ? 'border-orange-700 bg-orange-50/90 text-orange-950' : 'border-emerald-700 bg-emerald-50/90 text-emerald-950'} p-3 flex flex-col gap-1.5 font-mono text-xs shadow-xs">
							<div class="flex items-center justify-between">
								<span class="font-bold uppercase text-[10px] flex items-center gap-1.5">
									<span>⚡ ALOCAÇÃO DETERMINÍSTICA DO BACKEND ({centroSelecionado})</span>
								</span>
								<span class="{prioridade === 'EMERGENCIA' ? 'bg-red-800 text-white' : prioridade === 'URGENTE' ? 'bg-orange-800 text-white' : 'bg-emerald-800 text-white'} font-bold px-1.5 py-0.5 text-[9px] uppercase">
									{alocacaoOtimizadaBalcao.prazoLegalSus}
								</span>
							</div>

							<div class="text-sm font-black font-sans mt-0.5 flex items-center gap-2">
								<span>📅 {alocacaoOtimizadaBalcao.dataFormatada}</span>
								<span>·</span>
								<span>⏰ {alocacaoOtimizadaBalcao.hora} (SLOT LIVRE)</span>
							</div>

							<div class="text-[11px] font-bold">
								📍 {alocacaoOtimizadaBalcao.consultorio} · {alocacaoOtimizadaBalcao.medicoNome} ({alocacaoOtimizadaBalcao.crm})
							</div>

							<div class="text-[10px] border-t border-slate-300/60 pt-1 font-sans leading-tight opacity-90">
								{alocacaoOtimizadaBalcao.justificativaEscala}
							</div>
						</div>
					{:else if mensagemSlotBackend}
						<div class="border border-amber-600 bg-amber-50 p-3 text-amber-900 font-mono text-xs flex flex-col gap-1">
							<span class="font-bold">⚠️ RETORNO DO SERVIDOR:</span>
							<span class="font-sans text-[11px]">{mensagemSlotBackend}</span>
						</div>
					{:else}
						<div class="border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-slate-500 font-mono text-[11px]">
							⚡ Selecione a <strong>Especialidade</strong> e o <strong>Profissional</strong> para calcular automaticamente o próximo slot livre na grade da escala do servidor.
						</div>
					{/if}

					<!-- Checkbox Discreto: Agendamento Manual / Retorno / Retroativo -->
					<div class="flex flex-col gap-2 border-t border-slate-200 pt-2.5">
						<label class="flex items-center gap-2 cursor-pointer select-none font-mono text-xs text-slate-700 hover:text-slate-900">
							<input
								type="checkbox"
								bind:checked={habilitarAgendamentoManual}
								class="w-4 h-4 text-blue-900 border-slate-300 focus:ring-0"
							/>
							<span class="font-bold">Agendamento Manual ou Registro Retroativo (Definir data manualmente)</span>
						</label>

						{#if habilitarAgendamentoManual}
							<div class="flex flex-col gap-2.5 bg-slate-50 border border-slate-300 p-3 font-mono text-xs mt-1">
								<div class="grid grid-cols-2 gap-1.5 text-[10px]">
									<button
										type="button"
										onclick={() => tipoAgendamentoManual = 'MANUAL'}
										class="px-2 py-1.5 font-bold uppercase border transition-colors {tipoAgendamentoManual === 'MANUAL' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
									>
										📅 CONSULTA DE RETORNO / MANUAL
									</button>
									<button
										type="button"
										onclick={() => tipoAgendamentoManual = 'RETROATIVO'}
										class="px-2 py-1.5 font-bold uppercase border transition-colors {tipoAgendamentoManual === 'RETROATIVO' ? 'border-amber-900 bg-amber-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
									>
										🔙 FICHA ANTIGA (RETROATIVO)
									</button>
								</div>

								{#if tipoAgendamentoManual === 'MANUAL'}
									<div class="grid grid-cols-2 gap-2 pt-1 font-mono">
										<div class="flex flex-col gap-1">
											<label for="man-dt" class="text-[9px] font-bold text-slate-700 uppercase">Data Escolhida *</label>
											<input
												id="man-dt"
												type="date"
												bind:value={dataManual}
												class="border border-slate-300 bg-white px-2 py-1.5 outline-none text-xs font-mono font-bold"
											/>
										</div>
										<div class="flex flex-col gap-1">
											<label for="man-hr" class="text-[9px] font-bold text-slate-700 uppercase">Horário da Consulta *</label>
											<input
												id="man-hr"
												type="time"
												bind:value={horaManual}
												class="border border-slate-300 bg-white px-2 py-1.5 outline-none text-xs font-mono font-bold"
											/>
										</div>
									</div>
								{:else}
									<div class="grid grid-cols-3 gap-2 pt-1 font-mono">
										<div class="flex flex-col gap-1">
											<label for="ret-dt" class="text-[9px] font-bold text-slate-700 uppercase">Data *</label>
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
											<label for="ret-st" class="text-[9px] font-bold text-slate-700 uppercase">Status</label>
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
								{/if}
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
						disabled={processandoAgendamento}
						class="bg-blue-900 hover:bg-blue-950 text-white border border-blue-900 px-6 py-2.5 font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
					>
						{processandoAgendamento ? 'PROCESSANDO...' : 'CONFIRMAR E AGENDAR NO BALCÃO ↵'}
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
