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

	// Filtra os grupos dinamicamente para o Centro de Especialidades Médicas (CEM)
	let gruposVisiveis = $derived.by<NavGroup[]>(() => {
		const role = auth.me?.role;
		const list: NavGroup[] = [];

		// Recepção / Operação CEM
		if (role === 'REGULADOR_SMS' || role === 'ATENDENTE_UBS' || role === 'ATENDENTE_CENTRO' || role === 'ADMIN' || role === 'DESENVOLVEDOR') {
			list.push({
				titulo: 'OPERAÇÃO CEM',
				items: [
					{ label: 'Fila da Regulação', href: '/cem/recepcao/fila', shortcut: 'F' },
					{ label: 'Agenda do Dia', href: '/cem/recepcao/agenda', shortcut: 'A' },
					{ label: 'Agendar no Balcão', href: '/cem/recepcao/balcao', shortcut: 'B' },
					{ label: 'Painel TV (Chamada)', href: '/cem/recepcao/painel', shortcut: 'T' },
					{ label: 'Base de Pacientes', href: '/cem/pacientes', shortcut: 'P' }
				]
			});
		}

		// Médico Especialista CEM
		if (role === 'MEDICO' || role === 'MEDICO_ESPECIALISTA' || role === 'COORDENADOR_UBS' || role === 'ADMIN' || role === 'DESENVOLVEDOR') {
			list.push({
				titulo: 'CORPO CLÍNICO MÉDICO',
				items: [
					{ label: 'Consultório Digital SOAP', href: '/cem/medico/agenda', shortcut: 'M' },
					{ label: 'Histórico de Atendimentos', href: '/cem/medico/historico', shortcut: 'H' },
					{ label: 'Indicadores & Produtividade', href: '/cem/medico/desempenho', shortcut: 'I' }
				]
			});
		}

		// Gestão ERP CEM
		if (role === 'REGULADOR_SMS' || role === 'COORDENADOR_UBS' || role === 'ADMIN' || role === 'DESENVOLVEDOR') {
			list.push({
				titulo: 'INTELIGÊNCIA & GESTÃO CEM',
				items: [
					{ label: 'Painel Geral Executivo', href: '/cem/gestao/dashboard', shortcut: 'D' },
					{ label: 'Analytics & Desempenho', href: '/cem/gestao/analytics', shortcut: 'L' },
					{ label: 'Matriz de Vagas & Escalas', href: '/cem/gestao/vagas', shortcut: 'V' },
					{ label: 'Consultórios & Infraestrutura', href: '/cem/gestao/salas', shortcut: 'S' },
					{ label: 'Catálogo SIGTAP Médico', href: '/cem/gestao/especialidades', shortcut: 'E' },
					{ label: 'Produção & Faturamento BPA', href: '/cem/gestao/producao', shortcut: 'R' },
					{ label: 'Trilha de Auditoria CFM', href: '/cem/gestao/auditoria', shortcut: 'C' },
					{ label: 'Usuários & Equipes', href: '/cem/gestao/usuarios', shortcut: 'U' }
				]
			});
		}

		return list;
	});

	let current = $derived(page.url.pathname);
</script>

<aside class="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white font-mono text-sm">
	<!-- Marca institucional CEM -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-indigo-50 to-white px-4 py-4">
		<div class="flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center bg-indigo-900 text-xs font-bold text-white font-mono">
				CEM
			</div>
			<div class="leading-tight">
				<div class="text-xs font-bold tracking-widest text-slate-900 font-mono">UNISISM</div>
				<div class="text-[9px] tracking-wider text-indigo-900 font-mono font-bold">ESPECIALIDADES MÉDICAS</div>
			</div>
		</div>
	</div>

	<!-- Bloco de contexto -->
	<div class="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3">
		<div class="text-[10px] tracking-wider text-slate-500 font-mono">
			ÓRGÃO AUTÔNOMO
		</div>
		<div class="truncate text-xs font-semibold text-slate-900">
			{auth.me?.prefeitura ?? 'Centro de Especialidades Médicas (CEM)'}
		</div>
	</div>

	<!-- Navegação -->
	<nav class="flex flex-1 flex-col overflow-y-auto py-2" aria-label="Navegação CEM">
		{#each gruposVisiveis as grupo (grupo.titulo)}
			<div class="mt-3 first:mt-1">
				<div class="px-5 pb-1.5 font-mono text-[9px] font-bold tracking-widest text-slate-400 uppercase">
					{grupo.titulo}
				</div>
				{#each grupo.items as item (item.href)}
					{@const active = current === item.href || current.startsWith(item.href + '/')}
					<a
						href={item.href}
						class="flex items-center justify-between px-5 py-2 font-mono text-xs transition-colors {active
							? 'border-r-2 border-blue-900 bg-blue-50 font-bold text-blue-950'
							: 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}"
					>
						<span class="truncate">{item.label}</span>
						<kbd
							class="ml-2 flex h-4 min-w-4 items-center justify-center border border-slate-200 bg-slate-100 font-mono text-[9px] font-bold text-slate-600"
						>
							{item.shortcut}
						</kbd>
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<!-- Rodapé com Usuário Conectado -->
	<div class="border-t border-slate-200 bg-slate-50 p-4">
		<div class="flex items-center justify-between">
			<div class="truncate">
				<div class="truncate font-sans text-xs font-bold text-slate-900">
					{auth.me?.nome ?? 'Profissional CEM'}
				</div>
				<div class="font-mono text-[10px] text-indigo-900 font-bold truncate" title={formatarCargoPerfil(auth.me)}>
					{formatarCargoPerfil(auth.me)}
				</div>
			</div>
			<button
				type="button"
				onclick={() => auth.logout()}
				class="border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] font-bold text-slate-700 hover:bg-slate-100"
				title="Sair da Plataforma"
			>
				Sair
			</button>
		</div>
	</div>
</aside>
