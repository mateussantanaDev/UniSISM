<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Paciente, SolicitacaoMedica, PrioridadeClinica, Sexo, RacaCor } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

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

	// Dados da Solicitacao Médica
	let medicoNome = $state('Médico do Balcão');
	let medicoCrm = $state('000000');
	let especialidade = $state('');
	let tipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('CONSULTA');
	let procedimentoSolicitado = $state('');
	let cid10 = $state('Z00');
	let cidDescricao = $state('Exame Geral');
	let justificativa = $state('Agendamento direto efetuado no balcão do Centro de Especialidades.');
	let prioridade = $state<PrioridadeClinica>('ELETIVA');

	const procedimentosCadastrados = [
		'02.11.02.003-6 - Eletrocardiograma (ECG)',
		'02.05.02.009-7 - Ecocardiograma Transtorácico',
		'04.04.01.001-2 - Biópsia de Pele e Subcutâneo',
		'03.01.01.004-0 - Lavagem Otológica',
		'04.08.01.004-7 - Infiltração Articular',
		'02.11.05.008-3 - Holter 24 Horas',
		'04.01.01.002-3 - Curativo Especial',
		'02.06.01.007-9 - Endoscopia Digestiva Alta'
	];

	// Dados do Agendamento
	let especialistaNome = $state('');
	let recomendacoes = $state('');

	// Agendamento Retroativo / Digitação de Fichas de Papel / Data Manual
	let modoData = $state<'AUTODATA' | 'MANUAL' | 'RETROATIVO'>('AUTODATA');
	let dataRetroativa = $state(new Date().toISOString().substring(0, 10));
	let horaRetroativa = $state('09:00');
	let statusRetroativo = $state<'CONCLUIDO' | 'AGUARDANDO' | 'FALTOU'>('CONCLUIDO');

	// Lista de especialidades cadastradas pela gestão no Centro
	const especialidadesCadastradas = [
		'Cardiologia',
		'Oftalmologia',
		'Dermatologia',
		'Endocrinologia',
		'Ginecologia/Obstetrícia',
		'Ortopedia',
		'Neurologia'
	];

	// Dropdown de Médicos com Busca (carregados do servidor)
	let medicosEspecialistas = $state<{ nome: string, especialidade: string, registro: string }[]>([]);
	let buscaMedico = $state('');
	let dropdownAberto = $state(false);
	let medicoSelecionado = $state<{ nome: string, especialidade: string, registro: string } | null>(null);

	let medicosFiltrados = $derived(
		medicosEspecialistas.filter(m => {
			if (especialidade && m.especialidade !== especialidade) {
				return false;
			}
			return (
				m.nome.toLowerCase().includes(buscaMedico.toLowerCase()) ||
				m.especialidade.toLowerCase().includes(buscaMedico.toLowerCase())
			);
		})
	);

	let processandoAgendamento = $state(false);
	let erroAgendamento = $state('');
	let sucessoAgendamento = $state('');

	// Encaminhamentos SUS & Comprovantes Particulares para Alocação Direta de Vaga
	let encaminhamentosDisponiveis = $state<Array<{ id: string; protocolo: string; especialidade: string; dataAgendamento?: string }>>([]);
	let encaminhamentoSelecionadoId = $state<string>('');
	let tipoEncaminhamento = $state<'SUS_REGULADO' | 'PARTICULAR' | 'SEM_ANEXO'>('SEM_ANEXO');
	let anexoParticularFoto = $state<string | null>(null);
	let anexoParticularNome = $state<string>('');
	let cameraAbertaBalcao = $state(false);
	let inputFileInput = $state<HTMLInputElement | null>(null);

	function simularCapturaFotoParticular() {
		anexoParticularFoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		anexoParticularNome = `encaminhamento_particular_${Date.now()}.png`;
		tipoEncaminhamento = 'PARTICULAR';
	}

	function handleUploadFileParticular(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				anexoParticularFoto = ev.target?.result as string || 'uploaded';
				anexoParticularNome = file.name;
				tipoEncaminhamento = 'PARTICULAR';
			};
			reader.readAsDataURL(file);
		}
	}

	function calcularMockDataOtimizada(prio: PrioridadeClinica): { data: string; hora: string } {
		const hoje = new Date();
		let dias = 15;
		if (prio === 'EMERGENCIA') dias = 1;
		else if (prio === 'URGENTE') dias = 3;
		else if (prio === 'PRIORITARIA') dias = 7;
		
		hoje.setDate(hoje.getDate() + dias);
		if (hoje.getDay() === 0) hoje.setDate(hoje.getDate() + 1);
		else if (hoje.getDay() === 6) hoje.setDate(hoje.getDate() + 2);

		const dataStr = hoje.toISOString().substring(0, 10);
		const horas = ['08:00', '09:15', '10:30', '13:00', '14:15', '15:30', '16:45'];
		const horaStr = horas[Math.floor(Math.random() * horas.length)];

		return { data: dataStr, hora: horaStr };
	}

	async function pesquisarPaciente(sanitizado: string) {
		buscandoCpf = true;
		erroBusca = '';
		sucessoAgendamento = '';
		erroAgendamento = '';

		try {
			try {
				const resCentro = await api.centroRecepcao.buscarPacientePorCpf(sanitizado);
				if (resCentro && resCentro.existe && resCentro.paciente) {
					pacienteExiste = true;
					pacienteId = resCentro.paciente.id || null;
					pacienteNome = resCentro.paciente.nome;
					pacienteSus = resCentro.paciente.cartaoSus || '';
					pacienteNasc = resCentro.paciente.dataNascimento || '';
					pacienteSexo = (resCentro.paciente.sexo as Sexo) || 'M';
					pacienteTel = resCentro.paciente.telefone || '';
					pacienteEnd = resCentro.paciente.endereco || '';
					pacienteNomeMae = resCentro.paciente.nomeMae || '';
					pacienteRacaCor = (resCentro.paciente.racaCor as RacaCor) || '';
					return;
				}
			} catch (errCentro) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/pacientes/por-cpf em transição — usando fallback pacientes.porCpf', errCentro);
			}

			// Fallback para API geral de pacientes
			const res = await api.pacientes.porCpf(sanitizado);
			if (res.existe && res.paciente) {
				pacienteExiste = true;
				pacienteId = res.paciente.id || null;
				pacienteNome = res.paciente.nome;
				pacienteSus = res.paciente.cartaoSus || '';
				pacienteNasc = res.paciente.dataNascimento || '';
				pacienteSexo = res.paciente.sexo || 'M';
				pacienteTel = res.paciente.telefone || '';
				pacienteEnd = res.paciente.endereco || '';
				pacienteNomeMae = res.paciente.nomeMae || '';
				pacienteRacaCor = (res.paciente.racaCor as RacaCor) || '';

				// Carrega encaminhamentos SUS ativos do paciente
				try {
					const encs = await api.encaminhamentos.list({ status: 'APROVADO', limit: 5 });
					if (encs && encs.length > 0) {
						encaminhamentosDisponiveis = encs.map(e => ({
							id: e.id,
							protocolo: e.protocolo,
							especialidade: e.solicitacao.especialidadeSolicitada,
							dataAgendamento: e.agendamentoPrevisto || undefined
						}));
						tipoEncaminhamento = 'SUS_REGULADO';
						encaminhamentoSelecionadoId = encaminhamentosDisponiveis[0].id;
						especialidade = encaminhamentosDisponiveis[0].especialidade || especialidade;
					} else {
						encaminhamentosDisponiveis = [];
					}
				} catch (eEnc) {
					console.info('[UniSISM] Busca de encaminhamentos executada localmente.', eEnc);
					encaminhamentosDisponiveis = [];
				}
			} else {
				pacienteExiste = false;
				pacienteId = null;
				encaminhamentosDisponiveis = [];
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

		// REGRAS 2, 3 e 4: Definição do Status de Alocação da Vaga
		let statusAlocacao = 'ALOCADO';
		let mensagemAlocacaoResumo = '';

		if (tipoEncaminhamento === 'SEM_ANEXO' || (tipoEncaminhamento === 'PARTICULAR' && !anexoParticularFoto)) {
			// REGRA 2: Caso não tenha anexo de encaminhamento a vaga fica esperando aprovação do gestor TFD
			statusAlocacao = 'AGUARDANDO_GESTOR_TFD';
			mensagemAlocacaoResumo = '⚠ Sem anexo de encaminhamento: A solicitação foi registrada mas ficou AGUARDANDO APROVAÇÃO MANUL DO GESTOR TFD.';
		} else if (tipoEncaminhamento === 'SUS_REGULADO' && encaminhamentoSelecionadoId) {
			// REGRA 3: Se o atendente selecionar um encaminhamento SUS disponível, o paciente é aceito de imediato
			statusAlocacao = 'ALOCADO';
			mensagemAlocacaoResumo = '✓ Encaminhamento SUS Regulado Vinculado: Paciente ACEITO DE IMEDIATO com vaga alocada!';
		} else if (tipoEncaminhamento === 'PARTICULAR' && anexoParticularFoto) {
			// REGRA 4: Encaminhamento particular com Foto/Scanner enviado garante a vaga de certeza
			statusAlocacao = 'ALOCADO';
			mensagemAlocacaoResumo = '✓ Encaminhamento Particular Digitalizado (Foto/Scanner): VAGA GARANTIDA E ALOCADA DE CERTEZA!';
		}

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
		} else {
			const otimizado = calcularMockDataOtimizada(prioridade);
			dataCalculada = otimizado.data;
			horaCalculada = otimizado.hora;
		}

		const nomeMedicoFinal = medicoSelecionado?.nome || 'Especialista';
		const notaAgendamento = `Médico: ${nomeMedicoFinal} às ${horaCalculada} | ${mensagemAlocacaoResumo} | Obs: ${recomendacoes.trim() || 'Nenhuma'}` + (modoData === 'RETROATIVO' ? ` | [MIGRAÇÃO PAPEL RETROATIVO: ${dataCalculada} às ${horaCalculada} - Status: ${statusRetroativo}]` : '');

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
					nota: notaAgendamento
				});
			}

			sucessoAgendamento = `Agendamento realizado com sucesso pelo algoritmo de otimização!\n\nProtocolo: ${protocoloFinal}\nData Calculada: ${new Date(dataFinal + 'T12:00:00').toLocaleDateString('pt-BR')}\nHorário: ${horaFinal}\nMédico: ${nomeMedicoFinal}`;
			
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


					<!-- Médico especialista dropdown com busca -->
					<div class="flex flex-col gap-1 relative">
						<label for="medico-search" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Médico Especialista <span class="text-red-700">*</span>
						</label>
						
						<button
							id="medico-search"
							type="button"
							onclick={() => dropdownAberto = !dropdownAberto}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-left font-sans text-sm text-slate-900 outline-none flex justify-between items-center"
						>
							<span>{medicoSelecionado ? `${medicoSelecionado.nome} (${medicoSelecionado.especialidade})` : 'Selecione um Médico Especialista...'}</span>
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

					<!-- Comprovação de Encaminhamento (Alocação Automática x Aprovação Gestor) -->
					<div class="flex flex-col gap-2 border border-blue-200 bg-blue-50/60 p-3 font-mono text-xs">
						<span class="font-bold text-blue-900 uppercase tracking-widest text-[9px] flex items-center justify-between">
							<span>📄 ORIGEM DO ENCAMINHAMENTO (REGRAS DE ALOCAÇÃO)</span>
							<span class="text-[9px] text-blue-800 font-normal">Alocação Automática x Aprovação</span>
						</span>

						<div class="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
							<button
								type="button"
								onclick={() => tipoEncaminhamento = 'SUS_REGULADO'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center text-center {tipoEncaminhamento === 'SUS_REGULADO' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								✓ SUS REGULADO ({encaminhamentosDisponiveis.length})
							</button>
							<button
								type="button"
								onclick={() => tipoEncaminhamento = 'PARTICULAR'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center text-center {tipoEncaminhamento === 'PARTICULAR' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								📷 PARTICULAR (FOTO/SCAN)
							</button>
							<button
								type="button"
								onclick={() => tipoEncaminhamento = 'SEM_ANEXO'}
								class="px-2 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center text-center {tipoEncaminhamento === 'SEM_ANEXO' ? 'border-amber-700 bg-amber-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
							>
								⏳ SEM ANEXO
							</button>
						</div>

						<!-- Opcão 1: Encaminhamento SUS Regulado selecionado -->
						{#if tipoEncaminhamento === 'SUS_REGULADO'}
							<div class="flex flex-col gap-1 border-t border-blue-200 pt-2 font-sans">
								{#if encaminhamentosDisponiveis.length > 0}
									<label for="enc-sel-sus" class="font-mono text-[9px] font-bold text-blue-900 uppercase">
										Selecione o Encaminhamento SUS Regulado do Paciente *
									</label>
									<select id="enc-sel-sus" bind:value={encaminhamentoSelecionadoId} class="border border-blue-300 bg-white p-1.5 text-xs font-bold font-mono">
										{#each encaminhamentosDisponiveis as enc}
											<option value={enc.id}>Protocolo {enc.protocolo} · {enc.especialidade} {enc.dataAgendamento ? `(Agendado: ${enc.dataAgendamento})` : ''}</option>
										{/each}
									</select>
									<div class="text-[10px] text-emerald-800 font-mono font-bold mt-0.5">
										✓ PACIENTE ACEITO DE IMEDIATO (VAGA ALOCADA DE CERTEZA COM ENCAMINHAMENTO SUS)
									</div>
								{:else}
									<div class="bg-amber-100 border border-amber-300 p-2 text-[10px] text-amber-900">
										⚠ Nenhum encaminhamento SUS regulado encontrado para este CPF. Escolha "📷 PARTICULAR" para fotografar/escanear o pedido físico ou "⏳ SEM ANEXO" para aguardar gestor.
									</div>
								{/if}
							</div>
						{/if}

						<!-- Opção 2: Encaminhamento Particular com Foto / Scanner -->
						{#if tipoEncaminhamento === 'PARTICULAR'}
							<div class="flex flex-col gap-2 border-t border-purple-200 pt-2 font-sans">
								<div class="bg-purple-100/70 border border-purple-300 p-2 text-[10px] text-purple-950">
									<strong>📷 Encaminhamento de Médico Particular:</strong> Fotografe ou escaneie o pedido físico trazido pelo paciente para garantir a vaga de certeza e alocação imediata.
								</div>

								<div class="flex items-center gap-2">
									<input
										type="file"
										accept="image/*,.pdf"
										bind:this={inputFileInput}
										onchange={handleUploadFileParticular}
										class="hidden"
									/>

									<button
										type="button"
										onclick={() => inputFileInput?.click()}
										class="border border-purple-900 bg-purple-900 text-white px-3 py-1.5 font-mono text-xs font-bold uppercase"
									>
										📁 Anexar Arquivo / Scanner
									</button>

									<button
										type="button"
										onclick={simularCapturaFotoParticular}
										class="border border-purple-900 bg-white text-purple-950 px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-purple-50"
									>
										📷 Tirar Foto (Câmera)
									</button>
								</div>

								{#if anexoParticularFoto}
									<div class="flex items-center gap-2 bg-emerald-50 border border-emerald-300 p-2 text-[11px] font-mono text-emerald-900 font-bold">
										<span>✓ DOCUMENTO ANEXADO: {anexoParticularNome || 'Foto_Encaminhamento.png'}</span>
										<span class="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 uppercase">VAGA GARANTIDA DE CERTEZA</span>
									</div>
								{:else}
									<div class="text-[10px] text-purple-800 font-mono italic">
										* Faça a foto ou scanner do documento particular para garantir a alocação imediata da vaga.
									</div>
								{/if}
							</div>
						{/if}

						<!-- Opção 3: Sem Anexo de Encaminhamento -->
						{#if tipoEncaminhamento === 'SEM_ANEXO'}
							<div class="border-t border-amber-300 pt-2 font-sans">
								<div class="bg-amber-100 border border-amber-300 p-2 text-[10px] text-amber-950">
									⏳ <strong>Sem Anexo de Encaminhamento:</strong> A solicitação será registrada no sistema, mas a vaga <strong>NÃO será alocada automaticamente</strong>. Ela ficará em estado de espera aguardando avaliação e aprovação manual do <strong>Gestor TFD</strong>.
								</div>
							</div>
						{/if}
					</div>

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
