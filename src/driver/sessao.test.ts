import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import {
  abrirComStorageState,
  comoPaginaMinima,
  exportarSessao,
  extrairCnpj,
  garantirSessaoAtiva,
  type PaginaMinima,
  verificarLogin,
} from './sessao.ts';

function paginaFalsa(campos: { url: string; temSenha: boolean; texto: string }): PaginaMinima {
  return {
    url: () => campos.url,
    obterTextoDoBody: async () => campos.texto,
    temCampoSenha: async () => campos.temSenha,
  };
}

describe('extrairCnpj', () => {
  it('acha um CNPJ formatado no texto', () => {
    expect(extrairCnpj('Emitente: QARA CNPJ 44.697.695/0001-88 Simples Nacional')).toBe('44.697.695/0001-88');
  });

  it('retorna null quando não há CNPJ no texto', () => {
    expect(extrairCnpj('nada por aqui')).toBeNull();
  });
});

describe('verificarLogin', () => {
  it('detecta sessão logada com CNPJ visível', async () => {
    const resultado = await verificarLogin(
      paginaFalsa({
        url: 'https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas',
        temSenha: false,
        texto: 'Painel do emitente\nQARA SERVICOS MEDICOS LTDA\nCNPJ 44.697.695/0001-88\nSair',
      })
    );
    expect(resultado).toEqual({
      logado: true,
      url: 'https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas',
      cnpj: '44.697.695/0001-88',
    });
  });

  it('detecta não-logado quando a URL caiu em /Login', () => {
    return verificarLogin(
      paginaFalsa({ url: 'https://www.nfse.gov.br/EmissorNacional/Login', temSenha: true, texto: 'Entrar' })
    ).then((resultado) => {
      expect(resultado.logado).toBe(false);
      expect(resultado.cnpj).toBeNull();
    });
  });

  it('detecta não-logado quando há campo de senha na tela, mesmo fora de /Login', async () => {
    const resultado = await verificarLogin(
      paginaFalsa({ url: 'https://www.nfse.gov.br/EmissorNacional/', temSenha: true, texto: 'Painel\nSair' })
    );
    expect(resultado.logado).toBe(false);
  });

  it('não confunde uma página qualquer sem os textos de painel com login válido', async () => {
    const resultado = await verificarLogin(
      paginaFalsa({ url: 'https://www.nfse.gov.br/EmissorNacional/', temSenha: false, texto: 'Carregando...' })
    );
    expect(resultado.logado).toBe(false);
  });
});

describe('garantirSessaoAtiva', () => {
  it('não lança quando logado', async () => {
    await expect(
      garantirSessaoAtiva(paginaFalsa({ url: 'x', temSenha: false, texto: 'Meus dados\nSair' }))
    ).resolves.toMatchObject({ logado: true });
  });

  it('lança mensagem acionável quando não logado', async () => {
    await expect(
      garantirSessaoAtiva(paginaFalsa({ url: 'https://x/Login', temSenha: true, texto: 'Entrar' }))
    ).rejects.toThrow(/nunca loga sozinho/);
  });
});

// --- Testes com navegador real: só rodam com RUN_BROWSER_TESTS=1 (não entram no CI). ---
// Neste sandbox de dev, a revisão de Chromium pré-instalada não bate com a que o pacote
// `playwright` espera por padrão, então é preciso apontar o binário explicitamente:
//   RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser
const RODAR_TESTES_DE_NAVEGADOR = process.env.RUN_BROWSER_TESTS === '1';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

describe.skipIf(!RODAR_TESTES_DE_NAVEGADOR)('exportarSessao / abrirComStorageState (navegador real)', () => {
  it('faz round-trip de cookies e grava o arquivo com permissão 600', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nf-sessao-'));
    const destino = join(dir, 'storage-state.json');

    const browser1 = await chromium.launch({ headless: true, executablePath });
    const context1 = await browser1.newContext();
    await context1.addCookies([
      { name: 'nf_teste', value: 'abc123', domain: 'example.com', path: '/' },
    ]);

    await exportarSessao(context1, destino);
    await browser1.close();

    const modo = statSync(destino).mode & 0o777;
    expect(modo).toBe(0o600);

    const sessao2 = await abrirComStorageState(destino, { executablePath });
    try {
      const cookies = await sessao2.context.cookies('https://example.com');
      expect(cookies.find((c) => c.name === 'nf_teste')?.value).toBe('abc123');

      const pagina = comoPaginaMinima(sessao2.page);
      expect(pagina.url()).toBe('about:blank');
    } finally {
      await sessao2.encerrar();
    }

    rmSync(dir, { recursive: true, force: true });
  }, 30_000);
});
