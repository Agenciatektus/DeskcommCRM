/**
 * A PRÉVIA GUARDADA (B1): a copy que a tela gerou, o veredito em que ela se
 * apoiou e a hora. Morada única da CHAVE e da validação — a leitura (worker) e a
 * escrita (rota) precisam concordar sobre o que é "a mesma auditoria", ou o pair
 * tela×envio se rompe em silêncio.
 *
 * ═══ Por que a prévia é ancorada numa CHAVE, e não só guardada ═══
 *
 * O envio pode sair dias depois da prévia. Nesse meio-tempo o site pode ter
 * sido reauditado (`reanalisar_site`, o tick) e mudado de classe — a copy que a
 * pessoa revisou cita "site fora do ar" e agora o site está no ar. Mandar a
 * prévia velha seria afirmar um fato que já não vale. A chave diz SOBRE QUAL
 * medição a copy foi escrita; quando a medição muda, a prévia vence e o envio
 * volta a escrever do zero.
 *
 * ═══ A regra da chave: NUNCA "agora" ═══
 *
 * - Veredito GRAVADO (`data.site`): a chave é a própria medição
 *   (`classe@verificado_em`). Só muda quando o site é reauditado.
 * - Veredito DERIVADO sem rede (sem-site): a chave é a CLASSE. O
 *   `verificado_em` de um derivado é o instante da leitura — usá-lo como chave
 *   faria a prévia nascer inválida no segundo seguinte, porque cada leitura
 *   produz um "agora" novo.
 */
import { z } from "zod";

import { ehAgregador, ehSemSite, type SiteEnrichment } from "./site-classify";

/** O que a tela guardou: a copy + a âncora da auditoria + quando + o agente que a escreveu. */
export const previaSalvaSchema = z.object({
  texto: z.string().min(1).max(4000),
  /** `chaveDaAuditoria` no momento da geração — nunca um instante solto. */
  baseada_em: z.string().min(1).max(160),
  gerada_em: z.string().min(1).max(40),
  agente_id: z.string().uuid(),
});
export type PreviaSalva = z.infer<typeof previaSalvaSchema>;

/** O que `chaveDaAuditoria` e `previaValida` precisam de um candidato. */
export interface DadosDaPrevia {
  website: string | null;
  site?: SiteEnrichment | null;
  previa?: PreviaSalva | null;
}

/**
 * A chave da auditoria de um candidato, ou `null` quando ele ainda depende de
 * rede (sem veredito gravado e com site na web). É a MESMA derivação que a
 * leitura usa (`siteEfetivo`), mas sem o instante: derivado ancora na classe.
 */
export function chaveDaAuditoria(data: Pick<DadosDaPrevia, "website" | "site">): string | null {
  const gravado = data.site;
  if (gravado) return `${gravado.classe}@${gravado.verificado_em}`;
  if (ehSemSite(data.website)) return "sem-site@derivado";
  if (ehAgregador(data.website)) return "agregador@derivado";
  return null;
}

/**
 * A prévia do candidato SE ela ainda vale: bem-formada e ancorada na auditoria
 * atual. `null` em qualquer outro caso — o envio então escreve do zero, que é
 * mais honesto do que mandar uma copy presa a uma medição que mudou.
 */
export function previaValida(data: DadosDaPrevia): PreviaSalva | null {
  if (!data.previa) return null;
  const parsed = previaSalvaSchema.safeParse(data.previa);
  if (!parsed.success) return null;
  const chave = chaveDaAuditoria(data);
  if (!chave || parsed.data.baseada_em !== chave) return null;
  return parsed.data;
}

/**
 * Grava a prévia no candidato: merge de UMA chave (`data || jsonb_build_object`)
 * — as outras chaves de `data` (site, endereço…) ficam intactas. Filtro de
 * organização OBRIGATÓRIO: `admin`/service role não passa por RLS, e um `update`
 * por id sem tenant escreveria na prévia de outra empresa. Não toma o lock da
 * organização: é uma escrita de uma chave só, e prender o lock por causa dela
 * travaria a fila do tick.
 */
export async function gravarPrevia(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  args: {
    organizationId: string;
    campaignId: string;
    candidateId: string;
    previa: PreviaSalva;
  },
): Promise<void> {
  await db.query(
    "update prospecting_candidates set data = coalesce(data,'{}'::jsonb) || jsonb_build_object('previa',$4::jsonb), updated_at=now() where organization_id=$1 and campaign_id=$2 and id=$3",
    [args.organizationId, args.campaignId, args.candidateId, JSON.stringify(args.previa)],
  );
}
