#!/usr/bin/env node
import { Command } from 'commander';
import { montarNota } from '../core/nota.ts';
import { PORTAL_BASE, abrirComStorageState, comoPaginaMinima, conectarPorCdp, exportarSessao, verificarLogin } from '../driver/sessao.ts';
import { lerPlanilha } from './planilha.ts';

const CDP_URL_PADRAO = 'http://localhost:9222';

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const program = new Command();
program.name('nf').description('CLI de emissão de NFS-e da clínica Qara');

const auth = program.command('auth').description('Gerencia a sessão do gov.br (login é sempre humano)');

auth
  .command('status')
  .description('Confere se a sessão está logada, sem alterar nada')
  .option('--cdp-url <url>', 'Chrome já aberto com --remote-debugging-port (ver docs/FASE1-SETUP.md)', CDP_URL_PADRAO)
  .option('--storage-state <arquivo>', 'Em vez de CDP, verifica uma sessão já exportada (modo container)')
  .action(async (opts: { cdpUrl: string; storageState?: string }) => {
    const sessao = opts.storageState
      ? await abrirComStorageState(opts.storageState)
      : await conectarPorCdp(opts.cdpUrl);
    try {
      // conectarPorCdp já entrega uma aba no portal; abrirComStorageState entrega
      // uma página em branco de propósito (não é dela decidir para onde navegar),
      // então quem precisa checar login no portal navega explicitamente aqui.
      if (opts.storageState) {
        await sessao.page.goto(PORTAL_BASE, { waitUntil: 'domcontentloaded' });
      }
      const resultado = await verificarLogin(comoPaginaMinima(sessao.page));
      console.log(JSON.stringify(resultado, null, 2));
      if (!resultado.logado) {
        process.exitCode = 1;
      }
    } finally {
      await sessao.encerrar();
    }
  });

auth
  .command('login')
  .description('Espera você logar na janela do Chrome de setup e exporta a sessão (nunca loga sozinho)')
  .option('--cdp-url <url>', 'Chrome já aberto com --remote-debugging-port (ver docs/FASE1-SETUP.md)', CDP_URL_PADRAO)
  .option('--out <arquivo>', 'Onde salvar a sessão exportada, para uso no modo container', 'sessions/storage-state.json')
  .option('--timeout <segundos>', 'Quanto tempo esperar pelo login', '300')
  .action(async (opts: { cdpUrl: string; out: string; timeout: string }) => {
    const timeoutMs = Number(opts.timeout) * 1000;
    const sessao = await conectarPorCdp(opts.cdpUrl);
    try {
      console.log(`Aguardando login em ${sessao.page.url()} (até ${opts.timeout}s)...`);
      const inicio = Date.now();
      let resultado = await verificarLogin(comoPaginaMinima(sessao.page));
      while (!resultado.logado) {
        if (Date.now() - inicio > timeoutMs) {
          console.error(`Login não detectado em ${opts.timeout}s. Rode de novo depois de logar.`);
          process.exitCode = 1;
          return;
        }
        await dormir(2000);
        resultado = await verificarLogin(comoPaginaMinima(sessao.page));
      }

      console.log(`Login detectado${resultado.cnpj ? ` — CNPJ ${resultado.cnpj}` : ''}. Exportando sessão...`);
      await exportarSessao(sessao.context, opts.out);
      console.log(`Sessão exportada em ${opts.out} (permissão 600).`);
    } finally {
      await sessao.encerrar();
    }
  });

program
  .command('validar')
  .description('Valida uma planilha de notas linha a linha, sem abrir o navegador')
  .requiredOption('--planilha <arquivo>', 'Caminho do XLSX ou CSV')
  .action(async (opts: { planilha: string }) => {
    const linhas = await lerPlanilha(opts.planilha);
    if (linhas.length === 0) {
      console.log('Planilha sem linhas de dados.');
      return;
    }

    let comErro = 0;
    for (const { numeroLinha, dados } of linhas) {
      const resultado = montarNota(dados, numeroLinha);
      if (resultado.ok) {
        const { nota } = resultado;
        const valor = (nota.servico.valorCentavos / 100).toFixed(2);
        console.log(`linha ${numeroLinha}: OK — ${nota.empresa} · ${nota.tomador.tipo} · ${nota.servico.codigo} · R$ ${valor}`);
      } else {
        comErro++;
        console.log(`linha ${numeroLinha}: ERRO`);
        for (const erro of resultado.erros) console.log(`  - ${erro}`);
      }
    }

    console.log('');
    console.log(`${linhas.length - comErro}/${linhas.length} linhas válidas.`);
    if (comErro > 0) {
      process.exitCode = 1;
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
