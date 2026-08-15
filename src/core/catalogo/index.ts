import { CatalogoSchema, type ItemCatalogo } from './schema.ts';
import qaraRaw from './qara.json' with { type: 'json' };
import cgRaw from './cg.json' with { type: 'json' };

/** Código reservado para serviço avulso: valor e descrição vêm da própria nota, não do catálogo. */
export const CODIGO_AVULSO = 'OUTROS';

const CATALOGOS: Record<string, ItemCatalogo[]> = {
  qara: CatalogoSchema.parse(qaraRaw),
  cg: CatalogoSchema.parse(cgRaw),
};

export function catalogoDaEmpresa(empresaSlug: string): ItemCatalogo[] {
  const catalogo = CATALOGOS[empresaSlug];
  if (!catalogo) {
    throw new Error(`Sem catálogo de serviços para a empresa "${empresaSlug}"`);
  }
  return catalogo;
}

export function itemPorCodigo(empresaSlug: string, codigo: string): ItemCatalogo | undefined {
  return catalogoDaEmpresa(empresaSlug).find((item) => item.codigo === codigo);
}

export function renderDescricao(template: string, dataAtendimentoBR: string): string {
  return template.replaceAll('{{data}}', dataAtendimentoBR);
}

export interface ServicoResolvido {
  codigo: string;
  valorCentavos: number;
  descricao: string;
}

export interface ServicoAvulsoInput {
  valorCentavos: number;
  descricao: string;
}

/**
 * Resolve um código de serviço contra o catálogo da empresa, ou monta um
 * serviço avulso quando `codigo === CODIGO_AVULSO` (requer valor e descrição
 * informados à parte — o catálogo não tem entrada para "OUTROS").
 */
export function resolverServico(
  empresaSlug: string,
  codigo: string,
  dataAtendimentoBR: string,
  avulso?: ServicoAvulsoInput
): ServicoResolvido {
  if (codigo === CODIGO_AVULSO) {
    if (!avulso) {
      throw new Error(`Código "${CODIGO_AVULSO}" exige valor e descrição informados.`);
    }
    return { codigo, valorCentavos: avulso.valorCentavos, descricao: avulso.descricao };
  }

  const item = itemPorCodigo(empresaSlug, codigo);
  if (!item) {
    throw new Error(
      `Código de serviço "${codigo}" não existe no catálogo da empresa "${empresaSlug}".`
    );
  }
  return {
    codigo,
    valorCentavos: item.valorCentavos,
    descricao: renderDescricao(item.descricaoTemplate, dataAtendimentoBR),
  };
}
