<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import RegistrarVacina from '$lib/presentation/components/prontuario/RegistrarVacina.svelte';
	import ConfirmarRemocao from '$lib/presentation/components/prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto, VacinaAplicada } from '$lib/api/types';

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
		notificar('ok', 'Dose registrada na caderneta.');
	}

	async function confirmarRemocao() {
		if (!removendoId) return;
		removendo = true;
		try {
			const atualizado = await api.pacientes.removeVacina(p.id, removendoId);
			ctx.atualizar?.(atualizado);
			notificar('ok', 'Registro removido.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
		} finally {
			removendo = false;
			removendoId = null;
		}
	}

	const viaLabel: Record<VacinaAplicada['via'], string> = {
		INTRAMUSCULAR: 'IM',
		SUBCUTANEA: 'SC',
		ORAL: 'VO',
		INTRADERMICA: 'ID'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function diasDesde(iso: string): number {
		return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
	}

	let noUltimoAno = $derived(p.vacinacoes.filter((v) => diasDesde(v.data) < 365).length);
	let vacinasDistintas = $derived(new Set(p.vacinacoes.map((v) => v.vacina)).size);
	let ultimaDose = $derived(p.vacinacoes[0]);
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
		<MetricCard label="Doses Aplicadas" value={p.vacinacoes.length} sublabel="Histórico completo" />
		<MetricCard
			label="Vacinas Distintas"
			value={vacinasDistintas}
			sublabel="Imunobiológicos únicos"
		/>
		<MetricCard
			label="No Último Ano"
			value={noUltimoAno}
			sublabel="Últimos 365 dias"
			accent="default"
		/>
		<MetricCard
			label="Última Aplicação"
			value={ultimaDose ? formatarData(ultimaDose.data) : '—'}
			sublabel={ultimaDose ? `há ${diasDesde(ultimaDose.data)} dias` : 'Nenhuma dose'}
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Caderneta de Vacinação"
			subtitle="Doses aplicadas registradas na sala de vacina"
			index="01"
		>
			<span
				class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
			>
				CADERNETA ATIVA
			</span>
			{#if podeEditar}
				<PrimaryButton label="+ Dose Aplicada" onclick={() => (modalAberto = true)} />
			{/if}
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Data</th>
						<th class="border-r border-slate-200 px-3 py-2">Vacina</th>
						<th class="border-r border-slate-200 px-3 py-2">Dose</th>
						<th class="border-r border-slate-200 px-3 py-2">Via</th>
						<th class="border-r border-slate-200 px-3 py-2">Lote</th>
						<th class="border-r border-slate-200 px-3 py-2">Aplicador</th>
						<th class="border-r border-slate-200 px-3 py-2">Unidade</th>
						{#if podeEditar}
							<th class="px-3 py-2">Ação</th>
						{/if}
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if p.vacinacoes.length === 0}
						<tr>
							<td
								colspan={podeEditar ? 8 : 7}
								class="px-3 py-8 text-center font-sans text-sm text-slate-500"
							>
								Nenhuma vacina aplicada registrada.
							</td>
						</tr>
					{:else}
						{#each p.vacinacoes as v (v.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarData(v.data)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{v.vacina}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border border-blue-900 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-blue-900 uppercase"
									>
										{v.dose}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center text-slate-700">
									{viaLabel[v.via]}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{v.lote}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{v.aplicador}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-600">
									{v.unidade}
								</td>
								{#if podeEditar}
									<td class="px-3 py-2">
										<button
											type="button"
											onclick={() => (removendoId = v.id)}
											class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Remover
										</button>
									</td>
								{/if}
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
	title="Registrar Aplicação de Vacina"
	subtitle="Entrada na caderneta digital"
	maxWidth="lg"
>
	<RegistrarVacina
		pacienteId={p.id}
		{unidadePadrao}
		onCancel={() => (modalAberto = false)}
		onSalvo={handleSalvo}
	/>
</Modal>

<Modal
	isOpen={removendoId !== null}
	onClose={() => (removendoId = null)}
	title="Remover Registro de Vacina"
	subtitle="Ação auditada"
	maxWidth="md"
>
	<ConfirmarRemocao
		mensagem="Remover esta aplicação da caderneta?"
		detalhe="A caderneta de vacinação é documento oficial — remova apenas em caso de erro de cadastro."
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removendoId = null)}
	/>
</Modal>
