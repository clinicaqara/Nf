import { describe, expect, it } from 'vitest';
import { identificadorTomador, montarNota } from './nota.ts';

function cpfValido(base9 = '111222333'): string {
  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calcularDigito(base9, 10);
  const d2 = calcularDigito(base9 + String(d1), 11);
  return base9 + String(d1) + String(d2);
}

describe('montarNota — tomador com CPF', () => {
  it('monta uma nota válida', () => {
    const resultado = montarNota(
      {
        empresa: 'qara',
        dataAtendimento: '15/08/2026',
        cpf: cpfValido(),
        cep: '22041-012',
        numero: '100',
        codigoServico: 'DIEGO',
      },
      1
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.nota.tomador.tipo).toBe('cpf');
      expect(resultado.nota.servico.valorCentavos).toBe(45000);
    }
  });

  it('rejeita CPF inválido com mensagem clara e reporta a linha', () => {
    const resultado = montarNota(
      { empresa: 'qara', dataAtendimento: '15/08/2026', cpf: '11111111111', cep: '22041-012', numero: '100', codigoServico: 'DIEGO' },
      7
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.linha).toBe(7);
      expect(resultado.erros.some((e) => /CPF inválido/.test(e))).toBe(true);
    }
  });

  it('exige número quando há CEP', () => {
    const resultado = montarNota(
      { empresa: 'qara', dataAtendimento: '15/08/2026', cpf: cpfValido(), cep: '22041-012', codigoServico: 'DIEGO' },
      1
    );
    expect(resultado.ok).toBe(false);
  });
});

describe('montarNota — casos sem CPF', () => {
  it('estrangeiro residente', () => {
    const r = montarNota(
      { empresa: 'cg', dataAtendimento: '15/08/2026', tipoTomador: 'estrangeiro-residente', nome: 'John Doe', codigoServico: 'DIEGO' },
      1
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nota.tomador).toEqual({ tipo: 'estrangeiro-residente', nome: 'John Doe', nif: undefined });
  });

  it('turista exige país', () => {
    const r = montarNota(
      { empresa: 'cg', dataAtendimento: '15/08/2026', tipoTomador: 'turista', nome: 'Jane', codigoServico: 'DIEGO' },
      1
    );
    expect(r.ok).toBe(false);
  });

  it('não informado não exige nome nem endereço', () => {
    const r = montarNota(
      { empresa: 'cg', dataAtendimento: '15/08/2026', tipoTomador: 'nao-informado', codigoServico: 'DIEGO' },
      1
    );
    expect(r.ok).toBe(true);
  });

  it('sem cpf e sem tipo_tomador é erro claro, não crash', () => {
    const r = montarNota({ empresa: 'qara', dataAtendimento: '15/08/2026', codigoServico: 'DIEGO' }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.some((e) => /tipo_tomador/.test(e))).toBe(true);
  });
});

describe('montarNota — serviço avulso (OUTROS)', () => {
  it('exige valor e observação', () => {
    const semValor = montarNota(
      { empresa: 'qara', dataAtendimento: '15/08/2026', tipoTomador: 'nao-informado', codigoServico: 'OUTROS' },
      1
    );
    expect(semValor.ok).toBe(false);
  });

  it('monta a nota quando valor e observação vêm preenchidos', () => {
    const completo = montarNota(
      {
        empresa: 'qara',
        dataAtendimento: '15/08/2026',
        tipoTomador: 'nao-informado',
        codigoServico: 'OUTROS',
        valorCentavos: 9900,
        observacao: 'Curativo especial',
      },
      2
    );
    expect(completo.ok).toBe(true);
    if (completo.ok) {
      expect(completo.nota.servico).toEqual({ codigo: 'OUTROS', valorCentavos: 9900, descricao: 'Curativo especial' });
    }
  });
});

describe('identificadorTomador', () => {
  it('difere entre tipos de tomador', () => {
    const a = identificadorTomador({ tipo: 'cpf', cpf: '12345678909', cep: '1', numero: '1' });
    const b = identificadorTomador({ tipo: 'nao-informado' });
    expect(a).not.toBe(b);
  });
});
