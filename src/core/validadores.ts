/** Validador de CPF por dígito verificador (não confirma existência real, só o cálculo). */
export function validarCPF(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const base = digitos.slice(0, 9);
  const d1 = calcularDigito(base, 10);
  const d2 = calcularDigito(base + String(d1), 11);
  return digitos === base + String(d1) + String(d2);
}

export function normalizarCPF(valor: string): string {
  return valor.replace(/\D/g, '');
}

const CEP_RE = /^\d{5}-?\d{3}$/;

export function validarCEP(valor: string): boolean {
  return CEP_RE.test(valor.trim());
}

export function normalizarCEP(valor: string): string {
  return valor.replace(/\D/g, '');
}

const DATA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Valida "DD/MM/AAAA" incluindo dias reais do mês (rejeita 30/02, 31/04 etc). */
export function validarDataBR(valor: string): boolean {
  const m = DATA_RE.exec(valor.trim());
  if (!m) return false;
  const [, diaStr, mesStr, anoStr] = m;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  if (mes < 1 || mes > 12) return false;
  const diasNoMes = new Date(ano, mes, 0).getDate();
  return dia >= 1 && dia <= diasNoMes;
}
