<script lang="ts">
	import { onMount } from 'svelte';
	import type { PacienteCompleto } from '$lib/api/types';

	interface Props {
		paciente: PacienteCompleto;
		operador: string;
		prefeitura: string | null;
		unidade: string | null;
		onFechar: () => void;
	}

	let { paciente, operador, prefeitura, unidade, onFechar }: Props = $props();

	function formatarData(iso: string | null | undefined, comHora = false) {
		if (!iso) return '—';
		try {
			const d = new Date(iso);
			if (comHora) {
				return d.toLocaleString('pt-BR', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
			return d.toLocaleDateString('pt-BR');
		} catch {
			return iso;
		}
	}

	function formatarBRL(v: number) {
		return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	function idade(iso: string): number {
		const hoje = new Date();
		const nasc = new Date(iso);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return a;
	}

	const sexoLabel = { F: 'Feminino', M: 'Masculino', OUTRO: 'Outro' } as const;
	const racaLabel: Record<string, string> = {
		BRANCA: 'Branca',
		PRETA: 'Preta',
		PARDA: 'Parda',
		AMARELA: 'Amarela',
		INDIGENA: 'Indígena',
		NAO_INFORMADA: 'Não informada'
	};
	const estadoCivilLabel: Record<string, string> = {
		SOLTEIRO: 'Solteiro(a)',
		CASADO: 'Casado(a)',
		UNIAO_ESTAVEL: 'União Estável',
		DIVORCIADO: 'Divorciado(a)',
		VIUVO: 'Viúvo(a)',
		OUTRO: 'Outro'
	};
	const tipoAtendLabel: Record<string, string> = {
		CONSULTA_MEDICA: 'Consulta Médica',
		ENFERMAGEM: 'Enfermagem',
		VACINACAO: 'Vacinação',
		CURATIVO: 'Curativo',
		ODONTOLOGICO: 'Odontológico',
		PROCEDIMENTO: 'Procedimento',
		ACOLHIMENTO: 'Acolhimento'
	};
	const viaLabel: Record<string, string> = {
		INTRAMUSCULAR: 'IM',
		SUBCUTANEA: 'SC',
		ORAL: 'VO',
		INTRADERMICA: 'ID'
	};
	const transporteLabel: Record<string, string> = {
		VAN_SMS: 'Van SMS',
		AMBULANCIA: 'Ambulância',
		PASSAGEM_RODOVIARIA: 'Passagem Rodoviária',
		PASSAGEM_AEREA: 'Passagem Aérea'
	};

	function imprimir() {
		window.print();
	}

	// Gera data/hora atual do documento
	const geradoEm = new Date().toLocaleString('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	// Dispara ESC pra fechar
	onMount(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onFechar();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});
</script>

<!-- Overlay fixo por cima de tudo. O `print-scope` é alvo do @media print. -->
<div
	class="print-overlay fixed inset-0 z-50 flex flex-col overflow-auto bg-slate-100"
	role="dialog"
	aria-modal="true"
	aria-label="Impressão de prontuário"
>
	<!-- Toolbar (esconde no print) -->
	<div
		class="print-toolbar sticky top-0 z-10 flex items-center justify-between border-b-2 border-slate-900 bg-white px-6 py-3 shadow-md"
	>
		<div class="font-mono text-[11px] font-bold tracking-widest text-slate-900 uppercase">
			Prévia de Impressão · Prontuário
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={onFechar}
				class="border border-slate-300 bg-white px-3 py-1.5 font-mono text-[11px] font-bold tracking-widest text-slate-700 uppercase hover:border-slate-900 hover:text-slate-900"
			>
				Fechar (ESC)
			</button>
			<button
				type="button"
				onclick={imprimir}
				class="border border-blue-900 bg-blue-900 px-4 py-1.5 font-mono text-[11px] font-bold tracking-widest text-white uppercase hover:bg-blue-800"
			>
				Imprimir
			</button>
		</div>
	</div>

	<!-- Documento imprimível (A4) -->
	<article
		class="print-scope mx-auto my-6 w-full max-w-[210mm] bg-white p-8 shadow-lg print:my-0 print:shadow-none"
	>
		<!-- Cabeçalho institucional -->
		<header class="border-b-2 border-slate-900 pb-3">
			<div class="flex items-start justify-between">
				<div>
					<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						UNISISM · PRONTUÁRIO ELETRÔNICO DO PACIENTE
					</div>
					<h1 class="mt-1 font-mono text-lg font-bold text-slate-900">
						{prefeitura ?? 'PREFEITURA MUNICIPAL'}
					</h1>
					<div class="font-mono text-[11px] text-slate-700">
						{unidade ?? 'Unidade Básica de Saúde'}
					</div>
				</div>
				<div class="text-right font-mono text-[10px] tracking-wider text-slate-600 uppercase">
					<div>Impresso em {geradoEm}</div>
					<div>Operador: {operador}</div>
					<div class="mt-1 border border-slate-400 bg-slate-50 px-2 py-0.5 text-slate-700">
						USO INSTITUCIONAL · LGPD 13.709/2018
					</div>
				</div>
			</div>
		</header>

		<!-- Identificação do paciente -->
		<section class="mt-4 border border-slate-300 p-3">
			<h2
				class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				1 · Identificação
			</h2>
			<div class="grid grid-cols-12 gap-2 text-[11px]">
				<div class="col-span-9">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Nome completo
					</div>
					<div class="text-sm font-bold text-slate-900">{paciente.nome}</div>
					{#if paciente.nomeSocial}
						<div class="text-[11px] text-slate-700">(Social: {paciente.nomeSocial})</div>
					{/if}
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Idade / Sexo
					</div>
					<div class="text-sm font-bold text-slate-900">
						{idade(paciente.dataNascimento)} anos · {sexoLabel[paciente.sexo]}
					</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">CPF</div>
					<div class="font-mono text-slate-900">{paciente.cpf}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Cartão SUS
					</div>
					<div class="font-mono text-slate-900">{paciente.cartaoSus}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Nascimento
					</div>
					<div class="font-mono text-slate-900">{formatarData(paciente.dataNascimento)}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Grupo Sanguíneo
					</div>
					<div class="font-mono font-bold text-slate-900">{paciente.grupoSanguineo}</div>
				</div>
				<div class="col-span-6">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Nome da mãe
					</div>
					<div class="text-slate-900">{paciente.nomeMae || '—'}</div>
				</div>
				<div class="col-span-6">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Nome do pai
					</div>
					<div class="text-slate-900">{paciente.nomePai || '—'}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Estado Civil
					</div>
					<div class="text-slate-900">{estadoCivilLabel[paciente.estadoCivil] ?? '—'}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Raça/Cor</div>
					<div class="text-slate-900">{racaLabel[paciente.racaCor] ?? '—'}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Escolaridade
					</div>
					<div class="text-slate-900">{paciente.escolaridade || '—'}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Profissão</div>
					<div class="text-slate-900">{paciente.profissao || '—'}</div>
				</div>
				<div class="col-span-4">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Telefone</div>
					<div class="font-mono text-slate-900">{paciente.telefone || '—'}</div>
				</div>
				<div class="col-span-4">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Tel. Secundário
					</div>
					<div class="font-mono text-slate-900">{paciente.telefoneSecundario || '—'}</div>
				</div>
				<div class="col-span-4">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Email</div>
					<div class="font-mono text-slate-900">{paciente.email || '—'}</div>
				</div>
				<div class="col-span-12">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">Endereço</div>
					<div class="text-slate-900">
						{paciente.endereco}
						{#if paciente.bairro}· {paciente.bairro}{/if}
						{#if paciente.municipio}· {paciente.municipio}{/if}
						{#if paciente.uf}/{paciente.uf}{/if}
						{#if paciente.cep}· CEP {paciente.cep}{/if}
					</div>
				</div>
				<div class="col-span-6">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Equipe de Saúde da Família
					</div>
					<div class="text-slate-900">{paciente.equipeSaudeFamilia || '—'}</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						ACS / Microárea
					</div>
					<div class="text-slate-900">
						{paciente.agenteComunitario || '—'}
						{#if paciente.microarea}
							· Micro {paciente.microarea}{/if}
					</div>
				</div>
				<div class="col-span-3">
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
						Unidade Vinculada
					</div>
					<div class="text-slate-900">{paciente.unidadeVinculada}</div>
				</div>
			</div>
		</section>

		<!-- Alergias (crítico) -->
		<section class="mt-3 border-2 border-red-700 p-3">
			<h2
				class="mb-2 border-b border-red-300 pb-1 font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase"
			>
				⚠ 2 · Alergias Conhecidas · verificar antes de prescrever
			</h2>
			{#if paciente.alergias.length === 0}
				<div class="font-mono text-[11px] text-slate-600">
					Nenhuma alergia conhecida registrada.
				</div>
			{:else}
				<ul class="space-y-1 text-[11px]">
					{#each paciente.alergias as a (a.id)}
						<li class="flex items-start gap-3">
							<span class="font-bold text-red-800">●</span>
							<span>
								<strong>{a.substancia}</strong> ({a.tipo.toLowerCase()}) · gravidade
								<strong>{a.gravidade}</strong>{#if a.observacao}
									· {a.observacao}{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Condições crônicas + Medicamentos -->
		<section class="mt-3 grid grid-cols-2 gap-3">
			<div class="border border-slate-300 p-3">
				<h2
					class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					3 · Condições Crônicas
				</h2>
				{#if paciente.condicoesCronicas.length === 0}
					<div class="font-mono text-[11px] text-slate-600">Nenhuma condição crônica.</div>
				{:else}
					<ul class="space-y-1 text-[11px]">
						{#each paciente.condicoesCronicas as c (c.id)}
							<li>
								<strong class="font-mono text-blue-900">{c.cid10}</strong> — {c.descricao}
								<span class="text-slate-600">
									· desde {formatarData(c.desde)}
									· {c.ativo ? 'ATIVA' : 'encerrada'}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="border border-slate-300 p-3">
				<h2
					class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					4 · Medicamentos em Uso
				</h2>
				{#if paciente.medicamentosEmUso.length === 0}
					<div class="font-mono text-[11px] text-slate-600">Nenhum medicamento registrado.</div>
				{:else}
					<ul class="space-y-1 text-[11px]">
						{#each paciente.medicamentosEmUso as m (m.id)}
							<li>
								<strong>{m.nome}</strong>
								{m.dosagem} · {m.frequencia}
								<span class="text-slate-600">
									· {m.prescritor} · desde {formatarData(m.desde)}
									{#if !m.ativo}
										· SUSPENSO{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Histórico familiar -->
		<section class="mt-3 border border-slate-300 p-3">
			<h2
				class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				5 · Histórico Familiar
			</h2>
			{#if paciente.historicoFamiliar.length === 0}
				<div class="font-mono text-[11px] text-slate-600">Nenhum antecedente registrado.</div>
			{:else}
				<ul class="list-inside list-disc space-y-0.5 text-[11px]">
					{#each paciente.historicoFamiliar as h, i (i)}
						<li>{h}</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Page break antes do histórico clínico -->
		<div class="page-break"></div>

		<!-- Atendimentos -->
		<section class="mt-3 border border-slate-300 p-3">
			<h2
				class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				6 · Histórico de Atendimentos · {paciente.atendimentos.length} registros
			</h2>
			{#if paciente.atendimentos.length === 0}
				<div class="font-mono text-[11px] text-slate-600">Nenhum atendimento registrado.</div>
			{:else}
				<div class="space-y-2">
					{#each paciente.atendimentos as a (a.id)}
						<div class="border-b border-slate-200 pb-2 last:border-0">
							<div class="flex items-baseline justify-between">
								<div
									class="font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase"
								>
									{formatarData(a.data, true)} · {tipoAtendLabel[a.tipo] ?? a.tipo}
									{#if a.cid10}
										· <span class="text-blue-900">{a.cid10}</span>{/if}
								</div>
								<div class="font-mono text-[10px] text-slate-500">
									{a.profissional} · {a.registroProfissional} · {a.unidade}
								</div>
							</div>
							<div class="text-[11px] text-slate-800">
								<strong>Queixa:</strong>
								{a.queixaPrincipal}
							</div>
							<div class="text-[11px] text-slate-800">
								<strong>Diagnóstico:</strong>
								{a.diagnostico || '—'}
							</div>
							<div class="text-[11px] text-slate-800">
								<strong>Conduta:</strong>
								{a.conduta}
							</div>
							{#if a.prescricaoResumo}
								<div
									class="mt-1 border-l-2 border-slate-400 pl-2 font-mono text-[10px] text-slate-700"
								>
									Rx · {a.prescricaoResumo}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Exames -->
		<section class="mt-3 border border-slate-300 p-3">
			<h2
				class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				7 · Exames · {paciente.exames.length} registros
			</h2>
			{#if paciente.exames.length === 0}
				<div class="font-mono text-[11px] text-slate-600">Nenhum exame registrado.</div>
			{:else}
				<table class="w-full border-collapse text-[10px]">
					<thead>
						<tr
							class="border-b border-slate-400 text-left font-mono tracking-wider text-slate-700 uppercase"
						>
							<th class="py-1 pr-2">Data</th>
							<th class="py-1 pr-2">Exame</th>
							<th class="py-1 pr-2">Cat.</th>
							<th class="py-1 pr-2">Solicitante</th>
							<th class="py-1 pr-2">Executor</th>
							<th class="py-1">Resultado</th>
						</tr>
					</thead>
					<tbody>
						{#each paciente.exames as e (e.id)}
							<tr class="border-b border-slate-100">
								<td class="py-1 pr-2 font-mono">{formatarData(e.data)}</td>
								<td class="py-1 pr-2">{e.tipo}</td>
								<td class="py-1 pr-2">{e.categoria}</td>
								<td class="py-1 pr-2">{e.solicitante}</td>
								<td class="py-1 pr-2">{e.unidadeExecutora}</td>
								<td class="py-1">
									<strong>{e.resultado}</strong>
									{#if e.observacao}
										— {e.observacao}{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<!-- Vacinação -->
		<section class="mt-3 border border-slate-300 p-3">
			<h2
				class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				8 · Caderneta de Vacinação · {paciente.vacinacoes.length} doses
			</h2>
			{#if paciente.vacinacoes.length === 0}
				<div class="font-mono text-[11px] text-slate-600">Nenhuma dose registrada.</div>
			{:else}
				<table class="w-full border-collapse text-[10px]">
					<thead>
						<tr
							class="border-b border-slate-400 text-left font-mono tracking-wider text-slate-700 uppercase"
						>
							<th class="py-1 pr-2">Data</th>
							<th class="py-1 pr-2">Vacina</th>
							<th class="py-1 pr-2">Dose</th>
							<th class="py-1 pr-2">Via</th>
							<th class="py-1 pr-2">Lote</th>
							<th class="py-1 pr-2">Aplicador</th>
							<th class="py-1">Unidade</th>
						</tr>
					</thead>
					<tbody>
						{#each paciente.vacinacoes as v (v.id)}
							<tr class="border-b border-slate-100">
								<td class="py-1 pr-2 font-mono">{formatarData(v.data)}</td>
								<td class="py-1 pr-2"><strong>{v.vacina}</strong></td>
								<td class="py-1 pr-2">{v.dose}</td>
								<td class="py-1 pr-2">{viaLabel[v.via] ?? v.via}</td>
								<td class="py-1 pr-2 font-mono">{v.lote}</td>
								<td class="py-1 pr-2">{v.aplicador}</td>
								<td class="py-1">{v.unidade}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<!-- Viagens TFD -->
		{#if paciente.viagensTFD.length > 0}
			<section class="mt-3 border border-slate-300 p-3">
				<h2
					class="mb-2 border-b border-slate-200 pb-1 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					9 · Viagens TFD · {paciente.viagensTFD.length} registros
				</h2>
				<div class="space-y-2">
					{#each paciente.viagensTFD as v (v.id)}
						<div class="border-b border-slate-200 pb-2 last:border-0">
							<div class="flex items-baseline justify-between text-[11px]">
								<div>
									<strong class="font-mono text-blue-900">{v.protocolo}</strong>
									· {v.destino} · {v.especialidade}
								</div>
								<div class="font-mono text-[10px] text-slate-600">
									{v.status.replace('_', ' ')}
								</div>
							</div>
							<div class="text-[10px] text-slate-700">
								{formatarData(v.dataIda)} → {formatarData(v.dataVolta)} ·
								{transporteLabel[v.transporte] ?? v.transporte}
								{#if v.acompanhante}
									· com acompanhante{/if}
								· {formatarBRL(v.custoEstimadoBRL)}
							</div>
							<div class="text-[11px] text-slate-700 italic">Motivo: {v.motivo}</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Rodapé -->
		<footer
			class="mt-6 border-t-2 border-slate-900 pt-2 font-mono text-[9px] tracking-wider text-slate-600 uppercase"
		>
			<div class="flex justify-between">
				<span>UNISISM · Prontuário · Paciente #{paciente.id}</span>
				<span>Página <span class="print-page"></span></span>
			</div>
			<div class="mt-0.5 text-[8px]">
				Documento sigiloso · uso institucional · Lei 13.709/2018 (LGPD) · Res. CFM 1.821/2007
			</div>
		</footer>
	</article>
</div>

<style>
	/* ────────────────────────────────────────────────────────────────
	 * @media print — ao disparar window.print(), apenas .print-scope
	 * aparece; toda a chrome (sidebar, header, toolbar) é escondida.
	 * ──────────────────────────────────────────────────────────────── */
	@media print {
		:global(body *) {
			visibility: hidden !important;
		}
		.print-overlay,
		.print-overlay * {
			visibility: visible !important;
		}
		.print-toolbar {
			display: none !important;
		}
		.print-overlay {
			position: static !important;
			background: white !important;
		}
		.print-scope {
			box-shadow: none !important;
			margin: 0 !important;
			max-width: none !important;
			width: 100% !important;
			padding: 10mm 12mm !important;
		}
		.page-break {
			page-break-before: always;
		}
		@page {
			size: A4;
			margin: 0;
		}
	}
</style>
