/**
 * Ativa a conta do paciente no primeiro acesso.
 *
 * Confirmação do paciente: CPF + data de nascimento (conferida contra
 * `encaminhamentos.pacienteDataNascimento`).
 * Define a senha inicial.
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import type { IPasswordHasher } from '../../../../domain/services/IPasswordHasher';
import {
  formatarCpf,
  normalizarCpf,
} from '../../../../infrastructure/services/NotificacaoPacienteService';

export class AtivarContaPacienteUseCase {
  constructor(private readonly hasher: IPasswordHasher) {}

  async exec(cpf: string, dataNascimentoYmd: string, senha: string, nome?: string): Promise<void> {
    if (senha.length < 8) {
      throw Unprocessable('SENHA_FRACA', 'Senha deve ter ao menos 8 caracteres');
    }
    const cpfDigits = normalizarCpf(cpf);
    const conta = await prisma.pacienteConta.findUnique({ where: { cpf: cpfDigits } });

    // 1. Busca se já existe conta ou paciente cadastrado
    const pac = await prisma.paciente.findFirst({
      where: {
        OR: [
          { cpf: cpfDigits },
          { cpf: formatarCpf(cpfDigits) }
        ],
        deletadoEm: null,
      },
      include: { ubs: true },
    });

    const enc = await prisma.encaminhamento.findFirst({
      where: {
        pacienteCpf: { contains: cpfDigits.slice(0, 3) },
        pacienteDataNascimento: new Date(`${dataNascimentoYmd}T00:00:00.000Z`),
      },
      select: { pacienteNome: true, ubsId: true },
    });

    // Validação de data de nascimento:
    let dataNascimentoValida = false;
    let nomeFinal = nome?.trim().toUpperCase();
    let ubsIdFinal = conta?.ubsVinculadaId;

    if (pac) {
      const dataPacYmd = pac.dataNascimento.toISOString().slice(0, 10);
      if (dataPacYmd === dataNascimentoYmd) {
        dataNascimentoValida = true;
        nomeFinal = nomeFinal || pac.nome;
        ubsIdFinal = ubsIdFinal || pac.ubsId;
      }
    }

    if (!dataNascimentoValida && enc) {
      dataNascimentoValida = true;
      nomeFinal = nomeFinal || enc.pacienteNome;
      ubsIdFinal = ubsIdFinal || enc.ubsId;
    }

    if (!dataNascimentoValida) {
      throw Unprocessable(
        'CONFIRMACAO_INVALIDA',
        'Dados de confirmação não conferem. Verifique CPF e data de nascimento.',
      );
    }

    const hash = await this.hasher.hash(senha);

    if (conta) {
      await prisma.pacienteConta.update({
        where: { id: conta.id },
        data: {
          senhaHash: hash,
          ativo: true,
          senhaProvisoria: false,
          nome: nomeFinal || conta.nome,
          ubsVinculadaId: ubsIdFinal,
        },
      });
    } else {
      await prisma.pacienteConta.create({
        data: {
          cpf: cpfDigits,
          cpfFormatado: formatarCpf(cpfDigits),
          nome: nomeFinal || 'CIDADÃO',
          senhaHash: hash,
          ativo: true,
          senhaProvisoria: false,
          ubsVinculadaId: ubsIdFinal,
        },
      });
    }
  }
}
