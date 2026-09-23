<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import { useNovoEncaminhamento } from '$lib/presentation/contexts/novoEncaminhamentoContext';
	import { goto } from '$app/navigation';

	const ctx = useNovoEncaminhamento();
	let s = $derived(ctx.state);

	async function enviar() {
		await ctx.consolidar();
	}

	function voltar() {
		goto('/ubs/novo-encaminhamento/revisao');
	}

	function novoEncaminhamento() {
		ctx.resetar();
		goto('/ubs/novo-encaminhamento');
	}

	function verNoHistorico() {
		goto('/ubs/historico');
	}
</script>

{#if s.protocoloCriado}
	<div class="flex flex-col gap-4">
		<div class="border-2 border-emerald-700 bg-emerald-50 p-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
						✓ ENCAMINHAMENTO CONSOLIDADO COM SUCESSO
					</div>
					<div class="mt-1 font-mono text-3xl font-bold text-emerald-900">
						{s.protocoloCriado}
					</div>
					<div class="text-xs text-emerald-800">
						Enviado para fila da Secretaria Municipal de Saúde · Regulação notificada em tempo real
					</div>
				</div>
				<div class="flex gap-2">
					<PrimaryButton label="Ver no Histórico" variant="secondary" onclick={verNoHistorico} />
					<PrimaryButton label="Novo Encaminhamento" onclick={novoEncaminhamento} />
				</div>
			</div>
		</div>

		<div class="grid grid-cols-12 gap-3">
			<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
				<div class="border-b border-slate-200 bg-slate-50 px-4 py-2">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						Paciente
					</span>
				</div>
				<div class="px-4 py-3">
					<div class="text-sm font-bold text-slate-900">{s.nomePaciente}</div>
					<div class="mt-1 font-mono text-[11px] text-slate-600">CPF · {s.cpf}</div>
					<div class="font-mono text-[11px] text-slate-600">SUS · {s.cartaoSus}</div>
				</div>
			</div>
			<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
				<div class="border-b border-slate-200 bg-slate-50 px-4 py-2">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						Solicitação
					</span>
				</div>
				<div class="px-4 py-3">
					<div class="text-sm font-bold text-slate-900">{s.especialidade}</div>
					<div class="mt-1 font-mono text-[11px] text-slate-600">CID-10 · {s.cid10}</div>
					<StatusBadge prioridade={s.prioridade} />
				</div>
			</div>
			<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
				<div class="border-b border-slate-200 bg-slate-50 px-4 py-2">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
						Anexos
					</span>
				</div>
				<div class="px-4 py-3">
					<div class="font-mono text-2xl font-bold text-slate-900">
						{s.anexos.length + s.solicitacaoFile.length}
					</div>
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						documentos vinculados
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-12 gap-4">
		<section class="col-span-12 xl:col-span-8">
			<div class="border border-slate-200 bg-white">
				<PanelHeader
					title="Revisão Final"
					subtitle="Confira os dados antes de enviar à Regulação"
					index="01"
				>
					<StatusBadge prioridade={s.prioridade} />
				</PanelHeader>

				<div class="p-4">
					<div class="mb-3 border-b border-slate-200 pb-2">
						<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							Paciente
						</span>
					</div>
					<dl class="mb-5 grid grid-cols-12 gap-x-4 gap-y-2.5">
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Nome Completo
							</dt>
							<dd class="mt-0.5 text-sm font-bold text-slate-900">{s.nomePaciente}</dd>
						</div>
						<div class="col-span-4">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								CPF
							</dt>
							<dd class="mt-0.5 font-mono text-xs text-slate-900">{s.cpf}</dd>
						</div>
						<div class="col-span-4">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Cartão SUS
							</dt>
							<dd class="mt-0.5 font-mono text-xs text-slate-900">{s.cartaoSus}</dd>
						</div>
						<div class="col-span-4">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Telefone
							</dt>
							<dd class="mt-0.5 font-mono text-xs text-slate-900">{s.telefone}</dd>
						</div>
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Endereço
							</dt>
							<dd class="mt-0.5 text-xs text-slate-900">{s.endereco}</dd>
						</div>
					</dl>

					<div class="mb-3 border-b border-slate-200 pb-2">
						<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							Solicitação Clínica
						</span>
					</div>
					<dl class="grid grid-cols-12 gap-x-4 gap-y-2.5">
						<div class="col-span-8">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Médico Solicitante
							</dt>
							<dd class="mt-0.5 text-sm font-bold text-slate-900">{s.medicoSolicitante}</dd>
						</div>
						<div class="col-span-4">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								CRM
							</dt>
							<dd class="mt-0.5 font-mono text-xs text-slate-900">{s.crm}</dd>
						</div>
						<div class="col-span-6">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Especialidade
							</dt>
							<dd class="mt-0.5 text-sm font-bold text-slate-900">{s.especialidade}</dd>
						</div>
						<div class="col-span-3">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								CID-10
							</dt>
							<dd class="mt-0.5 font-mono text-sm font-bold text-blue-900">{s.cid10}</dd>
						</div>
						<div class="col-span-3">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Prioridade
							</dt>
							<dd class="mt-0.5"><StatusBadge prioridade={s.prioridade} /></dd>
						</div>
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Descrição CID
							</dt>
							<dd class="mt-0.5 text-xs text-slate-900">{s.cidDescricao}</dd>
						</div>
						<div class="col-span-12">
							<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
								Justificativa Clínica
							</dt>
							<dd
								class="mt-1 border-l-4 border-blue-900 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800"
							>
								{s.justificativa}
							</dd>
						</div>
					</dl>
				</div>
			</div>
		</section>

		<aside class="col-span-12 flex flex-col gap-4 xl:col-span-4">
			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Documentos" index="02" />
				<ul class="divide-y divide-slate-100 font-mono text-[11px]">
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Solicitação Médica</span>
						<span class="font-bold text-emerald-700">✓ 1</span>
					</li>
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Anexos Complementares</span>
						<span class="font-bold {s.anexos.length > 0 ? 'text-emerald-700' : 'text-slate-500'}">
							{s.anexos.length > 0 ? `✓ ${s.anexos.length}` : '—'}
						</span>
					</li>
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Total a Transmitir</span>
						<span class="font-bold text-slate-900">
							{s.anexos.length + s.solicitacaoFile.length}
						</span>
					</li>
				</ul>
			</div>

			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Destino" index="03" />
				<dl class="divide-y divide-slate-100 font-mono text-[11px]">
					<div class="flex items-center justify-between px-4 py-2">
						<dt class="tracking-wider text-slate-500 uppercase">Via</dt>
						<dd class="text-slate-900">Regulação SMS</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2">
						<dt class="tracking-wider text-slate-500 uppercase">Atendente</dt>
						<dd class="font-bold text-slate-900">MATEUS.SANTANA</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2">
						<dt class="tracking-wider text-slate-500 uppercase">Origem</dt>
						<dd class="text-slate-900">UBS CENTRAL</dd>
					</div>
				</dl>
			</div>

			{#if s.erroConsolidar}
				<div
					class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {s.erroConsolidar}
				</div>
			{/if}

			<div class="flex flex-col gap-2">
				<PrimaryButton
					label="Consolidar e Enviar"
					fullWidth
					onclick={enviar}
					loading={s.consolidando}
					shortcut="↵"
				/>
				<PrimaryButton
					label="Voltar para Revisão"
					variant="secondary"
					fullWidth
					onclick={voltar}
					shortcut="←"
				/>
			</div>
		</aside>
	</div>
{/if}
