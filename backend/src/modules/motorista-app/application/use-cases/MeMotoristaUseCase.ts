/**
 * `GET /motorista-app/auth/me` — perfil completo do motorista logado.
 *
 * Spec: backend/docs/MOTORISTA_APP_API.md §4.5
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { Unauthorized } from '../../../../shared/errors';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export interface MotoristaMeOutput {
  id: string;
  nome: string;
  cpf: string;
  matricula: string;
  cnh: string;
  categoriaCnh: 'B' | 'C' | 'D' | 'E';
  validadeCnh: string; // YYYY-MM-DD
  telefone: string;
  status: 'ATIVO' | 'AFASTADO' | 'INATIVO';
  totalViagens: number;
  totalKmRodados: number;
  prefeituraNome: string;
  fotoUrl: string | null;
  primeiroLogin: boolean;
}

export class MeMotoristaUseCase {
  async exec(auth: MotoristaAuthContext): Promise<MotoristaMeOutput> {
    const m = await prisma.motoristaTFD.findUnique({
      where: { id: auth.motoristaId },
      include: {
        prefeitura: { select: { nome: true } },
        atendente: { select: { matricula: true, nome: true } },
      },
    });
    if (!m || !m.atendente) throw Unauthorized('TOKEN_INVALIDO', 'Motorista não encontrado');

    return {
      id: m.id,
      nome: m.atendente.nome,
      cpf: m.cpf,
      matricula: m.atendente.matricula,
      cnh: m.cnh,
      categoriaCnh: m.categoriaCnh,
      validadeCnh: m.validadeCnh.toISOString().slice(0, 10),
      telefone: m.telefone,
      status: m.status,
      totalViagens: m.totalViagens,
      totalKmRodados: Number(m.totalKmRodados),
      prefeituraNome: m.prefeitura.nome,
      fotoUrl: null,
      primeiroLogin: m.primeiroLogin,
    };
  }
}
