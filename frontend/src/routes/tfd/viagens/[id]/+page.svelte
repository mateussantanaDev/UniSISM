<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import SeatPicker from '$lib/presentation/components/SeatPicker.svelte';
	import EditarViagem from '$lib/presentation/components/EditarViagem.svelte';
	import { api } from '$lib/api';
	import { ApiError } from '$lib/api/client';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarData, formatarDataHora } from '$lib/presentation/utils/tfdFormat';
	import type {
		PresencaPassageiro,
		SolicitacaoTFD,
		ViagemFrota
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let v = $state<ViagemFrota | null>(null);
	let aprovadasDisponiveis = $state<SolicitacaoTFD[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	const id = $derived(page.params.id ?? '');

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function recarregar() {
		try {
			v = await api.tfd.viagens.byId(id);
		} catch (e) {
			erro = mensagemErroTfd(e);
		}
	}

	async function carregarAprovadas() {
		try {
			const todas = await api.tfd.solicitacoes.list({ status: 'APROVADA' });
			aprovadasDisponiveis = todas.filter((s) => !s.viagemId);
		} catch (e) {
			console.warn('Falha ao listar solicitações APROVADAS:', e);
		}
	}

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			await Promise.all([recarregar(), carregarAprovadas()]);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// Modal iniciar
	let editarAberto = $state(false);
	let iniciarAberto = $state(false);
	let kmInicial = $state('');

	// Modal concluir
	let concluirAberto = $state(false);
	let kmFinal = $state('');
	let observacoesConclusao = $state('');

	// Modal cancelar
	let cancelarAberto = $state(false);
	let motivoCancel = $state('');

	let processando = $state(false);

	async function iniciar() {
		if (!v || !kmInicial) return;
		processando = true;
		try {
			await api.tfd.viagens.iniciar(v.id, { kmInicialHodometro: Number(kmInicial) });
			iniciarAberto = false;
			kmInicial = '';
			await recarregar();
			notificar('ok', 'Viagem iniciada · auditoria registrada.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function concluir() {
		if (!v || !kmFinal) return;
		processando = true;
		try {
			await api.tfd.viagens.concluir(v.id, {
				kmFinalHodometro: Number(kmFinal),
				observacoes: observacoesConclusao.trim() || undefined
			});
			concluirAberto = false;
			kmFinal = '';
			observacoesConclusao = '';
			await recarregar();
			notificar('ok', 'Viagem concluída.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function cancelar() {
		if (!v || motivoCancel.trim().length < 10) return;
		processando = true;
		try {
			await api.tfd.viagens.cancelar(v.id, motivoCancel.trim());
			cancelarAberto = false;
			motivoCancel = '';
			await Promise.all([recarregar(), carregarAprovadas()]);
			notificar('ok', 'Viagem cancelada.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processando = false;
		}
	}

	async function marcarPresenca(passageiroId: string, presenca: PresencaPassageiro) {
		if (!v) return;
		try {
			await api.tfd.viagens.marcarPresenca(v.id, passageiroId, {
				presenca: presenca as 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU'
			});
			await recarregar();
			notificar('ok', `Presença registrada: ${presenca}.`);
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	// ─── Alocar passageiro com seat picker ───
	let alocarAberto = $state(false);
	let solAlvoId = $state<string | null>(null);
	let assentoEscolhido = $state<number | null>(null);

	function abrirAlocar() {
		solAlvoId = null;
		assentoEscolhido = null;
		alocarAberto = true;
	}

	async function alocar() {
		if (!v || !solAlvoId || !assentoEscolhido) return;
		processando = true;
		try {
			await api.tfd.viagens.alocarPassageiro(v.id, {
				solicitacaoId: solAlvoId,
				numeroAssento: assentoEscolhido
			});
			alocarAberto = false;
			await Promise.all([recarregar(), carregarAprovadas()]);
			notificar('ok', `Passageiro alocado no assento ${assentoEscolhido}.`);
		} catch (e) {
			if (e instanceof ApiError && e.code === 'ASSENTO_OCUPADO') {
				// recarrega viagem para refrescar mapa
				await recarregar();
				assentoEscolhido = null;
				notificar('erro', 'Assento já ocupado · escolha outro.');
			} else {
				notificar('erro', mensagemErroTfd(e));
			}
		} finally {
			processando = false;
		}
	}

	async function removerPassageiro(passageiroId: string) {
		if (!v) return;
		try {
			await api.tfd.viagens.removerPassageiro(v.id, passageiroId);
			await Promise.all([recarregar(), carregarAprovadas()]);
			notificar('ok', 'Passageiro removido · assento liberado.');
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		}
	}

	const presencaTone: Record<PresencaPassageiro, string> = {
		AGUARDANDO: 'border-slate-300 bg-slate-50 text-slate-700',
		CONFIRMADO: 'border-blue-700 bg-blue-50 text-blue-900',
		EMBARCADO: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		AUSENTE: 'border-red-700 bg-red-50 text-red-800',
		DESISTIU: 'border-amber-600 bg-amber-50 text-amber-800'
	};
</script>

<div class="flex flex-col gap-4">
	<button
		type="button"
		onclick={() => goto('/tfd/viagens')}
		class="self-start border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
	>
		← Voltar
	</button>

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

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white p-6">
			<div class="h-5 w-1/2 animate-pulse bg-slate-100"></div>
			<div class="mt-3 h-3 w-1/3 animate-pulse bg-slate-100"></div>
		</div>
	{:else if !v}
		<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
			<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
				Viagem não encontrada
			</div>
		</div>
	{:else}
		<div
			class="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-4 py-3"
		>
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					VIAGEM · {v.status.replace('_', ' ')}
				</div>
				<div class="font-mono text-base font-bold text-blue-900">
					{v.veiculoPlaca ?? '—'} → {v.destino}
				</div>
				<div class="font-mono text-[11px] text-slate-600">
					{formatarData(v.data)} · saída {v.horaSaida}
					{#if v.horaPrevistaRetorno}· retorno previsto {v.horaPrevistaRetorno}{/if}
				</div>
			</div>

			{#if podeOperar}
				<div class="flex flex-wrap gap-2">
					{#if v.status === 'AGENDADA'}
						<PrimaryButton label="Iniciar Viagem" onclick={() => (iniciarAberto = true)} />
						<PrimaryButton
							label="Editar"
							variant="secondary"
							onclick={() => (editarAberto = true)}
						/>
						<PrimaryButton
							label="Cancelar"
							variant="danger"
							onclick={() => (cancelarAberto = true)}
						/>
					{:else if v.status === 'EM_ANDAMENTO'}
						<PrimaryButton label="Concluir Viagem" onclick={() => (concluirAberto = true)} />
					{/if}
					<PrimaryButton
						label="Solicitar Abastecimento"
						variant="secondary"
						onclick={() => v && goto('/tfd/abastecimento?viagem=' + v.id)}
					/>
				</div>
			{/if}
		</div>

		<section class="grid grid-cols-12 gap-4">
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
				<PanelHeader title="Dados Operacionais" index="01" />
				<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4 text-xs">
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Motorista
						</dt>
						<dd class="mt-0.5 font-bold text-slate-900">
							<a href="/tfd/motoristas/{v.motoristaId}" class="text-blue-900 underline">
								{v.motoristaNome ?? '—'}
							</a>
						</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Veículo
						</dt>
						<dd class="mt-0.5 font-bold text-slate-900">
							<a href="/tfd/frota/{v.veiculoId}" class="text-blue-900 underline">
								{v.veiculoPlaca ?? '—'}
							</a>
							{#if v.veiculoModelo}· {v.veiculoModelo}{/if}
						</dd>
					</div>
					{#if v.unidadeDestino}
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Unidade Destino
							</dt>
							<dd class="mt-0.5 text-slate-900">{v.unidadeDestino}</dd>
						</div>
					{/if}
					{#if v.rotaResumo}
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Rota
							</dt>
							<dd class="mt-0.5 font-mono text-slate-700">{v.rotaResumo}</dd>
						</div>
					{/if}
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							KM Estimados
						</dt>
						<dd class="mt-0.5 font-mono text-slate-900">
							{v.kmEstimados ? v.kmEstimados.toLocaleString('pt-BR') : '—'}
						</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Hodôm. Inicial
						</dt>
						<dd class="mt-0.5 font-mono text-slate-900">
							{v.kmInicialHodometro ? v.kmInicialHodometro.toLocaleString('pt-BR') : '—'}
						</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Hodôm. Final
						</dt>
						<dd class="mt-0.5 font-mono text-slate-900">
							{v.kmFinalHodometro ? v.kmFinalHodometro.toLocaleString('pt-BR') : '—'}
						</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Vagas
						</dt>
						<dd class="mt-0.5 font-mono font-bold text-slate-900">
							{v.vagasOcupadas}/{v.vagasTotais}
						</dd>
					</div>
					{#if v.observacoes}
						<div class="col-span-12 border-l-4 border-slate-400 bg-slate-50 px-3 py-2">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Observações
							</dt>
							<dd class="mt-0.5 text-slate-700 italic">{v.observacoes}</dd>
						</div>
					{/if}
					{#if v.motivoCancelamento}
						<div class="col-span-12 border-l-4 border-red-700 bg-red-50 px-3 py-2">
							<dt
								class="font-mono text-[10px] font-semibold tracking-widest text-red-700 uppercase"
							>
								Motivo do Cancelamento
							</dt>
							<dd class="mt-0.5 text-red-900">{v.motivoCancelamento}</dd>
						</div>
					{/if}
				</dl>
			</div>

			<!-- Trilha -->
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
				<PanelHeader title="Trilha" index="02" />
				<ul class="divide-y divide-slate-100 px-4 py-2 font-mono text-[11px]">
					<li class="flex justify-between py-1.5">
						<span>Criada</span>
						<span class="text-slate-500">
							{formatarDataHora(v.criadaEm)}
						</span>
					</li>
					{#if v.iniciadaEm}
						<li class="flex justify-between py-1.5">
							<span>Iniciada (saída registrada)</span>
							<span class="text-slate-500">
								{formatarDataHora(v.iniciadaEm)}
							</span>
						</li>
					{/if}
					{#if v.concluidaEm}
						<li class="flex justify-between py-1.5">
							<span>Concluída</span>
							<span class="text-slate-500">
								{formatarDataHora(v.concluidaEm)}
							</span>
						</li>
					{/if}
				</ul>
			</div>
		</section>

		<!-- Mapa de assentos -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Mapa de Assentos"
				subtitle="Visualização da ocupação · clique '+ Alocar' para escolher um assento"
				index="03"
			>
				<span
					class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
				>
					{v.vagasTotais - v.vagasOcupadas} VAGAS LIVRES
				</span>
				{#if podeOperar && v.status === 'AGENDADA' && aprovadasDisponiveis.length > 0 && v.vagasOcupadas < v.vagasTotais}
					<PrimaryButton label="+ Alocar Passageiro" onclick={abrirAlocar} />
				{/if}
			</PanelHeader>
			<div class="p-4">
				<SeatPicker capacidade={v.vagasTotais} passageiros={v.passageiros} readonly />
			</div>
		</div>

		<!-- Passageiros (lista) -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Passageiros Alocados" index="04">
				<span
					class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
				>
					{v.passageiros.length} ALOCADOS
				</span>
			</PanelHeader>

			{#if v.passageiros.length === 0}
				<div class="px-4 py-6 text-center font-mono text-xs text-slate-500">
					Nenhum passageiro alocado.
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr
								class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
							>
								<th class="border-r border-slate-200 px-3 py-2 text-center">Assento</th>
								<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
								<th class="border-r border-slate-200 px-3 py-2">Acomp.</th>
								<th class="border-r border-slate-200 px-3 py-2">Presença</th>
								<th class="px-3 py-2">Ações</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#each [...v.passageiros].sort((a, b) => (a.numeroAssento ?? 999) - (b.numeroAssento ?? 999)) as p (p.id)}
								<tr class="border-b border-slate-100">
									<td class="border-r border-slate-100 px-3 py-2 text-center">
										<span
											class="inline-flex h-7 w-7 items-center justify-center border border-slate-400 bg-slate-100 font-mono text-xs font-bold text-slate-900"
										>
											{p.numeroAssento ?? '—'}
										</span>
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900"
									>
										{p.pacienteNome ?? '—'}
										{#if p.protocolo}
											<div class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
												{p.protocolo}
											</div>
										{/if}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-center text-slate-700">
										{p.acompanhante ? 'Sim' : '—'}
									</td>
									<td class="border-r border-slate-100 px-3 py-2">
										<span
											class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {presencaTone[
												p.presenca
											]}"
										>
											{p.presenca}
										</span>
									</td>
									<td class="px-3 py-2">
										{#if podeOperar && (v.status === 'AGENDADA' || v.status === 'EM_ANDAMENTO')}
											<div class="flex flex-wrap gap-1">
												<button
													type="button"
													onclick={() => marcarPresenca(p.id, 'EMBARCADO')}
													class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-800 uppercase hover:bg-emerald-100"
												>
													Embarcou
												</button>
												<button
													type="button"
													onclick={() => marcarPresenca(p.id, 'AUSENTE')}
													class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-red-800 uppercase hover:bg-red-100"
												>
													Faltou
												</button>
												<button
													type="button"
													onclick={() => marcarPresenca(p.id, 'DESISTIU')}
													class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-800 uppercase hover:bg-amber-100"
												>
													Desistiu
												</button>
												{#if v.status === 'AGENDADA'}
													<button
														type="button"
														onclick={() => removerPassageiro(p.id)}
														class="ml-2 border border-red-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
													>
														Remover
													</button>
												{/if}
											</div>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Modal Iniciar -->
<Modal
	isOpen={iniciarAberto}
	onClose={() => (iniciarAberto = false)}
	title="Iniciar Viagem"
	subtitle="Registre o hodômetro de saída"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
		>
			O hodômetro inicial é a leitura no momento da saída do veículo. Servirá de base para cálculo
			de KM rodados e consumo.
		</div>
		<FormField
			label="Hodômetro Inicial (km)"
			name="kmi"
			type="number"
			span={12}
			mono
			bind:value={kmInicial}
		/>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (iniciarAberto = false)}
			/>
			<PrimaryButton
				label="Iniciar"
				onclick={iniciar}
				loading={processando}
				disabled={!kmInicial}
			/>
		</div>
	</div>
</Modal>

<!-- Modal Concluir -->
<Modal
	isOpen={concluirAberto}
	onClose={() => (concluirAberto = false)}
	title="Concluir Viagem"
	subtitle="Registre hodômetro final · auditado"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<FormField
			label="Hodômetro Final (km)"
			name="kmf"
			type="number"
			span={12}
			mono
			bind:value={kmFinal}
		/>
		<div class="flex flex-col">
			<label
				for="obsc"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Observações da Conclusão (opcional)
			</label>
			<textarea
				id="obsc"
				bind:value={observacoesConclusao}
				rows="2"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (concluirAberto = false)}
			/>
			<PrimaryButton
				label="Concluir"
				onclick={concluir}
				loading={processando}
				disabled={!kmFinal}
			/>
		</div>
	</div>
</Modal>

<!-- Modal Cancelar -->
<Modal
	isOpen={cancelarAberto}
	onClose={() => (cancelarAberto = false)}
	title="Cancelar Viagem"
	subtitle="Motivo obrigatório · auditado"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="border-2 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900">
			Solicitações alocadas voltarão para o status APROVADA · disponíveis para nova alocação.
		</div>
		<div class="flex flex-col">
			<label
				for="mc"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Motivo (mínimo 10 caracteres)
			</label>
			<textarea
				id="mc"
				bind:value={motivoCancel}
				rows="3"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700"
			></textarea>
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (cancelarAberto = false)}
			/>
			<PrimaryButton
				label="Confirmar Cancelamento"
				variant="danger"
				onclick={cancelar}
				disabled={motivoCancel.trim().length < 10}
				loading={processando}
			/>
		</div>
	</div>
</Modal>

<!-- Modal Alocar Passageiro -->
{#if v}
	<Modal
		isOpen={alocarAberto}
		onClose={() => (alocarAberto = false)}
		title="Alocar Passageiro"
		subtitle="Escolha solicitação aprovada + assento livre"
		maxWidth="lg"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			{#if aprovadasDisponiveis.length === 0}
				<div
					class="border border-slate-200 bg-slate-50 px-4 py-6 text-center font-mono text-xs text-slate-500"
				>
					Nenhuma solicitação aprovada disponível.
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					<div class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						Solicitação aprovada
					</div>
					<ul class="max-h-48 divide-y divide-slate-100 overflow-y-auto border border-slate-200">
						{#each aprovadasDisponiveis as s (s.id)}
							{@const sel = solAlvoId === s.id}
							<li>
								<button
									type="button"
									onclick={() => (solAlvoId = s.id)}
									class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors
										{sel ? 'bg-blue-50' : 'hover:bg-slate-50'}"
								>
									<div class="flex items-center gap-3">
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center border-2 font-mono text-[10px] font-bold
												{sel
												? 'border-blue-900 bg-blue-900 text-white'
												: 'border-slate-400 bg-white text-transparent'}"
										>
											✓
										</span>
										<div class="leading-tight">
											<div class="font-sans text-sm font-bold text-slate-900">
												{s.pacienteNome ?? '—'}
												<span
													class="ml-2 font-mono text-[10px] tracking-wider text-slate-500 uppercase"
												>
													{s.protocolo}
												</span>
											</div>
											<div class="font-mono text-[11px] text-slate-600">
												{s.destino} · {s.especialidade}
											</div>
										</div>
									</div>
									<span
										class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase
											{s.prioridade === 'URGENTE'
											? 'border-red-700 bg-red-50 text-red-800'
											: s.prioridade === 'PRIORITARIA'
												? 'border-amber-600 bg-amber-50 text-amber-800'
												: 'border-slate-300 bg-white text-slate-700'}"
									>
										{s.prioridade}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>

				<div class="border-t border-slate-200 pt-3">
					<div
						class="mb-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
					>
						Escolha o assento (verde = livre)
					</div>
					<SeatPicker
						capacidade={v.vagasTotais}
						passageiros={v.passageiros}
						selecionado={assentoEscolhido}
						onSelecionar={(n) => (assentoEscolhido = n)}
					/>
				</div>
			{/if}

			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => (alocarAberto = false)}
				/>
				<PrimaryButton
					label={`Alocar no Assento ${assentoEscolhido ?? '—'}`}
					onclick={alocar}
					loading={processando}
					disabled={!solAlvoId || !assentoEscolhido}
				/>
			</div>
		</div>
	</Modal>
{/if}

<!-- ─── Modal: Editar viagem ──────────────────────────────────── -->
{#if editarAberto && v}
	<Modal
		isOpen={editarAberto}
		title="Editar viagem"
		subtitle={`${v.destino} · ${formatarData(v.data)}`}
		maxWidth="lg"
		onClose={() => (editarAberto = false)}
	>
		<EditarViagem
			viagem={v}
			onCancel={() => (editarAberto = false)}
			onSaved={(novo) => {
				v = novo;
				editarAberto = false;
			}}
		/>
	</Modal>
{/if}
