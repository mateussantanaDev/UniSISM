<script lang="ts">
	import Dropzone from '$lib/presentation/components/Dropzone.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import { useNovoEncaminhamento } from '$lib/presentation/contexts/novoEncaminhamentoContext';
	import type { CampoPacienteEssencial, EstadoCivil, RacaCor } from '$lib/api/types';
	import type { PrioridadeClinica } from '$lib/domain/models/Encaminhamento';
	import { labelDe } from '$lib/presentation/utils/pacienteGaps';
	import { goto } from '$app/navigation';

	const ctx = useNovoEncaminhamento();
	let s = $derived(ctx.state);

	const prioridades: PrioridadeClinica[] = ['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA'];

	const estadoCivilOpcoes: { v: EstadoCivil; l: string }[] = [
		{ v: 'SOLTEIRO', l: 'Solteiro(a)' },
		{ v: 'CASADO', l: 'Casado(a)' },
		{ v: 'UNIAO_ESTAVEL', l: 'União Estável' },
		{ v: 'DIVORCIADO', l: 'Divorciado(a)' },
		{ v: 'VIUVO', l: 'Viúvo(a)' },
		{ v: 'OUTRO', l: 'Outro' }
	];
	const racaOpcoes: { v: RacaCor; l: string }[] = [
		{ v: 'BRANCA', l: 'Branca' },
		{ v: 'PRETA', l: 'Preta' },
		{ v: 'PARDA', l: 'Parda' },
		{ v: 'AMARELA', l: 'Amarela' },
		{ v: 'INDIGENA', l: 'Indígena' },
		{ v: 'NAO_INFORMADA', l: 'Não informada' }
	];

	/**
	 * Bind-fallback: alguns campos essenciais do backend moram em `s` (direto)
	 * — nome, dataNascimento, sexo, telefone, endereco — porque são
	 * obrigatórios no shape `Paciente`. Outros (nomeMae, bairro, municipio,
	 * uf, cep) moram em `s.complementos`. A tabela abaixo só lista os que
	 * vão no grupo "complementar" (9: os 5 complementares + 4 opcionais úteis).
	 */
	const CAMPOS_COMPLEMENTARES: readonly CampoPacienteEssencial[] = [
		'nomeMae',
		'bairro',
		'municipio',
		'uf',
		'cep'
	];

	/** Campos que vêm em `s` direto (inputs principais já renderizados). */
	const CAMPOS_BASE: readonly CampoPacienteEssencial[] = [
		'nome',
		'dataNascimento',
		'sexo',
		'telefone',
		'endereco'
	];

	function precisa(c: CampoPacienteEssencial): boolean {
		return s.camposFaltantes.includes(c);
	}

	// Complementares essenciais efetivamente faltantes (filtragem de CAMPOS_COMPLEMENTARES).
	let complementaresFaltantes = $derived(CAMPOS_COMPLEMENTARES.filter((c) => precisa(c)));

	// Oferecer opcionais úteis quando o paciente existe + vale a pena completar.
	// (Não são "essenciais" do backend, mas enriquecem o cadastro.)
	let oferecerOpcionais = $derived(s.pacienteExistente !== null && !s.cadastroCompleto);

	// Algum campo base (em `s`) está faltante? Usuário deve revisar.
	let basePendente = $derived(CAMPOS_BASE.some(precisa));

	// Índices dos painéis — depende de quantos blocos antes dele.
	let temComplementos = $derived(complementaresFaltantes.length > 0 || oferecerOpcionais);
	let anexosIdx = $derived(temComplementos ? '03' : '02');
	let checklistIdx = $derived(temComplementos ? '04' : '03');

	function avancar() {
		goto('/ubs/novo-encaminhamento/confirmacao');
	}

	function voltar() {
		goto('/ubs/novo-encaminhamento');
	}
</script>

<div class="grid grid-cols-12 gap-4">
	<section class="col-span-12 xl:col-span-8">
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Dados Extraídos · Revisão"
				subtitle="Revise e edite antes de prosseguir"
				index="01"
			>
				<StatusBadge prioridade={s.prioridade} />
			</PanelHeader>

			<div class="p-4">
				<div class="mb-3 border-b border-slate-200 pb-2">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						Identificação do Paciente
						{#if basePendente}
							<span class="ml-2 text-amber-700">· revisar campos pendentes</span>
						{/if}
					</span>
				</div>
				<div class="mb-5 grid grid-cols-6 gap-3">
					<FormField
						label="Nome do Paciente"
						name="nome"
						span={6}
						hint={precisa('nome') ? 'pendente' : ''}
						bind:value={s.nomePaciente}
					/>
					<FormField label="CPF" name="cpf" span={3} mono bind:value={s.cpf} />
					<FormField label="Cartão SUS" name="sus" span={3} mono bind:value={s.cartaoSus} />
					<FormField
						label="Data Nasc."
						name="dataNasc"
						span={2}
						mono
						hint={precisa('dataNascimento') ? 'pendente' : ''}
						bind:value={s.dataNascimento}
					/>
					<FormField
						label="Telefone"
						name="telefone"
						span={4}
						mono
						hint={precisa('telefone') ? 'pendente' : ''}
						bind:value={s.telefone}
					/>
					<FormField
						label="Endereço"
						name="endereco"
						span={6}
						hint={precisa('endereco') ? 'pendente' : ''}
						bind:value={s.endereco}
					/>
				</div>

				<div class="mb-3 border-b border-slate-200 pb-2">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						Solicitação Clínica
					</span>
				</div>
				<div class="grid grid-cols-6 gap-3">
					<FormField
						label="Médico Solicitante"
						name="medico"
						span={4}
						bind:value={s.medicoSolicitante}
					/>
					<FormField label="CRM" name="crm" span={2} mono bind:value={s.crm} />
					<FormField
						label="Especialidade Solicitada"
						name="especialidade"
						span={3}
						bind:value={s.especialidade}
					/>
					<FormField label="CID-10" name="cid" span={1} mono bind:value={s.cid10} />
					<div class="col-span-2 flex flex-col">
						<label
							for="prioridade"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Prioridade
						</label>
						<select
							id="prioridade"
							bind:value={s.prioridade}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							{#each prioridades as p (p)}
								<option value={p}>{p}</option>
							{/each}
						</select>
					</div>
					<FormField label="Descrição CID-10" name="cidDesc" span={6} bind:value={s.cidDescricao} />
					<div class="col-span-6 flex flex-col">
						<label
							for="justificativa"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Justificativa Clínica
						</label>
						<textarea
							id="justificativa"
							rows="4"
							bind:value={s.justificativa}
							class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						></textarea>
					</div>
				</div>
			</div>
		</div>

		<!-- ══════════════════════════════════════════════════════════ -->
		<!-- Estados de enriquecimento do cadastro (via /por-cpf)       -->
		<!-- ══════════════════════════════════════════════════════════ -->
		{#if s.buscandoPaciente}
			<div
				class="mt-4 flex items-center gap-3 border border-slate-300 bg-slate-50 px-4 py-2 font-mono text-[11px] tracking-wider text-slate-600 uppercase"
			>
				<div class="h-3 w-3 animate-spin border-[2px] border-blue-900 border-t-transparent"></div>
				Verificando cadastro do paciente...
			</div>
		{:else if s.pacienteExistente && s.cadastroCompleto}
			<div
				class="mt-4 flex items-center gap-3 border border-emerald-700 bg-emerald-50 px-4 py-2 font-mono text-[11px] font-bold tracking-wider text-emerald-900 uppercase"
			>
				<span class="text-base">✓</span>
				Paciente cadastrado · {s.pacienteExistente.nome} · cadastro completo
			</div>
		{:else if !s.pacienteExistente && s.cpf}
			<div
				class="mt-4 flex items-center gap-3 border border-blue-700 bg-blue-50 px-4 py-2 font-mono text-[11px] font-bold tracking-wider text-blue-900 uppercase"
			>
				<span class="text-base">+</span>
				Paciente novo · será criado junto com o encaminhamento e ganhará acesso ao app
			</div>
		{/if}

		<!-- Bloco "Completar Cadastro" — só campos que o backend disse que faltam -->
		{#if complementaresFaltantes.length > 0 || oferecerOpcionais}
			<div class="mt-4 border-2 border-amber-600 bg-white">
				<PanelHeader
					title={s.pacienteExistente
						? 'Completar Cadastro do Paciente'
						: 'Informações Complementares'}
					subtitle={s.pacienteExistente
						? `Paciente já existe · ${complementaresFaltantes.length} campo(s) essencial(is) pendente(s)`
						: 'Aproveite para enriquecer o cadastro do novo paciente'}
					index="02"
				>
					{#if complementaresFaltantes.length > 0}
						<span
							class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
						>
							⚠ {complementaresFaltantes.length} ESSENCIAIS
						</span>
					{/if}
				</PanelHeader>

				<div
					class="border-b border-amber-200 bg-amber-50 px-4 py-2 font-sans text-[11px] text-amber-900"
				>
					{#if s.pacienteExistente}
						Os campos abaixo serão <strong>preenchidos</strong> no cadastro
						<strong>sem sobrescrever</strong> valores existentes. Deixe em branco o que você não tiver
						certeza.
					{:else}
						Preencha o que puder — o paciente é novo e o cadastro é criado junto. Todos os campos
						são opcionais exceto os marcados acima como pendentes.
					{/if}
				</div>

				<div class="grid grid-cols-12 gap-3 p-4">
					<!-- Essenciais faltantes (ordem estável) -->
					{#each complementaresFaltantes as campo (campo)}
						{#if campo === 'nomeMae'}
							<FormField
								label={labelDe(campo)}
								name="cmp-nomeMae"
								span={6}
								hint="pendente"
								bind:value={s.complementos.nomeMae}
							/>
						{:else if campo === 'bairro'}
							<FormField
								label={labelDe(campo)}
								name="cmp-bairro"
								span={4}
								hint="pendente"
								bind:value={s.complementos.bairro}
							/>
						{:else if campo === 'municipio'}
							<FormField
								label={labelDe(campo)}
								name="cmp-municipio"
								span={4}
								hint="pendente"
								bind:value={s.complementos.municipio}
							/>
						{:else if campo === 'uf'}
							<FormField
								label={labelDe(campo)}
								name="cmp-uf"
								span={2}
								mono
								hint="pendente"
								bind:value={s.complementos.uf}
							/>
						{:else if campo === 'cep'}
							<FormField
								label={labelDe(campo)}
								name="cmp-cep"
								span={2}
								mono
								hint="pendente"
								placeholder="00000-000"
								bind:value={s.complementos.cep}
							/>
						{/if}
					{/each}

					<!-- Opcionais úteis (sempre oferecidos quando há flow de enriquecimento) -->
					{#if oferecerOpcionais || !s.pacienteExistente}
						<div
							class="col-span-12 mt-2 border-t border-slate-200 pt-2 text-[10px] font-bold tracking-widest text-slate-500 uppercase"
						>
							Opcionais · enriquecem o prontuário
						</div>
						<FormField
							label="Nome do Pai"
							name="cmp-nomePai"
							span={6}
							placeholder="Opcional"
							bind:value={s.complementos.nomePai}
						/>
						<FormField
							label="Nome Social"
							name="cmp-nomeSocial"
							span={6}
							placeholder="Opcional"
							bind:value={s.complementos.nomeSocial}
						/>
						<div class="col-span-3 flex flex-col">
							<label
								for="cmp-estadoCivil"
								class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Estado Civil
							</label>
							<select
								id="cmp-estadoCivil"
								bind:value={s.complementos.estadoCivil}
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							>
								<option value="">— Selecione —</option>
								{#each estadoCivilOpcoes as o (o.v)}
									<option value={o.v}>{o.l}</option>
								{/each}
							</select>
						</div>
						<div class="col-span-3 flex flex-col">
							<label
								for="cmp-racaCor"
								class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Raça/Cor
							</label>
							<select
								id="cmp-racaCor"
								bind:value={s.complementos.racaCor}
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							>
								<option value="">— Selecione —</option>
								{#each racaOpcoes as o (o.v)}
									<option value={o.v}>{o.l}</option>
								{/each}
							</select>
						</div>
						<FormField
							label="Escolaridade"
							name="cmp-escolaridade"
							span={3}
							placeholder="Opcional"
							bind:value={s.complementos.escolaridade}
						/>
						<FormField
							label="Profissão"
							name="cmp-profissao"
							span={3}
							placeholder="Opcional"
							bind:value={s.complementos.profissao}
						/>
						<FormField
							label="Tel. Secundário"
							name="cmp-telSec"
							span={4}
							mono
							placeholder="Opcional"
							bind:value={s.complementos.telefoneSecundario}
						/>
						<FormField
							label="Email"
							name="cmp-email"
							type="email"
							span={8}
							mono
							placeholder="Opcional"
							bind:value={s.complementos.email}
						/>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Anexos -->
		<div class="mt-4 border border-slate-200 bg-white">
			<PanelHeader
				title="Anexos Complementares"
				subtitle="RG, Cartão SUS, exames, laudos — sem OCR"
				index={anexosIdx}
			>
				<span
					class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
				>
					{s.anexos.length} ANEXO{s.anexos.length === 1 ? '' : 'S'}
				</span>
			</PanelHeader>
			<div class="p-4">
				<Dropzone
					label="ARRASTE OS DOCUMENTOS COMPLEMENTARES"
					sublabel="RG, Cartão SUS, exames, laudos. Múltiplos arquivos permitidos."
					acceptTypes="application/pdf,image/jpeg,image/png"
					multiple
					mode="simple"
					processingHint="Enviando para armazenamento seguro..."
					variant="secondary"
					files={s.anexos}
					onFiles={ctx.adicionarAnexos}
				/>
			</div>
		</div>
	</section>

	<aside class="col-span-12 flex flex-col gap-4 xl:col-span-4">
		<div class="border border-slate-200 bg-white">
			<PanelHeader title="Checklist" index={checklistIdx} />
			<ul class="divide-y divide-slate-100 font-mono text-[11px]">
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">SOLICITAÇÃO MÉDICA</span>
					<span class="font-bold text-emerald-700">✓ CARREGADA</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">DADOS DO PACIENTE</span>
					<span class="font-bold {s.nomePaciente && s.cpf ? 'text-emerald-700' : 'text-amber-700'}">
						{s.nomePaciente && s.cpf ? '✓ COMPLETO' : '◐ INCOMPLETO'}
					</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">CID-10 INFORMADO</span>
					<span class="font-bold {s.cid10 ? 'text-emerald-700' : 'text-amber-700'}">
						{s.cid10 ? '✓ OK' : '◐ FALTA'}
					</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">JUSTIFICATIVA</span>
					<span class="font-bold {s.justificativa ? 'text-emerald-700' : 'text-amber-700'}">
						{s.justificativa ? '✓ OK' : '◐ FALTA'}
					</span>
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">CADASTRO DO PACIENTE</span>
					{#if s.cadastroCompleto}
						<span class="font-bold text-emerald-700">✓ COMPLETO</span>
					{:else if complementaresFaltantes.length > 0}
						<span class="font-bold text-amber-700">
							◐ {complementaresFaltantes.length} PENDENTE{complementaresFaltantes.length === 1
								? ''
								: 'S'}
						</span>
					{:else if !s.pacienteExistente && s.cpf}
						<span class="font-bold text-blue-900">+ NOVO</span>
					{:else}
						<span class="font-bold text-slate-500">—</span>
					{/if}
				</li>
				<li class="flex items-center justify-between px-4 py-2.5">
					<span class="text-slate-700">ANEXOS COMPLEMENTARES</span>
					<span class="font-bold {s.anexos.length > 0 ? 'text-emerald-700' : 'text-slate-500'}">
						{s.anexos.length > 0 ? `✓ ${s.anexos.length} ARQUIVOS` : '◐ OPCIONAL'}
					</span>
				</li>
			</ul>
		</div>

		{#if s.anexos.length > 0}
			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Anexos" index="05" />
				<ul class="divide-y divide-slate-100 px-4 py-2">
					{#each s.anexos as f, i (f.name + i)}
						<li class="flex items-center justify-between gap-2 py-1.5 font-mono text-[11px]">
							<span class="flex-1 truncate text-slate-800">{f.name}</span>
							<span class="text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
							<button
								type="button"
								onclick={() => ctx.removerAnexo(i)}
								class="border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-red-700 uppercase hover:border-red-700 hover:bg-red-50"
							>
								REMOVER
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="flex justify-between gap-2">
			<PrimaryButton label="Voltar" variant="secondary" onclick={voltar} shortcut="←" />
			<PrimaryButton label="Avançar para Confirmação" onclick={avancar} shortcut="→" />
		</div>
	</aside>
</div>
