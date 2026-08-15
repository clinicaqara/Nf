#!/usr/bin/env node
import { Command } from 'commander';
import { montarNota } from '../core/nota.ts';
import { lerPlanilha } from './planilha.ts';

const program = new Command();
program.name('nf').description('CLI de emissão de NFS-e da clínica Qara');

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

await program.parseAsync(process.argv);
