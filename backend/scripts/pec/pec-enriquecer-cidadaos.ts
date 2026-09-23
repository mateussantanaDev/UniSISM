/**
 * Enriquece os 54k cidadãos coletados com BuscaDetailCidadao
 *  (endereço completo, raça, escolaridade, CBO, estado civil, gestações, etc)
 *
 * Saída: data/pec-pacientes/cidadaos-detalhados.jsonl
 * Resume automático via data/pec-pacientes/detalhados-progress.json
 *
 * Usa pool de N requests GraphQL paralelas (default 8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type APIRequestContext, type Page } from 'playwright';
import { PEC, PACIENTES_DIR, sleep, log } from './pec-common';

const INPUT = path.join(PACIENTES_DIR, 'pacientes.jsonl');
const OUTPUT = path.join(PACIENTES_DIR, 'cidadaos-detalhados.jsonl');
const PROGRESS = path.join(PACIENTES_DIR, 'detalhados-progress.json');
const ERRORS = path.join(PACIENTES_DIR, 'detalhados-errors.jsonl');
const POOL_SIZE = parseInt(process.env.PEC_ENRICH_POOL ?? '8', 10);

const QUERY_DETAIL = `query BuscaDetailCidadao($id: ID!) {
  cidadao(id: $id) {
    id cpf cns nisPisPasep nome nomeSocial dataNascimento dataAtualizado
    dataObito numeroDocumentoObito sexo nomeMae nomePai
    telefoneResidencial telefoneCelular telefoneContato email
    area microArea
    endereco {
      cep
      uf { id nome __typename }
      municipio { id nome __typename }
      bairro
      tipoLogradouro { id nome __typename }
      logradouro numero semNumero complemento pontoReferencia
      __typename
    }
    localidadeExterior
    prontuario {
      id
      gestacoes { id inicio fim __typename }
      preNatalAtivo {
        id altoRisco
        tipoGravidez { id descricao __typename }
        gravidezPlanejada ultimaDum
        __typename
      }
      puerpera
      __typename
    }
    identidadeGeneroDbEnum
    etnia { id nome __typename }
    racaCor { id nome racaCorDbEnum __typename }
    cbo { id nome __typename }
    escolaridade { id nome __typename }
    ativo
    localidadeNascimento {
      id nome
      uf { id sigla __typename }
      __typename
    }
    faleceu possuiAgendamento
    cidadaoVinculacaoEquipe {
      id tpCdsOrigem utilizarCadastroIndividual
      unidadeSaude { id nome __typename }
      equipe { id nome ine __typename }
      __typename
    }
    tipoSanguineo orientacaoSexualDbEnum
    estadoCivil { id nome __typename }
    paisExterior { id nome __typename }
    nacionalidade { id nacionalidadeDbEnum __typename }
    portariaNaturalizacao dataNaturalizacao
    paisNascimento { id nome __typename }
    dataEntradaBrasil
    stCompartilhaProntuario
    periodoAusenciaList { id dtAusencia dtRetorno __typename }
    cidadaoAldeado {
      id
      aldeiaNascimento { id nome __typename }
      funcaoSocial { id nome __typename }
      localOcorrencia { id nome __typename }
      beneficios nomeTradicional responsavelLegal stChefeFamilia
      unidadeFunai livro folha cadastroUnico
      ufNascimento { id sigla __typename }
      dtEmissao dtReconhecimento
      __typename
    }
    enderecoIndigena {
      aldeiaResidencia { id nome __typename }
      poloBaseResidencia { id nome __typename }
      dseiResidencia { id nome __typename }
      __typename
    }
    __typename
  }
}`;

async function loginAndContext(page: Page) {
  await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="username"]', { timeout: 30_000 });
  const cookieBtn = page.locator('button:has-text("apenas os necessários")');
  if (await cookieBtn.count()) await cookieBtn.click().catch(() => {});
  await page.evaluate(({ u, p }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    (document.querySelector('input[name="username"]') as HTMLInputElement).value = '';
    (document.querySelector('input[name="password"]') as HTMLInputElement).value = '';
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
  await page.evaluate(() => {
    const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'UBS Abel Dias da Silva');
    const card = h3?.closest('div[class]') as HTMLElement | null;
    card?.click();
  });
  await sleep(6000);
}

async function buscarDetail(req: APIRequestContext, id: string): Promise<any | null> {
  const url = PEC.baseUrl.replace(/\/$/, '') + '/api/graphql';
  const res = await req.post(url, {
    data: [{ operationName: 'BuscaDetailCidadao', variables: { id }, query: QUERY_DETAIL }],
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': PEC.baseUrl.replace(/\/$/, ''),
      'Referer': PEC.baseUrl.replace(/\/$/, '') + '/cidadao',
    },
    timeout: 20_000,
  });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  const json = await res.json();
  const data = Array.isArray(json) ? json[0]?.data : json.data;
  return data?.cidadao ?? null;
}

interface Progress {
  inicio: string;
  atualizado: string;
  totalAlvo: number;
  idsProcessados: string[];
}

function loadProgress(totalAlvo: number): Progress {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf-8'));
  return { inicio: new Date().toISOString(), atualizado: new Date().toISOString(), totalAlvo, idsProcessados: [] };
}
function saveProgress(p: Progress) {
  p.atualizado = new Date().toISOString();
  fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('✗ rode pec-graphql-scraper.ts primeiro');
    process.exit(1);
  }

  // Carrega lista de IDs (lendo só o id de cada linha)
  log('INFO', '📂 lendo lista de cidadãos do JSONL');
  const ids: string[] = [];
  const linhas = fs.readFileSync(INPUT, 'utf-8').split('\n').filter(Boolean);
  for (const linha of linhas) {
    try {
      const c = JSON.parse(linha);
      if (c.id) ids.push(String(c.id));
    } catch {}
  }
  const idsUnicos = Array.from(new Set(ids));
  log('INFO', `📊 ${idsUnicos.length} IDs únicos a enriquecer`);

  const progress = loadProgress(idsUnicos.length);
  const processados = new Set(progress.idsProcessados);
  const pendentes = idsUnicos.filter(id => !processados.has(id));
  log('INFO', `🔁 ${pendentes.length} pendentes · ${processados.size} já feitos · pool=${POOL_SIZE}`);

  if (pendentes.length === 0) {
    log('INFO', '✓ tudo já feito');
    return;
  }

  const browser = await chromium.launch({ headless: process.env.PEC_HEADLESS !== 'false', channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  log('INFO', '🔐 login + contexto');
  await loginAndContext(page);

  // Pool simples: N workers consumindo da fila
  let idx = 0;
  let ok = 0;
  let fail = 0;
  const tInicio = Date.now();
  let ultimoFlush = Date.now();

  async function worker(workerId: number) {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= pendentes.length) return;
      const id = pendentes[myIdx];
      try {
        const data = await buscarDetail(ctx.request, id);
        if (data) {
          fs.appendFileSync(OUTPUT, JSON.stringify(data) + '\n');
          ok++;
        } else {
          fs.appendFileSync(ERRORS, JSON.stringify({ id, erro: 'data null' }) + '\n');
          fail++;
        }
        processados.add(id);
      } catch (e) {
        fail++;
        fs.appendFileSync(ERRORS, JSON.stringify({ id, erro: (e as Error).message }) + '\n');
      }
      // Flush progress a cada 5s
      if (Date.now() - ultimoFlush > 5000) {
        progress.idsProcessados = Array.from(processados);
        saveProgress(progress);
        ultimoFlush = Date.now();
        const elapsed = (Date.now() - tInicio) / 1000;
        const rate = (ok + fail) / elapsed;
        const eta = (pendentes.length - (ok + fail)) / rate;
        log('INFO', `[w${workerId}] ${ok + fail}/${pendentes.length} · ${rate.toFixed(1)}/s · ETA ${(eta / 60).toFixed(1)}min · ok=${ok} fail=${fail}`);
      }
      // Pequena pausa anti-bot
      await sleep(50);
    }
  }

  await Promise.all(Array.from({ length: POOL_SIZE }, (_, i) => worker(i)));

  progress.idsProcessados = Array.from(processados);
  saveProgress(progress);
  await browser.close();

  log('INFO', `✅ COMPLETO · ok=${ok} fail=${fail} · ${OUTPUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
