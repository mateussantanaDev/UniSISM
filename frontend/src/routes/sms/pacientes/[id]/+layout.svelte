<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import EditarPaciente from '$lib/presentation/components/EditarPaciente.svelte';
	import ImprimirProntuario from '$lib/presentation/components/prontuario/ImprimirProntuario.svelte';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto } from '$lib/api/types';
	import { setPacienteContext } from '$lib/presentation/contexts/pacienteContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { camposFaltantesPaciente } from '$lib/presentation/utils/pacienteGaps';
	import { obterIniciais } from '$lib/presentation/utils/stringUtils';

	const auth = useAuth();

	let { children } = $props();

	let paciente = $state<PacienteCompleto | null>(null);
	let carregando = $state(true);
	let erro = $state(false);
	let editarAberto = $state(false);
	let imprimirAberto = $state(false);

	setPacienteContext({
		get paciente() {
			return paciente;
		},
		get carregando() {
			return carregando;
		},
		get erro() {
			return erro;
		},
		atualizar: (novo) => {
			paciente = novo;
		}
	});

	function handleSalvo(atualizado: PacienteCompleto) {
		paciente = atualizado;
		editarAberto = false;
	}

	let gaps = $derived(camposFaltantesPaciente(paciente));

	$effect(() => {
		const id = page.params.id;
		if (!id) {
			erro = true;
			carregando = false;
			return;
		}
		carregando = true;
		erro = false;
		paciente = null;

		api.pacientes
			.byId(id)
			.then((r) => {
				paciente = r;
			})
			.catch((e) => {
				if (e instanceof ApiError && e.code !== 'TOKEN_EXPIRADO') erro = true;
			})
			.finally(() => {
				carregando = false;
			});
	});

	const tabs = [
		{ label: 'Resumo', slug: '', shortcut: '1' },
		{ label: 'Cadastro', slug: '/cadastro', shortcut: '2' },
		{ label: 'Quadro Clínico', slug: '/quadro-clinico', shortcut: '3' },
		{ label: 'Atendimentos', slug: '/atendimentos', shortcut: '4' },
		{ label: 'Encaminhamentos', slug: '/encaminhamentos', shortcut: '5' },
		{ label: 'Viagens TFD', slug: '/viagens', shortcut: '6' },
		{ label: 'Exames', slug: '/exames', shortcut: '7' },
		{ label: 'Vacinação', slug: '/vacinas', shortcut: '8' }
	];

	let baseHref = $derived(`/sms/pacientes/${page.params.id}`);
	let currentPath = $derived(page.url.pathname);

	function isActive(slug: string): boolean {
		const href = `${baseHref}${slug}`;
		return slug === '' ? currentPath === baseHref : currentPath === href;
	}

	function idade(iso: string): number {
		const hoje = new Date();
		const nasc = new Date(iso);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return a;
	}

	const sexoLabel = { F: 'Feminino', M: 'Masculino', OUTRO: 'Outro' } as const;
</script>

<div class="flex flex-col gap-4">
	<!-- Header + Tab nav -->
	<div class="border border-slate-200 bg-white">
		<div class="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
			<div class="flex items-start gap-3">
				<button
					type="button"
					onclick={() => goto('/sms/pacientes')}
					class="flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-3 w-3"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
					</svg>
					VOLTAR
				</button>

				{#if paciente}
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-300 bg-blue-900 font-mono text-base font-bold text-white"
					>
						{obterIniciais(paciente.nome)}
					</div>
					<div class="leading-tight">
						<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
							PEC MUNICIPAL · {paciente.unidadeVinculada}
						</div>
						<div class="text-sm font-bold text-slate-900">{paciente.nome}</div>
						<div class="font-mono text-[11px] text-slate-600">
							{idade(paciente.dataNascimento)} anos · {sexoLabel[paciente.sexo]} · CPF
							{paciente.cpf} · SUS {paciente.cartaoSus}
						</div>
					</div>
				{/if}
			</div>

			{#if paciente}
				<div class="flex items-center gap-2">
					<span
						class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase"
					>
						GRUPO {paciente.grupoSanguineo}
					</span>
					{#if (paciente.alergias?.length ?? 0) > 0}
						<span
							class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase"
						>
							⚠ {paciente.alergias!.length} ALERGIA{paciente.alergias!.length === 1 ? '' : 'S'}
						</span>
					{/if}
					{#if (paciente.condicoesCronicasAtivas ?? 0) > 0}
						<span
							class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
						>
							{paciente.condicoesCronicasAtivas} CRÔNICA{paciente.condicoesCronicasAtivas === 1
								? ''
								: 'S'}
						</span>
					{/if}
					{#if gaps.total > 0}
						<span
							class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
							title="Campos essenciais do cadastro faltantes"
						>
							⚠ {gaps.total} PENDENTE{gaps.total === 1 ? '' : 'S'}
						</span>
					{/if}
					<PrimaryButton
						label="Imprimir Prontuário"
						variant="secondary"
						onclick={() => (imprimirAberto = true)}
					/>
					{#if auth.ehAdminOuDev}
						<PrimaryButton
							label="Editar Cadastro"
							variant="secondary"
							onclick={() => (editarAberto = true)}
						/>
					{/if}
				</div>
			{/if}
		</div>

		<nav
			class="flex flex-wrap items-stretch border-t border-slate-200 bg-slate-50"
			aria-label="Sub-navegação do paciente"
		>
			{#each tabs as tab (tab.slug)}
				{@const active = isActive(tab.slug)}
				<a
					href={`${baseHref}${tab.slug}`}
					class="relative flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 font-mono text-[11px] font-bold tracking-widest uppercase transition-colors
						{active ? 'bg-white text-blue-900' : 'text-slate-600 hover:bg-white hover:text-slate-900'}"
				>
					{#if active}
						<span class="absolute top-0 left-0 h-0.5 w-full bg-blue-900"></span>
					{/if}
					<span>{tab.label}</span>
					<kbd
						class="border px-1 py-px text-[9px] font-normal
							{active ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-500'}"
					>
						{tab.shortcut}
					</kbd>
				</a>
			{/each}
		</nav>
	</div>

	{#if carregando}
		<div class="border border-slate-200 bg-white p-10 text-center">
			<div
				class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
				Carregando prontuário...
			</div>
		</div>
	{:else if erro || !paciente}
		<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
			<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
				Paciente não encontrado
			</div>
			<div class="mt-4">
				<PrimaryButton
					label="Voltar à Lista"
					variant="secondary"
					onclick={() => goto('/sms/pacientes')}
				/>
			</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

{#if paciente}
	<Modal
		isOpen={editarAberto}
		onClose={() => (editarAberto = false)}
		title="Editar Cadastro do Paciente"
		subtitle="Complementar dados sociodemográficos · CPF e Cartão SUS imutáveis"
		maxWidth="xl"
	>
		<EditarPaciente {paciente} onCancel={() => (editarAberto = false)} onSaved={handleSalvo} />
	</Modal>

	{#if imprimirAberto}
		<ImprimirProntuario
			{paciente}
			operador={auth.me ? `${auth.me.nome} (${auth.me.matricula})` : '—'}
			prefeitura={auth.me?.prefeitura ?? null}
			unidade={auth.me?.unidade ?? paciente.unidadeVinculada}
			onFechar={() => (imprimirAberto = false)}
		/>
	{/if}
{/if}
