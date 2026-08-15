import { z } from 'zod';
import { validarCPF, validarCEP, validarDataBR } from './validadores.ts';
import { CODIGO_AVULSO, resolverServico, type ServicoResolvido } from './catalogo/index.ts';
import type { EmpresaSlug } from './empresas/index.ts';

export const TomadorCpfSchema = z.object({
  tipo: z.literal('cpf'),
  cpf: z.string().refine(validarCPF, { message: 'CPF inválido' }),
  cep: z.string().refine(validarCEP, { message: 'CEP inválido' }),
  numero: z.string().min(1, 'Número do endereço é obrigatório quando há CEP'),
});

export const TomadorEstrangeiroResidenteSchema = z.object({
  tipo: z.literal('estrangeiro-residente'),
  nome: z.string().min(1, 'Nome é obrigatório para estrangeiro residente'),
  nif: z.string().optional(),
});

export const TomadorTuristaSchema = z.object({
  tipo: z.literal('turista'),
  nome: z.string().min(1, 'Nome é obrigatório para turista'),
  pais: z.string().min(1, 'País é obrigatório para turista'),
});

export const TomadorNaoInformadoSchema = z.object({
  tipo: z.literal('nao-informado'),
});

export const TomadorSchema = z.discriminatedUnion('tipo', [
  TomadorCpfSchema,
  TomadorEstrangeiroResidenteSchema,
  TomadorTuristaSchema,
  TomadorNaoInformadoSchema,
]);

export type Tomador = z.infer<typeof TomadorSchema>;

export interface Nota {
  empresa: EmpresaSlug;
  /**
   * Data do atendimento, formato DD/MM/AAAA — entra só no texto da
   * descrição do serviço ("Consulta realizada no dia DD/MM/AAAA").
   *
   * NÃO é a "Data de Competência" do Passo 1: essa é sempre a data de
   * emissão (hoje), nunca retroativa, e é preenchida pelo driver no
   * momento do envio — não vem da planilha nem fica congelada na nota.
   * Retroagir a competência força reapuração fiscal e retrabalho na
   * contabilidade, por isso o driver pede confirmação explícita se a
   * emissão não acontecer no mesmo dia da montagem do lote.
   */
  dataAtendimento: string;
  tomador: Tomador;
  servico: ServicoResolvido;
  observacao?: string;
}

/** Uma linha de planilha, já com nomes de coluna normalizados (ver docs da CLI para o cabeçalho). */
export interface LinhaPlanilha {
  empresa?: string;
  dataAtendimento?: string;
  /** 'cpf' | 'estrangeiro-residente' | 'turista' | 'nao-informado'. Default 'cpf' se `cpf` vier preenchido. */
  tipoTomador?: string;
  cpf?: string;
  nome?: string;
  nif?: string;
  pais?: string;
  cep?: string;
  numero?: string;
  codigoServico?: string;
  valorCentavos?: string | number;
  observacao?: string;
}

export type ResultadoLinha =
  | { ok: true; nota: Nota }
  | { ok: false; linha: number; erros: string[] };

function candidatoTomador(tipo: string, raw: LinhaPlanilha): unknown {
  switch (tipo) {
    case 'cpf':
      return {
        tipo: 'cpf',
        cpf: raw.cpf?.trim() ?? '',
        cep: raw.cep?.trim() ?? '',
        numero: raw.numero?.trim() ?? '',
      };
    case 'estrangeiro-residente':
      return {
        tipo: 'estrangeiro-residente',
        nome: raw.nome?.trim() ?? '',
        nif: raw.nif?.trim() || undefined,
      };
    case 'turista':
      return { tipo: 'turista', nome: raw.nome?.trim() ?? '', pais: raw.pais?.trim() ?? '' };
    case 'nao-informado':
      return { tipo: 'nao-informado' };
    default:
      return { tipo };
  }
}

/**
 * Monta e valida uma nota a partir de uma linha de planilha (ou de um
 * comando interativo, que produz o mesmo formato). Nunca lança: erros de
 * dado voltam na lista `erros`, para o `nf validar` apontar tudo de uma vez
 * antes de abrir o navegador.
 */
export function montarNota(raw: LinhaPlanilha, linha: number): ResultadoLinha {
  const erros: string[] = [];

  const empresaRaw = raw.empresa?.trim();
  const empresaValida = empresaRaw === 'qara' || empresaRaw === 'cg';
  if (!empresaValida) {
    erros.push(`empresa deve ser "qara" ou "cg" (veio "${raw.empresa ?? ''}").`);
  }

  const dataAtendimento = raw.dataAtendimento?.trim() ?? '';
  if (!validarDataBR(dataAtendimento)) {
    erros.push(`data_atendimento inválida, use DD/MM/AAAA (veio "${raw.dataAtendimento ?? ''}").`);
  }

  let tomador: Tomador | undefined;
  const tipoTomador = raw.tipoTomador?.trim() || (raw.cpf?.trim() ? 'cpf' : '');
  if (!tipoTomador) {
    erros.push(
      'Informe "cpf" (tomador com CPF) ou "tipo_tomador" (estrangeiro-residente | turista | nao-informado).'
    );
  } else {
    const parsed = TomadorSchema.safeParse(candidatoTomador(tipoTomador, raw));
    if (parsed.success) {
      tomador = parsed.data;
    } else {
      for (const issue of parsed.error.issues) erros.push(issue.message);
    }
  }

  const codigoServico = raw.codigoServico?.trim() ?? '';
  if (!codigoServico) {
    erros.push('codigo_servico é obrigatório.');
  }

  let servico: ServicoResolvido | undefined;
  if (empresaValida && codigoServico && validarDataBR(dataAtendimento)) {
    try {
      let avulso: { valorCentavos: number; descricao: string } | undefined;
      if (codigoServico === CODIGO_AVULSO) {
        const valorCentavos = Number(raw.valorCentavos);
        const descricao = raw.observacao?.trim();
        if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
          erros.push(
            `Código "${CODIGO_AVULSO}" exige valor_centavos inteiro positivo (veio "${String(raw.valorCentavos ?? '')}").`
          );
        }
        if (!descricao) {
          erros.push(`Código "${CODIGO_AVULSO}" exige descrição em "observacao".`);
        }
        if (Number.isInteger(valorCentavos) && valorCentavos > 0 && descricao) {
          avulso = { valorCentavos, descricao };
        }
      }
      if (codigoServico !== CODIGO_AVULSO || avulso) {
        servico = resolverServico(empresaRaw as EmpresaSlug, codigoServico, dataAtendimento, avulso);
      }
    } catch (err) {
      erros.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (erros.length === 0 && (!tomador || !servico)) {
    erros.push('Falha interna ao montar a nota (tomador ou serviço não resolvido).');
  }

  if (erros.length > 0) {
    return { ok: false, linha, erros };
  }

  return {
    ok: true,
    nota: {
      empresa: empresaRaw as EmpresaSlug,
      dataAtendimento,
      tomador: tomador as Tomador,
      servico: servico as ServicoResolvido,
      observacao: codigoServico === CODIGO_AVULSO ? undefined : raw.observacao?.trim() || undefined,
    },
  };
}

/** Identificador do tomador para a chave natural do ledger (CPF ou, nos casos sem CPF, nome+tipo). */
export function identificadorTomador(tomador: Tomador): string {
  switch (tomador.tipo) {
    case 'cpf':
      return `cpf:${tomador.cpf}`;
    case 'estrangeiro-residente':
      return `estrangeiro:${tomador.nome.toLowerCase()}`;
    case 'turista':
      return `turista:${tomador.nome.toLowerCase()}:${tomador.pais.toLowerCase()}`;
    case 'nao-informado':
      return 'nao-informado';
  }
}
