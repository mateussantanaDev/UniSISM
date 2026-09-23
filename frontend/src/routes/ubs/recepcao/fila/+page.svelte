<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		AtendimentoUbsItem,
		PrioridadeUbs,
		StatusAtendimentoUbs,
		TipoAtendimentoUbs,
		UsuarioListado
	} from '$lib/api/types';
	import { PRIORIDADE_LABEL, TIPO_ATENDIMENTO_LABEL } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	let itens = $state<AtendimentoUbsItem[]>([]);
	let medicos = $state<UsuarioListado[]>([]);
	let carregando = $state(true);
	let salvando = $state(false);
	let erro = $state('');
	let sucesso = $state('');

	// Contadores
	let total = $state(0);
	let aguardando = $state(0);
	let chamados = $state(0);
	let emAtendimento = $state(0);
	let concluidos = $state(0);
	let faltas = $state(0);

	// Filtros
	let filtroStatus = $state<'TODOS' | StatusAtendimentoUbs>('TODOS');
	let busca = $state('');
	let filtroMedico = $state('');

	// Modal Novo Atendimento
	let modalAberto = $state(false);
	let buscaCpf = $state('');
	let buscandoPaciente = $state(false);

	let pacienteId = $state('');
	let pacienteNome = $state('');
	let pacienteCpf = $state('');
	let pacienteCartaoSus = $state('');
	let pacienteDataNasc = $state('');
	let pacienteSexo = $state<'M' | 'F' | 'OUTRO'>('M');
	let pacienteTelefone = $state('');
	let pacienteEndereco = $state('');

	let tipoAtendimento = $state<TipoAtendimentoUbs>('CONSULTA_MEDICA');
	let prioridade = $state<PrioridadeUbs>('NORMAL');
	let medicoId = $state('');
	let consultorio = $state('Consultório 01');
	let queixaBreve = $state('');

	const prioridadeCores: Record<PrioridadeUbs, { badge: string; border: string }> = {
		URGENCIA: {
			badge: 'bg-red-600 text-white font-bold animate-pulse',
			border: 'border-l-4 border-l-red-600'
		},
		SUPER_PRIORIDADE_80: {
			badge: 'bg-purple-700 text-white font-bold',
			border: 'border-l-4 border-l-purple-700'
		},
		GESTANTE_LACTANTE: {
			badge: 'bg-pink-600 text-white font-semibold',
			border: 'border-l-4 border-l-pink-600'
		},
		PCD: {
			badge: 'bg-indigo-600 text-white font-semibold',
			border: 'border-l-4 border-l-indigo-600'
		},
		TEA: {
			badge: 'bg-teal-600 text-white font-semibold',
			border: 'border-l-4 border-l-teal-600'
		},
		IDOSO_60: {
			badge: 'bg-amber-600 text-white font-semibold',
			border: 'border-l-4 border-l-amber-600'
		},
		NORMAL: {
			badge: 'bg-slate-100 text-slate-700 border border-slate-300',
			border: 'border-l-4 border-l-slate-300'
		}
	};

	const statusCores: Record<StatusAtendimentoUbs, string> = {
		AGUARDANDO: 'bg-amber-50 border border-amber-500 text-amber-900',
		CHAMADO: 'bg-blue-600 text-white font-bold animate-bounce',
		EM_ATENDIMENTO: 'bg-emerald-700 text-white font-bold',
		CONCLUIDO: 'bg-slate-100 border border-slate-300 text-slate-700',
		FALTOU: 'bg-red-50 border border-red-400 text-red-800',
		CANCELADO: 'bg-slate-50 text-slate-400 border border-slate-200'
	};

	async function carregarFila() {
		carregando = true;
		erro = '';
		try {
			const res = await api.ubs.listarFila({
				medicoId: filtroMedico || undefined,
				busca: busca || undefined
			});
			itens = res.itens;
			total = res.total;
			aguardando = res.aguardando;
			chamados = res.chamados;
			emAtendimento = res.emAtendimento;
			concluidos = res.concluidos;
			faltas = res.faltas;
		} catch (e) {
			erro = 'Falha ao carregar a fila de atendimento da UBS.';
		} finally {
			carregando = false;
		}
	}

	async function carregarProfissionais() {
		try {
			const list = await api.admin.listUsuarios();
			medicos = list.filter(
				(u) =>
					u.role === 'MEDICO' ||
					u.role === 'MEDICO_ESPECIALISTA' ||
					u.role === 'COORDENADOR_UBS' ||
					u.role === 'ATENDENTE_UBS'
			);
		} catch {
			// silencioso
		}
	}

	onMount(() => {
		carregarFila();
		carregarProfissionais();

		const timer = setInterval(() => {
			if (!salvando && !modalAberto) {
				carregarFila();
			}
		}, 6000);

		return () => clearInterval(timer);
	});

	async function buscarPacientePorCpf() {
		const clean = buscaCpf.replace(/\D/g, '');
		if (clean.length !== 11) {
			erro = 'Digite um CPF válido com 11 dígitos para buscar.';
			return;
		}

		buscandoPaciente = true;
		erro = '';
		try {
			const res = await api.pacientes.porCpf(clean);
			if (res.existe && res.paciente) {
				pacienteId = res.paciente.id;
				pacienteNome = res.paciente.nome;
				pacienteCpf = res.paciente.cpf;
				pacienteCartaoSus = res.paciente.cartaoSus || '';
				pacienteDataNasc = res.paciente.dataNascimento
					? res.paciente.dataNascimento.slice(0, 10)
					: '';
				pacienteSexo = (res.paciente.sexo as any) || 'M';
				pacienteTelefone = res.paciente.telefone || '';
				pacienteEndereco = res.paciente.endereco || '';
				sucesso = 'Paciente localizado no cadastro!';
				setTimeout(() => (sucesso = ''), 3000);
			} else {
				pacienteCpf = clean;
				erro = 'Paciente não localizado. Preencha os campos abaixo para cadastrá-lo.';
			}
		} catch (e) {
			pacienteCpf = clean;
			erro = 'Paciente não localizado. Preencha os campos abaixo para cadastrá-lo.';
		} finally {
			buscandoPaciente = false;
		}
	}

	async function salvarEntradaFila() {
		if (!pacienteNome.trim()) {
			erro = 'Informe o nome do paciente.';
			return;
		}
		if (!pacienteCpf.trim()) {
			erro = 'Informe o CPF do paciente.';
			return;
		}

		salvando = true;
		erro = '';
		try {
			const medSel = medicos.find((m) => m.id === medicoId);
			await api.ubs.adicionarFila({
				pacienteId: pacienteId || undefined,
				paciente: !pacienteId
					? {
							nome: pacienteNome.trim(),
							cpf: pacienteCpf.replace(/\D/g, ''),
							cartaoSus: pacienteCartaoSus.trim() || undefined,
							dataNascimento: pacienteDataNasc || undefined,
							sexo: pacienteSexo,
							telefone: pacienteTelefone.trim() || undefined,
							endereco: pacienteEndereco.trim() || undefined
						}
					: undefined,
				tipoAtendimento,
				prioridade,
				medicoId: medicoId || undefined,
				medicoNome: medSel?.nome || undefined,
				crm: (medSel as any)?.crm || undefined,
				consultorio,
				queixaBreve: queixaBreve.trim() || undefined
			});

			modalAberto = false;
			limparFormulario();
			sucesso = 'Paciente inserido na fila com sucesso!';
			setTimeout(() => (sucesso = ''), 4000);
			await carregarFila();
		} catch (e) {
			if (e instanceof ApiError) {
				erro = e.message;
			} else {
				erro = 'Erro ao registrar atendimento na fila.';
			}
		} finally {
			salvando = false;
		}
	}

	async function chamarPaciente(item: AtendimentoUbsItem) {
		try {
			await api.ubs.chamarPaciente(item.id, {
				consultorio: item.consultorio,
				crm: item.crm || undefined
			});
			sucesso = `Chamada disparada no Painel de TV: ${item.pacienteNome} → ${item.consultorio}`;
			setTimeout(() => (sucesso = ''), 5000);
			await carregarFila();
		} catch (e) {
			erro = 'Falha ao acionar chamada no painel de TV.';
		}
	}

	async function alterarStatus(id: string, status: StatusAtendimentoUbs) {
		try {
			await api.ubs.atualizarStatus(id, { status });
			await carregarFila();
		} catch (e) {
			erro = 'Falha ao atualizar status do atendimento.';
		}
	}

	function limparFormulario() {
		buscaCpf = '';
		pacienteId = '';
		pacienteNome = '';
		pacienteCpf = '';
		pacienteCartaoSus = '';
		pacienteDataNasc = '';
		pacienteSexo = 'M';
		pacienteTelefone = '';
		pacienteEndereco = '';
		tipoAtendimento = 'CONSULTA_MEDICA';
		prioridade = 'NORMAL';
		medicoId = '';
		consultorio = 'Consultório 01';
		queixaBreve = '';
		erro = '';
	}

	let listaFiltrada = $derived(
		itens.filter((item) => {
			if (filtroStatus !== 'TODOS' && item.status !== filtroStatus) return false;
			return true;
		})
	);
</script>

<div class="flex flex-col gap-5 font-mono">
	{#if erro}
		<div class="border border-red-700 bg-red-50 p-3 text-xs font-bold text-red-900">
			⚠ {erro}
		</div>
	{/if}

	{#if sucesso}
		<div class="border border-emerald-700 bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
			✓ {sucesso}
		</div>
	{/if}

	<!-- Métricas do Dia -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-6">
		<MetricCard label="Total Hoje" value={total} sublabel="Atendimentos do dia" />
		<MetricCard
			label="Aguardando"
			value={aguardando}
			sublabel="Fila na recepção"
			accent="warning"
		/>
		<MetricCard label="Chamados" value={chamados} sublabel="Na sala de espera" accent="warning" />
		<MetricCard
			label="Em Consulta"
			value={emAtendimento}
			sublabel="Nos consultórios"
			accent="success"
		/>
		<MetricCard label="Concluídos" value={concluidos} sublabel="Finalizados" />
		<MetricCard label="Faltosos" value={faltas} sublabel="Não compareceram" accent="critical" />
	</section>

	<!-- Painel Principal da Fila -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Fila Diária de Atendimento & Acolhimento"
			subtitle="Ordem de Chegada + Prioridades SUS (Lei 10.048 / 80+ / Urgência)"
			index="01"
		>
			<div class="flex items-center gap-2">
				<a
					href="/ubs/recepcao/painel"
					target="_blank"
					class="border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 uppercase transition hover:bg-slate-200"
				>
					📺 Abrir Painel TV
				</a>
				<PrimaryButton
					label="+ Acolhimento / Entrada"
					shortcut="E"
					onclick={() => {
						limparFormulario();
						modalAberto = true;
					}}
				/>
			</div>
		</PanelHeader>

		<!-- Barra de Filtros e Busca -->
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3"
		>
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-[11px] font-bold text-slate-600 uppercase">Status:</span>
				{#each ['TODOS', 'AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU'] as st}
					<button
						type="button"
						onclick={() => (filtroStatus = st as any)}
						class="border px-2.5 py-1 text-[11px] font-bold uppercase transition
							{filtroStatus === st
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
					>
						{st}
					</button>
				{/each}
			</div>

			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={busca}
					placeholder="Buscar por Paciente, CPF ou Senha..."
					oninput={carregarFila}
					class="w-64 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-900 focus:outline-none"
				/>
				<button
					type="button"
					onclick={carregarFila}
					class="border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
				>
					Atualizar
				</button>
			</div>
		</div>

		<!-- Tabela de Pacientes na Fila -->
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-left text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-100 text-[10px] tracking-wider text-slate-600 uppercase"
					>
						<th class="px-3 py-2.5">Senha</th>
						<th class="px-3 py-2.5">Prioridade SUS</th>
						<th class="px-3 py-2.5">Paciente</th>
						<th class="px-3 py-2.5">Chegada</th>
						<th class="px-3 py-2.5">Serviço / Atendimento</th>
						<th class="px-3 py-2.5">Profissional & Sala</th>
						<th class="px-3 py-2.5 text-center">Status</th>
						<th class="px-3 py-2.5 text-right">Ações</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if carregando && itens.length === 0}
						<tr>
							<td colspan="8" class="p-8 text-center text-slate-500">
								Carregando fila diária da UBS...
							</td>
						</tr>
					{:else if listaFiltrada.length === 0}
						<tr>
							<td colspan="8" class="p-8 text-center text-slate-500">
								Nenhum paciente aguardando ou cadastrado para os filtros selecionados.
							</td>
						</tr>
					{:else}
						{#each listaFiltrada as item (item.id)}
							<tr
								class="transition-colors hover:bg-blue-50/40 {prioridadeCores[item.prioridade]
									.border}"
							>
								<!-- Senha -->
								<td class="px-3 py-2.5 font-mono text-sm font-black text-slate-900">
									{item.senha}
								</td>

								<!-- Prioridade -->
								<td class="px-3 py-2.5">
									<span
										class="inline-block px-2 py-0.5 text-[10px] tracking-wider uppercase {prioridadeCores[
											item.prioridade
										].badge}"
									>
										{PRIORIDADE_LABEL[item.prioridade]}
									</span>
								</td>

								<!-- Paciente -->
								<td class="px-3 py-2.5">
									<div class="font-bold text-slate-900">{item.pacienteNome}</div>
									<div class="text-[10px] text-slate-500">
										CPF: {item.pacienteCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
										{#if item.pacienteCartaoSus}
											· CNS: {item.pacienteCartaoSus}
										{/if}
									</div>
								</td>

								<!-- Chegada -->
								<td class="px-3 py-2.5 text-slate-700">
									{new Date(item.horarioChegada).toLocaleTimeString('pt-BR', {
										hour: '2-digit',
										minute: '2-digit'
									})}
								</td>

								<!-- Serviço -->
								<td class="px-3 py-2.5">
									<div class="font-medium text-slate-800">
										{TIPO_ATENDIMENTO_LABEL[item.tipoAtendimento]}
									</div>
									{#if item.queixaBreve}
										<div class="max-w-xs truncate text-[10px] text-slate-500 italic">
											"{item.queixaBreve}"
										</div>
									{/if}
								</td>

								<!-- Médico & Consultório -->
								<td class="px-3 py-2.5">
									<div class="font-bold text-blue-900">{item.consultorio}</div>
									<div class="text-[10px] text-slate-600">
										{item.medicoNome ? item.medicoNome : 'Qualquer Profissional Disponível'}
									</div>
								</td>

								<!-- Status -->
								<td class="px-3 py-2.5 text-center">
									<span
										class="inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusCores[
											item.status
										]}"
									>
										{item.status}
									</span>
								</td>

								<!-- Ações -->
								<td class="px-3 py-2.5 text-right">
									<div class="flex items-center justify-end gap-1.5">
										{#if item.status === 'AGUARDANDO' || item.status === 'CHAMADO'}
											<button
												type="button"
												onclick={() => chamarPaciente(item)}
												title="Disparar chamada no Painel de TV da Sala de Espera"
												class="border border-blue-800 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-900 transition hover:bg-blue-900 hover:text-white"
											>
												📢 Chamar TV
											</button>
										{/if}

										{#if item.status === 'CHAMADO'}
											<button
												type="button"
												onclick={() => alterarStatus(item.id, 'EM_ATENDIMENTO')}
												class="border border-emerald-700 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-900 transition hover:bg-emerald-700 hover:text-white"
											>
												▶ Iniciar
											</button>
										{/if}

										{#if item.status === 'EM_ATENDIMENTO'}
											<button
												type="button"
												onclick={() => alterarStatus(item.id, 'CONCLUIDO')}
												class="border border-slate-700 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-900 transition hover:bg-slate-800 hover:text-white"
											>
												✓ Concluir
											</button>
										{/if}

										{#if item.status === 'AGUARDANDO' || item.status === 'CHAMADO'}
											<button
												type="button"
												onclick={() => alterarStatus(item.id, 'FALTOU')}
												title="Registrar falta / não comparecimento"
												class="border border-red-300 bg-white px-1.5 py-1 text-[10px] font-bold text-red-700 hover:bg-red-50"
											>
												✕ Falta
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal de Acolhimento / Entrada na Fila -->
{#if modalAberto}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs"
	>
		<div
			class="w-full max-w-2xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white"
			>
				<div class="text-xs font-bold tracking-wider uppercase">
					Acolhimento & Entrada na Fila Diária (UBS)
				</div>
				<button
					onclick={() => (modalAberto = false)}
					class="text-sm font-bold text-slate-400 hover:text-white">✕</button
				>
			</div>

			<div class="p-5">
				<form
					onsubmit={(e) => {
						e.preventDefault();
						salvarEntradaFila();
					}}
					class="flex flex-col gap-4 font-mono text-xs"
				>
					{#if erro}
						<div class="border border-red-700 bg-red-50 p-2 text-xs font-bold text-red-900">
							⚠ {erro}
						</div>
					{/if}

					<!-- Busca Rápida por CPF -->
					<div class="border border-blue-200 bg-blue-50/50 p-3">
						<div class="mb-2 text-[11px] font-bold text-blue-900 uppercase">
							1. Identificação do Paciente (SUS)
						</div>
						<div class="flex items-center gap-2">
							<input
								type="text"
								bind:value={buscaCpf}
								placeholder="Digite o CPF para autocompletar..."
								class="flex-1 border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-900 focus:outline-none"
							/>
							<button
								type="button"
								onclick={buscarPacientePorCpf}
								disabled={buscandoPaciente}
								class="border border-blue-900 bg-blue-900 px-4 py-1.5 font-bold text-white uppercase hover:bg-blue-800 disabled:opacity-50"
							>
								{buscandoPaciente ? 'Buscando...' : 'Buscar CPF'}
							</button>
						</div>
					</div>

					<!-- Dados Básicos -->
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label for="f-nome" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
								Nome Completo do Paciente *
							</label>
							<input
								id="f-nome"
								type="text"
								bind:value={pacienteNome}
								required
								placeholder="Nome completo..."
								class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>

						<div>
							<label for="f-cpf" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
								CPF *
							</label>
							<input
								id="f-cpf"
								type="text"
								bind:value={pacienteCpf}
								required
								placeholder="000.000.000-00"
								class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>

						<div>
							<label for="f-cns" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
								Cartão Nacional do SUS (CNS)
							</label>
							<input
								id="f-cns"
								type="text"
								bind:value={pacienteCartaoSus}
								placeholder="Cartão SUS (opcional)"
								class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>

						<div>
							<label for="f-tel" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
								Telefone / WhatsApp
							</label>
							<input
								id="f-tel"
								type="text"
								bind:value={pacienteTelefone}
								placeholder="(00) 00000-0000"
								class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>
					</div>

					<!-- Classificação de Prioridade & Atendimento -->
					<div class="border-t border-slate-200 pt-3">
						<div class="mb-3 text-[11px] font-bold text-slate-900 uppercase">
							2. Classificação de Prioridade & Destino
						</div>

						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div>
								<label
									for="f-tipo"
									class="mb-1 block text-[10px] font-bold text-slate-700 uppercase"
								>
									Tipo de Atendimento *
								</label>
								<select
									id="f-tipo"
									bind:value={tipoAtendimento}
									class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
								>
									<option value="CONSULTA_MEDICA">Consulta Médica (Clínica Geral)</option>
									<option value="PRE_NATAL">Pré-Natal / Saúde da Mulher</option>
									<option value="HIPERDIA">Hiperdia (Hipertensão / Diabetes)</option>
									<option value="PUERICULTURA">Puericultura / Pediatria</option>
									<option value="ENFERMAGEM">Atendimento de Enfermagem</option>
									<option value="ACOLHIMENTO_TRIAGEM">Acolhimento / Triagem Inicial</option>
									<option value="VACINACAO">Vacinação / Sala de Vacina</option>
									<option value="CURATIVO">Curativos & Procedimentos</option>
									<option value="ODONTOLOGIA">Odontologia (Saúde Bucal UBS)</option>
								</select>
							</div>

							<div>
								<label
									for="f-prioridade"
									class="mb-1 block text-[10px] font-bold text-slate-700 uppercase"
								>
									Prioridade Legal / SUS *
								</label>
								<select
									id="f-prioridade"
									bind:value={prioridade}
									class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold focus:border-blue-900 focus:outline-none"
								>
									<option value="NORMAL">🔵 Normal (Ordem de Chegada)</option>
									<option value="SUPER_PRIORIDADE_80">🟣 Superprioridade (Idoso 80+ Anos)</option>
									<option value="IDOSO_60">🟠 Idoso (60 a 79 anos)</option>
									<option value="GESTANTE_LACTANTE">🌸 Gestante / Lactante / Criança de Colo</option
									>
									<option value="PCD">♿ Pessoa com Deficiência (PCD)</option>
									<option value="TEA">🧩 Autismo (Lei Romeo Mion - TEA)</option>
									<option value="URGENCIA">🔴 Urgência / Triagem com Risco Imediato</option>
								</select>
							</div>

							<div>
								<label
									for="f-medico"
									class="mb-1 block text-[10px] font-bold text-slate-700 uppercase"
								>
									Médico / Profissional Designado
								</label>
								<select
									id="f-medico"
									bind:value={medicoId}
									class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
								>
									<option value="">Qualquer Profissional Disponível</option>
									{#each medicos as m}
										<option value={m.id}>
											{m.nome} ({m.role}){(m as any).crm ? ` - CRM ${(m as any).crm}` : ''}
										</option>
									{/each}
								</select>
							</div>

							<div>
								<label
									for="f-sala"
									class="mb-1 block text-[10px] font-bold text-slate-700 uppercase"
								>
									Consultório / Sala *
								</label>
								<select
									id="f-sala"
									bind:value={consultorio}
									class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold focus:border-blue-900 focus:outline-none"
								>
									<option value="Consultório 01">Consultório 01 (Médico)</option>
									<option value="Consultório 02">Consultório 02 (Médico)</option>
									<option value="Consultório 03">Consultório 03 (Enfermagem / Pré-natal)</option>
									<option value="Sala de Triagem">Sala de Triagem / Acolhimento</option>
									<option value="Sala de Vacina">Sala de Vacinação</option>
									<option value="Sala de Curativo">Sala de Curativos / Procedimentos</option>
									<option value="Consultório Odontológico">Consultório Odontológico</option>
								</select>
							</div>
						</div>

						<div class="mt-3">
							<label
								for="f-queixa"
								class="mb-1 block text-[10px] font-bold text-slate-700 uppercase"
							>
								Queixa Principal / Motivo Breve
							</label>
							<input
								id="f-queixa"
								type="text"
								bind:value={queixaBreve}
								placeholder="Ex: Renovação de receita, dor lombar, febre há 2 dias..."
								class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
							/>
						</div>
					</div>

					<!-- Rodapé de Ações -->
					<div class="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
						<button
							type="button"
							onclick={() => (modalAberto = false)}
							class="border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={salvando}
							class="border border-blue-900 bg-blue-900 px-5 py-2 text-xs font-bold text-white uppercase hover:bg-blue-800 disabled:opacity-50"
						>
							{salvando ? 'Gerando Senha...' : '✓ Gerar Senha & Inserir na Fila'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
