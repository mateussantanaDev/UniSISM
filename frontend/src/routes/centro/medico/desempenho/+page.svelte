<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { obterIniciais } from '$lib/presentation/utils/stringUtils';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');
	let rotuloProfissional = $derived(
		ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista'
	);

	// State
	let carregando = $state(true);
	let medicoNome = $state('Especialista');
	let medicoCrm = $state('Regulação');
	let medicoEspecialidade = $state('Especialidade não informada');

	// Metrics
	let totalConsultasMes = $state(0);
	let tempoMedioMinutos = $state<number | null>(null);
	let taxaPresenca = $state(0);
	let totalPrescricoes = $state(0);
	let totalExamesPedidos = $state(0);

	let topCids = $state<{ cid: string; descricao: string; qtd: number }[]>([]);
	let topMedicamentos = $state<{ nome: string; qtd: number }[]>([]);

	onMount(async () => {
		try {
			const [me, encs] = await Promise.all([
				api.auth.me().catch(() => null),
				api.centroMedico.listRegistros({ status: 'APROVADO', centro: ehCeo ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES' }).catch(() => [])
			]);

			const encsCentro = encs.filter((e) => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return (
						f === 'CENTRO_ESPECIALIDADES' ||
						f === 'CEM' ||
						(f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO')
					);
				}
			});

			if (me && me.nome) {
				medicoNome = me.nome;
				medicoEspecialidade = (me as any).especialidade || 'Especialidade não informada';
				medicoCrm = (me as any).crm || 'Registro na escala';
			}

			const mes = new Date().toISOString().slice(0, 7);
			const consultasMes = encsCentro.filter(e => { const data=e.atendimentoConcluidoEm || e.agendamentoPrevisto; return data && new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife',year:'numeric',month:'2-digit'}).format(new Date(data))===mes; });
			const concluidas=consultasMes.filter(e=>e.statusAtendimentoCentro==='CONCLUIDO');
			const duracoes=concluidas.filter(e=>e.atendimentoIniciadoEm && e.atendimentoConcluidoEm).map(e=>(Date.parse(e.atendimentoConcluidoEm!)-Date.parse(e.atendimentoIniciadoEm!))/60000).filter(n=>n>=0);
			tempoMedioMinutos=duracoes.length ? Math.round(duracoes.reduce((a,b)=>a+b,0)/duracoes.length):null;
			totalConsultasMes = consultasMes.filter(e => e.statusAtendimentoCentro === 'CONCLUIDO').length;
			const faltas = consultasMes.filter(e => e.statusAtendimentoCentro === 'FALTOU').length;
			taxaPresenca = totalConsultasMes + faltas ? Math.round(100 * totalConsultasMes / (totalConsultasMes + faltas)) : 0;

			// Agrupa CIDs e estatísticas reais do servidor
			const mapaCid = new Map<string, { descricao: string; qtd: number }>();
			for (const e of concluidas) {
				const code = e.atendimentoSOAP?.cid10; if(!code) continue;
				const desc = e.atendimentoSOAP?.diagnostico || '';
				const actual = mapaCid.get(code) || { descricao: desc, qtd: 0 };
				actual.qtd += 1;
				mapaCid.set(code, actual);
			}

			topCids = Array.from(mapaCid.entries())
				.map(([cid, item]) => ({
					cid,
					descricao: item.descricao,
					qtd: item.qtd
				}))
				.sort((a, b) => b.qtd - a.qtd)
				.slice(0, 5);

			totalPrescricoes = concluidas.filter(e=>e.atendimentoSOAP?.prescricaoResumo?.trim()).length;
			totalExamesPedidos = consultasMes.flatMap(e=>e.documentosClinicos || []).filter(d=>d.tipo==='PEDIDO_EXAMES' && d.emitidoEm.startsWith(mes)).length;

		} catch (e) {
			console.info('[UniSISM] Carregando indicadores do especialista.', e);
		} finally {
			carregando = false;
		}
	});
</script>

<svelte:head>
	<title>ERP Médico - Desempenho & Indicadores | UniSISM Centro</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="PAINEL DE DESEMPENHO E INDICADORES CLÍNICOS DO ESPECIALISTA"
		subtitle="Acompanhamento individual da produtividade assistencial, tempo médio de consulta, diagnósticos CIDs mais frequentes e perfil de prescrição."
	/>

	<!-- Card Perfil do Médico -->
	<section class="flex items-center justify-between border border-slate-200 bg-white p-5">
		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center bg-blue-900 font-mono text-lg font-bold text-white"
			>
				{obterIniciais(medicoNome)}
			</div>
			<div>
				<div class="font-sans text-base font-bold text-slate-900">{medicoNome}</div>
				<div class="mt-0.5 text-xs font-bold text-blue-900">
					{medicoEspecialidade} · {medicoCrm}
				</div>
				<div class="mt-0.5 text-[10px] text-slate-500">
					Centro Municipal de Especialidades · Escala Ativa
				</div>
			</div>
		</div>
		<div class="text-right">
			<span
				class="border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900"
			>
				INDICADORES DO PROFISSIONAL
			</span>
		</div>
	</section>

	<!-- Grid de KPIs Médicos -->
	<section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				CONSULTAS NO MÊS
			</div>
			<div class="mt-2 font-sans text-3xl font-extrabold text-blue-900">{totalConsultasMes}</div>
			<div class="mt-2 font-mono text-[10px] text-slate-500">Atendimentos concluídos</div>
		</div>

		<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				TEMPO MÉDIO / CONSULTA
			</div>
			<div class="mt-2 font-sans text-3xl font-extrabold text-indigo-700">
				{tempoMedioMinutos === null ? 'Sem dados' : `${tempoMedioMinutos} min`}
			</div>
			<div class="mt-2 font-mono text-[10px] font-bold text-indigo-900">
				Calculado pelo início e conclusão registrados
			</div>
		</div>

		<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				TAXA DE PRESENÇA
			</div>
			<div class="mt-2 font-sans text-3xl font-extrabold text-emerald-700">{taxaPresenca}%</div>
			<div class="mt-2 font-mono text-[10px] text-emerald-800">Comparecimento dos agendados</div>
		</div>

		<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				RECEITAS EMITIDAS
			</div>
			<div class="mt-2 font-sans text-3xl font-extrabold text-purple-700">{totalPrescricoes}</div>
			<div class="mt-2 font-mono text-[10px] font-bold text-purple-900">
				Prescrições eletrônicas
			</div>
		</div>

		<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				EXAMES SOLICITADOS
			</div>
			<div class="mt-2 font-sans text-3xl font-extrabold text-amber-700">{totalExamesPedidos}</div>
			<div class="mt-2 font-mono text-[10px] font-bold text-amber-800">Pedidos complementares</div>
		</div>
	</section>

	<!-- Distribuição Diagnósticos & Prescrição -->
	<section class="grid grid-cols-1 gap-5 lg:grid-cols-12">
		<!-- Top CIDs Diagnosticados -->
		<div class="border border-slate-200 bg-white p-5 lg:col-span-6">
			<div class="flex items-center justify-between border-b border-slate-200 pb-3">
				<span class="text-sm font-bold tracking-wider text-slate-900 uppercase"
					>TOP DIAGNÓSTICOS (CID-10)</span
				>
				<span class="text-[10px] text-slate-500">FREQUÊNCIA NO MÊS</span>
			</div>

			<div class="mt-4 flex flex-col gap-3">
				{#each topCids as item}
					{@const pct = Math.round((item.qtd / totalConsultasMes) * 100)}
					<div>
						<div class="mb-1 flex justify-between text-xs font-semibold text-slate-800">
							<span><strong class="text-blue-900">{item.cid}</strong> — {item.descricao}</span>
							<span>{item.qtd} casos ({pct}%)</span>
						</div>
						<div class="h-2.5 w-full border border-slate-200 bg-slate-100">
							<div class="h-full bg-blue-900" style="width: {pct * 2}%"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Top Medicamentos Prescritos -->
		<div class="border border-slate-200 bg-white p-5 lg:col-span-6">
			<div class="flex items-center justify-between border-b border-slate-200 pb-3">
				<span class="text-sm font-bold tracking-wider text-slate-900 uppercase"
					>MEDICAMENTOS MAIS PRESCRITOS (REMUME)</span
				>
				<span class="text-[10px] text-slate-500">PRESCRIÇÕES MENSAL</span>
			</div>

			<div class="mt-4 flex flex-col gap-3">
				{#each topMedicamentos as item}
					{@const pct = Math.round((item.qtd / totalPrescricoes) * 100)}
					<div>
						<div class="mb-1 flex justify-between text-xs font-semibold text-slate-800">
							<span>💊 {item.nome}</span>
							<span>{item.qtd} prescrições ({pct}%)</span>
						</div>
						<div class="h-2.5 w-full border border-slate-200 bg-slate-100">
							<div class="h-full bg-emerald-700" style="width: {pct * 1.2}%"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>
</div>
