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
		<PanelHeader
			title="Identificação do Paciente"
			subtitle="Dados declarados pela UBS de origem"
			index="01"
		/>
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
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Endereço</dt>
				<dd class="mt-0.5 text-xs text-slate-800">{enc.paciente.endereco}</dd>
			</div>
		</dl>
	</div>

	<!-- Prontuário completo disponível em Pacientes (escopo prefeitura). -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Prontuário Eletrônico" subtitle="PEC · rede municipal" index="02" />
		<div class="flex flex-col gap-3 px-4 py-4 text-xs text-slate-700">
			<p>
				Para consultar o histórico clínico completo do paciente — atendimentos, viagens TFD, exames
				e vacinação — abra o PEC na seção Pacientes.
			</p>
			<a
				href={`/sms/pacientes?cpf=${encodeURIComponent(enc.paciente.cpf)}`}
				class="inline-flex items-center justify-center border border-slate-300 bg-white px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:border-blue-900 hover:bg-blue-50"
			>
				Abrir PEC →
			</a>
			<div
				class="border-t border-slate-100 pt-2 text-[10px] tracking-wider text-slate-500 uppercase"
			>
				⚠ Link disponível após integração da Face 2 de Pacientes com o PEC da rede.
			</div>
		</div>
	</div>
</section>
