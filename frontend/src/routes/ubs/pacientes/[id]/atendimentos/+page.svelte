<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import RegistrarAtendimento from '$lib/presentation/components/prontuario/RegistrarAtendimento.svelte';
	import ConfirmarRemocao from '$lib/presentation/components/prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto, TipoAtendimento } from '$lib/api/types';
	import { separarDataHora } from '$lib/presentation/utils/stringUtils';

	const ctx = usePaciente();
	const auth = useAuth();
	let p = $derived(ctx.paciente!);
	let podeEditar = $derived(auth.podeConsolidarEncaminhamento || auth.ehAdminOuDev);
	let unidadePadrao = $derived(auth.me?.unidade ?? '');

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
		notificar('ok', 'Atendimento registrado.');
	}

	async function confirmarRemocao() {
		if (!removendoId) return;
		removendo = true;
		try {
			const atualizado = await api.pacientes.removeAtendimento(p.id, removendoId);
			ctx.atualizar?.(atualizado);
			removendoId = null;
			notificar('ok', 'Atendimento removido.');
		} catch (e) {
			console.error(e);
			notificar('erro', 'Falha ao remover atendimento.');
		} finally {
			removendo = false;
		}
	}

	function formatarDataHoraPartes(iso?: string | null) {
		if (!iso) return { data: '—', hora: 'Nunca atendido' };
		const str = new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		return separarDataHora(str);
	}

	let ultimoAtendimentoFmt = $derived(formatarDataHoraPartes(p.ultimoAtendimento));

	const tipoLabel: Record<TipoAtendimento, string> = {
		CONSULTA_MEDICA: 'Consulta Médica',
		ENFERMAGEM: 'Enfermagem',
		VACINACAO: 'Vacinação',
		CURATIVO: 'Curativo',
		ODONTOLOGICO: 'Odontológico',
		PROCEDIMENTO: 'Procedimentos',
		ACOLHIMENTO: 'Acolhimento'
	};

	const tipoTone: Record<TipoAtendimento, string> = {
		CONSULTA_MEDICA: 'border-blue-700 bg-blue-50 text-blue-900',
		ENFERMAGEM: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		VACINACAO: 'border-purple-700 bg-purple-50 text-purple-800',
		CURATIVO: 'border-amber-600 bg-amber-50 text-amber-800',
		ODONTOLOGICO: 'border-sky-700 bg-sky-50 text-sky-800',
		PROCEDIMENTO: 'border-slate-600 bg-slate-50 text-slate-700',
		ACOLHIMENTO: 'border-orange-600 bg-orange-50 text-orange-800'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let tipoFiltro = $state<'TODOS' | TipoAtendimento>('TODOS');

	let filtrados = $derived(
		tipoFiltro === 'TODOS' ? p.atendimentos : p.atendimentos.filter((a) => a.tipo === tipoFiltro)
	);

	let consultasMedicas = $derived(
		p.atendimentos.filter((a) => a.tipo === 'CONSULTA_MEDICA').length
	);
	let totalAno = $derived(
		p.atendimentos.filter((a) => {
			const d = new Date(a.data);
			return d.getFullYear() === new Date().getFullYear();
		}).length
	);

	const tipos: Array<'TODOS' | TipoAtendimento> = [
		'TODOS',
		'CONSULTA_MEDICA',
		'ENFERMAGEM',
		'VACINACAO',
		'ODONTOLOGICO',
		'ACOLHIMENTO'
	];

	const tipoFiltroLabel: Record<'TODOS' | TipoAtendimento, string> = {
		TODOS: 'Todos',
		CONSULTA_MEDICA: 'Médicas',
		ENFERMAGEM: 'Enfermagem',
		VACINACAO: 'Vacinação',
		CURATIVO: 'Curativos',
		ODONTOLOGICO: 'Odontológicos',
		PROCEDIMENTO: 'Procedimentos',
		ACOLHIMENTO: 'Acolhimentos'
	};
</script>

<div class="flex flex-col gap-4">
	{#if mensagem}
		<div
			class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
				{mensagem.tipo === 'ok'
				? 'border-emerald-700 bg-emerald-50 text-emerald-900'
				: 'border-red-700 bg-red-50 text-red-900'}"
		>
			{mensagem.tipo === 'ok' ? '✓' : '⚠'} {mensagem.texto}
		</div>
	{/if}

	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Total de Atendimentos" value={p.atendimentos.length} sublabel="Histórico completo" />
		<MetricCard label="Consultas Médicas" value={consultasMedicas} sublabel="Médicos da UBS" />
		<MetricCard
			label="Atendimentos no Ano"
			value={totalAno}
			sublabel={String(new Date().getFullYear())}
			accent="default"
		/>
		<MetricCard
			label="Último Atendimento"
			value={ultimoAtendimentoFmt.data}
			sublabel={ultimoAtendimentoFmt.hora}
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Histórico de Atendimentos"
			subtitle="Registros clínicos na UBS Central"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrados.length} / {p.atendimentos.length} REGISTROS
			</span>
			{#if podeEditar}
				<PrimaryButton label="+ Atendimento" onclick={() => (modalAberto = true)} />
			{/if}
		</PanelHeader>

		<div class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<span
				class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
			>
				Tipo
			</span>
			{#each tipos as t (t)}
				<button
					type="button"
					onclick={() => (tipoFiltro = t)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{tipoFiltro === t
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{tipoFiltroLabel[t]}
				</button>
			{/each}
		</div>

		<div>
			{#if filtrados.length === 0}
				<div class="px-4 py-8 text-center font-mono text-xs text-slate-500">
					Nenhum atendimento com o filtro selecionado.
				</div>
			{:else}
				<ul class="divide-y divide-slate-100">
					{#each filtrados as a (a.id)}
						{@const dtHora = formatarDataHoraPartes(a.data)}
						<li class="px-4 py-3">
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-start gap-3">
									<div class="text-right font-mono">
										<div class="text-[11px] font-bold text-slate-900">
											{dtHora.data}
										</div>
										<div class="text-[10px] text-slate-500">
											{dtHora.hora}
										</div>
									</div>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span
												class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {tipoTone[
													a.tipo
												]}"
											>
												{tipoLabel[a.tipo]}
											</span>
											<span class="font-mono text-[10px] font-bold text-blue-900">
												{a.cid10}
											</span>
										</div>
										<div class="mt-1 text-sm font-bold text-slate-900">
											{a.diagnostico}
										</div>
										<div class="mt-0.5 text-xs text-slate-700">
											<span class="font-semibold">Queixa:</span> {a.queixaPrincipal}
										</div>
										<div class="mt-1 text-xs text-slate-800">
											<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
												Conduta:
											</span>
											{a.conduta}
										</div>
										{#if a.prescricaoResumo}
											<div
												class="mt-1 border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700"
											>
												📋 {a.prescricaoResumo}
											</div>
										{/if}
									</div>
								</div>
								<div class="shrink-0 text-right font-mono text-[11px]">
									<div class="font-bold text-slate-900">{a.profissional}</div>
									<div class="text-slate-600">{a.registroProfissional}</div>
									<div class="text-slate-500">{a.especialidade}</div>
									<div class="text-slate-400">{a.unidade}</div>
									{#if podeEditar}
										<button
											type="button"
											onclick={() => (removendoId = a.id)}
											class="mt-1.5 border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Remover
										</button>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Registrar Atendimento"
	subtitle="Registro clínico que entra no prontuário"
	maxWidth="xl"
>
	<RegistrarAtendimento
		pacienteId={p.id}
		{unidadePadrao}
		onCancel={() => (modalAberto = false)}
		onSalvo={handleSalvo}
	/>
</Modal>

<Modal
	isOpen={removendoId !== null}
	onClose={() => (removendoId = null)}
	title="Remover Atendimento"
	subtitle="Ação auditada"
	maxWidth="md"
>
	<ConfirmarRemocao
		mensagem="Tem certeza que deseja remover este atendimento do prontuário?"
		detalhe="Considere apenas para cadastros indevidos. Correções devem ser feitas via novo atendimento."
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removendoId = null)}
	/>
</Modal>
