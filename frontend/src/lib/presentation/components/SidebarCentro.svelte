<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { formatarCargoPerfil } from '$lib/presentation/utils/usuarioUtils';

	const auth = useAuth();

	interface NavItem {
		label: string;
		href: string;
		shortcut: string;
	}

	interface NavGroup {
		titulo: string;
		items: NavItem[];
	}

	// Filtra os grupos dinamicamente conforme o papel do usuário
	let gruposVisiveis = $derived.by<NavGroup[]>(() => {
		const role = auth.me?.role;
		const list: NavGroup[] = [];

		// Recepção: Atendentes, Reguladores, Admins e Devs
		if (
			role === 'REGULADOR_SMS' ||
			role === 'ATENDENTE_UBS' ||
			role === 'ATENDENTE_CENTRO' ||
			role === 'ENFERMEIRO' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		) {
			list.push({
				titulo: 'RECEPÇÃO',
				items: [
					{ label: 'Fila da Regulação', href: '/centro/recepcao/fila', shortcut: 'F' },
					{ label: 'Agenda do Dia', href: '/centro/recepcao/agenda', shortcut: 'A' },
					{ label: 'Agendar no Balcão', href: '/centro/recepcao/balcao', shortcut: 'B' },
					{ label: 'CRM WhatsApp (Meta API)', href: '/centro/whatsapp', shortcut: 'W' },
					{ label: 'Painel TV (Chamada)', href: '/centro/recepcao/painel', shortcut: 'T' }
				]
			});
		}

		// Enfermagem & Triagem
		if (
			role === 'ENFERMEIRO' ||
			role === 'REGULADOR_SMS' ||
			role === 'ATENDENTE_CENTRO' ||
			role === 'COORDENADOR_UBS' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		) {
			list.push({
				titulo: 'ENFERMAGEM & TRIAGEM',
				items: [
					{ label: 'Triagem & Sinais Vitais', href: '/centro/enfermagem/triagem', shortcut: 'E' },
					{ label: 'Chamar Triagem (Painel)', href: '/centro/recepcao/painel', shortcut: 'T' },
					{ label: 'Agendar no Balcão', href: '/centro/recepcao/balcao', shortcut: 'B' }
				]
			});
		}

		// Médico: Médicos, Coordenadores, Admins e Devs
		if (
			role === 'MEDICO' ||
			role === 'COORDENADOR_UBS' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		) {
			list.push({
				titulo: 'MÉDICO ERP',
				items: [
					{ label: 'Consultório Digital SOAP', href: '/centro/medico/agenda', shortcut: 'M' },
					{ label: 'Histórico de Atendimentos', href: '/centro/medico/historico', shortcut: 'H' },
					{ label: 'Indicadores & Produtividade', href: '/centro/medico/desempenho', shortcut: 'I' }
				]
			});
		}

		// Gestão: Direção, Coordenadores, Reguladores, Admins e Devs
		if (
			role === 'REGULADOR_SMS' ||
			role === 'COORDENADOR_UBS' ||
			role === 'ADMIN' ||
			role === 'DESENVOLVEDOR'
		) {
			list.push({
				titulo: 'GESTÃO ERP',
				items: [
					{ label: 'Painel Geral Executivo', href: '/centro/gestao/dashboard', shortcut: 'D' },
					{ label: 'Gestão de Usuários & Equipes', href: '/centro/gestao/usuarios', shortcut: 'U' },
					{ label: 'Matriz de Vagas & Escalas', href: '/centro/gestao/vagas', shortcut: 'V' },
					{ label: 'Consultórios & Infraestrutura', href: '/centro/gestao/salas', shortcut: 'S' },
					{ label: 'Catálogo & SIGTAP', href: '/centro/gestao/especialidades', shortcut: 'E' },
					{ label: 'Produção e Relatórios', href: '/centro/gestao/producao', shortcut: 'P' }
				]
			});
		}

		return list;
	});

	let current = $derived(page.url.pathname);
</script>

<aside
	class="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white font-mono text-sm"
>
	<!-- Marca institucional -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-blue-50 to-white px-4 py-4">
		<div class="flex items-center gap-2">
			<div
				class="flex h-8 w-8 items-center justify-center bg-blue-900 font-mono text-xs font-bold text-white"
			>
				CEM
			</div>
			<div class="leading-tight">
				<div class="font-mono text-xs font-bold tracking-widest text-slate-900">UNISISM</div>
				<div class="font-mono text-[9px] font-bold tracking-wider text-blue-900">
					ESPECIALIDADES MÉDICAS
				</div>
			</div>
		</div>
	</div>

	<!-- Bloco de contexto -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3">
		<div class="font-mono text-[10px] tracking-wider text-slate-500">ÓRGÃO MUNICIPAL</div>
		<div class="truncate text-xs font-semibold text-slate-900">
			{auth.me?.prefeitura ?? 'CEM — Centro de Especialidades Médicas'}
		</div>
	</div>

	<!-- Navegação -->
	<nav class="flex flex-1 flex-col overflow-y-auto py-2" aria-label="Navegação Centro">
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

	<!-- Perfil / sessão activa -->
	<button
		type="button"
		onclick={() => goto('/sms/perfil')}
		class="group flex w-full items-center gap-2.5 border-t border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
		aria-label="Abrir perfil"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 bg-blue-900 font-mono text-[11px] font-bold text-white"
		>
			{auth.me?.iniciais ?? '··'}
		</div>
		<div class="min-w-0 flex-1 leading-tight">
			<div class="font-mono text-[10px] tracking-wider text-slate-500">SESSÃO ATIVA</div>
			<div class="truncate text-xs font-semibold text-slate-900 group-hover:text-blue-900">
				{auth.me?.nome ?? 'Operador'}
			</div>
			<div class="flex items-center gap-1.5 font-mono text-[11px] text-emerald-700">
				<span class="inline-block h-1.5 w-1.5 bg-emerald-600"></span>
				<span class="truncate font-semibold" title={formatarCargoPerfil(auth.me)}
					>{formatarCargoPerfil(auth.me)}</span
				>
			</div>
		</div>
	</button>
</aside>

<style>
	aside,
	kbd,
	button {
		border-radius: 0 !important;
	}
</style>
