import { z } from 'zod';

export const ItemCatalogoSchema = z.object({
  codigo: z.string().min(1),
  valorCentavos: z.number().int().positive(),
  /** Pode conter o placeholder "{{data}}", substituído pela data de atendimento em DD/MM/AAAA. */
  descricaoTemplate: z.string().min(1),
});

export const CatalogoSchema = z.array(ItemCatalogoSchema);

export type ItemCatalogo = z.infer<typeof ItemCatalogoSchema>;
