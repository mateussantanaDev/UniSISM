<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import EditarPrefeitura from '$lib/presentation/components/EditarPrefeitura.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Prefeitura } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	const auth = useAuth();

	let lista = $state<Prefeitura[]>([]);
	let carregando = $state(true);

	// Modal criar
	let modalAberto = $state(false);
	let nome = $state('');
	let municipio = $state('');
	let uf = $state('BA');
	let cnpj = $state('');
	let enviando = $state(false);
	let erro = $state('');

	// Modal editar
	let prefeituraSelecionada = $state<Prefeitura | null>(null);
	let editarAberto = $state(false);

	// Modal confirmação exclusão
	let excluirAberto = $state(false);
	let prefeituraParaExcluir = $state<Prefeitura | null>(null);
	let excluindo = $state(false);

	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	onMount(async () => {
		if (auth.me && auth.me.role !== 'DESENVOLVEDOR') {
			goto('/sms/configuracoes/parametros', { replaceState: true });
			return;
		}
		try {
			lista = await api.admin.listPrefeituras();
		} finally {
			carregando = false;
		}
	});

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	async function criar() {
		erro = '';
		if (!nome.trim() || !municipio.trim() || !uf.trim()) {
			erro = 'Preencha nome, município e UF.';
			return;
		}
		enviando = true;
		try {
			const nova = await api.admin.createPrefeitura({
				nome: nome.trim(),
				municipio: municipio.trim(),
				uf: uf.trim().toUpperCase(),
				cnpj: cnpj.trim() || undefined
			});
			lista = [nova, ...lista];
			modalAberto = false;
			nome = '';
			municipio = '';
			uf = 'BA';
			cnpj = '';
			notificar('ok', 'Prefeitura cadastrada.');
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'PREFEITURA_DUPLICADA':
						erro = 'Já existe prefeitura com este CNPJ.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Apenas DESENVOLVEDOR pode criar prefeituras.';
						break;
					default:
						erro = e.message || 'Falha ao criar prefeitura.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}

	function abrirEditar(p: Prefeitura) {
		prefeituraSelecionada = p;
		editarAberto = true;
	}

	function handleSalvo(atualizada: Prefeitura) {
		lista = lista.map((p) => (p.id === atualizada.id ? atualizada : p));
		editarAberto = false;
		prefeituraSelecionada = null;
		notificar('ok', 'Prefeitura atualizada.');
	}

	function abrirExcluir(p: Prefeitura) {
		prefeituraParaExcluir = p;
		excluirAberto = true;
	}

	async function confirmarExcluir() {
		if (!prefeituraParaExcluir) return;
		excluindo = true;
		try {
			await api.admin.deletePrefeitura(prefeituraParaExcluir.id);
			lista = lista.filter((p) => p.id !== prefeituraParaExcluir!.id);
			notificar('ok', 'Prefeitura excluída.');
			excluirAberto = false;
			prefeituraParaExcluir = null;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'PREFEITURA_TEM_UBS_VINCULADAS':
						notificar('erro', 'Prefeitura possui UBSs vinculadas. Migre-as antes de excluir.');
						break;
					case 'PREFEITURA_TEM_USUARIOS':
						notificar('erro', 'Prefeitura possui usuários vinculados. Desative-os antes.');
						break;
					case 'PERMISSAO_INSUFICIENTE':
						notificar('erro', 'Somente DESENVOLVEDOR pode excluir prefeituras.');
						break;
					default:
						notificar('erro', e.message || 'Falha ao excluir.');
				}
			} else {
				notificar('erro', 'Falha de conexão com o servidor.');
			}
			excluirAberto = false;
		} finally {
			excluindo = false;
		}
	}

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function abrirModal() {
		erro = '';
		modalAberto = true;
	}

	// Só DESENVOLVEDOR pode deletar prefeituras (regra mais estrita que ehAdminOuDev)
	let podeDeletar = $derived(auth.me?.role === 'DESENVOLVEDOR');
</script>

{#if auth.me?.role === 'DESENVOLVEDOR'}
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

	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Prefeituras"
			value={carregando ? '—' : lista.length}
			sublabel="Cadastradas na plataforma"
		/>
		<MetricCard
			label="Ativas"
			value={carregando ? '—' : lista.filter((p) => p.ativa).length}
			sublabel="Em operação"
			accent="success"
		/>
		<MetricCard
			label="Inativas"
			value={carregando ? '—' : lista.filter((p) => !p.ativa).length}
			sublabel="Desabilitadas"
			accent="critical"
		/>
		<MetricCard
			label="UFs Cobertas"
			value={carregando ? '—' : new Set(lista.map((p) => p.uf)).size}
			sublabel="Estados diferentes"
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Prefeituras"
			subtitle="Cadastro de clientes institucionais · edição restrita a Admin/Dev · exclusão só Dev"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{lista.length} REGISTROS
			</span>
			{#if auth.podeCriarPrefeitura}
				<PrimaryButton label="+ Nova Prefeitura" onclick={abrirModal} />
			{/if}
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">Município</th>
						<th class="border-r border-slate-200 px-3 py-2">UF</th>
						<th class="border-r border-slate-200 px-3 py-2">CNPJ</th>
						<th class="border-r border-slate-200 px-3 py-2">Cadastrada</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						{#if auth.ehAdminOuDev}
							<th class="px-3 py-2">Ações</th>
						{/if}
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(3) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan={auth.ehAdminOuDev ? 7 : 6} class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if lista.length === 0}
						<tr>
							<td
								colspan={auth.ehAdminOuDev ? 7 : 6}
								class="px-3 py-12 text-center font-sans text-sm text-slate-500"
							>
								Nenhuma prefeitura cadastrada.
							</td>
						</tr>
					{:else}
						{#each lista as p (p.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{p.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{p.municipio}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">{p.uf}</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{p.cnpj ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(p.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									{#if p.ativa}
										<span
											class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
										>
											ATIVA
										</span>
									{:else}
										<span
											class="border border-red-700 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-red-800 uppercase"
										>
											INATIVA
										</span>
									{/if}
								</td>
								{#if auth.ehAdminOuDev}
									<td class="flex gap-1.5 px-3 py-2">
										<button
											type="button"
											onclick={() => abrirEditar(p)}
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											Editar
										</button>
										{#if podeDeletar}
											<button
												type="button"
												onclick={() => abrirExcluir(p)}
												class="border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
											>
												Excluir
											</button>
										{/if}
									</td>
								{/if}
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal criar -->
<Modal
	isOpen={modalAberto}
	onClose={() => (modalAberto = false)}
	title="Nova Prefeitura"
	subtitle="Cadastro institucional na plataforma UNISISM"
	maxWidth="md"
>
	<div class="flex flex-col gap-4 font-mono text-slate-900">
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Nome da Prefeitura" name="nome" span={12} bind:value={nome} />
			<FormField label="Município" name="municipio" span={8} bind:value={municipio} />
			<FormField label="UF" name="uf" span={4} mono bind:value={uf} />
			<FormField label="CNPJ (opcional)" name="cnpj" span={12} mono bind:value={cnpj} />
		</div>

		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => (modalAberto = false)}
			/>
			<PrimaryButton label="Cadastrar Prefeitura" onclick={criar} loading={enviando} />
		</div>
	</div>
</Modal>

<!-- Modal editar -->
{#if prefeituraSelecionada}
	<Modal
		isOpen={editarAberto}
		onClose={() => {
			editarAberto = false;
			prefeituraSelecionada = null;
		}}
		title="Editar Prefeitura"
		subtitle="Atualizar dados cadastrais"
		maxWidth="md"
	>
		<EditarPrefeitura
			prefeitura={prefeituraSelecionada}
			onCancel={() => {
				editarAberto = false;
				prefeituraSelecionada = null;
			}}
			onSaved={handleSalvo}
		/>
	</Modal>
{/if}

<!-- Modal excluir -->
{#if prefeituraParaExcluir}
	<Modal
		isOpen={excluirAberto}
		onClose={() => {
			excluirAberto = false;
			prefeituraParaExcluir = null;
		}}
		title="Confirmar Exclusão"
		subtitle="Ação irreversível · auditada"
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			<div
				class="border-2 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900"
			>
				<strong>Atenção:</strong> excluir <strong>{prefeituraParaExcluir.nome}</strong>
				remove o cliente institucional da plataforma. Esta operação <strong
					>afeta todos os usuários, UBSs e encaminhamentos</strong
				> vinculados — só conclui se a prefeitura estiver sem vínculos ativos.
			</div>
			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => {
						excluirAberto = false;
						prefeituraParaExcluir = null;
					}}
				/>
				<PrimaryButton
					label="Sim, Excluir"
					variant="danger"
					loading={excluindo}
					onclick={confirmarExcluir}
				/>
			</div>
		</div>
	</Modal>
{/if}
{/if}
