import { prisma } from '../../infrastructure/database/prisma';
import { Forbidden } from '../../shared/errors';
import { buildScope } from '../../shared/scope';

type UsuarioEscopo = {
  role: string;
  ubsId?: string | null;
  prefeituraId?: string | null;
  tipoUnidade?: string | null;
  unidadeId?: string | null;
};
const operacionais = new Set(['ATENDENTE_UBS', 'ATENDENTE_CENTRO', 'MEDICO', 'MEDICO_ESPECIALISTA', 'ENFERMEIRO']);

/** Autoriza tanto o estado atual quanto o pretendido; escopo municipal não equivale a administração. */
export async function authorizeUsuarioManagement(editorId: string, alvo: UsuarioEscopo) {
  const editor = await prisma.atendente.findUnique({ where: { id: editorId }, include: { ubs: true } });
  const deny = () => { throw Forbidden('PERMISSAO_INSUFICIENTE', 'Sem permissão para gerenciar este perfil ou vínculo'); };
  if (!editor || !editor.ativo || editor.deletadoEm) return deny();
  if (editor.role === 'DESENVOLVEDOR') return;
  if (!['ADMIN', 'REGULADOR_SMS', 'COORDENADOR_UBS'].includes(editor.role)) return deny();
  if (alvo.role === 'DESENVOLVEDOR') return deny();
  const scope = buildScope({ atendenteId: editor.id, role: editor.role, ubsId: editor.ubsId,
    prefeituraId: editor.prefeituraId ?? editor.ubs?.prefeituraId, tipoUnidade: editor.tipoUnidade });
  const ubs = alvo.ubsId ? await prisma.ubs.findUnique({ where: { id: alvo.ubsId } }) : null;
  if (alvo.ubsId && !ubs) return deny();
  const prefeituraId = alvo.prefeituraId ?? ubs?.prefeituraId;
  if (scope.kind === 'GLOBAL' || !prefeituraId || prefeituraId !== scope.prefeituraId) return deny();
  if (ubs && ubs.prefeituraId !== prefeituraId) return deny();
  if (scope.kind === 'UBS' && alvo.ubsId !== scope.ubsId) return deny();
  if (editor.role !== 'ADMIN') {
    if (!operacionais.has(alvo.role)) return deny();
    // Um coordenador de UBS não pode conceder roles de abrangência municipal.
    if (scope.kind === 'UBS' && alvo.role !== 'ATENDENTE_UBS') return deny();
    if (editor.role === 'COORDENADOR_UBS' && alvo.tipoUnidade !== editor.tipoUnidade) return deny();
    if (editor.role === 'COORDENADOR_UBS' && editor.unidadeId && alvo.unidadeId !== editor.unidadeId) return deny();
  }
}
