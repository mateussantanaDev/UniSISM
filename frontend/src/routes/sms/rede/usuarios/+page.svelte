<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { Role, UsuarioListado } from '$lib/api/types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatarCargoPerfil, formatarVinculoUsuario } from '$lib/presentation/utils/usuarioUtils';

	const auth = useAuth();

	let lista = $state<UsuarioListado[]>([]);
	let carregando = $state(true);
	let busca = $state('');
	let filtroRole = $state<'TODOS' | Role>('TODOS');
	let filtroAtivo = $state<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');

	onMount(async () => {
		try {
			lista = await api.admin.listUsuarios();
		} finally {
			carregando = false;
		}
	});

	let filtrada = $derived.by(() => {
		let base = lista;
		if (filtroRole !== 'TODOS') base = base.filter((u) => u.role === filtroRole);
		if (filtroAtivo === 'ATIVOS') base = base.filter((u) => u.ativo);
		else if (filtroAtivo === 'INATIVOS') base = base.filter((u) => !u.ativo);
		if (busca) {
			const q = busca.toLowerCase();
			base = base.filter(
				(u) =>
					u.nome.toLowerCase().includes(q) ||
					u.matricula.toLowerCase().includes(q) ||
					u.email.toLowerCase().includes(q) ||
					(u.cargo && u.cargo.toLowerCase().includes(q)) ||
					(u.tipoUnidade && u.tipoUnidade.toLowerCase().includes(q))
			);
		}
		return base;
	});

	let ativos = $derived(lista.filter((u) => u.ativo).length);
	let reguladores = $derived(lista.filter((u) => u.role === 'REGULADOR_SMS').length);
	let coordenadores = $derived(lista.filter((u) => u.role === 'COORDENADOR_UBS' || u.role === 'ADMIN').length);

	function formatarData(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	const roleTone: Record<Role, string> = {
		DESENVOLVEDOR: 'border-slate-700 bg-slate-100 text-slate-800',
		ADMIN: 'border-blue-700 bg-blue-50 text-blue-900',
		REGULADOR_SMS: 'border-purple-700 bg-purple-50 text-purple-800',
		COORDENADOR_UBS: 'border-amber-600 bg-amber-50 text-amber-800',
		ATENDENTE_UBS: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		GESTOR_TFD: 'border-sky-700 bg-sky-50 text-sky-800',
		REGULADOR_TFD: 'border-blue-900 bg-blue-50 text-blue-900',
		MEDICO: 'border-blue-900 bg-blue-50 text-blue-950',
		MEDICO_ESPECIALISTA: 'border-teal-700 bg-teal-50 text-teal-900',
		ATENDENTE_CENTRO: 'border-indigo-700 bg-indigo-50 text-indigo-900',
		ATENDENTE_TFD: 'border-sky-600 bg-sky-50 text-sky-700',
		MOTORISTA_TFD: 'border-amber-700 bg-amber-50 text-amber-900'
	};

	const roles: Array<'TODOS' | Role> = [
		'TODOS',
		'COORDENADOR_UBS',
		'ADMIN',
		'ATENDENTE_UBS',
		'ATENDENTE_CENTRO',
		'REGULADOR_SMS',
		'MEDICO',
		'MEDICO_ESPECIALISTA',
		'GESTOR_TFD',
		'REGULADOR_TFD',
		'ATENDENTE_TFD',
		'DESENVOLVEDOR'
	];
</script>

<div class="flex flex-col gap-4">
	<!-- KPIs -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Total Cadastrados" value={carregando ? '—' : lista.length} sublabel="Rede municipal" />
		<MetricCard label="Ativos" value={carregando ? '—' : ativos} sublabel="Login habilitado" accent="success" />
		<MetricCard
			label="Reguladores"
			value={carregando ? '—' : reguladores}
			sublabel="Decisão clínica"
			accent="default"
		/>
		<MetricCard
			label="Gestão & Coordenação"
			value={carregando ? '—' : coordenadores}
			sublabel="Diretoria, Centros e UBS"
			accent="default"
		/>
	</section>

	<!-- Lista -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Usuários" subtitle="Gestão de acessos da rede" index="01">
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{filtrada.length} / {lista.length}
			</span>
			{#if auth.podeCriarUsuario}
				<PrimaryButton
					label="+ Novo Usuário"
					shortcut="N"
					onclick={() => goto('/sms/rede/usuarios/novo')}
				/>
			{/if}
		</PanelHeader>

		<div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<div class="flex flex-1 items-center gap-2">
				<label
					for="busca"
					class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase"
				>
					Buscar
				</label>
				<input
					id="busca"
					type="text"
					bind:value={busca}
					placeholder="Nome, matrícula, email..."
					class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="flex items-center gap-1">
				<select
					bind:value={filtroRole}
					class="border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase outline-none focus:border-blue-900"
				>
					{#each roles as r (r)}
						<option value={r}>{r === 'TODOS' ? 'TODOS OS PERFIS' : formatarCargoPerfil({ role: r })}</option>
					{/each}
				</select>

				{#each ['TODOS', 'ATIVOS', 'INATIVOS'] as f (f)}
					<button
						type="button"
						onclick={() => (filtroAtivo = f as typeof filtroAtivo)}
						class="border px-2 py-1 font-mono text-[10px] font-bold tracking-widest uppercase
							{filtroAtivo === f
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
					>
						{f}
					</button>
				{/each}
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Nome</th>
						<th class="border-r border-slate-200 px-3 py-2">Matrícula</th>
						<th class="border-r border-slate-200 px-3 py-2">Email</th>
						<th class="border-r border-slate-200 px-3 py-2">Cargo / Perfil</th>
						<th class="border-r border-slate-200 px-3 py-2">Vínculo & Lotação</th>
						<th class="border-r border-slate-200 px-3 py-2">Criado</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="8" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrada.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum usuário encontrado.
							</td>
						</tr>
					{:else}
						{#each filtrada as u (u.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
									{u.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{u.matricula}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{u.email}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {roleTone[
											u.role
										] || 'border-slate-300 bg-slate-100 text-slate-800'}"
									>
										{formatarCargoPerfil(u)}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									<div class="flex flex-col">
										<span class="font-bold text-slate-900 text-xs">{formatarVinculoUsuario(u)}</span>
										{#if u.tipoUnidade}
											<span class="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Unidade: {u.tipoUnidade}</span>
										{/if}
									</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(u.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
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
								<td class="flex gap-1.5 px-3 py-2">
									<button
										type="button"
										onclick={() => goto(`/sms/rede/usuarios/${u.id}`)}
										class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
									>
										Detalhe
									</button>
									{#if auth.ehAdminOuDev}
										<button
											type="button"
											onclick={() => goto(`/sms/rede/usuarios/${u.id}?edit=1`)}
											title="Abrir detalhe com edição"
											class="border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
										>
											Editar
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
