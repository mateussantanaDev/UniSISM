<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import SeatPicker from '$lib/presentation/components/SeatPicker.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { hojeYmd } from '$lib/presentation/utils/tfdFormat';
	import type { Motorista, SolicitacaoTFD, Veiculo } from '$lib/api/tfd-types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let veiculos = $state<Veiculo[]>([]);
	let motoristas = $state<Motorista[]>([]);
	let solicitacaoSemente = $state<SolicitacaoTFD | null>(null);
	let carregando = $state(true);
	let erro = $state('');

	let data = $state(hojeYmd());
	let horaSaida = $state('05:00');
	let horaPrevistaRetorno = $state('20:00');
	let veiculoId = $state('');
	let motoristaId = $state('');
	let destino = $state('');
	let unidadeDestino = $state('');
	let rotaResumo = $state('');
	// String pra ligar direto no FormField (que tem fallback ''). Convertido
	// pra Number só no submit. Antes era number|undefined com cast inseguro,
	// e o Svelte 5 rejeita bind:value={undefined} quando o bindable tem fallback.
	let kmEstimados = $state('');
	let observacoes = $state('');

	let isRegistroTardio = $state(false);
	let justificativaTardia = $state('Lançamento retroativo de viagem executada em caráter emergencial.');

	const veiculosAtivos = $derived(veiculos.filter((v) => v.status === 'ATIVO'));
	const motoristasAtivos = $derived(motoristas.filter((m) => m.status === 'ATIVO'));
	const veiculoSelecionado = $derived(veiculosAtivos.find((v) => v.id === veiculoId) ?? null);
	const motoristaSelecionado = $derived(
		motoristasAtivos.find((m) => m.id === motoristaId) ?? null
	);
	const capacidade = $derived(veiculoSelecionado?.capacidade ?? 0);

	let processando = $state(false);

	async function carregar() {
		carregando = true;
		erro = '';
		try {
			const solicitacaoId = page.url.searchParams.get('solicitacao');
			const promises: [Promise<Veiculo[]>, Promise<Motorista[]>, Promise<SolicitacaoTFD | null>] = [
				api.tfd.veiculos.list(),
				api.tfd.motoristas.list(),
				solicitacaoId ? api.tfd.solicitacoes.byId(solicitacaoId) : Promise.resolve(null)
			];
			const [vs, ms, sol] = await Promise.all(promises);
			veiculos = vs;
			motoristas = ms;
			solicitacaoSemente = sol;

			if (sol) {
				destino = sol.destino;
				unidadeDestino = sol.unidadeDestino ?? '';
				if (sol.dataDesejada) data = sol.dataDesejada;
				observacoes = `Viagem para atender solicitação ${sol.protocolo} · ${sol.especialidade}`;
			}
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	async function publicar() {
		erro = '';
		if (!veiculoId) return (erro = 'Selecione um veículo (placa).');
		if (!motoristaId) return (erro = 'Selecione um motorista.');
		if (!destino.trim()) return (erro = 'Informe o destino.');
		if (!data || !horaSaida) return (erro = 'Data e hora de saída são obrigatórias.');

		processando = true;
		try {
			const obsComposta = isRegistroTardio
				? `[REGISTRO TARDIO / VIAGEM REALIZADA] Justificativa: ${justificativaTardia} | ${observacoes.trim()}`
				: (observacoes.trim() || undefined);

			const v = await api.tfd.viagens.create({
				data,
				horaSaida,
				horaPrevistaRetorno: horaPrevistaRetorno || undefined,
				veiculoId,
				motoristaId,
				destino: destino.trim(),
				unidadeDestino: unidadeDestino.trim() || undefined,
				rotaResumo: rotaResumo.trim() || undefined,
				kmEstimados: kmEstimados.trim() ? Number(kmEstimados) : undefined,
				observacoes: obsComposta,
				isRegistroTardio,
				justificativaTardia: isRegistroTardio ? justificativaTardia : undefined,
				statusDirect: isRegistroTardio ? 'CONCLUIDA' : undefined
			});
			// Se viemos de uma solicitação aprovada, tenta alocar imediatamente
			if (solicitacaoSemente && solicitacaoSemente.status === 'APROVADA') {
				try {
					await api.tfd.viagens.alocarPassageiro(v.id, {
						solicitacaoId: solicitacaoSemente.id
					});
				} catch (e) {
					// não trava a navegação se a alocação falhar
					console.warn('Falha ao alocar passageiro automaticamente:', e);
				}
			}
			goto(`/tfd/viagens/${v.id}`);
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			processando = false;
		}
	}
</script>

<div class="grid grid-cols-12 gap-4">
	<!-- Coluna principal · formulário -->
	<section class="col-span-12 xl:col-span-8">
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Programar Nova Viagem"
				subtitle="Cadastre uma viagem com assentos disponíveis · pacientes serão alocados depois conforme solicitações forem aprovadas"
				index="01"
			/>

			{#if solicitacaoSemente}
				<div
					class="border-b border-blue-300 bg-blue-50 px-4 py-2.5 font-mono text-[11px] tracking-wider text-blue-900"
				>
					Criando viagem para atender solicitação <strong>{solicitacaoSemente.protocolo}</strong>
					· {solicitacaoSemente.pacienteNome ?? 'paciente'} · {solicitacaoSemente.especialidade}
				</div>
			{/if}

			<div class="grid grid-cols-12 gap-3 p-4">
				<!-- Modo de Viagem: Regular vs Registro Tardio -->
				<div class="col-span-12 border border-amber-300 bg-amber-50/60 p-3 font-mono text-xs flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-bold text-amber-950 uppercase tracking-wider text-[10px]">
							⚡ MODO DE REGISTRO DA VIAGEM TFD
						</span>
						<span class="text-[9px] text-amber-800 font-bold uppercase">Planejada vs Retroativa</span>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							onclick={() => isRegistroTardio = false}
							class="px-2.5 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {!isRegistroTardio ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
						>
							<span>🚐 PROGRAMAR VIAGEM FUTURA</span>
						</button>
						<button
							type="button"
							onclick={() => isRegistroTardio = true}
							class="px-2.5 py-1.5 font-bold uppercase border transition-colors flex items-center justify-center gap-1 {isRegistroTardio ? 'border-amber-900 bg-amber-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
						>
							<span>🔙 REGISTRO TARDIO (RETROATIVA)</span>
						</button>
					</div>

					{#if isRegistroTardio}
						<div class="flex flex-col gap-2 border-t border-amber-300 pt-2 font-sans text-xs">
							<div class="bg-amber-100 border border-amber-300 p-2 text-[10px] text-amber-950">
								<strong>💡 Registro Tardio de Viagem:</strong> Registre as viagens de emergência já realizadas (*ex: transporte de final de semana, ambulância de suporte ou frota emergencial*). O status da viagem será salvo diretamente como <strong>CONCLUÍDA</strong>.
							</div>
							<div class="flex flex-col gap-1 font-mono">
								<label for="just-via-tardia" class="text-[9px] font-bold text-amber-950 uppercase">Justificativa da Viagem Tardia *</label>
								<input
									id="just-via-tardia"
									type="text"
									bind:value={justificativaTardia}
									class="border border-amber-400 bg-white px-2 py-1 outline-none text-xs font-sans"
								/>
							</div>
						</div>
					{/if}
				</div>

				<!-- Identidade da viagem -->
				<div
					class="col-span-12 mb-1 border-b border-slate-200 pb-1.5 font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
				>
					Quando · Rota
				</div>

				<FormField label="Data" name="data" type="date" span={3} mono bind:value={data} />
				<FormField
					label="Hora de Saída"
					name="hsaida"
					span={3}
					mono
					placeholder="04:30"
					bind:value={horaSaida}
				/>
				<FormField
					label="Retorno Previsto"
					name="hretorno"
					span={3}
					mono
					placeholder="20:00 (opcional)"
					bind:value={horaPrevistaRetorno}
				/>
				<FormField
					label="KM Estimados"
					name="km"
					type="number"
					span={3}
					mono
					bind:value={kmEstimados}
				/>

				<FormField
					label="Destino (cidade/estado)"
					name="dest"
					span={6}
					placeholder="Ex.: Salvador / BA"
					bind:value={destino}
				/>
				<FormField
					label="Unidade Destino"
					name="udest"
					span={6}
					placeholder="Ex.: Hospital Ana Nery"
					bind:value={unidadeDestino}
				/>

				<FormField
					label="Rota / Trajeto"
					name="rota"
					span={12}
					placeholder="Ex.: BR-101 → BR-324 (anote pontos relevantes)"
					bind:value={rotaResumo}
				/>

				<!-- Frota + equipe -->
				<div
					class="col-span-12 mt-3 mb-1 border-b border-slate-200 pb-1.5 font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase"
				>
					Veículo · Motorista
				</div>

				<div class="col-span-6 flex flex-col">
					<label
						for="vid"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Placa do Veículo (somente ATIVOS)
					</label>
					<select
						id="vid"
						bind:value={veiculoId}
						disabled={carregando}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50"
					>
						<option value="">{carregando ? 'Carregando...' : '— Selecione uma placa —'}</option>
						{#each veiculosAtivos as v (v.id)}
							<option value={v.id}>
								{v.placa} · {v.modelo} · {v.capacidade} lug.
							</option>
						{/each}
					</select>
				</div>

				<div class="col-span-6 flex flex-col">
					<label
						for="mid"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Motorista (somente ATIVOS)
					</label>
					<select
						id="mid"
						bind:value={motoristaId}
						disabled={carregando}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:bg-slate-50"
					>
						<option value="">{carregando ? 'Carregando...' : '— Selecione —'}</option>
						{#each motoristasAtivos as m (m.id)}
							<option value={m.id}>
								{m.nome} · CNH cat. {m.categoriaCnh}
							</option>
						{/each}
					</select>
				</div>

				<div class="col-span-12 flex flex-col">
					<label
						for="obs"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Observações
					</label>
					<textarea
						id="obs"
						bind:value={observacoes}
						rows="3"
						placeholder="Ex.: viagem prioritária para retorno cardiológico"
						class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					></textarea>
				</div>

				{#if erro}
					<div
						class="col-span-12 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
					>
						⚠ {erro}
					</div>
				{/if}
			</div>
		</div>

		<!-- Preview dos assentos -->
		{#if veiculoSelecionado}
			<div class="mt-4 border border-slate-200 bg-white">
				<PanelHeader
					title="Assentos Disponíveis"
					subtitle="{capacidade} assentos vão nascer livres · pacientes alocados conforme solicitações forem aprovadas"
					index="02"
				>
					<span
						class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
					>
						{capacidade}/{capacidade} LIVRES
					</span>
				</PanelHeader>
				<div class="p-4">
					<SeatPicker capacidade={veiculoSelecionado.capacidade} passageiros={[]} readonly />
				</div>
			</div>
		{/if}
	</section>

	<!-- Coluna lateral · resumo + ações -->
	<aside class="col-span-12 flex flex-col gap-4 xl:col-span-4">
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Resumo da Viagem" index="03" />
			<dl class="grid grid-cols-1 gap-3 px-4 py-3 font-mono text-[11px]">
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Data</dt>
					<dd class="font-bold text-slate-900">{data || '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Saída</dt>
					<dd class="font-bold text-slate-900">{horaSaida || '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Placa</dt>
					<dd class="text-slate-900">{veiculoSelecionado?.placa ?? '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Modelo</dt>
					<dd class="truncate text-slate-900">{veiculoSelecionado?.modelo ?? '—'}</dd>
				</div>
				<div class="flex items-center justify-between border-t border-slate-200 pt-2">
					<dt class="font-bold tracking-widest text-slate-700 uppercase">Assentos</dt>
					<dd class="text-2xl font-bold text-blue-900">
						{capacidade || '—'}
					</dd>
				</div>
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Motorista</dt>
					<dd class="truncate text-slate-900">{motoristaSelecionado?.nome ?? '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="tracking-widest text-slate-500 uppercase">Destino</dt>
					<dd class="truncate text-slate-900">{destino || '—'}</dd>
				</div>
			</dl>
		</div>

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
		>
			<strong class="font-mono tracking-wider uppercase">Modo BlaBlaCar:</strong>
			a viagem nasce com todos os assentos livres. Pacientes vão sendo embarcados conforme solicitações
			forem aprovadas — escolhe-se o assento na hora da aprovação.
		</div>

		<div class="flex justify-between gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={() => goto('/tfd/viagens')} />
			<PrimaryButton
				label="Publicar Viagem"
				onclick={publicar}
				loading={processando}
				disabled={carregando || !veiculoId || !motoristaId || !destino.trim()}
			/>
		</div>
	</aside>
</div>
