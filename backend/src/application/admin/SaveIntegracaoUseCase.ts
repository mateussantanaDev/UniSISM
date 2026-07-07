import { prisma } from '../../infrastructure/database/prisma';

export interface SaveIntegracaoInput {
  nome: 'CADSUS' | 'e-SUS APS' | 'SISREG' | 'Webhook UBS';
  url: string;
  usuario?: string | null;
  senha?: string | null;
  token?: string | null;
}

export class SaveIntegracaoUseCase {
  async exec(input: SaveIntegracaoInput) {
    const config = await prisma.configuracaoIntegracao.upsert({
      where: { nome: input.nome },
      create: {
        nome: input.nome,
        url: input.url,
        usuario: input.usuario,
        senha: input.senha,
        token: input.token,
      },
      update: {
        url: input.url,
        usuario: input.usuario,
        senha: input.senha,
        token: input.token,
      },
    });

    return config;
  }
}
