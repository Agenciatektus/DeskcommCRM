/**
 * Recursos pré-prontos do atendimento (#2833) — o modelo de TEXTO ou de ÁUDIO
 * que o operador escolhe num clique dentro do Inbox.
 *
 * O produto de mercado dispara o conteúdo no clique; a issue cobra o oposto:
 * a escolha só PREPARA o compositor. Um recurso de texto cai no campo editável
 * e um de áudio vira anexo PENDENTE — e é o operador quem decide o instante do
 * envio. Este módulo descreve esse "plano" e NÃO tem nenhum caminho de envio:
 * quem manda é sempre um clique humano, separado.
 *
 * ── Um recurso é uma linha de `message_templates` ──────────────────────────
 *
 * Texto mora no `body`; ÁUDIO é uma entrada de áudio em `midias` — o MESMO
 * vocabulário de mídia da resposta rápida (#2526), no mesmo bucket privado e
 * gravado pela MESMA rota (`POST /message-templates/:id/midias`). Não existe
 * coluna, bucket nem rota próprios do áudio: era o desenho anterior, e o preço
 * dele era um segundo caminho de mídia ao lado do primeiro.
 *
 * Por isso `tipo` NÃO é campo do modelo: quem responde se o recurso é de áudio
 * é `midiaDeAudioDe`, lendo o CAMINHO do arquivo (que a rota escolheu pelos
 * bytes) — nunca uma coluna que outra escrita pode contradizer.
 */
import { interpolateTemplate, type TemplateContact } from "@/lib/inbox/template-vars";
import { midiaDeAudioDe, type MidiaDeTemplate } from "@/lib/templates/midias";

/**
 * Os tipos de recurso — vocabulário da TELA (o seletor do formulário e o ícone
 * da barra). Não espelha coluna nenhuma do banco de propósito: o que existe no
 * dado é a mídia; o tipo é a LEITURA dela.
 */
export const TIPOS_DE_RECURSO = ["texto", "audio"] as const;
export type TipoDeRecurso = (typeof TIPOS_DE_RECURSO)[number];

/**
 * O subconjunto de `message_templates` que o compositor precisa conhecer.
 *
 * `midias` é opcional de propósito, pela mesma razão de `MessageTemplate`:
 * linha anterior à migration 0643 (e fixture anterior a ela) chega sem a chave,
 * e a ausência é "recurso de texto".
 */
export interface Recurso {
  id: string;
  title: string;
  body: string;
  midias?: readonly MidiaDeTemplate[] | null;
}

/** Um áudio pronto para virar anexo pendente — descreve, não envia. */
export interface AnexoDeRecurso {
  recursoId: string;
  titulo: string;
  media_path: string;
  media_mime: string;
  media_size_bytes: number;
}

/**
 * O que fazer quando o operador clica no recurso. PURO: só descreve o efeito
 * no compositor.
 *
 *   texto → o texto interpolado, que cai no CAMPO (editável) e não é enviado;
 *   áudio → o descritor do anexo PENDENTE, que o operador manda quando quiser.
 *
 * Não existe variante "enviado" de propósito: se um dia aparecer, o teste do
 * "não envia no clique" reprova.
 */
export type PlanoDoRecurso =
  | { tipo: "texto"; texto: string }
  | { tipo: "audio"; anexo: AnexoDeRecurso };

/** O recurso é de ÁUDIO? A resposta sai da mídia, não de uma coluna `tipo`. */
export function ehRecursoDeAudio(recurso: {
  midias?: readonly MidiaDeTemplate[] | null;
}): boolean {
  return midiaDeAudioDe(recurso.midias) !== undefined;
}

export function planoDoRecurso(recurso: Recurso, contato: TemplateContact): PlanoDoRecurso {
  const audio = midiaDeAudioDe(recurso.midias);
  if (audio) {
    return {
      tipo: "audio",
      anexo: {
        recursoId: recurso.id,
        titulo: recurso.title,
        media_path: audio.storage_path,
        media_mime: audio.media_mime,
        media_size_bytes: audio.media_size_bytes,
      },
    };
  }
  return { tipo: "texto", texto: interpolateTemplate(recurso.body, contato) };
}
