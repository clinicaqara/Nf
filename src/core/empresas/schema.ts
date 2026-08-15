import { z } from 'zod';

/**
 * Perfil fiscal de uma empresa emitente. O Passo 3 (Tributação) do portal é
 * o que mais difere entre regimes — por isso vira dado, não `if` no driver.
 */
export const EmpresaSchema = z.object({
  slug: z.string().min(1),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos, sem máscara'),
  razaoSocial: z.string().min(1),
  regime: z.enum(['simples-nacional', 'sociedade-de-profissionais']),

  passo1: z.object({
    // Presente só quando o portal pede "Regime de Apuração dos Tributos no
    // Simples Nacional" nessa empresa (não aparece para Sociedade de Profissionais).
    regimeApuracaoSN: z.string().optional(),
  }),

  passo2: z.object({
    municipioPrestacao: z.string().min(1),
    codigoTributacaoNacional: z.string().min(1),
    codigoTributacaoComplementar: z.string().min(1),
    // IBS/CBS — Reforma Tributária, obrigatório desde 01/08/2026. Hoje é
    // igual nas duas empresas (mesmo tipo de serviço, mesmo município), mas
    // fica por empresa porque é exatamente esse tipo de campo que muda
    // quando entrar uma terceira empresa ou um serviço de outra natureza.
    ibsCbs: z.object({
      preencher: z.boolean(),
      compraGovernamental: z.boolean(),
      destinatarioProprioAdquirente: z.boolean(),
      itemNbs: z.string().min(1),
      codigoIndicadorOperacao: z.string().min(1),
      codigoSituacaoTributaria: z.string().min(1),
      codigoClassificacaoTributaria: z.string().min(1),
    }),
  }),

  passo3: z.object({
    pisCofinsSituacaoTributaria: z.string().min(1),
    pisCofinsTipoRetencao: z.string().min(1),
    tipoValorTributos: z.string().min(1),
    // Só quando tipoValorTributos = "Configurar percentuais" (caso Sociedade de Profissionais).
    percentuais: z
      .object({
        federal: z.string(),
        estadual: z.string(),
        municipal: z.string(),
      })
      .optional(),
    // Só quando o regime exige "Regime Especial de Tributação" no Passo 3 (Sociedade de Profissionais).
    issqnRegimeEspecial: z.string().optional(),
  }),

  cepPadrao: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
});

export type Empresa = z.infer<typeof EmpresaSchema>;
