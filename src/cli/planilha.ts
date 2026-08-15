import ExcelJS from 'exceljs';
import { extname } from 'node:path';
import type { LinhaPlanilha } from '../core/nota.ts';

const CABECALHO: Record<string, keyof LinhaPlanilha> = {
  empresa: 'empresa',
  data_atendimento: 'dataAtendimento',
  tipo_tomador: 'tipoTomador',
  cpf: 'cpf',
  nome: 'nome',
  nif: 'nif',
  pais: 'pais',
  cep: 'cep',
  numero: 'numero',
  codigo_servico: 'codigoServico',
  valor_centavos: 'valorCentavos',
  observacao: 'observacao',
};

function celulaTexto(valor: ExcelJS.CellValue, campo: keyof LinhaPlanilha): string | number | undefined {
  if (valor === null || valor === undefined) return undefined;

  // Excel guarda data digitada em coluna formatada como Data como objeto Date.
  // Só faz sentido converter de volta a DD/MM/AAAA na própria coluna de data.
  if (valor instanceof Date) {
    if (campo !== 'dataAtendimento') return undefined;
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${valor.getUTCFullYear()}`;
  }

  if (typeof valor === 'object') {
    const obj = valor as { richText?: Array<{ text: string }>; text?: string; result?: ExcelJS.CellValue };
    if (obj.richText) return obj.richText.map((r) => r.text).join('').trim() || undefined;
    if (obj.result !== undefined) return celulaTexto(obj.result, campo);
    if (obj.text !== undefined) return String(obj.text).trim() || undefined;
    return undefined;
  }

  if (typeof valor === 'number') {
    // CEP como número perde o zero à esquerda (ex: 01310-000 vira 1310).
    if (campo === 'cep') return String(Math.trunc(valor)).padStart(8, '0');
    if (campo === 'valorCentavos') return valor;
    return String(valor);
  }

  const texto = String(valor).trim();
  return texto === '' ? undefined : texto;
}

export interface LinhaComNumero {
  /** Número da linha como aparece no Excel (1 = cabeçalho, então dados começam em 2). */
  numeroLinha: number;
  dados: LinhaPlanilha;
}

export async function lerPlanilha(caminho: string): Promise<LinhaComNumero[]> {
  const workbook = new ExcelJS.Workbook();
  if (extname(caminho).toLowerCase() === '.csv') {
    await workbook.csv.readFile(caminho);
  } else {
    await workbook.xlsx.readFile(caminho);
  }

  const planilha = workbook.worksheets[0];
  if (!planilha) {
    throw new Error(`Nenhuma aba encontrada em "${caminho}".`);
  }

  const colunaPorIndice = new Map<number, keyof LinhaPlanilha>();
  planilha.getRow(1).eachCell((cell, colNumber) => {
    const chave = String(cell.value ?? '').trim().toLowerCase();
    const campo = CABECALHO[chave];
    if (campo) colunaPorIndice.set(colNumber, campo);
  });

  if (colunaPorIndice.size === 0) {
    throw new Error(
      `Cabeçalho não reconhecido em "${caminho}". Colunas esperadas: ${Object.keys(CABECALHO).join(', ')}.`
    );
  }

  const linhas: LinhaComNumero[] = [];
  planilha.eachRow((row, numeroLinha) => {
    if (numeroLinha === 1) return;
    const dados: LinhaPlanilha = {};
    let temAlgumValor = false;
    for (const [colNumber, campo] of colunaPorIndice) {
      const valor = celulaTexto(row.getCell(colNumber).value, campo);
      if (valor !== undefined) {
        (dados as Record<string, unknown>)[campo] = valor;
        temAlgumValor = true;
      }
    }
    if (temAlgumValor) {
      linhas.push({ numeroLinha, dados });
    }
  });

  return linhas;
}
