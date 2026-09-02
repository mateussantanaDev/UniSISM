/**
 * PEC e-SUS APS · Scraper via GraphQL (1000x mais rápido que scraping de UI)
 *
 * Estratégia:
 *   1. Login Playwright (1 vez) — pega cookies de sessão
 *   2. Navega pra UBS qualquer + /cidadao (estabelece contexto)
 *   3. Loop A-Z chamando GraphQL CidadaoListing direto via context.request.post()
 *   4. Pra cada letra: pagina até esgotar
 *   5. Dedup por id, salva em data/pec-pacientes/pacientes.jsonl
 *   6. (Próximo passo: query GraphQL de prontuário individual por id)
 *
 * Uso:
 *   npx ts-node-dev --transpile-only scripts/pec/pec-graphql-scraper.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type APIRequestContext, type Page } from 'playwright';
import { PEC, PACIENTES_DIR, sleep, log, getLaunchOptions } from './pec-common';

fs.mkdirSync(PACIENTES_DIR, { recursive: true });
const OUTPUT = path.join(PACIENTES_DIR, 'pacientes.jsonl');
const PROGRESS = path.join(PACIENTES_DIR, 'graphql-progress.json');

// ─── Query GraphQL CidadaoListing ────────────────────────────
const QUERY_CIDADAOS = `query CidadaoListing($filtro: CidadaosQueryInput!) {
  cidadaos(input: $filtro) {
    content {
      id
      nome
      nomeSocial
      cpf
      cns
      nomeMae
      dataNascimento
      telefoneCelular
      telefoneResidencial
      sexo
      identidadeGeneroDbEnum
      dataAtualizado
      ativo
      unificado
      unificacaoBase
      prontuario { id __typename }
      possuiAgendamento
      localidadeNascimento {
        id nome
        uf { id nome sigla __typename }
        __typename
      }
      faleceu
      cidadaoVinculacaoEquipe {
        id
        unidadeSaude { id nome __typename }
        __typename
      }
      enderecoIndigena {
        aldeiaResidencia { id nome __typename }
        poloBaseResidencia { id nome __typename }
        dseiResidencia { id nome __typename }
        __typename
      }
      cidadaoAldeado { id nomeTradicional __typename }
      __typename
    }
    __typename
  }
}`;

async function loginAndContext(page: Page): Promise<void> {
  await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="username"]', { timeout: 30_000 });
  const cookieBtn = page.locator('button:has-text("apenas os necessários")');
  if (await cookieBtn.count()) await cookieBtn.click().catch(() => {});
  await page.evaluate(({ u, p }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    const userInput = document.querySelector('input[name="username"]') as HTMLInputElement;
    const passInput = document.querySelector('input[name="password"]') as HTMLInputElement;
    setter.call(userInput, u);
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(passInput, p);
    passInput.dispatchEvent(new Event('input', { bubbles: true }));
  }, { u: PEC.user, p: PEC.password });
  await page.locator('button:has-text("Acessar")').click();
  await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30_000 }).catch(() => {});
  await sleep(3000);
  const modal = page.locator('text=/já está logado em outra sessão/i').first();
  if (await modal.count() > 0) {
    await page.locator('button:has-text("Continuar")').click().catch(() => {});
    await sleep(3000);
  }
  await sleep(2000);

  // Clica na UBS pra estabelecer contexto (qualquer uma serve)
  await page.evaluate(() => {
    const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'UBS Abel Dias da Silva');
    const card = h3?.closest('div[class]') as HTMLElement | null;
    card?.click();
  });
  await sleep(6000);
}

async function queryCidadaos(
  request: APIRequestContext,
  query: string,
  pageSize: number,
  page: number = 0,
): Promise<any[]> {
  const url = PEC.baseUrl.replace(/\/$/, '') + '/api/graphql';
  const variables = {
    filtro: {
      pageParams: { size: pageSize, page, fetchPageInfo: false },
      query,
      cidadaoAldeado: null,
      ativo: null,
      obito: null,
    },
  };
  const res = await request.post(url, {
    data: [{
      operationName: 'CidadaoListing',
      variables,
      query: QUERY_CIDADAOS,
    }],
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': PEC.baseUrl.replace(/\/$/, ''),
      'Referer': PEC.baseUrl.replace(/\/$/, '') + '/cidadao',
    },
  });
  const text = await res.text();
  if (process.env.PEC_DEBUG) {
    log('INFO', `GraphQL ${res.status()} · body[0..500]: ${text.slice(0, 500)}`);
  }
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const data = Array.isArray(json) ? json[0]?.data : json.data;
  const errors = Array.isArray(json) ? json[0]?.errors : json.errors;
  if (errors) log('WARN', `GraphQL errors: ${JSON.stringify(errors).slice(0, 300)}`);
  return data?.cidadaos?.content ?? [];
}

interface Progress {
  letrasFeitas: string[];
  idsColetados: string[];
  inicio: string;
  atualizado: string;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf-8'));
  return { letrasFeitas: [], idsColetados: [], inicio: new Date().toISOString(), atualizado: new Date().toISOString() };
}
function saveProgress(p: Progress): void {
  p.atualizado = new Date().toISOString();
  fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

function appendJsonl(items: any[]): void {
  const lines = items.map(i => JSON.stringify(i)).join('\n') + '\n';
  fs.appendFileSync(OUTPUT, lines);
}

async function main() {
  log('INFO', '🚀 pec-graphql-scraper · GraphQL direto');
  const browser = await chromium.launch(getLaunchOptions());
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  try {
    log('INFO', '🔐 login + contexto');
    await loginAndContext(page);

    const progress = loadProgress();
    const idsJaColetados = new Set(progress.idsColetados);
    log('INFO', `📊 progresso atual`, {
      letrasFeitas: progress.letrasFeitas.length,
      idsColetados: idsJaColetados.size,
    });

    const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const PAGE_SIZE = 1000;

    // Estratégia: query "" (vazia) DEVE retornar todos. Se PEC não aceita,
    // iteramos por letras (cada nome contém pelo menos uma vogal/letra)
    // e paginamos via pageParams.page até retornar < PAGE_SIZE
    async function buscarComPaginacao(query: string): Promise<number> {
      let page = 0;
      let totalNovos = 0;
      while (true) {
        const content = await queryCidadaos(ctx.request, query, PAGE_SIZE, page);
        if (content.length === 0) break;
        const novos = content.filter((c: any) => !idsJaColetados.has(c.id));
        novos.forEach((c: any) => idsJaColetados.add(c.id));
        if (novos.length) {
          appendJsonl(novos);
          totalNovos += novos.length;
        }
        progress.idsColetados = Array.from(idsJaColetados);
        saveProgress(progress);
        log('INFO', `  page ${page} de "${query}": +${novos.length} novos · total acumulado ${idsJaColetados.size}`);
        if (content.length < PAGE_SIZE) break;
        page++;
        await sleep(500);
      }
      return totalNovos;
    }

    // Primeiro tenta uma busca por " " (espaço) — todos os nomes têm espaço (NOME SOBRENOME)
    log('INFO', '═══ busca global por " " (todos têm espaço no nome) ═══');
    await buscarComPaginacao(' ');
    progress.letrasFeitas.push('SPACE');
    saveProgress(progress);

    // Caso o espaço não pegue todos: também varre por vogais (que estão em quase todo nome)
    for (const letra of ['A', 'E', 'I', 'O', 'U']) {
      if (progress.letrasFeitas.includes(letra)) continue;
      log('INFO', `═══ vogal ${letra} (complemento) ═══`);
      await buscarComPaginacao(letra);
      progress.letrasFeitas.push(letra);
      saveProgress(progress);
      await sleep(1000);
    }

    log('INFO', `✅ COMPLETO · ${idsJaColetados.size} pacientes únicos em ${OUTPUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
