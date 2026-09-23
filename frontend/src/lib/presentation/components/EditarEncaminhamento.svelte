<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		AtualizarEncaminhamentoRequest,
		Encaminhamento,
		PrioridadeClinica
	} from '$lib/api/types';

	interface Props {
		encaminhamento: Encaminhamento;
		onCancel: () => void;
		onSaved: (atualizado: Encaminhamento) => void;
	}

	let { encaminhamento, onCancel, onSaved }: Props = $props();

	// Snapshot dos valores originais — capturados no momento da abertura do modal
	// via untrack(), sem criar dependência reativa.
	const orig = untrack(() => ({
		pacienteNome: encaminhamento.paciente.nome,
		pacienteTelefone: encaminhamento.paciente.telefone,
		pacienteEndereco: encaminhamento.paciente.endereco,
		cid10: encaminhamento.solicitacao.cid10,
		cidDescricao: encaminhamento.solicitacao.cidDescricao,
		especialidadeSolicitada: encaminhamento.solicitacao.especialidadeSolicitada,
		justificativaClinica: encaminhamento.solicitacao.justificativaClinica,
		prioridade: encaminhamento.solicitacao.prioridade
	}));

	// Estado editável.
	let pacienteNome = $state(orig.pacienteNome);
	let pacienteTelefone = $state(orig.pacienteTelefone);
	let pacienteEndereco = $state(orig.pacienteEndereco);
	let cid10 = $state(orig.cid10);
	let cidDescricao = $state(orig.cidDescricao);
	let especialidadeSolicitada = $state(orig.especialidadeSolicitada);
	let justificativaClinica = $state(orig.justificativaClinica);
	let prioridade = $state<PrioridadeClinica>(orig.prioridade);

	let enviando = $state(false);
	let erro = $state('');

	const prioridadeOpcoes: { valor: PrioridadeClinica; label: string }[] = [
		{ valor: 'ELETIVA', label: 'Eletiva' },
		{ valor: 'PRIORITARIA', label: 'Prioritária' },
		{ valor: 'URGENTE', label: 'Urgente' },
		{ valor: 'EMERGENCIA', label: 'Emergência' }
	];

	function diff(): AtualizarEncaminhamentoRequest {
		const out: AtualizarEncaminhamentoRequest = {};
		if (pacienteNome.trim() !== orig.pacienteNome) out.pacienteNome = pacienteNome.trim();
		if (pacienteTelefone.trim() !== orig.pacienteTelefone)
			out.pacienteTelefone = pacienteTelefone.trim();
		if (pacienteEndereco.trim() !== orig.pacienteEndereco)
			out.pacienteEndereco = pacienteEndereco.trim();
		if (cid10.trim().toUpperCase() !== orig.cid10.toUpperCase())
			out.cid10 = cid10.trim().toUpperCase();
		if (cidDescricao.trim() !== orig.cidDescricao) out.cidDescricao = cidDescricao.trim();
		if (especialidadeSolicitada.trim() !== orig.especialidadeSolicitada)
			out.especialidadeSolicitada = especialidadeSolicitada.trim();
		if (justificativaClinica.trim() !== orig.justificativaClinica)
			out.justificativaClinica = justificativaClinica.trim();
		if (prioridade !== orig.prioridade) out.prioridade = prioridade;
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let podeSalvar = $derived(pendente > 0 && !enviando);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		if (!justificativaClinica.trim()) {
			erro = 'A justificativa clínica não pode ficar em branco.';
			return;
		}

		enviando = true;
		try {
			const atualizado = await api.encaminhamentos.update(encaminhamento.id, patch);
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'EDICAO_NAO_PERMITIDA':
						erro = 'O status atual não permite edição. Reabra o fluxo pela pendência.';
						break;
					case 'NENHUMA_ALTERACAO':
						erro = 'Nenhuma alteração identificada.';
						break;
					case 'JUSTIFICATIVA_VAZIA':
						erro = 'A justificativa clínica não pode ficar em branco.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para editar este encaminhamento.';
						break;
					default:
						erro = e.message || 'Falha ao salvar alterações.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<!-- Aviso -->
	<section
		class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
	>
		Edição permitida apenas enquanto o encaminhamento estiver em
		<strong>AGUARDANDO_REGULACAO</strong>. Qualquer alteração aparecerá na linha do tempo como
		evento <strong>EDITADO</strong>.
	</section>

	<!-- Dados do paciente -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Contato do Paciente
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome Completo" name="pacienteNome" span={12} bind:value={pacienteNome} />
			<FormField
				label="Telefone"
				name="pacienteTelefone"
				span={4}
				mono
				bind:value={pacienteTelefone}
			/>
			<FormField label="Endereço" name="pacienteEndereco" span={8} bind:value={pacienteEndereco} />
		</div>
	</section>

	<!-- Dados clínicos -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Solicitação Clínica
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="CID-10" name="cid10" span={3} mono bind:value={cid10} />
			<FormField label="Descrição do CID" name="cidDescricao" span={9} bind:value={cidDescricao} />
			<FormField
				label="Especialidade Solicitada"
				name="especialidadeSolicitada"
				span={8}
				bind:value={especialidadeSolicitada}
			/>

			<div class="col-span-4 flex flex-col">
				<label
					for="prioridade"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Prioridade
				</label>
				<select
					id="prioridade"
					bind:value={prioridade}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each prioridadeOpcoes as opt (opt.valor)}
						<option value={opt.valor}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="col-span-12 flex flex-col">
				<label
					for="justificativaClinica"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Justificativa Clínica
				</label>
				<textarea
					id="justificativaClinica"
					bind:value={justificativaClinica}
					rows="4"
					class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
			</div>
		</div>
	</section>

	<!-- Resumo das mudanças -->
	<section
		class="border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] tracking-wider text-slate-700"
	>
		<span class="font-bold uppercase">
			{pendente === 0 ? 'Nenhuma alteração' : `${pendente} campo(s) modificado(s)`}
		</span>
		<span class="text-slate-500">· enviado como PATCH atômico</span>
	</section>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
		<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
		<PrimaryButton
			label="Salvar Alterações"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
