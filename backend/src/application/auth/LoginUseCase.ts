import { Forbidden, Unauthorized } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import type { IPasswordHasher } from '../../domain/services/IPasswordHasher';
import type { ISessaoRepository } from '../../domain/repositories/ISessaoRepository';
import type { ITokenService } from '../../domain/services/ITokenService';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import { authLoginTotal } from '../../infrastructure/metrics/prometheus';
import { prisma } from '../../infrastructure/database/prisma';
import { iniciais } from '../utils/iniciais';

export interface LoginInput {
  login: string;
  senha: string;
  lembrar?: boolean;
  ip?: string;
  userAgent?: string;
}

export interface LoginOutput {
  token: string;
  refreshToken: string;
  expiresIn: number;
  atendente: {
    id: string;
    nome: string;
    matricula: string;
    iniciais: string;
  };
}

export class LoginUseCase {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly sessoes: ISessaoRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly audit?: IAuditLogger,
  ) {}

  async exec(input: LoginInput): Promise<LoginOutput> {
    const atendente = await this.atendentes.buscarPorLogin(input.login);

    if (!atendente) {
      await this.atendentes.registrarTentativaLogin({
        login: input.login,
        sucesso: false,
        ...(input.ip ? { ip: input.ip } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      });
      authLoginTotal.inc({ resultado: 'falha' });
      await this.audit?.registrar({
        acao: 'LOGIN_FALHA',
        recurso: 'Sessao',
        payload: { login: input.login, motivo: 'usuario_nao_encontrado' },
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw Unauthorized('CREDENCIAIS_INVALIDAS', 'Login ou senha inválidos');
    }

    if (!atendente.ativo) {
      authLoginTotal.inc({ resultado: 'bloqueado' });
      throw Forbidden('USUARIO_INATIVO', 'Usuário inativo');
    }
    if (atendente.bloqueadoAte && atendente.bloqueadoAte > new Date()) {
      authLoginTotal.inc({ resultado: 'bloqueado' });
      throw Forbidden('USUARIO_BLOQUEADO', 'Usuário temporariamente bloqueado');
    }

    const ok = await this.hasher.compare(input.senha, atendente.senhaHash);
    if (!ok) {
      await this.atendentes.registrarTentativaLogin({
        login: input.login,
        atendenteId: atendente.id,
        sucesso: false,
        ...(input.ip ? { ip: input.ip } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      });

      const falhas = await this.atendentes.contarTentativasFalhas(input.login, 15);
      if (falhas >= 5) {
        await this.atendentes.bloquearAte(atendente.id, new Date(Date.now() + 30 * 60_000));
      }
      throw Unauthorized('CREDENCIAIS_INVALIDAS', 'Login ou senha inválidos');
    }

    // Política simples: senhas com mais de 180 dias atualizam data para evitar bloqueio indevido
    const limiteSenha = 180 * 24 * 60 * 60 * 1000;
    if (Date.now() - atendente.senhaAlteradaEm.getTime() > limiteSenha) {
      await prisma.atendente.update({
        where: { id: atendente.id },
        data: { senhaAlteradaEm: new Date() },
      }).catch(() => {});
    }

    const refresh = this.tokens.gerarRefresh();
    const sessao = await this.sessoes.criar({
      atendenteId: atendente.id,
      refreshTokenHash: refresh.hash,
      expiraEm: refresh.expiraEm,
      ...(input.ip ? { ip: input.ip } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    });

    // prefeituraId efetivo: o do atendente OU o herdado da UBS OU a prefeitura padrão do município
    let prefeituraId =
      atendente.prefeituraId ?? atendente.ubs?.prefeituraId ?? null;

    if (!prefeituraId && atendente.role !== 'DESENVOLVEDOR') {
      const prefAtiva = await prisma.prefeitura.findFirst({
        where: { ativa: true },
        orderBy: { criadoEm: 'asc' },
        select: { id: true },
      });
      prefeituraId = prefAtiva?.id ?? 'b2ca1b67-3b6b-4a52-adbe-01df1d64cae6';
      // Persiste no atendente para estabilidade futura
      await prisma.atendente.update({
        where: { id: atendente.id },
        data: { prefeituraId },
      }).catch(() => {});
    }

    const accessToken = this.tokens.assinarAccess({
      sub: atendente.id,
      role: atendente.role,
      ubsId: atendente.ubsId,
      prefeituraId,
      sid: sessao.sessaoId,
    });

    await this.atendentes.registrarTentativaLogin({
      login: input.login,
      atendenteId: atendente.id,
      sucesso: true,
      ...(input.ip ? { ip: input.ip } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    });
    await this.atendentes.registrarAtividade(atendente.id, 'Login efetuado');
    authLoginTotal.inc({ resultado: 'sucesso' });
    await this.audit?.registrar({
      acao: 'LOGIN_SUCESSO',
      recurso: 'Sessao',
      recursoId: sessao.sessaoId,
      atendenteId: atendente.id,
      payload: { matricula: atendente.matricula, role: atendente.role },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      token: accessToken,
      refreshToken: refresh.token,
      expiresIn: this.tokens.ttlAccessSeconds(),
      atendente: {
        id: atendente.id,
        nome: atendente.nome,
        matricula: atendente.matricula,
        iniciais: iniciais(atendente.nome),
      },
    };
  }
}
