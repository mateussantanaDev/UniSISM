<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import RegistrarViagemTfd from '$lib/presentation/components/prontuario/RegistrarViagemTfd.svelte';
	import ConfirmarRemocao from '$lib/presentation/components/prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto, StatusViagemTFD, ViagemTFD } from '$lib/api/types';

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
		notificar('ok', 'Viagem TFD registrada.');
	}

	async function confirmarRemocao() {
		if (!removendoId) return;
		removendo = true;
		try {
			const atualizado = await api.pacientes.removeViagemTfd(p.id, removendoId);
			ctx.atualizar?.(atualizado);
			notificar('ok', 'Viagem removida.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
		} finally {
			removendo = false;
			removendoId = null;
		}
	}

	async function atualizarStatus(id: string, novoStatus: StatusViagemTFD) {
		try {
			const atualizado = await api.pacientes.updateViagemTfd(p.id, id, { status: novoStatus });
			ctx.atualizar?.(atualizado);
			notificar('ok', `Viagem marcada como ${novoStatus.replace('_', ' ').toLowerCase()}.`);
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao atualizar.');
		}
	}

	const statusTone: Record<StatusViagemTFD, string> = {
		AGENDADA: 'border-blue-700 bg-blue-50 text-blue-900',
		REALIZADA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		CANCELADA: 'border-red-700 bg-red-50 text-red-800',
		EM_ANDAMENTO: 'border-amber-600 bg-amber-50 text-amber-800'
	};

	const transporteLabel: Record<ViagemTFD['transporte'], string> = {
		VAN_SMS: 'Van SMS',
		AMBULANCIA: 'Ambulância',
		PASSAGEM_RODOVIARIA: 'Passagem Rodoviária',
		PASSAGEM_AEREA: 'Passagem Aérea'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function formatarBRL(v: number) {
		return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	let realizadas = $derived(p.viagensTFD.filter((v) => v.status === 'REALIZADA').length);
	let agendadas = $derived(p.viagensTFD.filter((v) => v.status === 'AGENDADA').length);
	let custoTotal = $derived(
		p.viagensTFD
			.filter((v) => v.status === 'REALIZADA')
			.reduce((acc, v) => acc + v.custoEstimadoBRL, 0)
	);
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
		<MetricCard
			label="Total de Viagens"
			value={p.viagensTFD.length}
			sublabel="Tratamento Fora do Domicílio"
		/>
		<MetricCard label="Realizadas" value={realizadas} sublabel="Concluídas" accent="success" />
		<MetricCard
			label="Agendadas"
			value={agendadas}
			sublabel="Em fila para viagem"
			accent="warning"
		/>
		<MetricCard
			label="Custo Acumulado"
			value={formatarBRL(custoTotal)}
			sublabel="Despesas SMS realizadas"
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Viagens TFD · Tratamento Fora do Domicílio"
			subtitle="Deslocamentos custeados pela SMS para atendimento especializado"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{p.viagensTFD.length} REGISTROS
			</span>
			{#if podeEditar}
				<PrimaryButton label="+ Viagem TFD" onclick={() => (modalAberto = true)} />
			{/if}
		</PanelHeader>

		{#if p.viagensTFD.length === 0}
			<div class="px-4 py-8 text-center font-mono text-xs text-slate-500">
				Nenhuma viagem TFD registrada para este paciente.
			</div>
		{:else}
			<ul class="divide-y divide-slate-100">
				{#each p.viagensTFD as v (v.id)}
					<li class="grid grid-cols-12 gap-3 px-4 py-4">
						<div class="col-span-12 flex items-start justify-between gap-3 md:col-span-8">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-sm font-bold text-blue-900">{v.protocolo}</span>
									<span
										class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {statusTone[
											v.status
										]}"
									>
										{v.status.replace('_', ' ')}
									</span>
									<span
										class="border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase"
									>
										{v.especialidade}
									</span>
								</div>
								<div class="mt-1.5 text-sm font-bold text-slate-900">
									{v.destino}
								</div>
								<div class="font-mono text-[11px] text-slate-600">{v.unidadeDestino}</div>
								<div class="mt-1.5 text-xs text-slate-700">
									<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
										Motivo:
									</span>
									{v.motivo}
								</div>
							</div>
						</div>

						<div class="col-span-12 md:col-span-4">
							<dl class="grid grid-cols-2 gap-2 font-mono text-[11px]">
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Ida</dt>
									<dd class="font-bold text-slate-900">{formatarData(v.dataIda)}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Volta</dt>
									<dd class="font-bold text-slate-900">{formatarData(v.dataVolta)}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Transporte</dt>
									<dd class="text-slate-900">{transporteLabel[v.transporte]}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Acompanhante</dt>
									<dd class="text-slate-900">{v.acompanhante ? 'Sim' : 'Não'}</dd>
								</div>
								<div class="col-span-2">
									<dt class="tracking-widest text-slate-500 uppercase">Custo Estimado</dt>
									<dd class="text-sm font-bold text-slate-900">
										{formatarBRL(v.custoEstimadoBRL)}
									</dd>
								</div>
							</dl>
							{#if podeEditar}
								<div
									class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2"
								>
									{#if v.status === 'AGENDADA'}
										<button
											type="button"
											onclick={() => atualizarStatus(v.id, 'EM_ANDAMENTO')}
											class="border border-amber-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase hover:border-amber-600 hover:bg-amber-50"
										>
											Iniciar
										</button>
									{/if}
									{#if v.status === 'EM_ANDAMENTO'}
										<button
											type="button"
											onclick={() => atualizarStatus(v.id, 'REALIZADA')}
											class="border border-emerald-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase hover:border-emerald-700 hover:bg-emerald-50"
										>
											Marcar Realizada
										</button>
									{/if}
									{#if v.status !== 'CANCELADA' && v.status !== 'REALIZADA'}
										<button
											type="button"
											onclick={() => atualizarStatus(v.id, 'CANCELADA')}
											class="border border-red-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Cancelar
										</button>
									{/if}
									<button
										type="button"
										onclick={() => (removendoId = v.id)}
										class="ml-auto border border-red-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
									>
										Remover
									</button>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Registrar Viagem TFD"
	subtitle="Despesa custeada pela SMS"
	maxWidth="xl"
>
	<RegistrarViagemTfd
		pacienteId={p.id}
		onCancel={() => (modalAberto = false)}
		onSalvo={handleSalvo}
	/>
</Modal>

<Modal
	isOpen={removendoId !== null}
	onClose={() => (removendoId = null)}
	title="Remover Viagem TFD"
	subtitle="Ação auditada"
	maxWidth="md"
>
	<ConfirmarRemocao
		mensagem="Remover esta viagem do histórico?"
		detalhe="Considere CANCELAR em vez de remover, para manter a trilha do orçamento."
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removendoId = null)}
	/>
</Modal>
