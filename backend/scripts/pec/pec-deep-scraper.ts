/**
 * PEC e-SUS APS · Tour profundo paralelo (paciente por paciente)
 *
 * Arquitetura:
 *   1. UM login por UBS (perfil Enfermeira) → storage state salvo
 *   2. Pool de 4 contexts paralelos por UBS
 *   3. Throttle global 6 req/s (defesa anti-bot)
 *   4. Checkpoint resumível em data/pec-progress.json
 *   5. JSON por paciente em data/pec-pacientes/<ubs-slug>/<cpf>.json
 *
 * Tempo estimado:
 *   - Serial: 9-90 dias
 *   - Pool 4×: 2-22 dias
 *
 * Uso:
 *   pm2 start --interpreter "npx" --interpreter-args "ts-node-dev --transpile-only" \
 *     scripts/pec/pec-deep-scraper.ts --name pec-deep
 *
 * ⚠️ TODOs marcados — completar após mapear UI dentro do perfil Enfermeira em 1 UBS de teste.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import {
  ContextPool,
  PACIENTES_DIR,
  POOL_SIZE,
  UBS_AGUAS_BELAS,
  defensiveSleep,
  hasStoredSession,
  log,
  loadProgress,
  loginAndSaveState,
  saveProgress,
  slug,
  sleep,
} from './pec-common';

const STATE_DIR = path.join(PACIENTES_DIR, '..', 'pec-state');

interface PacienteRef {
  id: string;
  nome: string;
  cpf?: string;
  cns?: string;
}

/**
 * TODO: Listar pacientes vinculados à UBS atual.
 *
 * Estratégia (a confirmar no 1º run manual):
 *   - Como Enfermeira, ir em "Cidadão" → busca por nome/CPF
 *   - OU pelo módulo CDS (Coleta de Dados Simplificada)
 *   - OU navegar pelas equipes → listar pacientes da equipe
 *
 * Retorna lista paginada com id interno do PEC + nome + CPF.
 */
async function listarPacientesUbs(page: Page): Promise<PacienteRef[]> {
  // TODO 1: mapear URL do módulo "Cidadão" pro perfil Enfermeiro
  // TODO 2: implementar paginação (PEC usa scroll infinito ou paginator clássico)
  // TODO 3: extrair lista completa de pacientes vinculados
  log('WARN', 'listarPacientesUbs() — não implementado ainda. Pula UBS.');
  return [];
}

/**
 * TODO: Captura dados completos de UM paciente.
 *
 * Estratégia:
 *   - Abrir folha do cidadão (URL com ID)
 *   - Capturar dados pessoais + endereço
 *   - Capturar prontuário longitudinal (atendimentos, evoluções, condutas)
 *   - Capturar condições crônicas, alergias, medicamentos
 *   - Capturar vacinas + exames + procedimentos
 *   - Retornar JSON estruturado
 */
async function capturarPaciente(page: Page, ref: PacienteRef): Promise<Record<string, unknown> | null> {
  // TODO: implementar
  return null;
}

// ────────────────────────────────────────────────────────────────
// Process por UBS
// ────────────────────────────────────────────────────────────────
async function processarUbs(ubs: { nome: string; ine?: string }, pool: ContextPool, progress: ReturnType<typeof loadProgress>): Promise<void> {
  const ubsSlug = slug(ubs.nome);
  const ubsState = progress.ubsPacientes[ubsSlug] ?? { coletados: [], restantes: 0 };

  if (ubsState.finalizado) {
    log('INFO', `[skip] UBS já finalizada`, { ubs: ubs.nome });
    return;
  }

  log('INFO', `→ UBS: ${ubs.nome}`, { ine: ubs.ine });

  // Cada UBS exige login profissional próprio — invalida storage state anterior
  // e refaz login como Enfermeira nessa UBS.
  log('INFO', `🔐 re-login como Enfermeira em ${ubs.nome}`);
  // Apaga state anterior pra forçar re-login no perfil correto
  const stateFile = path.join(STATE_DIR, 'storage-state.json');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  await loginAndSaveState({ nomeUbs: ubs.nome });

  // Re-init pool com novo state
  await pool.close();
  await pool.init(POOL_SIZE);

  // Worker auxiliar pra listar pacientes (usa 1 worker do pool)
  const listadorWorker = await pool.acquire();
  let pacientes: PacienteRef[];
  try {
    pacientes = await listarPacientesUbs(listadorWorker.page);
  } finally {
    pool.release(listadorWorker);
  }
  log('INFO', `${pacientes.length} pacientes identificados em ${ubs.nome}`);

  const ubsDir = path.join(PACIENTES_DIR, ubsSlug);
  fs.mkdirSync(ubsDir, { recursive: true });

  const naoColetados = pacientes.filter(p => !ubsState.coletados.includes(p.id));
  ubsState.restantes = naoColetados.length;
  progress.ubsPacientes[ubsSlug] = ubsState;
  saveProgress();

  // Processa pacientes em paralelo
  await pool.runAll(naoColetados, async (p, worker) => {
    try {
      const data = await capturarPaciente(worker.page, p);
      if (data) {
        const fname = path.join(ubsDir, `${(p.cpf ?? p.id).replace(/\D/g, '')}.json`);
        fs.writeFileSync(fname, JSON.stringify(data, null, 2));
        ubsState.coletados.push(p.id);
        ubsState.ultimoCpf = p.cpf;
        ubsState.restantes = naoColetados.length - ubsState.coletados.length;
        saveProgress();
        log('INFO', `✓ [${worker.id}] paciente`, { ubs: ubsSlug, cpf: p.cpf, restantes: ubsState.restantes });
      }
    } catch (e) {
      log('ERROR', `falhou ${p.id} em ${ubs.nome}: ${(e as Error).message}`);
    }
  });

  ubsState.finalizado = true;
  saveProgress();
  log('INFO', `✓ UBS ${ubs.nome} finalizada`);
}

// ────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', '🚀 pec-deep-scraper iniciando', { ubsTotal: UBS_AGUAS_BELAS.length, poolSize: POOL_SIZE });

  const progress = loadProgress();

  // Login inicial — não importa qual perfil, vai ser refeito por UBS
  if (!hasStoredSession()) {
    log('INFO', 'sem session — fazendo login Gestor pra warm-up');
    await loginAndSaveState('GESTOR');
  }

  const pool = new ContextPool();
  await pool.init(POOL_SIZE);

  try {
    for (const ubs of UBS_AGUAS_BELAS) {
      await processarUbs(ubs, pool, progress);
      await sleep(10_000); // cooldown entre UBSs
    }
  } catch (e) {
    log('ERROR', `falha geral: ${(e as Error).message}`);
  } finally {
    await pool.close();
  }

  log('INFO', '✓ deep-scraper concluído');
}

main().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
