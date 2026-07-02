<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarDataHora, mesAtual } from '$lib/presentation/utils/tfdFormat';
	import type {
		AporteSaldoFrota,
		FonteRecurso,
		SaldoVeiculo,
		Veiculo
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeAdmin = $derived(!!auth.ehAdminOuDev);
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let saldos = $state<SaldoVeiculo[]>([]);
	let veiculos = $state<Veiculo[]>([]);
	let aportes = $state<AporteSaldoFrota[]>([]);
	let mes = $state(mesAtual());
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);

	const total = $derived(saldos.reduce((acc, s) => acc + s.saldoMensal, 0));
	const consumido = $derived(saldos.reduce((acc, s) => acc + s.saldoConsumido, 0));
	const reservado = $derived(saldos.reduce((acc, s) => acc + s.saldoReservado, 0));
	const disponivel = $derived(total - consumido - reservado);

	function alertaSaldo(s: SaldoVeiculo): 'OK' | 'BAIXO' | 'ESGOTADO' {
		if (s.saldoMensal <= 0) return 'OK';
		const pct = s.saldoConsumido / s.saldoMensal;
		if (pct >= 1) return 'ESGOTADO';
		if (pct >= 0.85) return 'BAIXO';
		return 'OK';
	}

	const tone = {
		OK: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		BAIXO: 'border-amber-600 bg-amber-50 text-amber-800',
		ESGOTADO: 'border-red-700 bg-red-50 text-red-800'
	} as const;

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function carregar() {
		carregando = true;
		erroLista = null;
		try {
			const [s, v, a] = await Promise.all([
				api.tfd.saldo.list(mes),
				api.tfd.veiculos.list(),
				api.tfd.saldo.aportes(mes).catch(() => [] as AporteSaldoFrota[])
			]);
			saldos = s;
			veiculos = v;
			aportes = a;
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// ─── Ajustar Saldo (substitui o valor) ───
	let ajustarVeiculoId = $state<string | null>(null);
	let novoSaldo = $state('');
	let justificativaAjuste = $state('');
	let processandoAjuste = $state(false);

	async function ajustar() {
		if (!ajustarVeiculoId || !novoSaldo.trim() || justificativaAjuste.trim().length < 10)
			return;
		processandoAjuste = true;
		try {
			await api.tfd.saldo.ajustar({
				veiculoId: ajustarVeiculoId,
				mes,
				novoSaldoMensal: Number(novoSaldo),
				justificativa: justificativaAjuste.trim()
			});
			ajustarVeiculoId = null;
			novoSaldo = '';
			justificativaAjuste = '';
			notificar('ok', 'Saldo ajustado · auditado.');
			await carregar();
		} catch (e) {
			notificar('erro', mensagemErroTfd(e));
		} finally {
			processandoAjuste = false;
		}
	}

	// ─── Aportar Saldo (crédito) ───
	let aportarAberto = $state(false);
	let modoAporte = $state<'VEICULO' | 'RATEIO'>('VEICULO');
	let aporteVeiculoId = $state('');
	let aporteValor = $state('');
	let aporteFonte = $state<FonteRecurso>('EMPENHO');
	let aporteDoc = $state('');
	let aporteDescricao = $state('');
	let aporteJustificativa = $state('');
	let aporteIdemKey = $state<string>('');
	let processandoAporte = $state(false);
	let erroAporte = $state('');

	function resetAporte() {
		modoAporte = 'VEICULO';
		aporteVeiculoId = '';
		aporteValor = '';
		aporteFonte = 'EMPENHO';
		aporteDoc = '';
		aporteDescricao = '';
		aporteJustificativa = '';
		erroAporte = '';
		// Nova chave a cada abertura — mantém-se enquanto o modal estiver aberto.
		aporteIdemKey = crypto.randomUUID();
	}

	async function aportar() {
		erroAporte = '';
		if (!aporteValor.trim() || Number(aporteValor) <= 0) {
			erroAporte = 'Informe um valor maior que zero.';
			return;
		}
		if (modoAporte === 'VEICULO' && !aporteVeiculoId) {
			erroAporte = 'Selecione o veículo de destino.';
			return;
		}
		if (aporteJustificativa.trim().length < 10) {
			erroAporte = 'Justificativa precisa ter pelo menos 10 caracteres.';
			return;
		}
		if (
			(aporteFonte === 'EMPENHO' || aporteFonte === 'PORTARIA') &&
			!aporteDoc.trim()
		) {
			erroAporte = 'Informe o número do empenho/portaria.';
			return;
		}
		processandoAporte = true;
		try {
			await api.tfd.saldo.aportar(
				{
					veiculoId: modoAporte === 'VEICULO' ? aporteVeiculoId : undefined,
					rateioGeral: modoAporte === 'RATEIO',
					mes,
					valorBRL: Number(aporteValor),
					fonte: aporteFonte,
					numeroDocumento: aporteDoc.trim() || undefined,
					descricaoFonte: aporteDescricao.trim() || undefined,
					justificativa: aporteJustificativa.trim()
				},
				{ idempotencyKey: aporteIdemKey }
			);
			aportarAberto = false;
			resetAporte();
			notificar('ok', 'Aporte registrado · saldo atualizado.');
			await carregar();
		} catch (e) {
			erroAporte = mensagemErroTfd(e);
		} finally {
			processandoAporte = false;
		}
	}

	const fontes: Array<{ value: FonteRecurso; label: string }> = [
		{ value: 'EMPENHO', label: 'Empenho Orçamentário' },
		{ value: 'PORTARIA', label: 'Portaria SMS' },
		{ value: 'REPASSE_FEDERAL', label: 'Repasse Federal · FNS' },
		{ value: 'REPASSE_ESTADUAL', label: 'Repasse Estadual · SES' },
		{ value: 'REMANEJAMENTO', label: 'Remanejamento Interno' },
		{ value: 'OUTRO', label: 'Outro (descrever)' }
	];

	const fonteLabel: Record<FonteRecurso, string> = Object.fromEntries(
		fontes.map((f) => [f.value, f.label])
	) as Record<FonteRecurso, string>;
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

	{#if erroLista}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erroLista}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
		<MetricCard
			label="Saldo Mensal Total"
			value={carregando ? '—' : formatarBRL(total)}
			sublabel="Reservado para combustível"
		/>
		<MetricCard
			label="Consumido"
			value={carregando ? '—' : formatarBRL(consumido)}
			sublabel={total > 0 ? ((consumido / total) * 100).toFixed(1) + '% do mês' : '—'}
			accent={total > 0 && consumido / total > 0.85
				? 'critical'
				: total > 0 && consumido / total > 0.6
					? 'warning'
					: 'default'}
		/>
		<MetricCard
			label="Disponível"
			value={carregando ? '—' : formatarBRL(disponivel)}
			sublabel="Pode ser consumido este mês"
			accent={total > 0 && disponivel < total * 0.2 ? 'warning' : 'success'}
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Saldo por Veículo"
			subtitle="Orçamento mensal de combustível · ajustes e aportes auditados"
			index="01"
		>
			<div class="flex items-center gap-2">
				<input
					type="month"
					bind:value={mes}
					onchange={carregar}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				{#if podeOperar}
					<PrimaryButton
						label="+ Aportar Saldo"
						onclick={() => {
							resetAporte();
							aportarAberto = true;
						}}
					/>
				{/if}
			</div>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Veículo</th>
						<th class="border-r border-slate-200 px-3 py-2">Mês</th>
						<th class="border-r border-slate-200 px-3 py-2">Saldo Mensal</th>
						<th class="border-r border-slate-200 px-3 py-2">Consumido</th>
						<th class="border-r border-slate-200 px-3 py-2">Reservado</th>
						<th class="border-r border-slate-200 px-3 py-2">Disponível</th>
						<th class="border-r border-slate-200 px-3 py-2">% Uso</th>
						<th class="border-r border-slate-200 px-3 py-2">Alerta</th>
						<th class="px-3 py-2">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(4) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="9" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if saldos.length === 0}
						<tr>
							<td colspan="9" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum saldo configurado para {mes}. Use “+ Aportar Saldo” para iniciar.
							</td>
						</tr>
					{:else}
						{#each saldos as s (s.veiculoId)}
							{@const pct = s.saldoMensal > 0 ? (s.saldoConsumido / s.saldoMensal) * 100 : 0}
							{@const al = alertaSaldo(s)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{s.veiculoPlaca ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">{s.mes}</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarBRL(s.saldoMensal)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarBRL(s.saldoConsumido)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarBRL(s.saldoReservado)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
									{formatarBRL(s.saldoDisponivel)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<div class="flex items-center gap-2">
										<span class="font-mono text-[10px] text-slate-700">{pct.toFixed(0)}%</span>
										<div class="h-1.5 flex-1 bg-slate-100">
											<div
												class="h-full {pct > 85
													? 'bg-red-700'
													: pct > 60
														? 'bg-amber-600'
														: 'bg-emerald-700'}"
												style:width="{Math.min(pct, 100)}%"
											></div>
										</div>
									</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {tone[al]}"
									>
										{al}
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap gap-1">
										{#if podeOperar}
											<button
												type="button"
												onclick={() => {
													resetAporte();
													modoAporte = 'VEICULO';
													aporteVeiculoId = s.veiculoId;
													aportarAberto = true;
												}}
												class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase hover:bg-emerald-100"
											>
												+ Aportar
											</button>
										{/if}
										{#if podeAdmin}
											<button
												type="button"
												onclick={() => {
													ajustarVeiculoId = s.veiculoId;
													novoSaldo = String(s.saldoMensal);
													justificativaAjuste = '';
												}}
												class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
											>
												Ajustar
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Histórico de aportes do mês -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Aportes do Mês"
			subtitle="Créditos lançados no saldo · fonte e justificativa visíveis para auditoria"
			index="02"
		/>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Data</th>
						<th class="border-r border-slate-200 px-3 py-2">Destino</th>
						<th class="border-r border-slate-200 px-3 py-2">Valor</th>
						<th class="border-r border-slate-200 px-3 py-2">Fonte</th>
						<th class="border-r border-slate-200 px-3 py-2">Documento</th>
						<th class="border-r border-slate-200 px-3 py-2">Operador</th>
						<th class="px-3 py-2">Justificativa</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if aportes.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhum aporte lançado em {mes}.
							</td>
						</tr>
					{:else}
						{#each aportes as a (a.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-600">
									{formatarDataHora(a.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{a.veiculoPlaca ?? 'RATEIO GERAL'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-emerald-800">
									+ {formatarBRL(a.valorBRL)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{fonteLabel[a.fonte] ?? a.fonte}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{a.numeroDocumento ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{a.operadorNome}
								</td>
								<td class="px-3 py-2 font-sans text-[11px] text-slate-700">
									{a.justificativa}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<div class="border-l-4 border-blue-900 bg-blue-50 px-4 py-2 font-sans text-[12px] text-blue-900">
		<strong class="font-mono tracking-wider uppercase">LGPD/TCM:</strong> todo aporte ou ajuste de saldo
		é registrado em auditoria com operador, IP, valores antes/depois, fonte do recurso e justificativa.
		Disponível para consulta em <a href="/tfd/auditoria" class="underline">/tfd/auditoria</a>.
	</div>
</div>

<!-- Modal Aportar Saldo -->
<Modal
	isOpen={aportarAberto}
	onClose={() => (aportarAberto = false)}
	title="Aportar Saldo de Frota"
	subtitle="Crédito mensal · vincula a empenho/portaria · auditado"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<div class="col-span-12">
				<div class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
					Modo de Aporte
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (modoAporte = 'VEICULO')}
						class="flex-1 border px-3 py-2 text-left text-[11px] uppercase transition-colors
							{modoAporte === 'VEICULO'
							? 'border-blue-900 bg-blue-50 text-blue-900'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900'}"
					>
						<div class="font-bold tracking-widest">Veículo Específico</div>
						<div class="font-sans text-[11px] normal-case text-slate-600">
							Credita em uma placa só.
						</div>
					</button>
					<button
						type="button"
						onclick={() => (modoAporte = 'RATEIO')}
						class="flex-1 border px-3 py-2 text-left text-[11px] uppercase transition-colors
							{modoAporte === 'RATEIO'
							? 'border-blue-900 bg-blue-50 text-blue-900'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900'}"
					>
						<div class="font-bold tracking-widest">Rateio Geral</div>
						<div class="font-sans text-[11px] normal-case text-slate-600">
							Divide entre veículos ATIVOS.
						</div>
					</button>
				</div>
			</div>

			{#if modoAporte === 'VEICULO'}
				<div class="col-span-12 flex flex-col">
					<label
						for="apvid"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Veículo de Destino
					</label>
					<select
						id="apvid"
						bind:value={aporteVeiculoId}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						<option value="">— Selecione uma placa —</option>
						{#each veiculos.filter((v) => v.status === 'ATIVO') as v (v.id)}
							<option value={v.id}>{v.placa} · {v.modelo}</option>
						{/each}
					</select>
				</div>
			{/if}

			<FormField
				label="Valor do Aporte (R$)"
				name="apvalor"
				type="number"
				span={6}
				mono
				bind:value={aporteValor}
			/>
			<div class="col-span-6 flex flex-col">
				<label
					for="apmes"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Mês de Competência
				</label>
				<input
					id="apmes"
					type="month"
					value={mes}
					readonly
					class="w-full cursor-not-allowed border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-700 outline-none"
				/>
			</div>

			<div class="col-span-6 flex flex-col">
				<label
					for="apfonte"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Fonte do Recurso
				</label>
				<select
					id="apfonte"
					bind:value={aporteFonte}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each fontes as f (f.value)}
						<option value={f.value}>{f.label}</option>
					{/each}
				</select>
			</div>
			<FormField
				label="Nº Empenho / Portaria"
				name="apdoc"
				span={6}
				placeholder="Ex.: 2026NE000123"
				bind:value={aporteDoc}
			/>

			{#if aporteFonte === 'OUTRO'}
				<FormField
					label="Descrição da Fonte"
					name="apdesc"
					span={12}
					placeholder="Detalhe a origem do recurso"
					bind:value={aporteDescricao}
				/>
			{/if}

			<div class="col-span-12 flex flex-col">
				<label
					for="apjust"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Justificativa (mínimo 10 caracteres)
				</label>
				<textarea
					id="apjust"
					bind:value={aporteJustificativa}
					rows="3"
					placeholder="Ex.: aporte mensal regular para combustível – Empenho 2026NE000123"
					class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
			</div>
		</div>

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[11px] text-blue-900"
		>
			Aporte = <strong>crédito</strong> no saldo do mês (soma ao existente). Para sobrescrever o
			valor mensal, use “Ajustar” na linha do veículo.
		</div>

		{#if erroAporte}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erroAporte}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (aportarAberto = false)}
			/>
			<PrimaryButton label="Confirmar Aporte" onclick={aportar} loading={processandoAporte} />
		</div>
	</div>
</Modal>

<!-- Modal Ajustar -->
<Modal
	isOpen={ajustarVeiculoId !== null}
	onClose={() => (ajustarVeiculoId = null)}
	title="Ajustar Saldo Mensal"
	subtitle="Sobrescreve o saldo · auditado · TCM"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div
			class="border-2 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
		>
			Ajustes manuais sobrescrevem o saldo do mês inteiro. Esta justificativa fica disponível na
			trilha de auditoria por 5 anos para prestação de contas.
		</div>
		<FormField
			label="Novo Saldo Mensal (R$)"
			name="ns"
			type="number"
			span={12}
			mono
			bind:value={novoSaldo}
		/>
		<div class="flex flex-col">
			<label
				for="just"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Justificativa (mínimo 10 caracteres)
			</label>
			<textarea
				id="just"
				bind:value={justificativaAjuste}
				rows="3"
				placeholder="Ex.: correção de saldo após cancelamento de empenho · Portaria SMS 045/2026"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>
		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (ajustarVeiculoId = null)}
			/>
			<PrimaryButton
				label="Confirmar Ajuste"
				onclick={ajustar}
				loading={processandoAjuste}
				disabled={!novoSaldo.trim() || justificativaAjuste.trim().length < 10}
			/>
		</div>
	</div>
</Modal>
