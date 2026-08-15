// Fase 1 — spike de conexão CDP ao Chrome real.
//
// O que este script faz:
//   1. Conecta por CDP num Chrome já aberto (não lança navegador nenhum).
//   2. Acha a aba do Portal Nacional (ou abre uma nova no mesmo perfil).
//   3. Reporta se a sessão está logada.
//   4. Se --testar-passo1, entra em /DPS/Pessoas (rascunho — não emite nada)
//      e testa mecanicamente: o fill por setter nativo pega? o clique do
//      Playwright em "Avançar" trava a aba ou avança normalmente?
//
// O que este script NUNCA faz: clicar em "Emitir NFS-e", ir além do Passo 1,
// ou logar sozinho. Login é sempre humano, sempre antes de rodar o script.
//
// Como rodar (no PC da clínica, com o Chrome de setup já aberto — ver
// docs/FASE1-SETUP.md):
//   npm install
//   npm run spike:cdp -- --testar-passo1

import { chromium } from 'playwright';

const CDP_URL = process.env.NF_CDP_URL || 'http://localhost:9222';
const PORTAL_BASE = 'https://www.nfse.gov.br/EmissorNacional';
const TESTAR_PASSO1 = process.argv.includes('--testar-passo1');

function log(step, data) {
  console.log(JSON.stringify({ step, ...data }, null, 2));
}

async function detectarLogin(page) {
  const url = page.url();
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const temCampoSenha = await page.evaluate(
    () => !!document.querySelector('input[type="password"]')
  );
  const pareceLogado =
    !/\/Login/i.test(url) &&
    !temCampoSenha &&
    /Meus dados|Sair|Painel/i.test(bodyText);
  return { url, temCampoSenha, pareceLogado };
}

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    log('conexao', {
      ok: false,
      cdpUrl: CDP_URL,
      erro: err.message,
      dica:
        'Chrome não está com --remote-debugging-port aberto nesse endereço. ' +
        'Veja docs/FASE1-SETUP.md.',
    });
    process.exitCode = 1;
    return;
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    log('conexao', { ok: false, erro: 'Chrome conectado, mas sem nenhum contexto/aba aberta.' });
    process.exitCode = 1;
    await browser.close();
    return;
  }
  const context = contexts[0];
  log('conexao', { ok: true, cdpUrl: CDP_URL, abasAbertas: context.pages().length });

  let page = context.pages().find((p) => p.url().includes('nfse.gov.br'));
  if (!page) {
    page = await context.newPage();
    await page.goto(PORTAL_BASE, { waitUntil: 'domcontentloaded' });
  }

  const login = await detectarLogin(page);
  log('login', login);

  if (!login.pareceLogado) {
    log('resultado', {
      ok: false,
      motivo:
        'Sessão não parece logada. Faça login manualmente nessa janela do ' +
        'Chrome e rode o script de novo.',
    });
    await browser.close();
    return;
  }

  if (!TESTAR_PASSO1) {
    log('resultado', {
      ok: true,
      nota: 'Login detectado. Rode com --testar-passo1 para testar clique/fill.',
    });
    await browser.close();
    return;
  }

  // --- Teste mecânico no Passo 1 (rascunho, não emite nada) ---
  await page.goto(`${PORTAL_BASE}/DPS/Pessoas`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const fillResult = await page.evaluate(() => {
    const el = document.getElementById('DataCompetencia');
    if (!el) return { achou: false };
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(el, '01/01/2026');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { achou: true, valor: el.value };
  });
  log('teste_fill_setter_nativo', fillResult);

  let clickResult;
  try {
    await page.getByText('Exibir detalhes do emitente', { exact: true }).click({ timeout: 5000 });
    clickResult = { travou: false };
  } catch (err) {
    clickResult = { travou: true, erro: err.message };
  }
  log('teste_click_playwright', clickResult);

  log('resultado', {
    ok: true,
    conclusao:
      'Confira acima: se teste_fill_setter_nativo.valor veio preenchido e ' +
      'teste_click_playwright.travou=false, page.fill()/page.click() padrão ' +
      'do Playwright servem para as page objects da Fase 4. Se travou=true, ' +
      'manter o clique via JS (clickText) como nas skills atuais.',
  });

  // Não fecha o browser real do usuário — só solta a conexão CDP.
  await browser.close();
}

main();
