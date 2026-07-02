<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	/**
	 * Sidebar da Face 4 · Gestão Logística TFD.
	 *
	 * Centro de comando da frota — operação de transporte sanitário (Tratamento
	 * Fora do Domicílio). Quem opera aqui acompanha vans/ônibus, alocação de
	 * passageiros, confirmação de embarques e custos.
	 *
	 * Categorias:
	 *  1. OPERAÇÃO — fluxo diário (Dashboard, Solicitações, Viagens)
	 *  2. INTELIGÊNCIA — análise (Relatórios)
	 */

	interface NavItem {
		label: string;
		href: string;
		shortcut: string;
		quando?: () => boolean;
	}

	interface NavGroup {
		titulo: string;
		items: NavItem[];
	}

	const auth = useAuth();

	/**
	 * REGULADOR_TFD recebe o menu enxuto: Dashboard + Nova Solicitação.
	 * Critério é **somente a role** — não usa `ehAdminGlobalOuPrefeitura`
	 * porque o regulador também tem escopo PREFEITURA.
	 */
	let modoSimples = $derived(!!auth.ehReguladorTfdSimples);

	let gruposSimples = $derived<NavGroup[]>([
		{
			titulo: 'OPERAÇÃO',
			items: [
				{ label: 'Dashboard', href: '/tfd/dashboard', shortcut: 'D' },
				{
					label: 'Nova Solicitação',
					href: '/tfd/solicitacoes/nova',
					shortcut: 'N'
				}
			]
		}
	]);

	let gruposCompletos = $derived<NavGroup[]>([
		{
			titulo: 'OPERAÇÃO',
			items: [
				{ label: 'Dashboard', href: '/tfd/dashboard', shortcut: 'D' },
				{
					label: 'Solicitações',
					href: '/tfd/solicitacoes',
					shortcut: 'S',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Pedidos do App',
					href: '/tfd/solicitacoes-paciente',
					shortcut: 'A',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Viagens',
					href: '/tfd/viagens',
					shortcut: 'V',
					quando: () => !!auth.podeGerenciarTFD
				}
			]
		},
		{
			titulo: 'CADASTROS',
			items: [
				{
					label: 'Frota',
					href: '/tfd/frota',
					shortcut: 'F',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Motoristas',
					href: '/tfd/motoristas',
					shortcut: 'M',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Usuários',
					href: '/tfd/usuarios',
					shortcut: 'U',
					quando: () => !!auth.podeCadastrarUsuarioTFD
				}
			]
		},
		{
			titulo: 'FINANCEIRO',
			items: [
				{
					label: 'Abastecimento',
					href: '/tfd/abastecimento',
					shortcut: 'B',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Saldo de Frota',
					href: '/tfd/saldo',
					shortcut: 'O',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Saldo Ajuda Custo',
					href: '/tfd/saldo-ajuda-custo',
					shortcut: 'P',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Ajuda de Custo',
					href: '/tfd/ajuda-custo',
					shortcut: 'J',
					quando: () => !!auth.podeGerenciarTFD
				}
			]
		},
		{
			titulo: 'INTELIGÊNCIA',
			items: [
				{
					label: 'Relatórios',
					href: '/tfd/relatorios',
					shortcut: 'L',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Especialidades',
					href: '/tfd/relatorios/especialidades',
					shortcut: 'E',
					quando: () => !!auth.podeGerenciarTFD
				},
				{
					label: 'Auditoria · TJ',
					href: '/tfd/auditoria',
					shortcut: 'A',
					quando: () => !!auth.ehAdminGlobalOuPrefeitura
				}
			]
		}
	]);

	let grupos = $derived<NavGroup[]>(modoSimples ? gruposSimples : gruposCompletos);

	let gruposVisiveis = $derived(
		grupos
			.map((g) => ({
				...g,
				items: g.items.filter((i) => !i.quando || i.quando())
			}))
			.filter((g) => g.items.length > 0)
	);

	let current = $derived(page.url.pathname);
	let perfilAtivo = $derived(current.startsWith('/tfd/perfil'));
</script>

<aside
	class="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white font-mono text-sm"
>
	<!-- Marca institucional -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-4">
		<div class="flex items-center gap-2">
			<div
				class="flex h-8 w-8 items-center justify-center bg-blue-900 text-xs font-bold text-white"
			>
				U
			</div>
			<div class="leading-tight">
				<div class="text-xs font-bold tracking-widest text-slate-900">UNISISM</div>
				<div class="text-[10px] tracking-wider text-slate-500">FACE 4 / GESTÃO TFD</div>
			</div>
		</div>
	</div>

	<!-- Bloco de contexto operacional -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-blue-50 to-white px-4 py-3">
		<div class="text-[10px] tracking-wider text-slate-500">
			{auth.me?.escopo === 'PREFEITURA'
				? 'COMANDO LOGÍSTICO'
				: auth.me?.escopo === 'GLOBAL'
					? 'ACESSO GLOBAL'
					: 'OPERAÇÃO TFD'}
		</div>
		<div class="truncate text-xs font-semibold text-slate-900">
			{auth.me?.prefeitura ?? auth.me?.unidade ?? 'UNISISM'}
		</div>
		{#if auth.me?.cargo}
			<div class="truncate text-[11px] text-slate-600">{auth.me.cargo}</div>
		{/if}
	</div>

	<!-- Navegação agrupada -->
	<nav class="flex flex-1 flex-col overflow-y-auto py-2" aria-label="Navegação TFD">
		{#each gruposVisiveis as grupo (grupo.titulo)}
			<div class="mt-3 first:mt-1">
				<div
					class="px-5 pb-1.5 font-mono text-[9px] font-bold tracking-widest text-slate-400 uppercase"
				>
					{grupo.titulo}
				</div>
				{#each grupo.items as item (item.href)}
					{@const active = current === item.href || current.startsWith(item.href + '/')}
					<a
						href={item.href}
						class="mx-2 flex items-center justify-between border-l-2 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-all
							{active
							? 'border-blue-900 bg-blue-50 text-blue-900 shadow-sm'
							: 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'}"
					>
						<span>{item.label}</span>
						<kbd
							class="border px-1.5 py-0.5 text-[9px] font-normal
							{active
								? 'border-blue-900 bg-white text-blue-900'
								: 'border-slate-300 bg-slate-100 text-slate-500'}"
						>
							{item.shortcut}
						</kbd>
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<!-- Perfil / sessão ativa -->
	<button
		type="button"
		onclick={() => goto('/tfd/perfil')}
		class="group flex w-full items-center gap-2.5 border-t-2 border-l-2 bg-gradient-to-b from-white to-slate-50 px-4 py-3 text-left transition-colors
			{perfilAtivo
			? 'border-t-slate-200 border-l-blue-900 bg-slate-100'
			: 'border-t-slate-200 border-l-transparent hover:bg-slate-100 hover:border-l-slate-300'}"
		aria-label="Abrir perfil do gestor TFD"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center border font-mono text-[11px] font-bold text-white
				{perfilAtivo ? 'border-blue-900 bg-blue-900' : 'border-slate-300 bg-blue-900 group-hover:border-blue-900'}"
		>
			{auth.me?.iniciais ?? '··'}
		</div>
		<div class="min-w-0 flex-1 leading-tight">
			<div class="text-[10px] tracking-wider text-slate-500">SESSÃO ATIVA</div>
			<div
				class="truncate text-xs font-semibold
					{perfilAtivo ? 'text-blue-900' : 'text-slate-900 group-hover:text-blue-900'}"
			>
				{auth.me?.nome ?? 'Operador'}
			</div>
			<div class="flex items-center gap-1.5 text-[11px] text-emerald-700">
				<span class="inline-block h-1.5 w-1.5 bg-emerald-600"></span>
				<span class="font-semibold">{auth.me?.role ?? 'OPERACIONAL'}</span>
			</div>
		</div>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			class="h-3 w-3
				{perfilAtivo ? 'text-blue-900' : 'text-slate-400 group-hover:text-blue-900'}"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
		</svg>
	</button>
</aside>
