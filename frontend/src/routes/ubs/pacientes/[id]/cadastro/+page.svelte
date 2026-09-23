<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';

	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	const estadoCivilLabel = {
		SOLTEIRO: 'Solteiro(a)',
		CASADO: 'Casado(a)',
		DIVORCIADO: 'Divorciado(a)',
		VIUVO: 'Viúvo(a)',
		UNIAO_ESTAVEL: 'União Estável',
		OUTRO: 'Outro'
	} as const;

	const racaLabel = {
		BRANCA: 'Branca',
		PRETA: 'Preta',
		PARDA: 'Parda',
		AMARELA: 'Amarela',
		INDIGENA: 'Indígena',
		NAO_INFORMADA: 'Não informada'
	} as const;

	const sexoLabel = { F: 'Feminino', M: 'Masculino', OUTRO: 'Outro' } as const;

	function idade(iso: string): number {
		const hoje = new Date();
		const nasc = new Date(iso);
		let a = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) a--;
		return a;
	}
</script>

<section class="grid grid-cols-12 gap-4">
	<!-- Dados Pessoais -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Dados Pessoais" subtitle="Identificação cadastral" index="01" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Nome Completo
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">{p.nome}</dd>
			</div>
			{#if p.nomeSocial}
				<div class="col-span-12">
					<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
						Nome Social
					</dt>
					<dd class="mt-0.5 text-sm text-slate-900">{p.nomeSocial}</dd>
				</div>
			{/if}
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CPF</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.cpf}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Cartão SUS
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.cartaoSus}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Data de Nascimento
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{formatarData(p.dataNascimento)} · {idade(p.dataNascimento)} anos
				</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Sexo</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{sexoLabel[p.sexo]}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Estado Civil
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{estadoCivilLabel[p.estadoCivil]}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Raça / Cor
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{racaLabel[p.racaCor]}</dd>
			</div>
			<div class="col-span-8">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Escolaridade
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.escolaridade}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Profissão
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.profissao ?? '—'}</dd>
			</div>
		</dl>
	</div>

	<!-- Filiação -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
		<PanelHeader title="Filiação" index="02" />
		<dl class="divide-y divide-slate-100 px-4">
			<div class="py-2.5">
				<dt class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Nome da Mãe</dt>
				<dd class="mt-0.5 text-sm font-semibold text-slate-900">{p.nomeMae}</dd>
			</div>
			<div class="py-2.5">
				<dt class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">Nome do Pai</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.nomePai ?? '—'}</dd>
			</div>
		</dl>
	</div>

	<!-- Contato -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
		<PanelHeader title="Contato" subtitle="Telefones e email" index="03" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Telefone Principal
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.telefone}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Telefone Secundário
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">
					{p.telefoneSecundario ?? '—'}
				</dd>
			</div>
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Email</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.email ?? '—'}</dd>
			</div>
		</dl>
	</div>

	<!-- Endereço -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
		<PanelHeader title="Endereço" subtitle="Residencial" index="04" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Logradouro
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.endereco}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Bairro</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.bairro}</dd>
			</div>
			<div class="col-span-3">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">CEP</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.cep}</dd>
			</div>
			<div class="col-span-3">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Microárea
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.microarea ?? '—'}</dd>
			</div>
			<div class="col-span-8">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Município
				</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.municipio}</dd>
			</div>
			<div class="col-span-4">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">UF</dt>
				<dd class="mt-0.5 text-sm text-slate-900">{p.uf}</dd>
			</div>
		</dl>
	</div>

	<!-- Vínculo UBS -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
		<PanelHeader title="Vínculo com a UBS" index="05" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Unidade</dt>
				<dd class="font-bold text-slate-900">{p.unidadeVinculada}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Equipe ESF</dt>
				<dd class="truncate pl-2 text-slate-900">{p.equipeSaudeFamilia ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">ACS</dt>
				<dd class="text-slate-900">{p.agenteComunitario ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cadastrado em</dt>
				<dd class="text-slate-900">{formatarData(p.cadastradoEm)}</dd>
			</div>
		</dl>
	</div>

	<!-- Profissionais que atenderam -->
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
		<PanelHeader
			title="Profissionais que Atenderam"
			subtitle="Médicos e equipes ao longo do tempo"
			index="06"
		/>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Profissional</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">Última</th>
						<th class="px-3 py-2">Total</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#each p.medicosAtendentes as m (m.registro)}
						<tr class="border-b border-slate-100">
							<td class="border-r border-slate-100 px-3 py-2">
								<div class="font-sans font-bold text-slate-900">{m.nome}</div>
								<div class="text-[10px] text-slate-600">{m.registro}</div>
							</td>
							<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
								<div>{m.especialidade}</div>
								<div class="text-[10px] text-slate-500">{m.unidade}</div>
							</td>
							<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
								{formatarData(m.ultimaConsulta)}
							</td>
							<td class="px-3 py-2 text-center font-bold text-slate-900">
								{m.totalConsultas}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>
