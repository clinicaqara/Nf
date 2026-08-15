// Gera examples/planilha-exemplo.xlsx — dados 100% sintéticos, para demonstrar
// `nf validar`. Nunca colocar dado real de paciente aqui (ver .gitignore: a
// pasta real é input/, que não vai pro git).
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('notas');

sheet.addRow([
  'empresa',
  'data_atendimento',
  'tipo_tomador',
  'cpf',
  'nome',
  'nif',
  'pais',
  'cep',
  'numero',
  'codigo_servico',
  'valor_centavos',
  'observacao',
]);

// linha 2: válida — QARA, tomador com CPF
sheet.addRow(['qara', '15/08/2026', '', '11122233396', '', '', '', '22041-012', '100', 'DIEGO', '', '']);

// linha 3: CPF inválido (proposital, pra mostrar o erro linha a linha)
sheet.addRow(['qara', '15/08/2026', '', '00000000000', '', '', '', '22041-012', '100', 'MIGUEL RJ', '', '']);

// linha 4: válida — CG, tomador não informado
sheet.addRow(['cg', '16/08/2026', 'nao-informado', '', '', '', '', '', '', 'PODOLOGIA', '', '']);

// linha 5: OUTROS sem valor nem observação (erro proposital)
sheet.addRow(['qara', '16/08/2026', 'nao-informado', '', '', '', '', '', '', 'OUTROS', '', '']);

// linha 6: CEP sem número (erro proposital)
sheet.addRow(['qara', '17/08/2026', '', '11122233396', '', '', '', '22041-012', '', 'DIEGO', '', '']);

await workbook.xlsx.writeFile('examples/planilha-exemplo.xlsx');
console.log('examples/planilha-exemplo.xlsx gerado.');
