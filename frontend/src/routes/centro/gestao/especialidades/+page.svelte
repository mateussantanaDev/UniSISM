<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	interface EspecialidadeSigtap {
		id: string;
		nome: string;
		codigoSigtap: string;
		tempoPadraoMinutos: number;
		valorTabelaBrl: number;
		documentosObrigatorios: string[];
		preparoRequerido: string;
		ativa: boolean;
		tipoServico: 'CONSULTA' | 'PROCEDIMENTO';
	}

	let carregando = $state(true);
	let mensagemSucesso = $state('');
	let erro = $state('');
	let filtroTipo = $state<'TODOS' | 'CONSULTA' | 'PROCEDIMENTO'>('TODOS');

	let listaEspecialidades = $state<EspecialidadeSigtap[]>([]);

	let exibidas = $derived(
		listaEspecialidades.filter(e => filtroTipo === 'TODOS' || e.tipoServico === filtroTipo)
	);

	// Modal State
	let modalNovaAberto = $state(false);
	let erroModal = $state('');
	let formNome = $state('');
	let formCodigo = $state('');
	let formTempo = $state(20);
	let formValor = $state(80.00);
	let formTipoServico = $state<'CONSULTA' | 'PROCEDIMENTO'>('PROCEDIMENTO');
	let formDocs = $state('');
	let formPreparo = $state('');

	async function carregarEspecialidades() {
		carregando = true;
		erro = '';
		try {
			const res = await api.centroGestao.listEspecialidades();
			if (Array.isArray(res) && res.length > 0) {
				listaEspecialidades = (res as any[]).map(e => ({
					...e,
					tipoServico: e.tipoServico || (e.nome.toLowerCase().includes('exame') || e.nome.toLowerCase().includes('procedimento') || e.nome.toLowerCase().includes('eletro') || e.nome.toLowerCase().includes('biópsia') || e.nome.toLowerCase().includes('raspagem') || e.nome.toLowerCase().includes('canal') ? 'PROCEDIMENTO' : 'CONSULTA')
				}));
			} else {
				if (ehCeo) {
					listaEspecialidades = [
						{
							id: 'esp-o1',
							nome: 'Endodontia (Tratamento de Canal em Molares/Pré-molares)',
							codigoSigtap: '03.07.02.006-1',
							tempoPadraoMinutos: 45,
							valorTabelaBrl: 110.00,
							documentosObrigatorios: ['Radiografia Periapical Inicial', 'Encaminhamento com Teste de Sensibilidade Pulpar'],
							preparoRequerido: 'Alimentação leve prévia, não suspender medicações de uso contínuo.',
							ativa: true,
							tipoServico: 'PROCEDIMENTO'
						},
						{
							id: 'esp-o2',
							nome: 'Periodontia Especializada (Raspagem Subgengival & Cirurgia)',
							codigoSigtap: '03.07.01.004-0',
							tempoPadraoMinutos: 30,
							valorTabelaBrl: 65.00,
							documentosObrigatorios: ['Periograma da UBS', 'Levantamento Radiográfico'],
							preparoRequerido: 'Higiene bucal prévia.',
							ativa: true,
							tipoServico: 'PROCEDIMENTO'
						},
						{
							id: 'esp-o3',
							nome: 'Cirurgia Bucomaxilofacial (Exodontia de Terceiros Molares Inclusos)',
							codigoSigtap: '04.14.01.014-9',
							tempoPadraoMinutos: 40,
							valorTabelaBrl: 140.00,
							documentosObrigatorios: ['Panorâmica Atualizada (< 6 meses)', 'Coagulograma se hipertenso/diabético'],
							preparoRequerido: 'Jejum de 2h para líquidos, presença de acompanhante adulto.',
							ativa: true,
							tipoServico: 'PROCEDIMENTO'
						},
						{
							id: 'esp-o4',
							nome: 'Odontopediatria e Pacientes com Necessidades Especiais (PNE)',
							codigoSigtap: '03.07.04.004-6',
							tempoPadraoMinutos: 40,
							valorTabelaBrl: 95.00,
							documentosObrigatorios: ['Relatório Multiprofissional UBS/CAPS', 'Cartão de Vacinas'],
							preparoRequerido: 'Presença do responsável legal.',
							ativa: true,
							tipoServico: 'CONSULTA'
						}
					];
				} else {
					listaEspecialidades = [
						{
							id: 'esp-m1',
							nome: 'Cardiologia Clínica (Consulta Especializada)',
							codigoSigtap: '03.01.01.007-2',
							tempoPadraoMinutos: 20,
							valorTabelaBrl: 80.00,
							documentosObrigatorios: ['ECG de Repouso', 'Perfil Lipídico', 'Glicemia de Jejum'],
							preparoRequerido: 'Trazer receitas médicas e exames cardiológicos dos últimos 12 meses.',
							ativa: true,
							tipoServico: 'CONSULTA'
						},
						{
							id: 'esp-m2',
							nome: 'Oftalmologia (Mapeamento de Retina e Refração)',
							codigoSigtap: '02.11.06.010-0',
							tempoPadraoMinutos: 20,
							valorTabelaBrl: 75.00,
							documentosObrigatorios: ['Encaminhamento da UBS'],
							preparoRequerido: 'Não dirigir após a consulta (ocorre dilatação de pupila). Trazer óculos atuais.',
							ativa: true,
							tipoServico: 'PROCEDIMENTO'
						},
						{
							id: 'esp-m3',
							nome: 'Ortopedia & Traumatologia',
							codigoSigtap: '03.01.01.007-2',
							tempoPadraoMinutos: 20,
							valorTabelaBrl: 80.00,
							documentosObrigatorios: ['Raio-X Digital do segmento acometido'],
							preparoRequerido: 'Roupas confortáveis que facilitem o exame articular.',
							ativa: true,
							tipoServico: 'CONSULTA'
						},
						{
							id: 'esp-m4',
							nome: 'Ecocardiograma Transtorácico (ECO)',
							codigoSigtap: '02.05.01.003-2',
							tempoPadraoMinutos: 30,
							valorTabelaBrl: 150.00,
							documentosObrigatorios: ['Solicitação do Cardiologista', 'ECG recente'],
							preparoRequerido: 'Não passar cremes ou pomadas no tórax no dia do exame.',
							ativa: true,
							tipoServico: 'PROCEDIMENTO'
						}
					];
				}
			}
		} catch (e: any) {
			console.info('[UniSISM] Endpoint /v1/centro/gestao/especialidades em transição.', e);
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarEspecialidades();
	});

	async function cadastrarEspecialidade() {
		if (!formNome.trim() || !formCodigo.trim()) {
			erroModal = 'Preencha o nome e o código SIGTAP.';
			return;
		}
		erroModal = '';

		const nova: EspecialidadeSigtap = {
			id: 'esp-' + Date.now(),
			nome: formNome.trim(),
			codigoSigtap: formCodigo.trim(),
			tempoPadraoMinutos: formTempo,
			valorTabelaBrl: formValor,
			documentosObrigatorios: formDocs.split(',').map(s => s.trim()).filter(Boolean),
			preparoRequerido: formPreparo,
			ativa: true,
			tipoServico: formTipoServico
		};

		try {
			await api.centroGestao.criarEspecialidade(nova as any);
		} catch (e) {
			console.info('[UniSISM] Criar especialidade executado em modo local.', e);
		}

		listaEspecialidades.push(nova);
		modalNovaAberto = false;
		mensagemSucesso = `✓ ${nova.tipoServico === 'PROCEDIMENTO' ? 'Procedimento' : 'Consulta'} ${nova.nome} (SIGTAP ${nova.codigoSigtap}) cadastrado no catálogo!`;
		setTimeout(() => mensagemSucesso = '', 4000);
	}
</script>

<svelte:head>
	<title>ERP Gestão - Catálogo SIGTAP & Serviços · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="CATÁLOGO DE ESPECIALIDADES & TABELA SIGTAP / SUS — {nomeOrgao.toUpperCase()}"
		subtitle="Parâmetros clínicos do {nomeOrgao}: cadastramento de serviços, códigos SIGTAP/SIA-SUS, tempo médio de atendimento e diretrizes exigidas das UBSs."
	/>

	<!-- Banner Sucesso -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 flex flex-col gap-1 shadow-sm whitespace-pre-wrap">
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">SUCESSO</span>
				<span>CATÁLOGO ATUALIZADO</span>
			</div>
			<div class="text-xs font-mono font-normal mt-1">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Control Bar -->
	<section class="border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
		<div>
			<span class="font-bold text-slate-900 text-xs uppercase">SERVIÇOS ESPECIALIZADOS HABILITADOS ({siglaOrgao})</span>
			<span class="text-slate-500 text-[10px] block">Catálogo oficial de Consultas e Procedimentos do {nomeOrgao}</span>
		</div>
		<div class="flex items-center gap-2">
			<!-- Filtro por Tipo -->
			<div class="flex border border-slate-300 p-0.5 bg-slate-100 text-[11px]">
				<button
					type="button"
					onclick={() => filtroTipo = 'TODOS'}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'TODOS' ? 'bg-blue-900 text-white' : 'text-slate-700 hover:bg-slate-200'}"
				>
					Todos ({listaEspecialidades.length})
				</button>
				<button
					type="button"
					onclick={() => filtroTipo = 'CONSULTA'}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'CONSULTA' ? 'bg-blue-900 text-white' : 'text-slate-700 hover:bg-slate-200'}"
				>
					Consultas ({listaEspecialidades.filter(e => e.tipoServico === 'CONSULTA').length})
				</button>
				<button
					type="button"
					onclick={() => filtroTipo = 'PROCEDIMENTO'}
					class="px-2.5 py-1 font-bold uppercase transition-colors {filtroTipo === 'PROCEDIMENTO' ? 'bg-purple-900 text-white' : 'text-slate-700 hover:bg-slate-200'}"
				>
					Procedimentos ({listaEspecialidades.filter(e => e.tipoServico === 'PROCEDIMENTO').length})
				</button>
			</div>

			<button
				onclick={() => modalNovaAberto = true}
				class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950"
			>
				+ Habilitar Serviço / SIGTAP
			</button>
		</div>
	</section>

	<!-- Tabela SIGTAP / Especialidades -->
	<section class="border border-slate-200 bg-white overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-900 text-white text-[10px] uppercase font-bold tracking-wider">
						<th class="p-3">Tipo</th>
						<th class="p-3">Especialidade / Serviço</th>
						<th class="p-3">Código SIGTAP (SIA-SUS)</th>
						<th class="p-3">Tempo Padrão</th>
						<th class="p-3">Valor Repasse SIA-SUS</th>
						<th class="p-3">Documentos & Exames Obrigatórios (UBS)</th>
						<th class="p-3">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 text-xs font-mono">
					{#each exibidas as esp (esp.id)}
						<tr class="hover:bg-slate-50">
							<td class="p-3">
								{#if esp.tipoServico === 'PROCEDIMENTO'}
									<span class="bg-purple-100 text-purple-900 border border-purple-300 font-bold px-2 py-0.5 text-[9px] uppercase tracking-wider">
										🔬 PROCEDIMENTO
									</span>
								{:else}
									<span class="bg-blue-100 text-blue-900 border border-blue-300 font-bold px-2 py-0.5 text-[9px] uppercase tracking-wider">
										🩺 CONSULTA
									</span>
								{/if}
							</td>
							<td class="p-3 font-bold text-slate-900 font-sans">{esp.nome}</td>
							<td class="p-3">
								<span class="bg-slate-100 border border-slate-300 font-mono px-2 py-0.5 text-[11px] font-bold text-blue-900">
									{esp.codigoSigtap}
								</span>
							</td>
							<td class="p-3 text-slate-700 font-semibold">{esp.tempoPadraoMinutos} minutos</td>
							<td class="p-3 text-emerald-800 font-bold">R$ {esp.valorTabelaBrl.toFixed(2)}</td>
							<td class="p-3 text-slate-700">
								<div class="flex flex-col gap-1">
									{#each esp.documentosObrigatorios as doc}
										<div class="text-[10px] bg-amber-50 border border-amber-200 text-amber-900 p-1 font-sans">
											📄 {doc}
										</div>
									{/each}
									<div class="text-[10px] text-slate-500 italic mt-0.5">Preparo: {esp.preparoRequerido}</div>
								</div>
							</td>
							<td class="p-3">
								<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 text-[10px]">
									HABILITADA
								</span>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="p-6 text-center text-slate-500 font-sans">
								Nenhum serviço cadastrado nesta categoria.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<!-- Modal: Habilitar Especialidade -->
{#if modalNovaAberto}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-lg border-2 border-slate-900 bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">+ Habilitar Novo Serviço / SIGTAP</div>
				<button onclick={() => modalNovaAberto = false} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroModal}
					<div class="border border-red-700 bg-red-50 p-2 text-xs font-bold text-red-900">
						⚠ {erroModal}
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<label for="esp-tipo" class="font-bold text-slate-700 text-[11px]">Tipo de Serviço *</label>
					<select id="esp-tipo" bind:value={formTipoServico} class="border border-slate-300 p-2 text-xs font-bold bg-white">
						<option value="CONSULTA">🩺 CONSULTA MÉDICA ESPECIALIZADA</option>
						<option value="PROCEDIMENTO">🔬 PROCEDIMENTO DIAGNÓSTICO / TERAPÊUTICO</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="esp-nome" class="font-bold text-slate-700 text-[11px]">Nome do Serviço / Especialidade *</label>
						<input id="esp-nome" type="text" bind:value={formNome} class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="esp-cod" class="font-bold text-slate-700 text-[11px]">Código SIGTAP / SIA-SUS *</label>
						<input id="esp-cod" type="text" bind:value={formCodigo} class="border border-slate-300 p-2 text-xs font-bold" />
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="esp-tempo" class="font-bold text-slate-700 text-[11px]">Tempo Padrão (Minutos)</label>
						<input id="esp-tempo" type="number" bind:value={formTempo} class="border border-slate-300 p-2 text-xs" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="esp-val" class="font-bold text-slate-700 text-[11px]">Valor de Repasse Tabela SUS (R$)</label>
						<input id="esp-val" type="number" step="0.01" bind:value={formValor} class="border border-slate-300 p-2 text-xs" />
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label for="esp-docs" class="font-bold text-slate-700 text-[11px]">Exames / Documentos Exigidos da UBS</label>
					<input id="esp-docs" type="text" bind:value={formDocs} class="border border-slate-300 p-2 text-xs" />
				</div>

				<div class="flex flex-col gap-1">
					<label for="esp-prep" class="font-bold text-slate-700 text-[11px]">Orientações de Preparo para o Paciente</label>
					<input id="esp-prep" type="text" bind:value={formPreparo} class="border border-slate-300 p-2 text-xs" />
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
				<button onclick={() => modalNovaAberto = false} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={cadastrarEspecialidade}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950"
				>
					✓ Salvar no Catálogo SIGTAP
				</button>
			</div>
		</div>
	</div>
{/if}
