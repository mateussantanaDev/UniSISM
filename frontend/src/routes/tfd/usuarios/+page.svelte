<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Role, UsuarioListado } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let bloqueado = $derived(!auth.podeCadastrarUsuarioTFD);

	let lista = $state<UsuarioListado[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	/** Filtros — só mostra quem é equipe TFD por padrão (GESTOR_TFD/REGULADOR_TFD). */
	let mostrarTodos = $state(false);
	let busca = $state('');

	const rolesTfd: Role[] = ['GESTOR_TFD', 'REGULADOR_TFD'];

	const filtrada = $derived.by(() => {
		const q = busca.trim().toLowerCase();
		return lista
			.filter((u) => (mostrarTodos ? true : rolesTfd.includes(u.role)))
			.filter((u) => {
				if (!q) return true;
				return (
					u.nome.toLowerCase().includes(q) ||
					(u.matricula ?? '').toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					u.role.toLowerCase().includes(q)
				);
			});
	});

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			lista = await api.admin.listUsuarios();
		} catch (e) {
			if (e instanceof ApiError) erro = e.message;
			else erro = 'Falha ao carregar usuários.';
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	const roleTone: Record<Role, string> = {
		DESENVOLVEDOR: 'border-purple-700 bg-purple-50 text-purple-900',
		ADMIN: 'border-red-700 bg-red-50 text-red-800',
		COORDENADOR_UBS: 'border-blue-700 bg-blue-50 text-blue-900',
		ATENDENTE_UBS: 'border-slate-400 bg-slate-50 text-slate-800',
		REGULADOR_SMS: 'border-amber-600 bg-amber-50 text-amber-800',
		GESTOR_TFD: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		REGULADOR_TFD: 'border-blue-900 bg-blue-50 text-blue-900',
		MEDICO: 'border-blue-900 bg-blue-50 text-blue-950'
	};
</script>

{#if bloqueado}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">
			Apenas GESTOR_TFD, ADMIN ou DESENVOLVEDOR podem gerenciar usuários da equipe TFD.
		</p>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Equipe TFD"
				subtitle="Gestores e reguladores cadastrados na sua prefeitura"
				index="01"
			>
				<PrimaryButton
					label="+ Novo Usuário"
					onclick={() => goto('/tfd/usuarios/novo')}
				/>
			</PanelHeader>

			<div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
				<input
					type="text"
					bind:value={busca}
					placeholder="Buscar por nome, matrícula, e-mail ou role..."
					class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				<label class="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-slate-700">
					<input
						type="checkbox"
						bind:checked={mostrarTodos}
						class="h-4 w-4 cursor-pointer border-slate-400"
					/>
					<span class="font-semibold tracking-widest uppercase">Mostrar todas as roles</span>
				</label>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">Nome</th>
							<th class="border-r border-slate-200 px-3 py-2">Matrícula</th>
							<th class="border-r border-slate-200 px-3 py-2">E-mail</th>
							<th class="border-r border-slate-200 px-3 py-2">Role</th>
							<th class="border-r border-slate-200 px-3 py-2">Vínculo</th>
							<th class="px-3 py-2">Status</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if carregando}
							{#each Array(4) as _, i (i)}
								<tr class="border-b border-slate-100">
									<td colspan="6" class="px-3 py-3">
										<div class="h-3 w-full animate-pulse bg-slate-100"></div>
									</td>
								</tr>
							{/each}
						{:else if filtrada.length === 0}
							<tr>
								<td colspan="6" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
									{lista.length === 0
										? 'Nenhum usuário cadastrado ainda.'
										: 'Nenhum usuário corresponde à busca.'}
								</td>
							</tr>
						{:else}
							{#each filtrada as u (u.id)}
								<tr class="border-b border-slate-100 hover:bg-slate-50">
									<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
										{u.nome}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{u.matricula ?? '—'}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{u.email ?? '—'}
									</td>
									<td class="border-r border-slate-100 px-3 py-2">
										<span
											class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {roleTone[u.role]}"
										>
											{u.role}
										</span>
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
										{u.prefeitura?.nome ?? u.ubs?.nome ?? '—'}
									</td>
									<td class="px-3 py-2">
										{#if u.ativo}
											<span class="border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-800 uppercase">
												ATIVO
											</span>
										{:else}
											<span class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
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

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-4 py-2 font-sans text-[12px] text-blue-900"
		>
			<strong class="font-mono tracking-widest uppercase">Equipe TFD:</strong> o GESTOR_TFD comanda a frota e a regulação financeira; o REGULADOR_TFD apenas cadastra solicitações de viagem (cadastro de passageiro).
		</div>
	</div>
{/if}
