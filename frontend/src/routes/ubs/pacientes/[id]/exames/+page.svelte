<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import RegistrarExame from '$lib/presentation/components/prontuario/RegistrarExame.svelte';
	import ConfirmarRemocao from '$lib/presentation/components/prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api, ApiError } from '$lib/api';
	import type { ExameRealizado, PacienteCompleto, ResultadoExame } from '$lib/api/types';

	const ctx = usePaciente();
	const auth = useAuth();
	let p = $derived(ctx.paciente!);
	let podeEditar = $derived(auth.podeConsolidarEncaminhamento || auth.ehAdminOuDev);

	let modalAberto = $state(false);
	let removendoId = $state<string | null>(null);
	let removendo = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function handleSalvo(atualizado: PacienteCompleto) {
		ctx.atualizar?.(atualizado);
		modalAberto = false;
		notificar('ok', 'Exame registrado.');
	}

	async function confirmarRemocao() {
		if (!removendoId) return;
		removendo = true;
		try {
			const atualizado = await api.pacientes.removeExame(p.id, removendoId);
			ctx.atualizar?.(atualizado);
			notificar('ok', 'Exame removido.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
		} finally {
			removendo = false;
			removendoId = null;
		}
	}

	const resultadoTone: Record<ResultadoExame, string> = {
		NORMAL: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		ALTERADO: 'border-amber-600 bg-amber-50 text-amber-800',
		CRITICO: 'border-red-700 bg-red-50 text-red-800',
		PENDENTE: 'border-slate-400 bg-slate-50 text-slate-700'
	};

	const categoriaTone: Record<ExameRealizado['categoria'], string> = {
		LABORATORIAL: 'border-blue-700 bg-blue-50 text-blue-900',
		IMAGEM: 'border-purple-700 bg-purple-50 text-purple-800',
		FUNCIONAL: 'border-sky-700 bg-sky-50 text-sky-800',
		OUTROS: 'border-slate-400 bg-slate-50 text-slate-700'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	type FiltroCat = 'TODOS' | ExameRealizado['categoria'];
	let categoriaFiltro = $state<FiltroCat>('TODOS');

	let filtrados = $derived(
		categoriaFiltro === 'TODOS' ? p.exames : p.exames.filter((e) => e.categoria === categoriaFiltro)
	);

	let normais = $derived(p.exames.filter((e) => e.resultado === 'NORMAL').length);
	let alterados = $derived(p.exames.filter((e) => e.resultado === 'ALTERADO').length);
	let criticos = $derived(p.exames.filter((e) => e.resultado === 'CRITICO').length);

	const categorias: Array<{ valor: FiltroCat; label: string }> = [
		{ valor: 'TODOS', label: 'Todos' },
		{ valor: 'LABORATORIAL', label: 'Laboratoriais' },
		{ valor: 'IMAGEM', label: 'Imagem' },
		{ valor: 'FUNCIONAL', label: 'Funcionais' },
		{ valor: 'OUTROS', label: 'Outros' }
	];
</script>

<div class="flex flex-col gap-4">
	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-900'
				: 'border-red-700 bg-red-50 text-red-900'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'}
			{mensagem.texto}
		</div>
	{/if}

	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Total de Exames" value={p.exames.length} sublabel="Histórico completo" />
		<MetricCard label="Normais" value={normais} sublabel="Sem alterações" accent="success" />
		<MetricCard
			label="Alterados"
			value={alterados}
			sublabel="Requerem acompanhamento"
			accent="warning"
		/>
		<MetricCard label="Críticos" value={criticos} sublabel="Atenção imediata" accent="critical" />
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Histórico de Exames"
			subtitle="Laboratoriais, imagem e funcionais"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrados.length} / {p.exames.length} REGISTROS
			</span>
			{#if podeEditar}
				<PrimaryButton label="+ Exame" onclick={() => (modalAberto = true)} />
			{/if}
		</PanelHeader>

		<div class="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<span class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Categoria
			</span>
			{#each categorias as c (c.valor)}
				<button
					type="button"
					onclick={() => (categoriaFiltro = c.valor)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{categoriaFiltro === c.valor
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{c.label}
				</button>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Data</th>
						<th class="border-r border-slate-200 px-3 py-2">Exame</th>
						<th class="border-r border-slate-200 px-3 py-2">Categoria</th>
						<th class="border-r border-slate-200 px-3 py-2">Solicitante</th>
						<th class="border-r border-slate-200 px-3 py-2">Executor</th>
						<th class="border-r border-slate-200 px-3 py-2">Resultado</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if filtrados.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhum exame com o filtro selecionado.
							</td>
						</tr>
					{:else}
						{#each filtrados as e (e.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarData(e.data)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<div class="font-sans font-bold text-slate-900">{e.tipo}</div>
									{#if e.observacao}
										<div class="mt-0.5 font-sans text-[11px] text-slate-600">
											{e.observacao}
										</div>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase {categoriaTone[
											e.categoria
										]}"
									>
										{e.categoria}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{e.solicitante}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-600">
									{e.unidadeExecutora}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase {resultadoTone[
											e.resultado
										]}"
									>
										{e.resultado}
									</span>
								</td>
								<td class="flex gap-1.5 px-3 py-2">
									<button
										type="button"
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
									>
										Ver Laudo
									</button>
									{#if podeEditar}
										<button
											type="button"
											onclick={() => (removendoId = e.id)}
											class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Remover
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Registrar Exame"
	subtitle="Entrada no histórico clínico"
	maxWidth="lg"
>
	<RegistrarExame pacienteId={p.id} onCancel={() => (modalAberto = false)} onSalvo={handleSalvo} />
</Modal>

<Modal
	isOpen={removendoId !== null}
	onClose={() => (removendoId = null)}
	title="Remover Exame"
	subtitle="Ação auditada"
	maxWidth="md"
>
	<ConfirmarRemocao
		mensagem="Remover este exame do histórico?"
		detalhe="Apenas para cadastros indevidos. Resultados alterados devem ser corrigidos via novo registro."
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removendoId = null)}
	/>
</Modal>
