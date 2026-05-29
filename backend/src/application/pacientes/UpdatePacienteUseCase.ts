/**
 * Edição de paciente (PEC).
 *
 * Permissões:
 *   - DESENVOLVEDOR: qualquer paciente.
 *   - ADMIN: pacientes da sua prefeitura.
 *   - COORDENADOR_UBS: pacientes da sua UBS.
 *
 * NÃO permite alterar CPF (chave natural) nem ubsId via PATCH.
 * Para mover um paciente entre UBSs, deve existir endpoint específico (roadmap).
 */
import type { Prisma } from '../../../generated/prisma';
import { Conflict, Forbidden, NotFound } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';
import type { AccessScope } from '../../shared/scope';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type {
  EstadoCivil,
  GrupoSanguineo as GrupoDominio,
  RacaCor,
  Sexo,
} from '../../domain/entities/Paciente';
import { grupoSanguineoToPrisma } from '../../infrastructure/database/mappers';

export interface UpdatePacienteInput {
  nome?: string;
  nomeSocial?: string | null;
  cartaoSus?: string | null;
  dataNascimento?: string; // YYYY-MM-DD
  sexo?: Sexo;
  telefone?: string | null;
  telefoneSecundario?: string | null;
  email?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  estadoCivil?: EstadoCivil;
  escolaridade?: string | null;
  profissao?: string | null;
  racaCor?: RacaCor;
  endereco?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  grupoSanguineo?: GrupoDominio;
  historicoFamiliar?: string[];
  agenteComunitario?: string | null;
  microarea?: string | null;
  equipeSaudeFamilia?: string | null;
}

function assertScopePodeEditarPaciente(
  scope: AccessScope,
  prefeituraIdDoPaciente: string,
  ubsIdDoPaciente: string,
): void {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && scope.prefeituraId === prefeituraIdDoPaciente) return;
  if (scope.kind === 'UBS' && scope.ubsId === ubsIdDoPaciente) return;
  throw Forbidden('FORA_DO_ESCOPO', 'Paciente fora do escopo do usuário');
}

export class UpdatePacienteUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    editorId: string,
    pacienteId: string,
    input: UpdatePacienteInput,
  ): Promise<{ id: string; nome: string }> {
    const alvo = await prisma.paciente.findUnique({
      where: { id: pacienteId },
      include: { ubs: { select: { prefeituraId: true } } },
    });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado');
    }
    assertScopePodeEditarPaciente(scope, alvo.ubs.prefeituraId, alvo.ubsId);

    // Cartão SUS único
    if (input.cartaoSus !== undefined && input.cartaoSus !== null && input.cartaoSus !== alvo.cartaoSus) {
      const dup = await prisma.paciente.findUnique({ where: { cartaoSus: input.cartaoSus } });
      if (dup && dup.id !== pacienteId) {
        throw Conflict('PACIENTE_DUPLICADO', 'Cartão SUS já cadastrado em outro paciente');
      }
    }

    const data: Prisma.PacienteUpdateInput = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.nomeSocial !== undefined) data.nomeSocial = input.nomeSocial;
    if (input.cartaoSus !== undefined) data.cartaoSus = input.cartaoSus;
    if (input.dataNascimento !== undefined) {
      const d = new Date(`${input.dataNascimento}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        throw Conflict('DATA_NASCIMENTO_INVALIDA', 'Data de nascimento inválida');
      }
      data.dataNascimento = d;
    }
    if (input.sexo !== undefined) data.sexo = input.sexo;
    if (input.telefone !== undefined) data.telefone = input.telefone;
    if (input.telefoneSecundario !== undefined) data.telefoneSecundario = input.telefoneSecundario;
    if (input.email !== undefined) data.email = input.email;
    if (input.nomeMae !== undefined) data.nomeMae = input.nomeMae;
    if (input.nomePai !== undefined) data.nomePai = input.nomePai;
    if (input.estadoCivil !== undefined) data.estadoCivil = input.estadoCivil;
    if (input.escolaridade !== undefined) data.escolaridade = input.escolaridade;
    if (input.profissao !== undefined) data.profissao = input.profissao;
    if (input.racaCor !== undefined) data.racaCor = input.racaCor;
    if (input.endereco !== undefined) data.endereco = input.endereco;
    if (input.bairro !== undefined) data.bairro = input.bairro;
    if (input.municipio !== undefined) data.municipio = input.municipio;
    if (input.uf !== undefined) data.uf = input.uf;
    if (input.cep !== undefined) data.cep = input.cep;
    if (input.grupoSanguineo !== undefined) data.grupoSanguineo = grupoSanguineoToPrisma(input.grupoSanguineo);
    if (input.historicoFamiliar !== undefined) data.historicoFamiliar = input.historicoFamiliar;
    if (input.agenteComunitario !== undefined) data.agenteComunitario = input.agenteComunitario;
    if (input.microarea !== undefined) data.microarea = input.microarea;
    if (input.equipeSaudeFamilia !== undefined) data.equipeSaudeFamilia = input.equipeSaudeFamilia;

    const atualizado = await prisma.paciente.update({ where: { id: pacienteId }, data });

    await this.audit?.registrar({
      acao: 'EDITAR_PACIENTE',
      recurso: 'Paciente',
      recursoId: pacienteId,
      atendenteId: editorId,
      payload: {
        campos: Object.keys(data),
        ubsId: alvo.ubsId,
        prefeituraId: alvo.ubs.prefeituraId,
      },
    });

    return { id: atualizado.id, nome: atualizado.nome };
  }
}
