import { z } from "zod";

/**
 * Recursos pré-prontos (#2833): um modelo é de TEXTO (o `body`) ou de ÁUDIO
 * (o arquivo apontado por `media_path`). O compositor insere o texto no campo
 * editável ou arma o áudio como anexo pendente — nunca envia no clique.
 */
export const tipoDeRecursoSchema = z.enum(["texto", "audio"]);

export const createTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(4096).default(""),
    shortcut: z.string().trim().min(1).max(40).optional(),
    tipo: tipoDeRecursoSchema.default("texto"),
    media_path: z.string().trim().min(1).max(1024).optional(),
    media_mime: z.string().trim().min(1).max(255).optional(),
    media_size_bytes: z.number().int().nonnegative().optional(),
    /** true = compartilhado da org (owner null, exige manager+); false = pessoal. */
    shared: z.boolean().default(false),
  })
  // Recurso de texto precisa de mensagem; de áudio, do arquivo. As duas guardas
  // são separadas de propósito: a mensagem de erro cai no campo certo do form.
  .refine((d) => d.tipo === "audio" || d.body.length > 0, {
    message: "Recurso de texto precisa de mensagem.",
    path: ["body"],
  })
  .refine((d) => d.tipo !== "audio" || !!d.media_path, {
    message: "Recurso de áudio precisa do arquivo.",
    path: ["media_path"],
  });
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(4096),
    shortcut: z.string().trim().min(1).max(40).nullable(),
    tipo: tipoDeRecursoSchema,
    media_path: z.string().trim().min(1).max(1024).nullable(),
    media_mime: z.string().trim().min(1).max(255).nullable(),
    media_size_bytes: z.number().int().nonnegative().nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
