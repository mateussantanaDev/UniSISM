<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, ApiError, type AnexoUpload } from '$lib/api';
	import type { Paciente } from '$lib/api/types';
	import {
		setNovoEncaminhamentoContext,
		estadoInicial,
		complementosVazios
	} from '$lib/presentation/contexts/novoEncaminhamentoContext';
	import type { NovoEncaminhamentoState } from '$lib/presentation/contexts/novoEncaminhamentoContext';

	let { children } = $props();

	let state = $state<NovoEncaminhamentoState>(estadoInicial());

	async function extrairPdf(file: File) {
		state.solicitacaoFile = [file];
		state.extraindo = true;
		state.preenchido = false;
		state.protocoloCriado = null;
		state.erroConsolidar = '';
		state.pacienteExistente = null;
		state.camposFaltantes = [];
		state.cadastroCompleto = false;
		state.complementos = complementosVazios();

		try {
			const dados = await api.encaminhamentos.extractPdf(file);
			state.nomePaciente = dados.paciente.nome;
			state.cpf = dados.paciente.cpf;
			state.cartaoSus = dados.paciente.cartaoSus;
			state.dataNascimento = dados.paciente.dataNascimento;
			state.sexo = dados.paciente.sexo;
			state.telefone = dados.paciente.telefone;
			state.endereco = dados.paciente.endereco;

			state.medicoSolicitante = dados.solicitacao.medicoSolicitante;
			state.crm = dados.solicitacao.crm;
			state.especialidade = dados.solicitacao.especialidadeSolicitada;
			state.cid10 = dados.solicitacao.cid10;
			state.cidDescricao = dados.solicitacao.cidDescricao;
			state.justificativa = dados.solicitacao.justificativaClinica;
			state.prioridade = dados.solicitacao.prioridade;
			state.confianca = dados.confiancaExtracao;
			state.preenchido = true;

			// Enriquecimento: busca estável por CPF no backend.
			// GET /pacientes/por-cpf/:cpf nunca lança 404 — sempre retorna
			// { existe, paciente, camposFaltantes, completo }.
			if (state.cpf) {
				await buscarPorCpf(state.cpf);
			}
		} finally {
			state.extraindo = false;
		}
	}

	async function buscarPorCpf(cpf: string) {
		state.buscandoPaciente = true;
		try {
			const resp = await api.pacientes.porCpf(cpf);
			state.pacienteExistente = resp.paciente;
			state.camposFaltantes = resp.camposFaltantes;
			state.cadastroCompleto = resp.completo;
		} catch {
			// Falha silenciosa — tratamos como paciente novo. O POST do
			// encaminhamento continua funcionando (backend faz upsert).
			state.pacienteExistente = null;
			state.camposFaltantes = [];
			state.cadastroCompleto = false;
		} finally {
			state.buscandoPaciente = false;
		}
	}

	/**
	 * Monta o shape `Paciente` enviado no POST /encaminhamentos.
	 *
	 * Inclui os complementares preenchidos pelo usuário — o backend faz
	 * upsert incremental (preenche só o que está vazio no banco, nunca
	 * sobrescreve). Não precisa mais de PATCH separado.
	 */
	function montarPaciente(): Paciente {
		const c = state.complementos;
		const base: Paciente = {
			nome: state.nomePaciente,
			cpf: state.cpf,
			cartaoSus: state.cartaoSus,
			dataNascimento: state.dataNascimento,
			sexo: state.sexo,
			telefone: state.telefone,
			endereco: state.endereco
		};
		// Complementares — só incluímos quando há valor. Backend ignora ausentes.
		if (c.nomeSocial.trim()) base.nomeSocial = c.nomeSocial.trim();
		if (c.telefoneSecundario.trim()) base.telefoneSecundario = c.telefoneSecundario.trim();
		if (c.email.trim()) base.email = c.email.trim();
		if (c.nomeMae.trim()) base.nomeMae = c.nomeMae.trim();
		if (c.nomePai.trim()) base.nomePai = c.nomePai.trim();
		if (c.estadoCivil) base.estadoCivil = c.estadoCivil;
		if (c.escolaridade.trim()) base.escolaridade = c.escolaridade.trim();
		if (c.profissao.trim()) base.profissao = c.profissao.trim();
		if (c.racaCor) base.racaCor = c.racaCor;
		if (c.bairro.trim()) base.bairro = c.bairro.trim();
		if (c.municipio.trim()) base.municipio = c.municipio.trim();
		if (c.uf.trim()) base.uf = c.uf.trim().toUpperCase();
		if (c.cep.trim()) base.cep = c.cep.trim();
		return base;
	}

	function adicionarAnexos(files: File[]) {
		state.anexos = [...state.anexos, ...files];
	}

	function removerAnexo(index: number) {
		state.anexos = state.anexos.filter((_, i) => i !== index);
	}

	async function consolidar(): Promise<string | null> {
		if (state.consolidando) return null;
		state.consolidando = true;
		state.erroConsolidar = '';
		try {
			const anexos: AnexoUpload[] = state.anexos.map((f) => ({
				arquivo: f,
				nome: f.name,
				tipo: 'OUTRO'
			}));
			// Cadastro incremental: os complementares vão dentro do `paciente`.
			// Backend faz upsert atômico preservando valores já existentes.
			const resultado = await api.encaminhamentos.create({
				paciente: montarPaciente(),
				solicitacao: {
					medicoSolicitante: state.medicoSolicitante,
					crm: state.crm,
					especialidadeSolicitada: state.especialidade,
					cid10: state.cid10,
					cidDescricao: state.cidDescricao,
					justificativaClinica: state.justificativa,
					prioridade: state.prioridade,
					dataSolicitacao: new Date().toISOString().slice(0, 10)
				},
				solicitacaoPdf: state.solicitacaoFile[0],
				anexos
			});
			state.protocoloCriado = resultado.protocolo;
			return resultado.protocolo;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'DADOS_OBRIGATORIOS_AUSENTES':
						state.erroConsolidar =
							'Preencha todos os campos obrigatórios (nome, CPF, especialidade, CID-10).';
						break;
					case 'CPF_INVALIDO':
						state.erroConsolidar = 'CPF inválido — deve ter 11 dígitos.';
						break;
					case 'PAYLOAD_INVALIDO':
						state.erroConsolidar =
							'Payload inválido. Verifique especialidade, CID-10 e justificativa clínica.';
						break;
					case 'USUARIO_SEM_UBS':
						state.erroConsolidar = 'Seu usuário não tem UBS vinculada.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						state.erroConsolidar = 'Você não tem permissão para consolidar encaminhamentos.';
						break;
					default:
						state.erroConsolidar = e.message || 'Falha ao consolidar encaminhamento.';
				}
			} else {
				state.erroConsolidar = 'Falha de conexão com o servidor.';
			}
			return null;
		} finally {
			state.consolidando = false;
		}
	}

	function resetar() {
		Object.assign(state, estadoInicial());
	}

	setNovoEncaminhamentoContext({
		state,
		extrairPdf,
		adicionarAnexos,
		removerAnexo,
		consolidar,
		resetar
	});

	interface Step {
		numero: number;
		label: string;
		sub: string;
		href: string;
	}

	const steps: Step[] = [
		{ numero: 1, label: 'Upload', sub: 'PDF da Solicitação', href: '/ubs/novo-encaminhamento' },
		{
			numero: 2,
			label: 'Revisão',
			sub: 'Dados + Anexos',
			href: '/ubs/novo-encaminhamento/revisao'
		},
		{
			numero: 3,
			label: 'Confirmação',
			sub: 'Enviar à Secretaria',
			href: '/ubs/novo-encaminhamento/confirmacao'
		}
	];

	let currentPath = $derived(page.url.pathname);

	function statusDoStep(numero: number): 'done' | 'active' | 'locked' {
		const activeIndex = steps.findIndex((s) => s.href === currentPath);
		const i = numero - 1;
		if (i < activeIndex) return 'done';
		if (i === activeIndex) return 'active';
		return 'locked';
	}

	function podeIr(numero: number): boolean {
		if (numero === 1) return true;
		if (numero === 2) return state.preenchido;
		if (numero === 3) return state.preenchido && !!state.nomePaciente && !!state.especialidade;
		return false;
	}

	function irParaStep(numero: number) {
		if (!podeIr(numero)) return;
		goto(steps[numero - 1].href);
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Stepper -->
	<div class="border border-slate-200 bg-white">
		<ol class="flex items-stretch">
			{#each steps as step (step.numero)}
				{@const s = statusDoStep(step.numero)}
				{@const disponivel = podeIr(step.numero)}
				<li class="flex flex-1 items-stretch border-r border-slate-200 last:border-r-0">
					<button
						type="button"
						onclick={() => irParaStep(step.numero)}
						disabled={!disponivel}
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed
							{s === 'active' ? 'bg-white' : s === 'done' ? 'bg-slate-50' : 'bg-slate-50'}
							{disponivel && s !== 'active' ? 'hover:bg-white' : ''}"
					>
						<span
							class="flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-xs font-bold
								{s === 'active'
								? 'border-blue-900 bg-blue-900 text-white'
								: s === 'done'
									? 'border-emerald-700 bg-emerald-700 text-white'
									: 'border-slate-300 bg-white text-slate-400'}"
						>
							{s === 'done' ? '✓' : step.numero}
						</span>
						<div class="min-w-0 flex-1 leading-tight">
							<div
								class="font-mono text-[10px] tracking-widest uppercase
									{s === 'active' ? 'text-blue-900' : s === 'done' ? 'text-emerald-800' : 'text-slate-400'}"
							>
								PASSO {step.numero}
							</div>
							<div
								class="truncate font-mono text-xs font-bold uppercase
									{s === 'active' ? 'text-slate-900' : s === 'done' ? 'text-slate-900' : 'text-slate-500'}"
							>
								{step.label}
							</div>
							<div
								class="truncate text-[10px]
									{s === 'active' ? 'text-slate-600' : 'text-slate-400'}"
							>
								{step.sub}
							</div>
						</div>
						{#if step.numero < steps.length}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="h-4 w-4 shrink-0
									{s === 'done' ? 'text-emerald-700' : s === 'active' ? 'text-blue-900' : 'text-slate-300'}"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="m8.25 4.5 7.5 7.5-7.5 7.5"
								/>
							</svg>
						{/if}
					</button>
				</li>
			{/each}
		</ol>
	</div>

	{@render children()}
</div>
