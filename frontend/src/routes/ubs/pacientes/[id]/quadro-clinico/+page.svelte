<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import RegistrarAlergia from '$lib/presentation/components/prontuario/RegistrarAlergia.svelte';
	import RegistrarCondicaoCronica from '$lib/presentation/components/prontuario/RegistrarCondicaoCronica.svelte';
	import RegistrarMedicamento from '$lib/presentation/components/prontuario/RegistrarMedicamento.svelte';
	import ConfirmarRemocao from '$lib/presentation/components/prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto } from '$lib/api/types';

	const ctx = usePaciente();
	const auth = useAuth();
	let p = $derived(ctx.paciente!);

	// Quem pode cadastrar/editar prontuário: qualquer usuário UBS (operacional)
	// ou ADMIN/DEV (administrativo).
	let podeEditar = $derived(auth.podeConsolidarEncaminhamento || auth.ehAdminOuDev);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	const gravidadeTone = {
		LEVE: 'border-slate-400 bg-slate-50 text-slate-700',
		MODERADA: 'border-amber-600 bg-amber-50 text-amber-800',
		GRAVE: 'border-red-700 bg-red-50 text-red-800'
	} as const;

	const tipoAlergiaLabel = {
		MEDICAMENTO: 'Medicamento',
		ALIMENTO: 'Alimento',
		AMBIENTAL: 'Ambiental',
		OUTRO: 'Outro'
	} as const;

	let ativas = $derived(p.condicoesCronicas.filter((c) => c.ativo));
	let encerradas = $derived(p.condicoesCronicas.filter((c) => !c.ativo));
	let medsAtivos = $derived(p.medicamentosEmUso.filter((m) => m.ativo));
	let medsSuspensos = $derived(p.medicamentosEmUso.filter((m) => !m.ativo));

	// ═══ Estado dos modais ═══
	let modalAlergiaAberto = $state(false);
	let modalCondicaoAberto = $state(false);
	let modalMedicamentoAberto = $state(false);

	// Confirmação de remoção — genérica
	let removeAberto = $state(false);
	let removeLabel = $state('');
	let removeDetalhe = $state('');
	let removeExec = $state<() => Promise<PacienteCompleto>>(async () => p);
	let removendo = $state(false);

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function aplicarAtualizado(atualizado: PacienteCompleto, msg: string) {
		ctx.atualizar?.(atualizado);
		notificar('ok', msg);
	}

	function abrirRemover(label: string, detalhe: string, exec: () => Promise<PacienteCompleto>) {
		removeLabel = label;
		removeDetalhe = detalhe;
		removeExec = exec;
		removeAberto = true;
	}

	async function confirmarRemocao() {
		removendo = true;
		try {
			const atualizado = await removeExec();
			aplicarAtualizado(atualizado, 'Registro removido.');
			removeAberto = false;
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
			removeAberto = false;
		} finally {
			removendo = false;
		}
	}

	// ═══ Medicamento: toggle ativo (suspender/reativar) inline ═══
	async function toggleMedicamento(id: string, ativoAtual: boolean) {
		try {
			const atualizado = await api.pacientes.updateMedicamento(p.id, id, {
				ativo: !ativoAtual
			});
			aplicarAtualizado(
				atualizado,
				ativoAtual ? 'Medicamento suspenso.' : 'Medicamento reativado.'
			);
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao atualizar.');
		}
	}

	// ═══ Condição crônica: toggle ativo (encerrar/reativar) inline ═══
	async function toggleCondicao(id: string, ativoAtual: boolean) {
		try {
			const atualizado = await api.pacientes.updateCondicaoCronica(p.id, id, {
				ativo: !ativoAtual
			});
			aplicarAtualizado(atualizado, ativoAtual ? 'Condição encerrada.' : 'Condição reativada.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao atualizar.');
		}
	}

	// ═══ Histórico familiar · edição inline ═══
	let editandoHistorico = $state(false);
	let historicoItens = $state<string[]>([]);
	let novoHistorico = $state('');
	let salvandoHistorico = $state(false);

	function abrirEdicaoHistorico() {
		historicoItens = [...p.historicoFamiliar];
		novoHistorico = '';
		editandoHistorico = true;
	}

	function adicionarHistorico() {
		const v = novoHistorico.trim();
		if (!v) return;
		historicoItens = [...historicoItens, v];
		novoHistorico = '';
	}

	function removerHistorico(i: number) {
		historicoItens = historicoItens.filter((_, idx) => idx !== i);
	}

	async function salvarHistorico() {
		salvandoHistorico = true;
		try {
			const atualizado = await api.pacientes.setHistoricoFamiliar(p.id, historicoItens);
			aplicarAtualizado(atualizado, 'Histórico familiar atualizado.');
			editandoHistorico = false;
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao salvar histórico.');
		} finally {
			salvandoHistorico = false;
		}
	}
</script>

{#if mensagem}
	<div
		class="mb-3 border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
			{mensagem.tipo === 'ok'
			? 'border-emerald-700 bg-emerald-50 text-emerald-900'
			: 'border-red-700 bg-red-50 text-red-900'}"
	>
		{mensagem.tipo === 'ok' ? '✓' : '⚠'}
		{mensagem.texto}
	</div>
{/if}

<section class="grid grid-cols-12 gap-4">
	<!-- Alergias (crítico) -->
	<div class="col-span-12 border-2 border-red-700 bg-white">
		<PanelHeader
			title="⚠ Alergias"
			subtitle="Verificar antes de prescrever qualquer medicamento"
			index="01"
		>
			<span
				class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase"
			>
				{p.alergias.length} REGISTRADA{p.alergias.length === 1 ? '' : 'S'}
			</span>
			{#if podeEditar}
				<PrimaryButton
					label="+ Alergia"
					variant="secondary"
					onclick={() => (modalAlergiaAberto = true)}
				/>
			{/if}
		</PanelHeader>
		{#if p.alergias.length === 0}
			<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
				Nenhuma alergia registrada para este paciente.
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2">
				{#each p.alergias as a (a.id)}
					<div class="flex items-start justify-between gap-3 bg-white px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="text-sm font-bold text-slate-900">{a.substancia}</div>
							<div class="font-mono text-[11px] tracking-wider text-slate-600 uppercase">
								{tipoAlergiaLabel[a.tipo]}
							</div>
							{#if a.observacao}
								<div class="mt-1 text-xs text-slate-700">{a.observacao}</div>
							{/if}
						</div>
						<div class="flex shrink-0 items-start gap-2">
							<span
								class="border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {gravidadeTone[
									a.gravidade
								]}"
							>
								{a.gravidade}
							</span>
							{#if podeEditar}
								<button
									type="button"
									onclick={() =>
										abrirRemover(
											`Remover alergia "${a.substancia}"?`,
											'Essa informação é crítica — remova apenas se foi cadastro indevido.',
											() => api.pacientes.removeAlergia(p.id, a.id)
										)}
									class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
								>
									Remover
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Condições Crônicas -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader
			title="Condições Crônicas"
			subtitle="Problemas de saúde em acompanhamento"
			index="02"
		>
			<div class="flex items-center gap-1.5">
				<span
					class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
				>
					{ativas.length} ATIVA{ativas.length === 1 ? '' : 'S'}
				</span>
				{#if encerradas.length > 0}
					<span
						class="border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
					>
						{encerradas.length} ENCERRADA{encerradas.length === 1 ? '' : 'S'}
					</span>
				{/if}
			</div>
			{#if podeEditar}
				<PrimaryButton
					label="+ Condição"
					variant="secondary"
					onclick={() => (modalCondicaoAberto = true)}
				/>
			{/if}
		</PanelHeader>
		{#if p.condicoesCronicas.length === 0}
			<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
				Nenhuma condição crônica registrada.
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">CID-10</th>
							<th class="border-r border-slate-200 px-3 py-2">Descrição</th>
							<th class="border-r border-slate-200 px-3 py-2">Desde</th>
							<th class="border-r border-slate-200 px-3 py-2">Status</th>
							{#if podeEditar}
								<th class="px-3 py-2">Ações</th>
							{/if}
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each p.condicoesCronicas as c (c.id)}
							<tr class="border-b border-slate-100">
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{c.cid10}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<div class="font-sans font-semibold text-slate-900">{c.descricao}</div>
									{#if c.observacao}
										<div class="mt-0.5 font-sans text-[11px] text-slate-600">
											{c.observacao}
										</div>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarData(c.desde)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									{#if c.ativo}
										<span
											class="border border-amber-600 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-amber-800 uppercase"
										>
											ATIVA
										</span>
									{:else}
										<span
											class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase"
										>
											ENCERRADA
										</span>
									{/if}
								</td>
								{#if podeEditar}
									<td class="flex gap-1.5 px-3 py-2">
										<button
											type="button"
											onclick={() => toggleCondicao(c.id, c.ativo)}
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											{c.ativo ? 'Encerrar' : 'Reativar'}
										</button>
										<button
											type="button"
											onclick={() =>
												abrirRemover(
													`Remover condição "${c.descricao}"?`,
													'Considere "encerrar" em vez de remover para preservar histórico.',
													() => api.pacientes.removeCondicaoCronica(p.id, c.id)
												)}
											class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Remover
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Histórico familiar -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader
			title="Histórico Familiar"
			subtitle="Antecedentes de parentes de 1º grau"
			index="03"
		>
			{#if podeEditar && !editandoHistorico}
				<PrimaryButton label="Editar" variant="secondary" onclick={abrirEdicaoHistorico} />
			{/if}
		</PanelHeader>

		{#if editandoHistorico}
			<div class="flex flex-col gap-2 p-4">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={novoHistorico}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								adicionarHistorico();
							}
						}}
						placeholder="Ex.: Pai — Diabetes tipo 2"
						class="flex-1 border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
					<button
						type="button"
						onclick={adicionarHistorico}
						class="border border-blue-900 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:bg-blue-900 hover:text-white"
					>
						+ Add
					</button>
				</div>
				<ul class="divide-y divide-slate-100 border border-slate-200">
					{#if historicoItens.length === 0}
						<li class="px-3 py-3 text-center font-mono text-[11px] text-slate-500 uppercase">
							Lista vazia · digite acima
						</li>
					{:else}
						{#each historicoItens as h, i (i)}
							<li class="flex items-center justify-between px-3 py-2 text-xs text-slate-800">
								<span>{h}</span>
								<button
									type="button"
									onclick={() => removerHistorico(i)}
									class="text-[10px] font-bold tracking-widest text-red-700 uppercase hover:underline"
								>
									Remover
								</button>
							</li>
						{/each}
					{/if}
				</ul>
				<div class="flex justify-end gap-2">
					<PrimaryButton
						label="Cancelar"
						variant="secondary"
						onclick={() => (editandoHistorico = false)}
					/>
					<PrimaryButton
						label="Salvar Lista"
						onclick={salvarHistorico}
						loading={salvandoHistorico}
					/>
				</div>
			</div>
		{:else}
			<ul class="divide-y divide-slate-100 text-xs">
				{#if p.historicoFamiliar.length === 0}
					<li class="px-4 py-4 text-center font-mono text-slate-500">Nenhum registro.</li>
				{:else}
					{#each p.historicoFamiliar as h, i (i)}
						<li class="px-4 py-2.5 text-slate-800">{h}</li>
					{/each}
				{/if}
			</ul>
		{/if}
	</div>

	<!-- Medicamentos -->
	<div class="col-span-12 border border-slate-200 bg-white">
		<PanelHeader
			title="Medicamentos"
			subtitle="Prescrições contínuas em curso e suspensas"
			index="04"
		>
			<div class="flex items-center gap-1.5">
				<span
					class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
				>
					{medsAtivos.length} EM USO
				</span>
				{#if medsSuspensos.length > 0}
					<span
						class="border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
					>
						{medsSuspensos.length} SUSPENSO{medsSuspensos.length === 1 ? '' : 'S'}
					</span>
				{/if}
			</div>
			{#if podeEditar}
				<PrimaryButton
					label="+ Medicamento"
					variant="secondary"
					onclick={() => (modalMedicamentoAberto = true)}
				/>
			{/if}
		</PanelHeader>
		{#if p.medicamentosEmUso.length === 0}
			<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
				Nenhum medicamento registrado.
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">Medicamento</th>
							<th class="border-r border-slate-200 px-3 py-2">Dosagem</th>
							<th class="border-r border-slate-200 px-3 py-2">Posologia</th>
							<th class="border-r border-slate-200 px-3 py-2">Prescritor</th>
							<th class="border-r border-slate-200 px-3 py-2">Desde</th>
							<th class="border-r border-slate-200 px-3 py-2">Status</th>
							{#if podeEditar}
								<th class="px-3 py-2">Ações</th>
							{/if}
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each p.medicamentosEmUso as m (m.id)}
							<tr class="border-b border-slate-100">
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{m.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-800">
									{m.dosagem}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{m.frequencia}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{m.prescritor}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(m.desde)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									{#if m.ativo}
										<span
											class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800"
										>
											ATIVO
										</span>
									{:else}
										<span
											class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
										>
											SUSPENSO
										</span>
									{/if}
								</td>
								{#if podeEditar}
									<td class="flex gap-1.5 px-3 py-2">
										<button
											type="button"
											onclick={() => toggleMedicamento(m.id, m.ativo)}
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											{m.ativo ? 'Suspender' : 'Reativar'}
										</button>
										<button
											type="button"
											onclick={() =>
												abrirRemover(
													`Remover medicamento "${m.nome}"?`,
													'Considere "suspender" para preservar histórico.',
													() => api.pacientes.removeMedicamento(p.id, m.id)
												)}
											class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
										>
											Remover
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<!-- Modal Registrar Alergia -->
<Modal
	isOpen={modalAlergiaAberto}
	onClose={() => (modalAlergiaAberto = false)}
	title="Registrar Alergia"
	subtitle="Alerta crítico · auditado"
	maxWidth="md"
>
	<RegistrarAlergia
		pacienteId={p.id}
		onCancel={() => (modalAlergiaAberto = false)}
		onSalvo={(a) => {
			aplicarAtualizado(a, 'Alergia registrada.');
			modalAlergiaAberto = false;
		}}
	/>
</Modal>

<!-- Modal Registrar Condição Crônica -->
<Modal
	isOpen={modalCondicaoAberto}
	onClose={() => (modalCondicaoAberto = false)}
	title="Registrar Condição Crônica"
	subtitle="Diagnóstico em acompanhamento"
	maxWidth="lg"
>
	<RegistrarCondicaoCronica
		pacienteId={p.id}
		onCancel={() => (modalCondicaoAberto = false)}
		onSalvo={(a) => {
			aplicarAtualizado(a, 'Condição registrada.');
			modalCondicaoAberto = false;
		}}
	/>
</Modal>

<!-- Modal Registrar Medicamento -->
<Modal
	isOpen={modalMedicamentoAberto}
	onClose={() => (modalMedicamentoAberto = false)}
	title="Registrar Medicamento"
	subtitle="Prescrição contínua"
	maxWidth="lg"
>
	<RegistrarMedicamento
		pacienteId={p.id}
		onCancel={() => (modalMedicamentoAberto = false)}
		onSalvo={(a) => {
			aplicarAtualizado(a, 'Medicamento registrado.');
			modalMedicamentoAberto = false;
		}}
	/>
</Modal>

<!-- Modal Confirmação Genérica -->
<Modal
	isOpen={removeAberto}
	onClose={() => (removeAberto = false)}
	title="Confirmar Remoção"
	subtitle="Ação auditada"
	maxWidth="md"
>
	<ConfirmarRemocao
		mensagem={removeLabel}
		detalhe={removeDetalhe}
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removeAberto = false)}
	/>
</Modal>
