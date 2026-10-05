import { prisma } from '../../../infrastructure/database/prisma';
import { Unprocessable } from '../../../shared/errors';

/** Nome é apenas compatibilidade de entrada: o vínculo persistido sempre usa ID único no município. */
export async function resolverProfissionalCentro(ubsId: string, nome?: string | null, id?: string | null) {
  if (!nome && !id) return null;
  const ubs = await prisma.ubs.findUnique({ where: { id: ubsId }, select: { prefeituraId: true } });
  if (!ubs) throw Unprocessable('UBS_NAO_ENCONTRADA', 'Unidade de origem não encontrada');
  const candidatos = await prisma.atendente.findMany({
    where: {
      role: { in: ['MEDICO', 'MEDICO_ESPECIALISTA'] }, ativo: true, deletadoEm: null,
      AND: [
        { OR: [{ prefeituraId: ubs.prefeituraId }, { ubs: { prefeituraId: ubs.prefeituraId } }] },
        id ? { id } : { OR: [{ nome: { equals: nome!.trim(), mode: 'insensitive' } }, { matricula: nome!.trim() }] },
      ],
    }, take: 2, select: { id: true, nome: true },
  });
  if (candidatos.length > 1) throw Unprocessable('PROFISSIONAL_AMBIGUO', 'Selecione o profissional pelo cadastro: há nomes iguais');
  if (id && !candidatos.length) throw Unprocessable('PROFISSIONAL_INVALIDO', 'Profissional não encontrado nesta prefeitura');
  return candidatos[0] ?? null;
}
