<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type {
		AtualizarPacienteRequest,
		EstadoCivil,
		GrupoSanguineo,
		PacienteCompleto,
		RacaCor,
		Sexo
	} from '$lib/api/types';

	interface Props {
		paciente: PacienteCompleto;
		/**
		 * Modo compacto — só expõe o subset de campos sociodemográficos
		 * tipicamente faltantes. Usado no wizard de encaminhamento.
		 */
		compacto?: boolean;
		onCancel: () => void;
		onSaved: (atualizado: PacienteCompleto) => void;
	}

	let { paciente, compacto = false, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		nome: paciente.nome,
		nomeSocial: paciente.nomeSocial ?? '',
		nomeMae: paciente.nomeMae ?? '',
		nomePai: paciente.nomePai ?? '',
		dataNascimento: paciente.dataNascimento,
		sexo: paciente.sexo,
		estadoCivil: paciente.estadoCivil,
		escolaridade: paciente.escolaridade ?? '',
		profissao: paciente.profissao ?? '',
		racaCor: paciente.racaCor,
		telefone: paciente.telefone,
		telefoneSecundario: paciente.telefoneSecundario ?? '',
		email: paciente.email ?? '',
		endereco: paciente.endereco,
		bairro: paciente.bairro ?? '',
		municipio: paciente.municipio ?? '',
		uf: paciente.uf ?? '',
		cep: paciente.cep ?? '',
		grupoSanguineo: paciente.grupoSanguineo,
		agenteComunitario: paciente.agenteComunitario ?? '',
		microarea: paciente.microarea ?? ''
	}));

	// Estado editável
	let nome = $state(orig.nome);
	let nomeSocial = $state(orig.nomeSocial);
	let nomeMae = $state(orig.nomeMae);
	let nomePai = $state(orig.nomePai);
	let dataNascimento = $state(orig.dataNascimento);
	let sexo = $state<Sexo>(orig.sexo);
	let estadoCivil = $state<EstadoCivil>(orig.estadoCivil);
	let escolaridade = $state(orig.escolaridade);
	let profissao = $state(orig.profissao);
	let racaCor = $state<RacaCor>(orig.racaCor);
	let telefone = $state(orig.telefone);
	let telefoneSecundario = $state(orig.telefoneSecundario);
	let email = $state(orig.email);
	let endereco = $state(orig.endereco);
	let bairro = $state(orig.bairro);
	let municipio = $state(orig.municipio);
	let uf = $state(orig.uf);
	let cep = $state(orig.cep);
	let grupoSanguineo = $state<GrupoSanguineo>(orig.grupoSanguineo);
	let agenteComunitario = $state(orig.agenteComunitario);
	let microarea = $state(orig.microarea);

	let enviando = $state(false);
	let erro = $state('');

	const sexoOpcoes: { v: Sexo; l: string }[] = [
		{ v: 'M', l: 'Masculino' },
		{ v: 'F', l: 'Feminino' },
		{ v: 'OUTRO', l: 'Outro' }
	];
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
	const sangueOpcoes: { v: GrupoSanguineo; l: string }[] = [
		{ v: 'A+', l: 'A+' },
		{ v: 'A-', l: 'A−' },
		{ v: 'B+', l: 'B+' },
		{ v: 'B-', l: 'B−' },
		{ v: 'AB+', l: 'AB+' },
		{ v: 'AB-', l: 'AB−' },
		{ v: 'O+', l: 'O+' },
		{ v: 'O-', l: 'O−' },
		{ v: 'NAO_INFORMADO', l: 'Não informado' }
	];

	function nuloSeVazio(s: string): string | null {
		return s.trim() === '' ? null : s.trim();
	}

	function diff(): AtualizarPacienteRequest {
		const out: AtualizarPacienteRequest = {};
		if (nome.trim() !== orig.nome) out.nome = nome.trim();
		if (nomeSocial.trim() !== orig.nomeSocial) out.nomeSocial = nuloSeVazio(nomeSocial);
		if (nomeMae.trim() !== orig.nomeMae) out.nomeMae = nomeMae.trim();
		if (nomePai.trim() !== orig.nomePai) out.nomePai = nuloSeVazio(nomePai);
		if (dataNascimento !== orig.dataNascimento) out.dataNascimento = dataNascimento;
		if (sexo !== orig.sexo) out.sexo = sexo;
		if (estadoCivil !== orig.estadoCivil) out.estadoCivil = estadoCivil;
		if (escolaridade.trim() !== orig.escolaridade) out.escolaridade = escolaridade.trim();
		if (profissao.trim() !== orig.profissao) out.profissao = nuloSeVazio(profissao);
		if (racaCor !== orig.racaCor) out.racaCor = racaCor;
		if (telefone.trim() !== orig.telefone) out.telefone = telefone.trim();
		if (telefoneSecundario.trim() !== orig.telefoneSecundario)
			out.telefoneSecundario = nuloSeVazio(telefoneSecundario);
		if (email.trim().toLowerCase() !== orig.email.toLowerCase()) out.email = nuloSeVazio(email);
		if (endereco.trim() !== orig.endereco) out.endereco = endereco.trim();
		if (bairro.trim() !== orig.bairro) out.bairro = bairro.trim();
		if (municipio.trim() !== orig.municipio) out.municipio = municipio.trim();
		if (uf.trim().toUpperCase() !== orig.uf.toUpperCase()) out.uf = uf.trim().toUpperCase();
		if (cep.trim() !== orig.cep) out.cep = cep.trim();
		if (grupoSanguineo !== orig.grupoSanguineo) out.grupoSanguineo = grupoSanguineo;
		if (agenteComunitario.trim() !== orig.agenteComunitario)
			out.agenteComunitario = nuloSeVazio(agenteComunitario);
		if (microarea.trim() !== orig.microarea) out.microarea = nuloSeVazio(microarea);
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let podeSalvar = $derived(pendente > 0 && !enviando && nome.trim().length > 0);

	async function salvar() {
		erro = '';
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.update(paciente.id, patch);
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'NENHUMA_ALTERACAO':
						erro = 'Nenhuma alteração identificada.';
						break;
					case 'EMAIL_INVALIDO':
						erro = 'Email inválido.';
						break;
					case 'CEP_INVALIDO':
						erro = 'CEP inválido.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para editar este paciente.';
						break;
					default:
						erro = e.message || 'Falha ao salvar alterações.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<section
		class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
	>
		CPF e Cartão SUS são imutáveis (identidade). Todo o resto pode ser atualizado. Alterações são
		auditadas por paciente.
	</section>

	{#if !compacto}
		<!-- Identificação -->
		<section>
			<div class="mb-2 border-b border-slate-200 pb-1.5">
				<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Identificação
				</h3>
			</div>
			<div class="grid grid-cols-12 gap-3">
				<FormField label="Nome Completo" name="nome" span={12} bind:value={nome} />
				<FormField
					label="Nome Social (opcional)"
					name="nomeSocial"
					span={6}
					bind:value={nomeSocial}
				/>
				<FormField
					label="Data de Nascimento"
					name="dataNascimento"
					type="date"
					span={3}
					mono
					bind:value={dataNascimento}
				/>
				<div class="col-span-3 flex flex-col">
					<label
						for="sexo"
						class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Sexo
					</label>
					<select
						id="sexo"
						bind:value={sexo}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					>
						{#each sexoOpcoes as o (o.v)}
							<option value={o.v}>{o.l}</option>
						{/each}
					</select>
				</div>
			</div>
		</section>
	{/if}

	<!-- Filiação -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Filiação</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField
				label="Nome da Mãe"
				name="nomeMae"
				span={6}
				hint="obrigatório"
				bind:value={nomeMae}
			/>
			<FormField label="Nome do Pai (opcional)" name="nomePai" span={6} bind:value={nomePai} />
		</div>
	</section>

	<!-- Sociodemográfico -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Sociodemográfico
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<div class="col-span-3 flex flex-col">
				<label
					for="estadoCivil"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Estado Civil
				</label>
				<select
					id="estadoCivil"
					bind:value={estadoCivil}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each estadoCivilOpcoes as o (o.v)}
						<option value={o.v}>{o.l}</option>
					{/each}
				</select>
			</div>
			<div class="col-span-3 flex flex-col">
				<label
					for="racaCor"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Raça/Cor
				</label>
				<select
					id="racaCor"
					bind:value={racaCor}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each racaOpcoes as o (o.v)}
						<option value={o.v}>{o.l}</option>
					{/each}
				</select>
			</div>
			<FormField label="Escolaridade" name="escolaridade" span={3} bind:value={escolaridade} />
			<FormField
				label="Profissão"
				name="profissao"
				span={3}
				placeholder="Opcional"
				bind:value={profissao}
			/>
		</div>
	</section>

	<!-- Contato -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Contato</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Telefone" name="telefone" span={4} mono bind:value={telefone} />
			<FormField
				label="Telefone Secundário"
				name="telefoneSecundario"
				span={4}
				mono
				placeholder="Opcional"
				bind:value={telefoneSecundario}
			/>
			<FormField
				label="Email"
				name="email"
				type="email"
				span={4}
				mono
				placeholder="Opcional"
				bind:value={email}
			/>
		</div>
	</section>

	<!-- Endereço -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Endereço</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Logradouro" name="endereco" span={9} bind:value={endereco} />
			<FormField label="CEP" name="cep" span={3} mono placeholder="00000-000" bind:value={cep} />
			<FormField label="Bairro" name="bairro" span={5} bind:value={bairro} />
			<FormField label="Município" name="municipio" span={5} bind:value={municipio} />
			<FormField label="UF" name="uf" span={2} mono bind:value={uf} />
		</div>
	</section>

	<!-- Clínico mínimo + vínculo equipe -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Clínico · Vínculo com Equipe
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<div class="col-span-3 flex flex-col">
				<label
					for="grupoSanguineo"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Grupo Sanguíneo
				</label>
				<select
					id="grupoSanguineo"
					bind:value={grupoSanguineo}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each sangueOpcoes as o (o.v)}
						<option value={o.v}>{o.l}</option>
					{/each}
				</select>
			</div>
			<FormField
				label="Agente Comunitário (ACS)"
				name="agenteComunitario"
				span={6}
				placeholder="Opcional"
				bind:value={agenteComunitario}
			/>
			<FormField
				label="Microárea"
				name="microarea"
				span={3}
				mono
				placeholder="Ex.: 04"
				bind:value={microarea}
			/>
		</div>
	</section>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-between gap-2 border-t border-slate-200 pt-4">
		<span class="self-center font-mono text-[10px] tracking-widest text-slate-500 uppercase">
			{pendente === 0 ? 'Sem alterações' : `${pendente} campo(s) pendente(s)`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
			<PrimaryButton
				label="Salvar Alterações"
				onclick={salvar}
				loading={enviando}
				disabled={!podeSalvar}
			/>
		</div>
	</div>
</div>
