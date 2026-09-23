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
</script>

<section class="grid grid-cols-12 gap-4">
	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
		<PanelHeader title="Dados Pessoais" subtitle="Cadastro nacional do cidadão" index="01" />
		<dl class="grid grid-cols-12 gap-x-4 gap-y-3 px-4 py-4">
			<div class="col-span-12">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Nome Completo
				</dt>
				<dd class="mt-0.5 text-base font-bold text-slate-900">{p.nome}</dd>
			</div>
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
					{formatarData(p.dataNascimento)}
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

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
		<PanelHeader title="Contato e Endereço" index="03" />
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
					Município/UF
				</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.municipio}/{p.uf}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Telefone</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.telefone}</dd>
			</div>
			<div class="col-span-6">
				<dt class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Email</dt>
				<dd class="mt-0.5 font-mono text-sm text-slate-900">{p.email ?? '—'}</dd>
			</div>
		</dl>
	</div>

	<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
		<PanelHeader title="Vínculo à Rede" index="04" />
		<dl class="divide-y divide-slate-100 font-mono text-[11px]">
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">UBS</dt>
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
				<dt class="tracking-widest text-slate-500 uppercase">Microárea</dt>
				<dd class="text-slate-900">{p.microarea ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-2.5">
				<dt class="tracking-widest text-slate-500 uppercase">Cadastrado em</dt>
				<dd class="text-slate-900">{formatarData(p.cadastradoEm)}</dd>
			</div>
		</dl>
	</div>
</section>
