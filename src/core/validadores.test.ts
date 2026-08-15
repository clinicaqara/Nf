import { describe, expect, it } from 'vitest';
import { normalizarCEP, normalizarCPF, validarCEP, validarCPF, validarDataBR } from './validadores.ts';

function gerarCPFValido(base9: string): string {
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

describe('validarCPF', () => {
  it('aceita um CPF com dígitos verificadores corretos', () => {
    expect(validarCPF(gerarCPFValido('123456789'))).toBe(true);
  });

  it('rejeita quando o dígito verificador não bate', () => {
    const cpf = gerarCPFValido('123456789');
    const ultimoDigitoErrado = cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);
    expect(validarCPF(ultimoDigitoErrado)).toBe(false);
  });

  it('rejeita sequência de dígitos repetidos', () => {
    expect(validarCPF('111.111.111-11')).toBe(false);
  });

  it('rejeita tamanho errado', () => {
    expect(validarCPF('123')).toBe(false);
  });

  it('aceita com ou sem máscara', () => {
    const cpf = gerarCPFValido('987654321');
    const mascarado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    expect(validarCPF(mascarado)).toBe(true);
  });
});

describe('normalizarCPF', () => {
  it('remove a máscara', () => {
    expect(normalizarCPF('123.456.789-09')).toBe('12345678909');
  });
});

describe('validarCEP', () => {
  it('aceita com e sem hífen', () => {
    expect(validarCEP('22041-012')).toBe(true);
    expect(validarCEP('22041012')).toBe(true);
  });

  it('rejeita formato errado', () => {
    expect(validarCEP('22041')).toBe(false);
    expect(validarCEP('abcde-123')).toBe(false);
  });
});

describe('normalizarCEP', () => {
  it('remove o hífen', () => {
    expect(normalizarCEP('22041-012')).toBe('22041012');
  });
});

describe('validarDataBR', () => {
  it('aceita data real', () => {
    expect(validarDataBR('15/08/2026')).toBe(true);
  });

  it('aceita 29/02 em ano bissexto', () => {
    expect(validarDataBR('29/02/2024')).toBe(true);
  });

  it('rejeita 29/02 em ano não bissexto', () => {
    expect(validarDataBR('29/02/2026')).toBe(false);
  });

  it('rejeita dia inexistente no mês', () => {
    expect(validarDataBR('31/04/2026')).toBe(false);
    expect(validarDataBR('30/02/2026')).toBe(false);
  });

  it('rejeita formato fora do DD/MM/AAAA', () => {
    expect(validarDataBR('2026-08-15')).toBe(false);
    expect(validarDataBR('15/8/2026')).toBe(false);
  });
});
