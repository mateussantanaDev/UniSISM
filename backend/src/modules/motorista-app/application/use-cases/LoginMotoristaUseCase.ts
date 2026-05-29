/**
 * Login do motorista no app mobile (Face 4).
 *
 * Chave: matrícula + senha.
 * Token: JWT (claims = sub=atendenteId, motoristaId, role=MOTORISTA_TFD,
 *              prefeituraId, primeiroLogin). TTL configurável (default 30 dias).
 *
 * Tratamento de senha placeholder: contas criadas pelo backfill ficam com
 * `senhaHash='!provisorio!'`. O bcrypt sempre falha contra essa string —
 * resultado: o motorista NÃO consegue logar até o gestor rodar
 * `npm run db:backfill-motoristas` (que aplica bcrypt real dos últimos
 * 8 dígitos do CPF). Mensagem retornada é sempre "CREDENCIAIS_INVALIDAS"
 * pra não vazar o estado interno.
 *
 * Logging: registra MOTORISTA_LOGIN na cadeia de audit TFD.
 */
import type { Request } from 'express';
import { Forbidden, Unauthorized } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { IPasswordHasher } from '../../../../domain/services/IPasswordHasher';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { ITfdAuditLogger } from '../../../tfd/infrastructure/TfdAuditLogger';

export interface LoginMotoristaOutput {
  token: string;
  motorista: {
    id: string;
    nome: string;
    matricula: string;
    status: 'ATIVO' | 'AFASTADO' | 'INATIVO';
  };
  primeiroLogin: boolean;
}

const TOKEN_TTL_SECONDS_DEFAULT = 30 * 24 * 60 * 60; // 30 dias (apps mobile)

export class LoginMotoristaUseCase {
  constructor(
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly audit: ITfdAuditLogger,
    private readonly tokenTtlSeconds: number = TOKEN_TTL_SECONDS_DEFAULT,
  ) {}

  async exec(matricula: string, senha: string, req: Request): Promise<LoginMotoristaOutput> {
    const matriculaNorm = matricula.trim().toUpperCase();
    const atendente = await prisma.atendente.findUnique({
      where: { matricula: matriculaNorm },
      include: {
        motoristaTfd: { select: { id: true, status: true, primeiroLogin: true } },
      },
    });
    if (
      !atendente
      || atendente.role !== 'MOTORISTA_TFD'
      || !atendente.motoristaTfd
      || !atendente.prefeituraId
    ) {
      throw Unauthorized('MATRICULA_OU_SENHA_INVALIDA', 'Matrícula ou senha inválidos');
    }

    // Bcrypt nunca casa com '!provisorio!' → motorista pré-backfill recebe
    // CREDENCIAIS_INVALIDAS (não vazamos o estado interno).
    const ok = await this.hasher.compare(senha, atendente.senhaHash);
    if (!ok) {
      throw Unauthorized('MATRICULA_OU_SENHA_INVALIDA', 'Matrícula ou senha inválidos');
    }

    if (!atendente.ativo) {
      throw Forbidden('MOTORISTA_INATIVO', 'Conta inativa. Contate a gestão TFD.');
    }
    if (atendente.motoristaTfd.status !== 'ATIVO') {
      throw Forbidden(
        'MOTORISTA_INATIVO',
        `Motorista está ${atendente.motoristaTfd.status}. Contate a gestão TFD.`,
      );
    }

    const token = this.tokens.assinarAccess(
      {
        sub: atendente.id,
        role: 'MOTORISTA_TFD',
        prefeituraId: atendente.prefeituraId,
        motoristaId: atendente.motoristaTfd.id,
        primeiroLogin: atendente.motoristaTfd.primeiroLogin,
      },
      this.tokenTtlSeconds,
    );

    await this.audit.registrar({
      prefeituraId: atendente.prefeituraId,
      acao: 'MOTORISTA_LOGIN',
      recursoTipo: 'MOTORISTA',
      recursoId: atendente.motoristaTfd.id,
      operadorId: atendente.id,
      operadorNome: atendente.nome,
      operadorMatricula: atendente.matricula,
      operadorRole: 'MOTORISTA_TFD',
      ip: req.ip ?? '0.0.0.0',
      userAgent: req.header('user-agent') ?? 'unknown',
      depois: { primeiroLogin: atendente.motoristaTfd.primeiroLogin },
    });

    return {
      token,
      motorista: {
        id: atendente.motoristaTfd.id,
        nome: atendente.nome,
        matricula: atendente.matricula,
        status: atendente.motoristaTfd.status,
      },
      primeiroLogin: atendente.motoristaTfd.primeiroLogin,
    };
  }
}
