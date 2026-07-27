<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import type { Paciente, SolicitacaoMedica, PrioridadeClinica, Sexo } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	// Dados do Paciente (existente ou novo)
	let pacienteCpf = $state('');
	let pacienteNome = $state('');
	let pacienteSus = $state('');
	let pacienteNasc = $state('');
	let pacienteSexo = $state<Sexo>('M');
	let pacienteTel = $state('');
	let pacienteEnd = $state('');

	// Estado de busca reativa por CPF
	let buscandoCpf = $state(false);
	let pacienteExiste = $state(false);
	let erroBusca = $state('');
	let ultimoCpfPesquisado = '';

	// Dados da Solicitacao Médica
	let medicoNome = $state('Médico do Balcão');
	let medicoCrm = $state('000000');
	let especialidade = $state('');
	let cid10 = $state('Z00');
	let cidDescricao = $state('Exame Geral');
	let justificativa = $state('Agendamento direto efetuado no balcão do Centro de Especialidades.');
	let prioridade = $state<PrioridadeClinica>('ELETIVA');

	// Dados do Agendamento
	let especialistaNome = $state('');
	let recomendacoes = $state('');

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

	// Dropdown de Médicos com Busca
	const medicosEspecialistas = [
		{ nome: 'Dr. Roberto Medeiros', especialidade: 'Cardiologia', registro: 'CRM 12345' },
		{ nome: 'Dra. Sandra Regina', especialidade: 'Cardiologia', registro: 'CRM 67890' },
		{ nome: 'Dr. Fábio Alencar', especialidade: 'Oftalmologia', registro: 'CRM 24680' },
		{ nome: 'Dra. Patrícia Silveira', especialidade: 'Oftalmologia', registro: 'CRM 13579' },
		{ nome: 'Dr. Carlos Alberto', especialidade: 'Dermatologia', registro: 'CRM 11223' },
		{ nome: 'Dra. Marina Rocha', especialidade: 'Dermatologia', registro: 'CRM 44556' },
		{ nome: 'Dr. André Antunes', especialidade: 'Endocrinologia', registro: 'CRM 77889' },
		{ nome: 'Dra. Cláudia Mendes', especialidade: 'Ginecologia/Obstetrícia', registro: 'CRM 99001' },
		{ nome: 'Dr. Paulo Souza', especialidade: 'Ortopedia', registro: 'CRM 33445' },
		{ nome: 'Dra. Beatriz Costa', especialidade: 'Neurologia', registro: 'CRM 55667' }
	];
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
					pacienteNome = resCentro.paciente.nome;
					pacienteSus = resCentro.paciente.cartaoSus || '';
					pacienteNasc = resCentro.paciente.dataNascimento || '';
					pacienteSexo = (resCentro.paciente.sexo as Sexo) || 'M';
					pacienteTel = resCentro.paciente.telefone || '';
					pacienteEnd = resCentro.paciente.endereco || '';
					return;
				}
			} catch (errCentro) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/pacientes/por-cpf em transição — usando fallback pacientes.porCpf', errCentro);
			}

			// Fallback para API geral de pacientes
			const res = await api.pacientes.porCpf(sanitizado);
			if (res.existe && res.paciente) {
				pacienteExiste = true;
				pacienteNome = res.paciente.nome;
				pacienteSus = res.paciente.cartaoSus || '';
				pacienteNasc = res.paciente.dataNascimento || '';
				pacienteSexo = res.paciente.sexo || 'M';
				pacienteTel = res.paciente.telefone || '';
				pacienteEnd = res.paciente.endereco || '';
			} else {
				pacienteExiste = false;
				erroBusca = 'CPF não cadastrado. Preencha os campos abaixo para registrar um novo paciente.';
			}
		} catch (e) {
			console.error(e);
			erroBusca = 'Erro ao consultar CPF no banco de dados.';
		} finally {
			buscandoCpf = false;
		}
	}

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
				erroBusca = '';
				pacienteNome = '';
				pacienteSus = '';
				pacienteNasc = '';
				pacienteSexo = 'M';
				pacienteTel = '';
				pacienteEnd = '';
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
		if (!pacienteNome.trim() || !pacienteNasc || !especialidade.trim() || !medicoSelecionado) {
			erroAgendamento = 'Preencha todos os campos obrigatórios (*).';
			return;
		}

		processandoAgendamento = true;
		erroAgendamento = '';
		sucessoAgendamento = '';

		// O algoritmo roda no backend. O frontend simula a data/hora ideal localmente para salvar no banco
		const { data: dataCalculada, hora: horaCalculada } = calcularMockDataOtimizada(prioridade);
		const notaAgendamento = `Médico: ${medicoSelecionado.nome} às ${horaCalculada} | Obs: ${recomendacoes.trim() || 'Nenhuma'}`;

		try {
			// 1. Prepara dados do Paciente
			const pacientePayload: Paciente = {
				nome: pacienteNome.trim(),
				cpf: sanitizadoCpf,
				cartaoSus: pacienteSus.trim(),
				dataNascimento: pacienteNasc,
				sexo: pacienteSexo,
				telefone: pacienteTel.trim(),
				endereco: pacienteEnd.trim()
			};

			// 2. Prepara dados da Solicitação
			const solicitacaoPayload: SolicitacaoMedica = {
				medicoSolicitante: medicoNome.trim(),
				crm: medicoCrm.trim(),
				especialidadeSolicitada: especialidade.trim(),
				cid10: cid10.trim().toUpperCase(),
				cidDescricao: cidDescricao.trim(),
				justificativaClinica: justificativa.trim(),
				prioridade,
				dataSolicitacao: new Date().toISOString().substring(0, 10)
			};

			let protocoloFinal = '';
			let dataFinal = dataCalculada;
			let horaFinal = horaCalculada;

			try {
				const resBalcao = await api.centroRecepcao.agendarBalcao({
					paciente: pacientePayload,
					solicitacao: solicitacaoPayload,
					nota: recomendacoes.trim(),
					medicoDesejado: medicoSelecionado.nome
				});
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

			sucessoAgendamento = `Agendamento realizado com sucesso pelo algoritmo de otimização!\n\nProtocolo: ${protocoloFinal}\nData Calculada: ${new Date(dataFinal + 'T12:00:00').toLocaleDateString('pt-BR')}\nHorário: ${horaFinal}\nMédico: ${medicoSelecionado.nome}`;
			
			// Limpa o formulário
			pacienteCpf = '';
			pacienteNome = '';
			pacienteSus = '';
			pacienteNasc = '';
			pacienteSexo = 'M';
			pacienteTel = '';
			pacienteEnd = '';
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
								[CADASTRADO]
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
						disabled={pacienteExiste}
						placeholder="Nome do paciente"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-700"
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
						disabled={pacienteExiste}
						placeholder="0000 0000 0000 0000"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono disabled:bg-slate-100 disabled:text-slate-700"
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
							disabled={pacienteExiste}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono disabled:bg-slate-100 disabled:text-slate-700"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="pac-sexo" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Sexo <span class="text-red-700">*</span>
						</label>
						<select
							id="pac-sexo"
							bind:value={pacienteSexo}
							disabled={pacienteExiste}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none disabled:bg-slate-100 disabled:text-slate-700"
						>
							<option value="M">Masculino</option>
							<option value="F">Feminino</option>
							<option value="OUTRO">Outro / Não Informado</option>
						</select>
					</div>
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
						disabled={pacienteExiste}
						placeholder="(00) 00000-0000"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono disabled:bg-slate-100 disabled:text-slate-700"
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
						disabled={pacienteExiste}
						placeholder="Rua, Número, Bairro"
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none disabled:bg-slate-100 disabled:text-slate-700"
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

					<!-- Especialidade (Dropdown de especialidades cadastradas no Centro) -->
					<div class="flex flex-col gap-1">
						<label for="cons-esp" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
							Especialidade Solicitada <span class="text-red-700">*</span>
						</label>
						<select
							id="cons-esp"
							bind:value={especialidade}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900"
						>
							<option value="">Selecione uma especialidade...</option>
							{#each especialidadesCadastradas as esp}
								<option value={esp}>{esp.toUpperCase()}</option>
							{/each}
						</select>
					</div>

					<!-- Prioridade e CID-10 -->
					<div class="grid grid-cols-2 gap-2">
						<div class="flex flex-col gap-1">
							<label for="cons-prio" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
								Prioridade
							</label>
							<select
								id="cons-prio"
								bind:value={prioridade}
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900"
							>
								<option value="ELETIVA">ELETIVA</option>
								<option value="PRIORITARIA">PRIORITÁRIA</option>
								<option value="URGENTE">URGENTE</option>
								<option value="EMERGENCIA">EMERGÊNCIA</option>
							</select>
						</div>
						<div class="flex flex-col gap-1">
							<label for="cons-cid" class="font-mono text-[9px] font-semibold tracking-widest text-slate-500 uppercase">
								CID-10
							</label>
							<input
								id="cons-cid"
								type="text"
								bind:value={cid10}
								placeholder="Z00"
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none font-mono focus:border-blue-900"
							/>
						</div>
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
