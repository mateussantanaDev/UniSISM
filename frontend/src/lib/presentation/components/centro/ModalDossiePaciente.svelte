<script lang="ts">
	import Modal from '$lib/presentation/components/Modal.svelte';
	import type { PacienteCompleto } from '$lib/domain/models/Paciente';

	let {
		isOpen,
		carregando,
		paciente,
		onClose,
		onImprimirProntuario
	}: {
		isOpen: boolean;
		carregando: boolean;
		paciente: PacienteCompleto | null;
		onClose: () => void;
		onImprimirProntuario: () => void;
	} = $props();

	let abaDossieAtiva = $state<'resumo' | 'quadro' | 'atendimentos' | 'exames' | 'vacinas'>('resumo');
</script>

<Modal
	{isOpen}
	{onClose}
	title="DOSSIÊ COMPLETO DO PACIENTE (PEC)"
	subtitle={paciente ? `${paciente.nome} · CPF: ${paciente.cpf}` : ''}
	maxWidth="xl"
>
	{#if carregando}
		<div class="p-8 text-center font-mono text-xs text-slate-500">
			Carregando prontuário eletrônico completo...
		</div>
	{:else if paciente}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<!-- Header Resumo com Impressão -->
			<div class="border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<div class="text-base font-bold text-slate-900 font-sans">{paciente.nome}</div>
					<div class="text-xs text-slate-600">
						Cartão SUS: {paciente.cartaoSus} · {paciente.sexo === 'M' ? 'Masculino' : 'Feminino'} · Nascimento: {paciente.dataNascimento}
					</div>
				</div>

				<button
					type="button"
					onclick={onImprimirProntuario}
					class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950"
				>
					🖨️ Imprimir Prontuário Completo
				</button>
			</div>

			<!-- Abas do Dossiê -->
			<div class="flex border-b border-slate-200 bg-slate-100 overflow-x-auto" role="tablist" aria-label="Abas do Prontuário">
				<button
					type="button"
					role="tab"
					aria-selected={abaDossieAtiva === 'resumo'}
					onclick={() => (abaDossieAtiva = 'resumo')}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'resumo' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Resumo
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={abaDossieAtiva === 'quadro'}
					onclick={() => (abaDossieAtiva = 'quadro')}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'quadro' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Alergias & Crônicas
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={abaDossieAtiva === 'atendimentos'}
					onclick={() => (abaDossieAtiva = 'atendimentos')}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'atendimentos' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Histórico de Consultas
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={abaDossieAtiva === 'exames'}
					onclick={() => (abaDossieAtiva = 'exames')}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'exames' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Exames Realizados
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={abaDossieAtiva === 'vacinas'}
					onclick={() => (abaDossieAtiva = 'vacinas')}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'vacinas' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Vacinação
				</button>
			</div>

			<!-- Conteúdo das Abas -->
			<div class="p-4 border border-slate-200 bg-white min-h-[250px]">
				{#if abaDossieAtiva === 'resumo'}
					<div class="grid grid-cols-2 gap-4 font-sans text-xs">
						<div>
							<h4 class="font-mono font-bold text-slate-500 text-[10px] uppercase border-b pb-1 mb-2">Dados Cadastrais</h4>
							<p><strong>Mãe:</strong> {paciente.nomeMae}</p>
							<p><strong>Endereço:</strong> {paciente.endereco}, {paciente.bairro} - {paciente.municipio}/{paciente.uf}</p>
							<p><strong>Telefone:</strong> {paciente.telefone}</p>
							<p><strong>Unidade de Vínculo:</strong> {paciente.unidadeVinculada}</p>
						</div>
						<div>
							<h4 class="font-mono font-bold text-slate-500 text-[10px] uppercase border-b pb-1 mb-2">Alertas de Saúde</h4>
							<p><strong class="text-red-700">Alergias:</strong> {paciente.alergias.map(a => a.substancia).join(', ') || 'Nenhuma'}</p>
							<p><strong>Condições Crônicas:</strong> {paciente.condicoesCronicas.map(c => c.descricao).join(', ') || 'Nenhuma'}</p>
							<p><strong>Medicamentos em Uso:</strong> {paciente.medicamentosEmUso.map(m => `${m.nome} ${m.dosagem}`).join(', ') || 'Nenhum'}</p>
						</div>
					</div>
				{:else if abaDossieAtiva === 'quadro'}
					<div class="flex flex-col gap-4 font-sans text-xs">
						<!-- Alergias -->
						<div>
							<h4 class="font-mono font-bold text-red-700 text-xs uppercase mb-2">Alergias Registradas</h4>
							<div class="border border-red-200 bg-red-50 p-3">
								{#each paciente.alergias as al}
									<div class="font-bold text-red-900">{al.substancia} ({al.tipo}) — Gravidade: {al.gravidade}</div>
									<div class="text-xs text-red-800">{al.observacao}</div>
								{:else}
									<div class="text-slate-500">Nenhuma alergia registrada.</div>
								{/each}
							</div>
						</div>

						<!-- Medicamentos em Uso -->
						<div>
							<h4 class="font-mono font-bold text-slate-800 text-xs uppercase mb-2">Medicamentos em Uso Contínuo</h4>
							<table class="w-full border-collapse font-mono text-xs border border-slate-200">
								<thead>
									<tr class="bg-slate-100 text-left border-b border-slate-200">
										<th class="p-2">Medicamento</th>
										<th class="p-2">Dosagem</th>
										<th class="p-2">Frequência</th>
										<th class="p-2">Prescritor</th>
									</tr>
								</thead>
								<tbody>
									{#each paciente.medicamentosEmUso as med}
										<tr class="border-b border-slate-100">
											<td class="p-2 font-bold">{med.nome}</td>
											<td class="p-2">{med.dosagem}</td>
											<td class="p-2">{med.frequencia}</td>
											<td class="p-2">{med.prescritor}</td>
										</tr>
									{:else}
										<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhum medicamento registrado.</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else if abaDossieAtiva === 'atendimentos'}
					<div class="flex flex-col gap-3 font-sans text-xs">
						{#each paciente.atendimentos as at}
							<div class="border border-slate-200 p-3 bg-slate-50">
								<div class="flex justify-between border-b border-slate-200 pb-1.5 font-mono text-[11px] text-slate-600">
									<span>{new Date(at.data).toLocaleString('pt-BR')} — <strong>{at.profissional}</strong> ({at.especialidade})</span>
									<span>CID-10: <strong>{at.cid10}</strong></span>
								</div>
								<div class="mt-2">
									<p><strong>Queixa:</strong> {at.queixaPrincipal}</p>
									<p><strong>Diagnóstico:</strong> {at.diagnostico}</p>
									<p><strong>Conduta:</strong> {at.conduta}</p>
								</div>
							</div>
						{:else}
							<div class="p-8 text-center text-slate-500">Nenhum atendimento anterior registrado.</div>
						{/each}
					</div>
				{:else if abaDossieAtiva === 'exames'}
					<table class="w-full border-collapse font-mono text-xs border border-slate-200">
						<thead>
							<tr class="bg-slate-100 text-left border-b border-slate-200">
								<th class="p-2">Data</th>
								<th class="p-2">Exame</th>
								<th class="p-2">Solicitante</th>
								<th class="p-2">Resultado</th>
							</tr>
						</thead>
						<tbody>
							{#each paciente.exames as ex}
								<tr class="border-b border-slate-100">
									<td class="p-2">{ex.data}</td>
									<td class="p-2 font-bold">{ex.tipo}</td>
									<td class="p-2">{ex.solicitante}</td>
									<td class="p-2 font-bold {ex.resultado === 'ALTERADO' ? 'text-red-700' : 'text-emerald-700'}">{ex.resultado}</td>
								</tr>
							{:else}
								<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhum exame registrado.</td></tr>
							{/each}
						</tbody>
					</table>
				{:else if abaDossieAtiva === 'vacinas'}
					<table class="w-full border-collapse font-mono text-xs border border-slate-200">
						<thead>
							<tr class="bg-slate-100 text-left border-b border-slate-200">
								<th class="p-2">Data</th>
								<th class="p-2">Vacina</th>
								<th class="p-2">Dose</th>
								<th class="p-2">Lote</th>
							</tr>
						</thead>
						<tbody>
							{#each paciente.vacinacoes as vc}
								<tr class="border-b border-slate-100">
									<td class="p-2">{vc.data}</td>
									<td class="p-2 font-bold">{vc.vacina}</td>
									<td class="p-2">{vc.dose}</td>
									<td class="p-2">{vc.lote}</td>
								</tr>
							{:else}
								<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhuma vacina registrada.</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<div class="flex justify-end pt-2">
				<button
					type="button"
					onclick={onClose}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-50"
				>
					Fechar Dossiê
				</button>
			</div>
		</div>
	{/if}
</Modal>
