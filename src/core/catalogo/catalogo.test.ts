import { describe, expect, it } from 'vitest';
import { CODIGO_AVULSO, catalogoDaEmpresa, itemPorCodigo, renderDescricao, resolverServico } from './index.ts';

describe('catalogo', () => {
  it('carrega os catálogos de qara e cg sem erro de schema', () => {
    expect(catalogoDaEmpresa('qara').length).toBeGreaterThan(0);
    expect(catalogoDaEmpresa('cg').length).toBeGreaterThan(0);
  });

  it('substitui {{data}} na descrição', () => {
    expect(renderDescricao('Consulta em {{data}}.', '15/08/2026')).toBe('Consulta em 15/08/2026.');
  });

  it('não mexe em template sem placeholder', () => {
    const item = itemPorCodigo('qara', 'PODOLOGIA');
    expect(item?.descricaoTemplate).not.toContain('{{data}}');
    expect(renderDescricao(item!.descricaoTemplate, '15/08/2026')).toBe(item!.descricaoTemplate);
  });

  it('resolve um serviço do catálogo com valor e descrição renderizada', () => {
    const servico = resolverServico('qara', 'DIEGO', '15/08/2026');
    expect(servico.valorCentavos).toBe(45000);
    expect(servico.descricao).toContain('15/08/2026');
    expect(servico.descricao).toContain('DR. DIEGO GALVEZ');
  });

  it('rejeita código inexistente', () => {
    expect(() => resolverServico('qara', 'NAO-EXISTE', '15/08/2026')).toThrow();
  });

  it('exige valor e descrição avulsos para OUTROS', () => {
    expect(() => resolverServico('qara', CODIGO_AVULSO, '15/08/2026')).toThrow();
    const servico = resolverServico('qara', CODIGO_AVULSO, '15/08/2026', {
      valorCentavos: 12345,
      descricao: 'Procedimento X',
    });
    expect(servico).toEqual({ codigo: CODIGO_AVULSO, valorCentavos: 12345, descricao: 'Procedimento X' });
  });

  it('cg não tem os médicos exclusivos da qara', () => {
    expect(itemPorCodigo('cg', 'FABRICIO')).toBeUndefined();
    expect(itemPorCodigo('qara', 'FABRICIO')).toBeDefined();
  });
});
