<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import EditarUbs from '$lib/presentation/components/EditarUbs.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Ubs, Encaminhamento, UsuarioListado } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	let ubs = $state<Ubs | null>(null);
	let usuarios = $state<UsuarioListado[]>([]);
	let encaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state(false);

	let editarAberto = $state(false);
	let confirmarAcaoAberto = $state(false);
	let acaoEmCurso = $state<'ativar' | 'desativar' | 'excluir' | null>(null);
	let processando = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	onMount(async () => {
		const id = page.params.id;
		if (!id) {
			erro = true;
			carregando = false;
			return;
		}
		try {
			const [listaUbs, listaUsuarios, listaEnc] = await Promise.all([
				api.admin.listUbs(),
				api.admin.listUsuarios({ ubsId: id }),
				api.encaminhamentos.list({ limit: 500 })
			]);
			ubs = listaUbs.find((u) => u.id === id) ?? null;
			if (!ubs) erro = true;
			usuarios = listaUsuarios;
			encaminhamentos = listaEnc.filter((e) => e.unidadeOrigem.includes(ubs?.nome ?? '__'));
			// Atalho da lista: /sms/rede/ubs?edit=1 → já abre modal se user pode
			if (auth.ehAdminOuDev && page.url.searchParams.get('edit') === '1' && ubs) {
				editarAberto = true;
			}
		} catch {
			erro = true;
		} finally {
			carregando = false;
		}
	});

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function notificar(tipo: 'ok' | 'erro', texto: string) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function handleSalvo(atualizada: Ubs) {
		ubs = atualizada;
		editarAberto = false;
		notificar('ok', 'Dados da UBS atualizados.');
	}

	function abrirConfirmacao(acao: 'ativar' | 'desativar' | 'excluir') {
		acaoEmCurso = acao;
		confirmarAcaoAberto = true;
	}

	async function executarAcao() {
		if (!ubs || !acaoEmCurso) return;
		processando = true;
		try {
			if (acaoEmCurso === 'ativar' || acaoEmCurso === 'desativar') {
				const ativa = acaoEmCurso === 'ativar';
				await api.admin.setAtivoUbs(ubs.id, ativa);
				ubs = { ...ubs, ativa };
				notificar('ok', ativa ? 'UBS reativada.' : 'UBS desativada.');
			} else {
				await api.admin.deleteUbs(ubs.id);
				notificar('ok', 'UBS excluída — redirecionando...');
				setTimeout(() => goto('/sms/rede/ubs'), 1200);
			}
			confirmarAcaoAberto = false;
			acaoEmCurso = null;
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'UBS_TEM_USUARIOS_VINCULADOS':
						notificar('erro', 'UBS possui usuários vinculados. Migre-os antes de excluir.');
						break;
					case 'UBS_TEM_ENCAMINHAMENTOS':
						notificar(
							'erro',
							'UBS possui encaminhamentos no histórico. Desative em vez de excluir.'
						);
						break;
					case 'PERMISSAO_INSUFICIENTE':
						notificar('erro', 'Sem permissão para esta ação.');
						break;
					default:
						notificar('erro', e.message || 'Falha ao executar ação.');
				}
			} else {
				notificar('erro', 'Falha de conexão com o servidor.');
			}
			confirmarAcaoAberto = false;
		} finally {
			processando = false;
		}
	}

	let totalEncaminhamentos = $derived(encaminhamentos.length);
	let aguardando = $derived(
		encaminhamentos.filter((e) => e.status === 'AGUARDANDO_REGULACAO').length
	);
	let pendencias = $derived(
		encaminhamentos.filter((e) => e.status === 'PENDENCIA_DOCUMENTO').length
	);
	let aprovados = $derived(encaminhamentos.filter((e) => e.status === 'APROVADO').length);

	let podeAdmin = $derived(auth.ehAdminOuDev);
	let podeExcluir = $derived(podeAdmin && (usuarios.length === 0 || totalEncaminhamentos === 0));
</script>

{#if carregando}
	<div class="border border-slate-200 bg-white p-10 text-center">
		<div
			class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
		></div>
		<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
			Carregando UBS...
		</div>
	</div>
{:else if erro || !ubs}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			UBS não encontrada
		</div>
		<div class="mt-4">
			<PrimaryButton
				label="Voltar à Lista"
				variant="secondary"
				onclick={() => goto('/sms/rede/ubs')}
			/>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		{#if mensagem}
			<div
				class="border px-3 py-2 font-mono text-[11px] font-bold tracking-wider uppercase
					{mensagem.tipo === 'ok'
					? 'border-emerald-700 bg-emerald-50 text-emerald-900'
					: 'border-red-700 bg-red-50 text-red-900'}"
			>
				{mensagem.tipo === 'ok' ? '✓' : '⚠'}
				{mensagem.texto}
			</div>
		{/if}

		<!-- Header -->
		<div class="flex items-center justify-between border border-slate-200 bg-white px-4 py-3">
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					UBS · {ubs.ativa ? 'ATIVA' : 'INATIVA'}
				</div>
				<div class="text-sm font-bold text-slate-900">{ubs.nome}</div>
				<div class="font-mono text-[11px] text-slate-600">
					{ubs.municipio} / {ubs.uf} · CNES {ubs.cnes ?? '—'}
				</div>
			</div>
			<div class="flex items-center gap-2">
				<PrimaryButton label="← Voltar" variant="secondary" onclick={() => goto('/sms/rede/ubs')} />
			</div>
		</div>

		<section class="grid grid-cols-12 gap-4">
			<!-- Dados cadastrais -->
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
				<PanelHeader title="Dados Cadastrais" index="01">
					{#if podeAdmin}
						<PrimaryButton
							label="Editar"
							variant="secondary"
							onclick={() => (editarAberto = true)}
						/>
					{/if}
				</PanelHeader>
				<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
					<div class="col-span-12">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Nome</dt>
						<dd class="mt-0.5 text-sm font-bold text-slate-900">{ubs.nome}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CNES</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">{ubs.cnes ?? '—'}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Município
						</dt>
						<dd class="mt-0.5 text-sm text-slate-900">{ubs.municipio}</dd>
					</div>
					<div class="col-span-4">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">UF</dt>
						<dd class="mt-0.5 text-sm text-slate-900">{ubs.uf}</dd>
					</div>
					<div class="col-span-12">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Endereço
						</dt>
						<dd class="mt-0.5 text-sm text-slate-900">{ubs.endereco ?? '—'}</dd>
					</div>
					<div class="col-span-6">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Prefeitura
						</dt>
						<dd class="mt-0.5 text-sm text-slate-900">{ubs.prefeitura?.nome ?? '—'}</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Criada em
						</dt>
						<dd class="mt-0.5 font-mono text-sm text-slate-900">
							{formatarData(ubs.criadoEm)}
						</dd>
					</div>
					<div class="col-span-3">
						<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
							Status
						</dt>
						<dd class="mt-0.5">
							{#if ubs.ativa}
								<span
									class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
								>
									ATIVA
								</span>
							{:else}
								<span
									class="border border-red-700 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase"
								>
									INATIVA
								</span>
							{/if}
						</dd>
					</div>
				</dl>
			</div>

			<!-- Indicadores operacionais -->
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
				<PanelHeader title="Indicadores Operacionais" index="02" />
				<dl class="divide-y divide-slate-100 font-mono text-[11px]">
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Atendentes Vinculados</dt>
						<dd class="text-lg font-bold text-slate-900">{usuarios.length}</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Encaminhamentos</dt>
						<dd class="text-lg font-bold text-slate-900">{totalEncaminhamentos}</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Aguardando Regulação</dt>
						<dd class="text-lg font-bold text-amber-800">{aguardando}</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Pendências Abertas</dt>
						<dd class="text-lg font-bold text-red-800">{pendencias}</dd>
					</div>
					<div class="flex items-center justify-between px-4 py-2.5">
						<dt class="tracking-widest text-slate-500 uppercase">Aprovados</dt>
						<dd class="text-lg font-bold text-emerald-700">{aprovados}</dd>
					</div>
				</dl>
			</div>

			<!-- Ações administrativas · gated por ehAdminOuDev -->
			{#if podeAdmin}
				<div class="col-span-12 border border-slate-200 bg-white">
					<PanelHeader
						title="Ações Administrativas"
						subtitle="Alterações auditadas · algumas não podem ser desfeitas"
						index="03"
					/>
					<div class="flex flex-wrap items-center gap-2 p-4">
						{#if ubs.ativa}
							<PrimaryButton
								label="Desativar UBS"
								variant="danger"
								onclick={() => abrirConfirmacao('desativar')}
							/>
						{:else}
							<PrimaryButton
								label="Reativar UBS"
								variant="primary"
								onclick={() => abrirConfirmacao('ativar')}
							/>
						{/if}

						<PrimaryButton
							label="Excluir UBS"
							variant="danger"
							disabled={!podeExcluir}
							onclick={() => abrirConfirmacao('excluir')}
						/>

						{#if !podeExcluir}
							<div
								class="ml-auto border border-amber-300 bg-amber-50 px-3 py-1 font-mono text-[10px] tracking-wider text-amber-800 uppercase"
							>
								⚠ Exclusão bloqueada · existem {usuarios.length} usuário(s) e {totalEncaminhamentos} encaminhamento(s)
								vinculados
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Atendentes vinculados -->
			<div class="col-span-12 border border-slate-200 bg-white">
				<PanelHeader
					title="Atendentes Vinculados"
					subtitle="Usuários operando nesta UBS"
					index={podeAdmin ? '04' : '03'}
				/>
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-xs">
						<thead>
							<tr
								class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
							>
								<th class="border-r border-slate-200 px-3 py-2">Nome</th>
								<th class="border-r border-slate-200 px-3 py-2">Matrícula</th>
								<th class="border-r border-slate-200 px-3 py-2">Email</th>
								<th class="border-r border-slate-200 px-3 py-2">Role</th>
								<th class="px-3 py-2">Status</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#if usuarios.length === 0}
								<tr>
									<td colspan="5" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
										Nenhum atendente vinculado a esta UBS.
									</td>
								</tr>
							{:else}
								{#each usuarios as u (u.id)}
									<tr
										class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
										onclick={() => goto(`/sms/rede/usuarios/${u.id}`)}
									>
										<td
											class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900"
										>
											{u.nome}
										</td>
										<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
											{u.matricula}
										</td>
										<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
											{u.email}
										</td>
										<td class="border-r border-slate-100 px-3 py-2">
											<span
												class="border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase"
											>
												{u.role}
											</span>
										</td>
										<td class="px-3 py-2">
											{#if u.ativo}
												<span
													class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
												>
													ATIVO
												</span>
											{:else}
												<span
													class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase"
												>
													INATIVO
												</span>
											{/if}
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	</div>

	<!-- Modal Editar -->
	<Modal
		isOpen={editarAberto}
		onClose={() => (editarAberto = false)}
		title="Editar UBS"
		subtitle="Atualizar dados cadastrais da unidade"
		maxWidth="lg"
	>
		<EditarUbs {ubs} onCancel={() => (editarAberto = false)} onSaved={handleSalvo} />
	</Modal>

	<!-- Modal Confirmação -->
	<Modal
		isOpen={confirmarAcaoAberto}
		onClose={() => {
			confirmarAcaoAberto = false;
			acaoEmCurso = null;
		}}
		title={acaoEmCurso === 'excluir'
			? 'Confirmar Exclusão'
			: acaoEmCurso === 'desativar'
				? 'Confirmar Desativação'
				: 'Confirmar Reativação'}
		subtitle={acaoEmCurso === 'excluir' ? 'Ação irreversível · auditada' : 'Alterar status da UBS'}
		maxWidth="md"
	>
		<div class="flex flex-col gap-4 font-mono text-slate-900">
			{#if acaoEmCurso === 'excluir'}
				<div class="border-2 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900">
					<strong>Atenção:</strong> excluir <strong>{ubs.nome}</strong> é permanente. O registro ficará
					arquivado apenas para auditoria. Esta UBS não aparecerá mais em nenhuma listagem nem aceitará
					novos encaminhamentos.
				</div>
			{:else if acaoEmCurso === 'desativar'}
				<div
					class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
				>
					<strong>{ubs.nome}</strong> ficará indisponível para novos encaminhamentos. Os usuários vinculados
					não poderão fazer login na Face UBS. Pode ser reativada depois.
				</div>
			{:else}
				<div
					class="border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[12px] text-emerald-900"
				>
					<strong>{ubs.nome}</strong> voltará a aceitar encaminhamentos e os usuários poderão operar normalmente.
				</div>
			{/if}
			<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
				<PrimaryButton
					label="Cancelar"
					variant="secondary"
					onclick={() => {
						confirmarAcaoAberto = false;
						acaoEmCurso = null;
					}}
				/>
				<PrimaryButton
					label={acaoEmCurso === 'excluir'
						? 'Sim, Excluir'
						: acaoEmCurso === 'desativar'
							? 'Sim, Desativar'
							: 'Sim, Reativar'}
					variant={acaoEmCurso === 'ativar' ? 'primary' : 'danger'}
					loading={processando}
					onclick={executarAcao}
				/>
			</div>
		</div>
	</Modal>
{/if}
