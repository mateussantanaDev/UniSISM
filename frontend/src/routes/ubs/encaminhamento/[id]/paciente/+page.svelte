<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { useEncaminhamento } from '$lib/presentation/contexts/encaminhamentoContext';

	const ctx = useEncaminhamento();
	let enc = $derived(ctx.encaminhamento!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function calcularIdade(dataNasc: string): number {
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
	}

	const sexoLabel = { F: 'Feminino', M: 'Masculino', OUTRO: 'Outro' } as const;
</script>

<section class="grid grid-cols-12 gap-4">
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Identificação do Paciente" subtitle="Dados cadastrais" index="01" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-4 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Nome Completo
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">{enc.paciente.nome}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{enc.paciente.cpf}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Cartão SUS
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{enc.paciente.cartaoSus}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Data de Nascimento
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{formatarData(enc.paciente.dataNascimento)}
				</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Idade</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{calcularIdade(enc.paciente.dataNascimento)} anos
				</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Sexo</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{sexoLabel[enc.paciente.sexo]}
				</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Telefone</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{enc.paciente.telefone}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Resumo Clínico" subtitle="Informações relevantes" index="02" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Faixa Etária</dt>
				<dd class="mt-0.5 text-sm font-bold text-slate-900">
					{calcularIdade(enc.paciente.dataNascimento) >= 60
						? 'Idoso (60+)'
						: calcularIdade(enc.paciente.dataNascimento) >= 18
							? 'Adulto'
							: 'Menor de idade'}
				</dd>
			</div>
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cadastro SUS</dt>
				<dd class="mt-0.5 text-slate-900">Ativo · Atenção Básica</dd>
			</div>
			<div class="px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Última Consulta UBS</dt>
				<dd class="mt-0.5 text-slate-900">Há 18 dias</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white">
		<PanelHeader title="Endereço e Contato" index="03" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Endereço Residencial
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{enc.paciente.endereco}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Telefone Principal
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{enc.paciente.telefone}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Unidade de Atenção Básica
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{enc.unidadeOrigem}</dd>
			</div>
		</dl>
	</div>
</section>
