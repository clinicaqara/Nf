import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export const PORTAL_BASE = 'https://www.nfse.gov.br/EmissorNacional';

export interface ResultadoLogin {
  logado: boolean;
  url: string;
  cnpj: string | null;
}

/**
 * Recorte mínimo de uma página, só com o que `verificarLogin` precisa.
 * Existe para testar a lógica de detecção de login com um objeto simples,
 * sem precisar de um navegador real nem dos tipos do Playwright.
 */
export interface PaginaMinima {
  url(): string;
  obterTextoDoBody(): Promise<string>;
  temCampoSenha(): Promise<boolean>;
}

export function comoPaginaMinima(page: Page): PaginaMinima {
  return {
    url: () => page.url(),
    obterTextoDoBody: () => page.evaluate(() => document.body?.innerText ?? ''),
    temCampoSenha: () => page.evaluate(() => document.querySelector('input[type="password"]') !== null),
  };
}

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

export function extrairCnpj(texto: string): string | null {
  const m = CNPJ_RE.exec(texto);
  return m ? m[0] : null;
}

export async function verificarLogin(pagina: PaginaMinima): Promise<ResultadoLogin> {
  const url = pagina.url();
  const [bodyText, temCampoSenha] = await Promise.all([pagina.obterTextoDoBody(), pagina.temCampoSenha()]);

  const logado = !/\/Login/i.test(url) && !temCampoSenha && /Meus dados|Sair|Painel/i.test(bodyText);

  return { logado, url, cnpj: logado ? extrairCnpj(bodyText) : null };
}

/** Preflight: usar antes de qualquer lote. Lança com mensagem acionável se a sessão não estiver ativa. */
export async function garantirSessaoAtiva(pagina: PaginaMinima): Promise<ResultadoLogin> {
  const resultado = await verificarLogin(pagina);
  if (!resultado.logado) {
    throw new Error(
      'Sessão do gov.br não está logada. Faça login na janela do Chrome de setup ' +
        '(ver docs/FASE1-SETUP.md) e rode de novo — este comando nunca loga sozinho.'
    );
  }
  return resultado;
}

export interface SessaoNavegador {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /**
   * Encerra a sessão. No modo CDP isso é deliberadamente um no-op: o
   * Browser type docs confirmam que `.close()` numa conexão obtida por
   * `connectOverCDP` desconecta e não mata o Chrome real — mas para não
   * depender disso, o modo CDP simplesmente não fecha nada (a conexão cai
   * sozinha quando o processo termina). Só o Chromium lançado pelo próprio
   * driver (modo container) é fechado de verdade.
   */
  encerrar: () => Promise<void>;
}

/** Modo local: anexa a um Chrome já aberto com --remote-debugging-port (ver docs/FASE1-SETUP.md). Nunca loga sozinho. */
export async function conectarPorCdp(cdpUrl: string): Promise<SessaoNavegador> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(`Chrome conectado em ${cdpUrl}, mas sem nenhuma aba/contexto aberto.`);
  }

  let page = context.pages().find((p) => p.url().includes('nfse.gov.br'));
  if (!page) {
    page = await context.newPage();
    await page.goto(PORTAL_BASE, { waitUntil: 'domcontentloaded' });
  }

  return { browser, context, page, encerrar: async () => {} };
}

/**
 * Modo container: lança um Chromium próprio com uma sessão previamente exportada por `exportarSessao`.
 * `executablePath` pode ser fixado por env var (`PLAYWRIGHT_CHROMIUM_PATH`) — útil quando o binário
 * não está no local padrão que o Playwright espera (caso deste sandbox de dev, por exemplo).
 */
export async function abrirComStorageState(
  storageStatePath: string,
  opts: { executablePath?: string } = {}
): Promise<SessaoNavegador> {
  const executablePath = opts.executablePath ?? process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    encerrar: async () => {
      await browser.close();
    },
  };
}

/** Exporta cookies/local storage da sessão atual para um arquivo — a ponte entre o modo local e o modo container. */
export async function exportarSessao(context: BrowserContext, destino: string): Promise<void> {
  await mkdir(dirname(destino), { recursive: true });
  await context.storageState({ path: destino });
  await chmod(destino, 0o600);
}
