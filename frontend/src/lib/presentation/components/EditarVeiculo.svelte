<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import type {
		AtualizarVeiculoRequest,
		Combustivel,
		TipoVeiculo,
		Veiculo
	} from '$lib/api/tfd-types';

	/**
	 * Modal-friendly de edição de Veículo TFD.
	 *
	 * - PATCH `/v1/tfd/veiculos/:id` (RBAC: rwGestor).
	 * - Diff apenas campos alterados (evita PATCH com payload inteiro).
	 * - `placa` é editável mas backend valida unicidade — tratamos 409.
	 * - `status` NÃO é editado aqui: para isso use as ações `manutencao` /
	 *   `reativar` (auditadas de forma específica).
	 * - `hodometroAtualKm` NÃO é editado aqui: backend atualiza via
	 *   conclusão de viagem (operador não deve poder reescrever km).
	 */
	interface Props {
		veiculo: Veiculo;
		onCancel: () => void;
		onSaved: (atualizado: Veiculo) => void;
	}

	let { veiculo, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		placa: veiculo.placa,
		modelo: veiculo.modelo,
		tipo: veiculo.tipo,
		capacidade: veiculo.capacidade,
		ano: veiculo.ano,
		combustivel: veiculo.combustivel,
		consumoMedioKml: veiculo.consumoMedioKml,
		proximaRevisaoKm: veiculo.proximaRevisaoKm ?? null,
		proximaRevisaoEm: veiculo.proximaRevisaoEm ?? null
	}));

	let placa = $state(orig.placa);
	let modelo = $state(orig.modelo);
	let tipo = $state<TipoVeiculo>(orig.tipo);
	let capacidade = $state(String(orig.capacidade));
	let ano = $state(String(orig.ano));
	let combustivel = $state<Combustivel>(orig.combustivel);
	let consumoMedioKml = $state(String(orig.consumoMedioKml));
	let proximaRevisaoKm = $state(orig.proximaRevisaoKm == null ? '' : String(orig.proximaRevisaoKm));
	let proximaRevisaoEm = $state(orig.proximaRevisaoEm ?? '');

	let enviando = $state(false);
	let erro = $state('');

	const tipos: { v: TipoVeiculo; l: string }[] = [
		{ v: 'VAN', l: 'Van' },
		{ v: 'ONIBUS', l: 'Ônibus' },
		{ v: 'CARRO', l: 'Carro' },
		{ v: 'AMBULANCIA', l: 'Ambulância' }
	];

	const combustiveis: { v: Combustivel; l: string }[] = [
		{ v: 'GASOLINA', l: 'Gasolina' },
		{ v: 'ETANOL', l: 'Etanol' },
		{ v: 'DIESEL', l: 'Diesel' },
		{ v: 'FLEX', l: 'Flex' },
		{ v: 'GNV', l: 'GNV' },
		{ v: 'ELETRICO', l: 'Elétrico' }
	];

	function nuloSeVazio(v: string): string | null {
		const t = v.trim();
		return t.length === 0 ? null : t;
	}

	function diff(): AtualizarVeiculoRequest {
		const out: AtualizarVeiculoRequest = {};
		if (placa.trim().toUpperCase() !== orig.placa.toUpperCase()) {
			out.placa = placa.trim().toUpperCase();
		}
		if (modelo.trim() !== orig.modelo) out.modelo = modelo.trim();
		if (tipo !== orig.tipo) out.tipo = tipo;
		if (Number(capacidade) !== orig.capacidade) out.capacidade = Number(capacidade);
		if (Number(ano) !== orig.ano) out.ano = Number(ano);
		if (combustivel !== orig.combustivel) out.combustivel = combustivel;
		if (Number(consumoMedioKml) !== orig.consumoMedioKml) {
			out.consumoMedioKml = Number(consumoMedioKml);
		}
		// nullable — null sinaliza "limpar"
		const novoRevKm = proximaRevisaoKm.trim() === '' ? null : Number(proximaRevisaoKm);
		if (novoRevKm !== orig.proximaRevisaoKm) out.proximaRevisaoKm = novoRevKm;
		const novoRevEm = nuloSeVazio(proximaRevisaoEm);
		if (novoRevEm !== orig.proximaRevisaoEm) out.proximaRevisaoEm = novoRevEm;
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let placaOk = $derived(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i.test(placa.trim()));
	let capacidadeOk = $derived(Number.isInteger(Number(capacidade)) && Number(capacidade) > 0);
	let anoOk = $derived(Number.isInteger(Number(ano)) && Number(ano) >= 1990);
	let consumoOk = $derived(Number(consumoMedioKml) > 0);

	let podeSalvar = $derived(
		pendente > 0 && !enviando && placaOk && capacidadeOk && anoOk && consumoOk
	);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.tfd.veiculos.update(veiculo.id, patch);
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'PLACA_DUPLICADA' || e.code === 'TFD_VEICULO_PLACA_DUPLICADA') {
					erro = 'Já existe outro veículo com esta placa nesta prefeitura.';
				} else if (e.code === 'NENHUMA_ALTERACAO') {
					erro = 'Nenhuma alteração identificada.';
				} else {
					erro = mensagemErroTfd(e);
				}
			} else {
				erro = mensagemErroTfd(e);
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<section
		class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
	>
		Hodômetro é atualizado pela conclusão de viagens. Status (ativo/manutenção/inativo) é alterado
		pelas ações no detalhe do veículo. Todas as edições são auditadas.
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Identificação</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Placa"
				name="placa"
				span={4}
				mono
				bind:value={placa}
				hint="ABC-1234 ou ABC1D23"
			/>
			<FormField label="Modelo" name="modelo" span={5} bind:value={modelo} />
			<div class="col-span-3 flex flex-col">
				<label
					for="tipo"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Tipo
				</label>
				<select
					id="tipo"
					bind:value={tipo}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each tipos as t (t.v)}
						<option value={t.v}>{t.l}</option>
					{/each}
				</select>
			</div>
			<FormField label="Ano" name="ano" type="number" span={3} mono bind:value={ano} />
			<FormField
				label="Capacidade (passageiros)"
				name="capacidade"
				type="number"
				span={3}
				mono
				bind:value={capacidade}
			/>
			<div class="col-span-3 flex flex-col">
				<label
					for="combustivel"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Combustível
				</label>
				<select
					id="combustivel"
					bind:value={combustivel}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each combustiveis as c (c.v)}
						<option value={c.v}>{c.l}</option>
					{/each}
				</select>
			</div>
			<FormField
				label="Consumo médio (km/L)"
				name="consumoMedioKml"
				type="number"
				span={3}
				mono
				bind:value={consumoMedioKml}
			/>
		</div>
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Manutenção programada (opcional)
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Próxima revisão (km)"
				name="proximaRevisaoKm"
				type="number"
				span={6}
				mono
				bind:value={proximaRevisaoKm}
				hint="Deixe vazio para limpar"
			/>
			<FormField
				label="Próxima revisão (data)"
				name="proximaRevisaoEm"
				type="date"
				span={6}
				mono
				bind:value={proximaRevisaoEm}
			/>
		</div>
	</section>

	{#if erro}
		<div class="border border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-800">
			{erro}
		</div>
	{/if}

	<div class="flex items-center justify-between pt-2">
		<span class="font-sans text-[11px] text-slate-500">
			{pendente === 0
				? 'Nenhum campo alterado'
				: `${pendente} campo${pendente === 1 ? '' : 's'} alterado${pendente === 1 ? '' : 's'}`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} disabled={enviando} />
			<PrimaryButton
				label={enviando ? 'Salvando...' : 'Salvar alterações'}
				onclick={salvar}
				disabled={!podeSalvar}
			/>
		</div>
	</div>
</div>
