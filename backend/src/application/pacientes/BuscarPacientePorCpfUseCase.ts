/**
 * Busca paciente por CPF (dígitos, formatado ou misto) para suportar o fluxo
 * de consolidação de encaminhamento:
 *
 *   1. Usuário faz upload do PDF → OCR extrai CPF.
 *   2. Frontend chama este endpoint com o CPF.
 *   3. Backend responde com:
 *        - os dados do paciente (se já existe)
 *        - a lista de CAMPOS FALTANTES (o que o usuário ainda precisa preencher)
 *        - flag `completo` (true → some o formulário complementar;
 *                         false → mostra apenas os campos faltantes)
 *   4. Ao submeter o encaminhamento, o backend recebe os campos faltantes
 *      preenchidos e atualiza o paciente (sem sobrescrever o que já existe).
 *
 * Scope-aware: ADMIN só vê pacientes da sua prefeitura, COORDENADOR/ATENDENTE
 * só vê os da sua UBS. Fora do escopo → 404 (não 403, pra não vazar existência).
 */
import { prisma } from '../../infrastructure/database/prisma';
import type { AccessScope } from '../../shared/scope';
import { normalizarCpf, formatarCpf } from '../../infrastructure/services/NotificacaoPacienteService';

/**
 * Campos considerados "essenciais" pra um cadastro completo.
 * Ordem reflete o que o frontend deve renderizar primeiro.
 */
export const CAMPOS_ESSENCIAIS_PACIENTE = [
  'nome',
  'dataNascimento',
  'sexo',
  'telefone',
  'nomeMae',
  'endereco',
  'bairro',
  'municipio',
  'uf',
  'cep',
] as const;

export type CampoPaciente = (typeof CAMPOS_ESSENCIAIS_PACIENTE)[number];

export interface PacienteCadastroParcial {
  id: string;
  nome: string;
  nomeSocial: string | null;
  cpf: string; // sempre dígitos
  cpfFormatado: string; // 123.456.789-00
  cartaoSus: string | null;
  dataNascimento: string | null; // YYYY-MM-DD (null se placeholder 1970-01-01)
  sexo: 'M' | 'F' | 'OUTRO';
  telefone: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  estadoCivil: string;
  escolaridade: string | null;
  profissao: string | null;
  racaCor: string;
  endereco: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  grupoSanguineo: string;
  ubsId: string;
  ubsNome?: string | null;
}

export interface BuscarPacientePorCpfResult {
  /** `true` se existe paciente com esse CPF no escopo do usuário. */
  existe: boolean;
  /** Dados do paciente (null se não existe ou está fora do escopo). */
  paciente: PacienteCadastroParcial | null;
  /** Lista de campos essenciais que ainda estão vazios/placeholder. */
  camposFaltantes: CampoPaciente[];
  /** `true` → nenhum campo essencial faltando. Frontend esconde form complementar. */
  completo: boolean;
}

export class BuscarPacientePorCpfUseCase {
  async exec(cpfInput: string, scope: AccessScope): Promise<BuscarPacientePorCpfResult> {
    const cpfDigits = normalizarCpf(cpfInput);
    if (cpfDigits.length !== 11) {
      // Retorna vazio em vez de 400 — o frontend pode chamar com CPF parcial
      return { existe: false, paciente: null, camposFaltantes: [...CAMPOS_ESSENCIAIS_PACIENTE], completo: false };
    }

    const p = await prisma.paciente.findUnique({
      where: { cpf: cpfDigits },
      include: { ubs: { select: { prefeituraId: true, id: true, nome: true } } },
    });

    // Não existe ou soft-deleted → pré-preencher nada
    if (!p || p.deletadoEm) {
      return {
        existe: false,
        paciente: null,
        camposFaltantes: [...CAMPOS_ESSENCIAIS_PACIENTE],
        completo: false,
      };
    }

    // Scope check — fora do escopo devolve como se não existisse (evita
    // vazar existência de paciente de outra UBS/prefeitura).
    if (scope.kind === 'PREFEITURA' && p.ubs.prefeituraId !== scope.prefeituraId) {
      return { existe: false, paciente: null, camposFaltantes: [...CAMPOS_ESSENCIAIS_PACIENTE], completo: false };
    }
    if (scope.kind === 'UBS' && p.ubsId !== scope.ubsId) {
      return { existe: false, paciente: null, camposFaltantes: [...CAMPOS_ESSENCIAIS_PACIENTE], completo: false };
    }

    const dataNascimentoIso = dataEhPlaceholder(p.dataNascimento)
      ? null
      : p.dataNascimento.toISOString().slice(0, 10);

    const paciente: PacienteCadastroParcial = {
      id: p.id,
      nome: p.nome,
      nomeSocial: p.nomeSocial,
      cpf: cpfDigits,
      cpfFormatado: formatarCpf(cpfDigits),
      cartaoSus: p.cartaoSus,
      dataNascimento: dataNascimentoIso,
      sexo: p.sexo as 'M' | 'F' | 'OUTRO',
      telefone: p.telefone,
      telefoneSecundario: p.telefoneSecundario,
      email: p.email,
      nomeMae: p.nomeMae,
      nomePai: p.nomePai,
      estadoCivil: p.estadoCivil,
      escolaridade: p.escolaridade,
      profissao: p.profissao,
      racaCor: p.racaCor,
      endereco: p.endereco,
      bairro: p.bairro,
      municipio: p.municipio,
      uf: p.uf,
      cep: p.cep,
      grupoSanguineo: p.grupoSanguineo,
      ubsId: p.ubsId,
      ubsNome: p.ubs?.nome,
    };

    const camposFaltantes = calcularCamposFaltantes(paciente);
    return {
      existe: true,
      paciente,
      camposFaltantes,
      completo: camposFaltantes.length === 0,
    };
  }
}

/** `1970-01-01` (epoch) é o placeholder usado quando paciente foi criado sem data. */
function dataEhPlaceholder(d: Date): boolean {
  return d.getTime() === 0;
}

function vazio(s: string | null | undefined): boolean {
  return !s || !s.trim();
}

function calcularCamposFaltantes(p: PacienteCadastroParcial): CampoPaciente[] {
  const faltantes: CampoPaciente[] = [];
  if (vazio(p.nome)) faltantes.push('nome');
  if (!p.dataNascimento) faltantes.push('dataNascimento');
  if (p.sexo === 'OUTRO') faltantes.push('sexo');
  if (vazio(p.telefone)) faltantes.push('telefone');
  if (vazio(p.nomeMae)) faltantes.push('nomeMae');
  if (vazio(p.endereco)) faltantes.push('endereco');
  if (vazio(p.bairro)) faltantes.push('bairro');
  if (vazio(p.municipio)) faltantes.push('municipio');
  if (vazio(p.uf)) faltantes.push('uf');
  if (vazio(p.cep)) faltantes.push('cep');
  return faltantes;
}
