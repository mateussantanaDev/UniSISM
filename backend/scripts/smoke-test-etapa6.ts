/**
 * Smoke test fim-a-fim da Etapa 6 (Banners SMS + CMS admin).
 *
 * Cobre as 15 brechas identificadas:
 *
 *   1. 5 endpoints admin (List, GetById, Create, Update, Delete) — todos com escopo + audit
 *   2. Audit log em CRIAR/EDITAR/DELETAR
 *   3-4. HTTPS-only em imagemUrl + ctaUrl (rejeita http://)
 *   5. Sanitização XSS em titulo/corpo
 *   6. Rate limit nos endpoints públicos (BannersRateLimiter)
 *   7. (skipped — MarcarBannerVistoUseCase silent fail é OK por design idempotente)
 *   8. Validação prefeituraId existente
 *   9. Escopo PREFEITURA não pode mexer em banner global nem de outra prefeitura
 *   10. UI SvelteKit — validada via svelte-check
 *   11. totalVisualizacoes exposto no admin
 *   12. expiraEm > publicadoEm validado
 *   13. Max chars (titulo 80, corpo 400, ctaLabel 30, url 500)
 *   14. prioridadeOrdem range [-100, 1000]
 *   15. ctaLabel + ctaUrl devem vir juntos
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa6.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import {
  ListarBannersAdminUseCase,
  ObterBannerAdminUseCase,
  CriarBannerAdminUseCase,
  AtualizarBannerAdminUseCase,
  DeletarBannerAdminUseCase,
} from '../src/application/admin/SmsBannerAdminUseCases';
import { BannersRateLimiter } from '../src/modules/paciente-app/infrastructure/BannersRateLimiter';
import { getCache } from '../src/infrastructure/cache/Cache';
import type { AccessScope } from '../src/shared/scope';

async function limparRateLimitKeys(): Promise<void> {
  const cache = getCache();
  const inicio = Date.now();
  while (!cache.isReady() && Date.now() - inicio < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await cache.delByPrefix('rl:pa:ban:');
}

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 6 (Banners SMS + CMS — 15 brechas) ────\n');

  // Setup
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) throw new Error('Sem prefeitura — rode seed');
  let pref2 = await prisma.prefeitura.findFirst({ where: { id: { not: pref.id } } });
  if (!pref2) {
    pref2 = await prisma.prefeitura.create({
      data: { nome: 'PREF SMOKE E6', municipio: 'Outro', uf: 'PE' },
    });
  }
  let atendente = await prisma.atendente.findUnique({ where: { matricula: 'SMOKE-E6-001' } });
  if (!atendente) {
    const h = await bcrypt.hash('senha123', 8);
    atendente = await prisma.atendente.create({
      data: {
        matricula: 'SMOKE-E6-001',
        nome: 'ATENDENTE E6',
        email: 'at-e6@example.com',
        senhaHash: h,
        cpf: '11122233398',
        role: 'ADMIN',
        prefeituraId: pref.id,
      },
    });
  }
  const scopePref: AccessScope = { kind: 'PREFEITURA', prefeituraId: pref.id };
  const scopeGlobal: AccessScope = { kind: 'GLOBAL' };
  const scopeOutra: AccessScope = { kind: 'PREFEITURA', prefeituraId: pref2.id };

  // Limpa banners smoke antigos
  await prisma.smsBanner.deleteMany({ where: { titulo: { startsWith: 'SMOKE E6' } } });

  const audit = new PrismaAuditLogger();
  const listarUC = new ListarBannersAdminUseCase();
  const obterUC = new ObterBannerAdminUseCase();
  const criarUC = new CriarBannerAdminUseCase(audit);
  const atualizarUC = new AtualizarBannerAdminUseCase(audit);
  const deletarUC = new DeletarBannerAdminUseCase(audit);

  const auditCtx = { atendenteId: atendente.id, ip: '10.0.0.1', userAgent: 'smoke-e6' };

  // ─────────── BRECHA 13 · Max chars ───────────
  console.log('── BRECHA 13 · Max chars ──');
  try {
    await criarUC.exec(scopePref, {
      titulo: 'A'.repeat(81),
      corpo: 'corpo válido',
      tone: 'INFO',
      prefeituraId: pref.id,
    }, auditCtx);
    assert('Título > 80 chars rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Título > 80 chars → VALIDATION_ERROR (foi ${code})`, code === 'VALIDATION_ERROR');
  }
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 ok titulo',
      corpo: 'A'.repeat(401),
      tone: 'INFO',
      prefeituraId: pref.id,
    }, auditCtx);
    assert('Corpo > 400 chars rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Corpo > 400 chars → VALIDATION_ERROR (foi ${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 3-4 · HTTPS-only ───────────
  console.log('\n── BRECHA 3-4 · HTTPS-only em URLs ──');
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 http imagem',
      corpo: 'corpo',
      tone: 'INFO',
      imagemUrl: 'http://insecure.example.com/img.jpg',
      prefeituraId: pref.id,
    }, auditCtx);
    assert('http:// em imagemUrl rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`imagemUrl http:// rejeitado (foi ${code})`, code === 'VALIDATION_ERROR');
  }
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 http cta',
      corpo: 'corpo',
      tone: 'INFO',
      ctaLabel: 'Clique',
      ctaUrl: 'http://insecure.example.com',
      prefeituraId: pref.id,
    }, auditCtx);
    assert('http:// em ctaUrl rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`ctaUrl http:// rejeitado (foi ${code})`, code === 'VALIDATION_ERROR');
  }
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 url malformada',
      corpo: 'corpo',
      tone: 'INFO',
      ctaLabel: 'Clique',
      ctaUrl: 'https://',
      prefeituraId: pref.id,
    }, auditCtx);
    assert('URL malformada rejeitada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`URL "https://" rejeitada (foi ${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 15 · CTA label+url juntos ───────────
  console.log('\n── BRECHA 15 · CTA label+url devem vir juntos ──');
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 cta sozinho',
      corpo: 'corpo',
      tone: 'INFO',
      ctaLabel: 'Clique',
      // ctaUrl ausente
      prefeituraId: pref.id,
    }, auditCtx);
    assert('ctaLabel sem ctaUrl rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`ctaLabel sem ctaUrl rejeitado (foi ${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 12 · expiraEm > publicadoEm ───────────
  console.log('\n── BRECHA 12 · expiraEm > publicadoEm ──');
  try {
    const pub = new Date('2026-01-01T10:00:00Z');
    const exp = new Date('2025-12-31T10:00:00Z');
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 exp antes',
      corpo: 'corpo',
      tone: 'INFO',
      publicadoEm: pub.toISOString(),
      expiraEm: exp.toISOString(),
      prefeituraId: pref.id,
    }, auditCtx);
    assert('expiraEm < publicadoEm rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`expiraEm antes de publicadoEm → VALIDATION_ERROR (foi ${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 14 · prioridadeOrdem range ───────────
  console.log('\n── BRECHA 14 · prioridadeOrdem range ──');
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 prio alta',
      corpo: 'corpo',
      tone: 'INFO',
      prioridadeOrdem: 1001,
      prefeituraId: pref.id,
    }, auditCtx);
    assert('prioridadeOrdem 1001 rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`prioridadeOrdem 1001 → VALIDATION_ERROR (foi ${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 8 · prefeituraId inexistente ───────────
  console.log('\n── BRECHA 8 · prefeituraId inexistente ──');
  try {
    await criarUC.exec(scopeGlobal, {
      titulo: 'SMOKE E6 pref fake',
      corpo: 'corpo',
      tone: 'INFO',
      prefeituraId: '00000000-0000-0000-0000-000000000000',
    }, auditCtx);
    assert('prefeituraId inexistente rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`prefeituraId inexistente → PREFEITURA_NAO_ENCONTRADA (foi ${code})`, code === 'PREFEITURA_NAO_ENCONTRADA');
  }

  // ─────────── BRECHA 1 · CREATE bem-sucedido + BRECHA 2 audit + BRECHA 5 sanitização ───────────
  console.log('\n── BRECHA 1, 2, 5 · CREATE OK + audit + sanitização ──');
  const banner1 = await criarUC.exec(scopePref, {
    titulo: 'SMOKE E6 <script>alert(1)</script>OK',
    corpo: 'Texto com <img src=x onerror=hack()> chars',
    tone: 'CAMPANHA',
    imagemUrl: 'https://cdn.example.com/img.jpg',
    ctaLabel: 'Ver mais',
    ctaUrl: 'https://aguasbelas.pe.gov.br/saude',
    prioridadeOrdem: 50,
    prefeituraId: pref.id,
  }, auditCtx);
  assert('Banner criado', banner1.id.length > 0);
  assert(
    `Título sanitizado (sem <script>): "${banner1.titulo}"`,
    !banner1.titulo.includes('<') && banner1.titulo.includes('OK'),
  );
  assert(
    `Corpo sanitizado (sem <img>): "${banner1.corpo}"`,
    !banner1.corpo.includes('<'),
  );
  assert('imagemUrl preservada', banner1.imagemUrl === 'https://cdn.example.com/img.jpg');
  assert('ctaLabel + ctaUrl preservados', banner1.ctaLabel === 'Ver mais' && banner1.ctaUrl === 'https://aguasbelas.pe.gov.br/saude');
  assert('totalVisualizacoes = 0 inicial', banner1.totalVisualizacoes === 0);

  const auditCreate = await prisma.auditoriaLog.findFirst({
    where: { acao: 'CRIAR_BANNER', recursoId: banner1.id },
  });
  assert('Audit CRIAR_BANNER gravado', auditCreate !== null);

  // ─────────── BRECHA 9 · Escopo ADMIN não pode criar global ───────────
  console.log('\n── BRECHA 9 · Escopo PREFEITURA não pode banner global ──');
  try {
    await criarUC.exec(scopePref, {
      titulo: 'SMOKE E6 tentativa global',
      corpo: 'corpo',
      tone: 'INFO',
      prefeituraId: null,
    }, auditCtx);
    assert('ADMIN criando banner global rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`ADMIN → banner global rejeitado (foi ${code})`, code === 'FORA_DO_ESCOPO');
  }

  // ─────────── BRECHA 9 · ADMIN não pode mexer em banner de outra prefeitura ───────────
  console.log('\n── BRECHA 9 · ADMIN não pode mexer em banner de outra prefeitura ──');
  try {
    await obterUC.exec(scopeOutra, banner1.id);
    assert('Outra prefeitura lendo banner alheio rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Outra prefeitura → FORA_DO_ESCOPO (foi ${code})`, code === 'FORA_DO_ESCOPO');
  }
  try {
    await atualizarUC.exec(scopeOutra, banner1.id, { titulo: 'hack' }, auditCtx);
    assert('Outra prefeitura editando banner alheio rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`UPDATE outra prefeitura → FORA_DO_ESCOPO (foi ${code})`, code === 'FORA_DO_ESCOPO');
  }

  // ─────────── BRECHA 1 · DEV pode banner global ───────────
  console.log('\n── DEV pode criar banner global ──');
  const banner2 = await criarUC.exec(scopeGlobal, {
    titulo: 'SMOKE E6 global DEV',
    corpo: 'corpo do banner global',
    tone: 'URGENTE',
    prioridadeOrdem: 100,
    prefeituraId: null, // GLOBAL
  }, auditCtx);
  assert('Banner global criado por DEV', banner2.prefeituraId === null);

  // ─────────── BRECHA 1, 11 · LIST escopo + totalVisualizacoes ───────────
  console.log('\n── BRECHA 1, 11 · LIST com escopo + totalVisualizacoes ──');
  const listaPref = await listarUC.exec(scopePref);
  const listaGlobal = await listarUC.exec(scopeGlobal);

  // PREFEITURA pref só vê os banners da pref (não global, não outra)
  const idsPref = new Set(listaPref.map((b) => b.id));
  assert('Lista PREFEITURA inclui banner próprio', idsPref.has(banner1.id));
  assert('Lista PREFEITURA NÃO inclui banner global', !idsPref.has(banner2.id));

  // DEV (GLOBAL) vê todos
  const idsGlobal = new Set(listaGlobal.map((b) => b.id));
  assert('Lista GLOBAL inclui banner próprio', idsGlobal.has(banner1.id));
  assert('Lista GLOBAL inclui banner global', idsGlobal.has(banner2.id));

  const inList = listaPref.find((b) => b.id === banner1.id);
  assert(
    'totalVisualizacoes exposto na lista',
    inList?.totalVisualizacoes === 0,
  );

  // ─────────── BRECHA 2 · UPDATE com snapshot antes/depois ───────────
  console.log('\n── BRECHA 2 · UPDATE com audit antes/depois ──');
  await atualizarUC.exec(scopePref, banner1.id, {
    titulo: 'SMOKE E6 título atualizado',
    prioridadeOrdem: 80,
  }, auditCtx);
  const auditUpdate = await prisma.auditoriaLog.findFirst({
    where: { acao: 'EDITAR_BANNER', recursoId: banner1.id },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit EDITAR_BANNER gravado', auditUpdate !== null);
  const updPayload = auditUpdate?.payload as {
    antes?: { titulo?: string; prioridadeOrdem?: number };
    depois?: { titulo?: string; prioridadeOrdem?: number };
    camposAlterados?: string[];
  } | null;
  assert(
    `Antes.prioridadeOrdem = 50 (foi ${updPayload?.antes?.prioridadeOrdem})`,
    updPayload?.antes?.prioridadeOrdem === 50,
  );
  assert(
    `Depois.prioridadeOrdem = 80 (foi ${updPayload?.depois?.prioridadeOrdem})`,
    updPayload?.depois?.prioridadeOrdem === 80,
  );
  assert(
    `camposAlterados = [titulo, prioridadeOrdem]`,
    updPayload?.camposAlterados?.includes('titulo') === true &&
      updPayload?.camposAlterados?.includes('prioridadeOrdem') === true,
  );

  // ─────────── BRECHA 6 · Rate limit ───────────
  console.log('\n── BRECHA 6 · Rate limit BannersRateLimiter (240/15min/conta) ──');
  await limparRateLimitKeys();
  const rl = new BannersRateLimiter();
  let estouro = false;
  for (let i = 0; i < 250; i++) {
    try {
      await rl.consumir('conta-rl-test', '10.7.7.7');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouro = true;
        assert(`Rate limit estourou na tentativa #${i + 1} (esperado 241ª)`, i + 1 === 241);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit estoura em ≤ 250 tentativas', estouro);

  // ─────────── BRECHA 1, 2 · DELETE com audit ───────────
  console.log('\n── BRECHA 1, 2 · DELETE com audit ──');
  await deletarUC.exec(scopePref, banner1.id, auditCtx);
  const auditDelete = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DELETAR_BANNER', recursoId: banner1.id },
  });
  assert('Audit DELETAR_BANNER gravado', auditDelete !== null);
  const delPayload = auditDelete?.payload as { snapshot?: { titulo?: string } } | null;
  assert(
    'Audit DELETE snapshot capturado',
    delPayload?.snapshot?.titulo === 'SMOKE E6 título atualizado',
  );
  // Banner não mais existe
  try {
    await obterUC.exec(scopePref, banner1.id);
    assert('Banner deletado não acessível', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`GET banner deletado → BANNER_NAO_ENCONTRADO (foi ${code})`, code === 'BANNER_NAO_ENCONTRADO');
  }

  // ─────────── Cleanup ───────────
  await prisma.smsBanner.deleteMany({ where: { titulo: { startsWith: 'SMOKE E6' } } });
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'SmsBanner', atendenteId: atendente.id },
  });

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (15 brechas cobertas)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
