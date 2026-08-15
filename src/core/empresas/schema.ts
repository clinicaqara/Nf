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
