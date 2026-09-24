<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { usePerfil } from '$lib/presentation/contexts/perfilContext';

	import { formatarCargoPerfil } from '$lib/presentation/utils/usuarioUtils';

	const ctx = usePerfil();
	let p = $derived(ctx.perfil!);

	function formatarData(iso: string | null | undefined) {
		if (!iso) return 'Não informada';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return 'Não informada';
		return d.toLocaleDateString('pt-BR');
	}
</script>

<section class="grid grid-cols-12 gap-4">
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Dados Pessoais" subtitle="Informações cadastrais" index="01" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Nome Completo
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">{p.nome}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.cpf}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Data de Nascimento
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{formatarData(p.dataNascimento)}</dd>
			</div>
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Email Corporativo
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.email}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Telefone</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.telefone}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Vínculo Funcional" index="02" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Matrícula</dt>
				<dd class="mt-0.5 text-sm font-bold text-slate-900">{p.matricula}</dd>
			</div>
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cargo</dt>
				<dd class="mt-0.5 text-sm font-semibold text-slate-900">{formatarCargoPerfil(p)}</dd>
			</div>
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Função</dt>
				<dd class="mt-0.5 font-sans text-xs text-slate-900">{p.funcao}</dd>
			</div>
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Admissão</dt>
				<dd class="mt-0.5 text-sm font-semibold text-slate-900">{formatarData(p.dataAdmissao)}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white">
		<PanelHeader title="Lotação" subtitle="Unidade e equipe" index="03" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Unidade Operacional
				</dt>
				<dd class="mt-0.5 text-sm font-bold text-slate-900">{p.unidade}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Lotação Completa
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.lotacao}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-slate-50 px-4 py-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="text-xs text-slate-600">
				Para alterar dados pessoais, entre em contato com o RH da Secretaria.
			</div>
			<div class="flex gap-2">
				<PrimaryButton label="Solicitar Alteração" variant="secondary" />
				<PrimaryButton label="Baixar Ficha Funcional" variant="secondary" />
			</div>
		</div>
	</div>
</section>
