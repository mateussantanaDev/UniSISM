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
		AporteSaldoAjudaCusto,
		FonteRecurso,
		SaldoAjudaCusto
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeAdmin = $derived(!!auth.ehAdminOuDev);
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let saldo = $state<SaldoAjudaCusto | null>(null);
	let aportes = $state<AporteSaldoAjudaCusto[]>([]);
	let mes = $state(mesAtual());
	let carregando = $state(true);
	let erroLista = $state<string | null>(null);

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	function notificar(t: 'ok' | 'erro', texto: string) {
		mensagem = { tipo: t, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	const pctUso = $derived.by(() => {
		if (!saldo || saldo.saldoMensal <= 0) return 0;
		return (saldo.saldoConsumido / saldo.saldoMensal) * 100;
	});

	async function carregar() {
		carregando = true;
		erroLista = null;
		try {
			const [s, a] = await Promise.all([
				api.tfd.saldoAjudaCusto.get(mes).catch(() => null),
				api.tfd.saldoAjudaCusto.aportes(mes).catch(() => [] as AporteSaldoAjudaCusto[])
			]);
			saldo = s;
			aportes = a;
		} catch (e) {
			erroLista = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// ─── Aportar ───
	let aportarAberto = $state(false);
	let aporteValor = $state('');
	let aporteFonte = $state<FonteRecurso>('EMPENHO');
	let aporteDoc = $state('');
	let aporteDescricao = $state('');
	let aporteJustificativa = $state('');
	let aporteIdemKey = $state<string>('');
	let processandoAporte = $state(false);
	let erroAporte = $state('');

	function resetAporte() {
		aporteValor = '';
		aporteFonte = 'EMPENHO';
		aporteDoc = '';
		aporteDescricao = '';
		aporteJustificativa = '';
		erroAporte = '';
		aporteIdemKey = crypto.randomUUID();
	}

	async function aportar() {
		erroAporte = '';
		if (!aporteValor.trim() || Number(aporteValor) <= 0) {
			erroAporte = 'Informe um valor maior que zero.';
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
			await api.tfd.saldoAjudaCusto.aportar(
				{
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
			notificar('ok', 'Aporte registrado · saldo de ajuda atualizado.');
			await carregar();
		} catch (e) {
			erroAporte = mensagemErroTfd(e);
		} finally {
			processandoAporte = false;
		}
	}

	// ─── Ajustar (saldo mensal + tetos por categoria) ───
	let ajustarAberto = $state(false);
	// Strings pra ligar direto no FormField. Convertidas pra Number no submit.
	let novoSaldo = $state('');
	let tetoAlim = $state('');
	let tetoHosp = $state('');
	let tetoDesl = $state('');
	let justificativaAjuste = $state('');
	let processandoAjuste = $state(false);
	let erroAjuste = $state('');

	function abrirAjuste() {
		novoSaldo = String(saldo?.saldoMensal ?? 0);
		tetoAlim = String(saldo?.tetoAlimentacao ?? 0);
		tetoHosp = String(saldo?.tetoHospedagem ?? 0);
		tetoDesl = String(saldo?.tetoDeslocamento ?? 0);
		justificativaAjuste = '';
		erroAjuste = '';
		ajustarAberto = true;
	}

	async function ajustar() {
		erroAjuste = '';
		if (!novoSaldo.trim() || Number(novoSaldo) < 0) {
			erroAjuste = 'Informe um saldo mensal válido.';
			return;
		}
		if (justificativaAjuste.trim().length < 10) {
			erroAjuste = 'Justificativa precisa ter pelo menos 10 caracteres.';
			return;
		}
		processandoAjuste = true;
		try {
			await api.tfd.saldoAjudaCusto.ajustar({
				mes,
				novoSaldoMensal: Number(novoSaldo),
				tetoAlimentacao: tetoAlim.trim() ? Number(tetoAlim) : undefined,
				tetoHospedagem: tetoHosp.trim() ? Number(tetoHosp) : undefined,
				tetoDeslocamento: tetoDesl.trim() ? Number(tetoDesl) : undefined,
				justificativa: justificativaAjuste.trim()
			});
			ajustarAberto = false;
			notificar('ok', 'Saldo de ajuda ajustado · auditado.');
			await carregar();
		} catch (e) {
			erroAjuste = mensagemErroTfd(e);
		} finally {
			processandoAjuste = false;
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

	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Saldo Mensal"
			value={carregando ? '—' : formatarBRL(saldo?.saldoMensal ?? 0)}
			sublabel="Pote único da prefeitura"
		/>
		<MetricCard
			label="Pago no Mês"
			value={carregando ? '—' : formatarBRL(saldo?.saldoConsumido ?? 0)}
			sublabel={saldo && saldo.saldoMensal > 0 ? pctUso.toFixed(1) + '% do mês' : '—'}
			accent={pctUso > 85 ? 'critical' : pctUso > 60 ? 'warning' : 'default'}
		/>
		<MetricCard
			label="Reservado"
			value={carregando ? '—' : formatarBRL(saldo?.saldoReservado ?? 0)}
			sublabel="Autorizadas aguardando pagto"
			accent="default"
		/>
		<MetricCard
			label="Disponível"
			value={carregando ? '—' : formatarBRL(saldo?.saldoDisponivel ?? 0)}
			sublabel="Pode ser autorizado este mês"
			accent={saldo && saldo.saldoDisponivel < (saldo.saldoMensal ?? 0) * 0.2
				? 'warning'
				: 'success'}
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Saldo de Ajuda de Custo"
			subtitle="Orçamento mensal global · alimentação · hospedagem · deslocamento"
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
						label="+ Aportar"
						onclick={() => {
							resetAporte();
							aportarAberto = true;
						}}
					/>
				{/if}
				{#if podeAdmin}
					<PrimaryButton label="Ajustar Tetos" variant="secondary" onclick={abrirAjuste} />
				{/if}
			</div>
		</PanelHeader>

		<div class="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-3">
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-600 uppercase">
					Teto · Alimentação
				</div>
				<div class="font-mono text-base font-bold text-slate-900">
					{carregando
						? '—'
						: saldo && saldo.tetoAlimentacao > 0
							? formatarBRL(saldo.tetoAlimentacao)
							: 'sem teto'}
				</div>
				<div class="font-sans text-[11px] text-slate-600">
					Limite máximo por item “Alimentação” em cada ajuda.
				</div>
			</div>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-600 uppercase">
					Teto · Hospedagem
				</div>
				<div class="font-mono text-base font-bold text-slate-900">
					{carregando
						? '—'
						: saldo && saldo.tetoHospedagem > 0
							? formatarBRL(saldo.tetoHospedagem)
							: 'sem teto'}
				</div>
				<div class="font-sans text-[11px] text-slate-600">
					Limite máximo por item “Hospedagem” em cada ajuda.
				</div>
			</div>
			<div class="border border-slate-200 bg-slate-50 px-3 py-2.5">
				<div class="font-mono text-[10px] tracking-widest text-slate-600 uppercase">
					Teto · Deslocamento Local
				</div>
				<div class="font-mono text-base font-bold text-slate-900">
					{carregando
						? '—'
						: saldo && saldo.tetoDeslocamento > 0
							? formatarBRL(saldo.tetoDeslocamento)
							: 'sem teto'}
				</div>
				<div class="font-sans text-[11px] text-slate-600">
					Limite máximo por item “Deslocamento Local” em cada ajuda.
				</div>
			</div>
		</div>

		{#if !carregando && saldo && saldo.saldoMensal > 0}
			<div class="px-4 pb-4">
				<div class="mb-1 flex items-center justify-between font-mono text-[10px] text-slate-700">
					<span>Uso do mês {mes}</span>
					<span>{pctUso.toFixed(0)}%</span>
				</div>
				<div class="h-2 w-full bg-slate-100">
					<div
						class="h-full {pctUso > 85
							? 'bg-red-700'
							: pctUso > 60
								? 'bg-amber-600'
								: 'bg-emerald-700'}"
						style:width="{Math.min(pctUso, 100)}%"
					></div>
				</div>
			</div>
		{:else if !carregando}
			<div class="px-4 pb-4 font-sans text-sm text-slate-500">
				Nenhum saldo configurado para {mes}. Use “+ Aportar” para iniciar.
			</div>
		{/if}
	</div>

	<!-- Histórico de aportes -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Aportes do Mês"
			subtitle="Créditos lançados · fonte e justificativa visíveis para auditoria"
			index="02"
		/>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Data</th>
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
							<td colspan="6" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhum aporte lançado em {mes}.
							</td>
						</tr>
					{:else}
						{#each aportes as a (a.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-600">
									{formatarDataHora(a.criadoEm)}
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
		<strong class="font-mono tracking-wider uppercase">Modelo:</strong> o saldo de ajuda de custo é
		um “pote único” da prefeitura. Cada ajuda autorizada reserva valor; cada pagamento debita do consumido.
		Tetos por categoria definem o limite máximo de cada item.
	</div>
</div>

<!-- Modal Aportar -->
<Modal
	isOpen={aportarAberto}
	onClose={() => (aportarAberto = false)}
	title="Aportar Saldo de Ajuda de Custo"
	subtitle="Crédito mensal · vincula a empenho/portaria · auditado"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Valor do Aporte (R$)"
				name="acvalor"
				type="number"
				span={6}
				mono
				bind:value={aporteValor}
			/>
			<div class="col-span-6 flex flex-col">
				<label
					for="acmes"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Mês de Competência
				</label>
				<input
					id="acmes"
					type="month"
					value={mes}
					readonly
					class="w-full cursor-not-allowed border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-700 outline-none"
				/>
			</div>

			<div class="col-span-6 flex flex-col">
				<label
					for="acfonte"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Fonte do Recurso
				</label>
				<select
					id="acfonte"
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
				name="acdoc"
				span={6}
				placeholder="Ex.: 2026NE000456"
				bind:value={aporteDoc}
			/>

			{#if aporteFonte === 'OUTRO'}
				<FormField
					label="Descrição da Fonte"
					name="acdesc"
					span={12}
					placeholder="Detalhe a origem do recurso"
					bind:value={aporteDescricao}
				/>
			{/if}

			<div class="col-span-12 flex flex-col">
				<label
					for="acjust"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Justificativa (mínimo 10 caracteres)
				</label>
				<textarea
					id="acjust"
					bind:value={aporteJustificativa}
					rows="3"
					placeholder="Ex.: aporte mensal para ajuda de custo de pacientes – Empenho 2026NE000456"
					class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
			</div>
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
	isOpen={ajustarAberto}
	onClose={() => (ajustarAberto = false)}
	title="Ajustar Saldo & Tetos"
	subtitle="Sobrescreve · auditado · TCM"
	maxWidth="lg"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div
			class="border-2 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
		>
			Use 0 para “sem teto” em qualquer categoria. Justificativa fica em auditoria por 5 anos.
		</div>

		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Saldo Mensal Total (R$)"
				name="ns"
				type="number"
				span={12}
				mono
				bind:value={novoSaldo}
			/>
			<FormField
				label="Teto · Alimentação"
				name="tal"
				type="number"
				span={4}
				mono
				bind:value={tetoAlim}
			/>
			<FormField
				label="Teto · Hospedagem"
				name="tho"
				type="number"
				span={4}
				mono
				bind:value={tetoHosp}
			/>
			<FormField
				label="Teto · Deslocamento"
				name="tde"
				type="number"
				span={4}
				mono
				bind:value={tetoDesl}
			/>
		</div>

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
				placeholder="Ex.: revisão dos tetos conforme Portaria SMS 047/2026"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>

		{#if erroAjuste}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erroAjuste}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (ajustarAberto = false)}
			/>
			<PrimaryButton label="Confirmar Ajuste" onclick={ajustar} loading={processandoAjuste} />
		</div>
	</div>
</Modal>
