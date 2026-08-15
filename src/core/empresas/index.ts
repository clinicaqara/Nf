import { EmpresaSchema, type Empresa } from './schema.ts';
import qaraRaw from './qara.json' with { type: 'json' };
import cgRaw from './cg.json' with { type: 'json' };

const REGISTRO: Record<string, Empresa> = {
  qara: EmpresaSchema.parse(qaraRaw),
  cg: EmpresaSchema.parse(cgRaw),
};

export type EmpresaSlug = keyof typeof REGISTRO;

export function empresaPorSlug(slug: string): Empresa {
  const empresa = REGISTRO[slug];
  if (!empresa) {
    const validas = Object.keys(REGISTRO).join(', ');
    throw new Error(`Empresa "${slug}" não cadastrada. Válidas: ${validas}`);
  }
  return empresa;
}

export function listarEmpresas(): Empresa[] {
  return Object.values(REGISTRO);
}

export { EmpresaSchema, type Empresa };
