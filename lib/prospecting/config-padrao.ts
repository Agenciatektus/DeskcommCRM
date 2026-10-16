/**
 * A CONFIGURAÇÃO PADRÃO DE PROSPECÇÃO da organização (B2, decisão do dono em
 * 16/10/2026): quem escreve a prévia é o AGENTE da campanha — o prompt e o modelo
 * dele —, mas uma busca nova nasce sem agente (a pessoa o escolhe na etapa 2,
 * depois de ver os resultados). Esperar a escolha para gerar a prévia desfaz o
 * que se queria: a prévia sair JUNTO com a avaliação. Então, enquanto a campanha
 * não tem agente, a prévia usa a configuração COMPLETA da campanha mais recente
 * da organização cujo agente ainda atende — o mesmo agente, a mesma instrução e
 * os mesmos critérios que a pessoa já escolheu antes.
 *
 * ═══ O que isso NÃO muda ═══
 *
 * A mensagem REAL sai sempre com o agente DA CAMPANHA. A prévia guarda o agente
 * que a escreveu (`agente_id`) e o envio só a usa quando é o mesmo
 * (`previaDoAgente`): escolheu outro agente na etapa 2, a prévia do padrão fica
 * de lado e o envio escreve do zero — nunca com o tom do agente errado.
 *
 * ═══ Leitura só da organização ═══
 *
 * O filtro `organization_id` está na consulta e na junção com o agente: um agente
 * de outra organização nunca vira padrão (service role não passa por RLS).
 */
import { campaignConfigSchema, type CampaignConfig } from "./schema";

/** A leitura mínima que o módulo precisa — o pool, o cliente do preparo e o do bloqueio servem. */
export interface LeitorDeConsulta {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ConfigPadrao {
  config: CampaignConfig;
  agenteId: string;
}

/** Quantas campanhas recentes olhar até achar uma com agente que ainda atende. */
const CAMPANHAS_OLHADAS = 5;

/**
 * Mesma régua do seletor de agentes da tela (`GET /prospecting`): publicado, não
 * arquivado, não pausado e em modo automático — o que o worker exige para enviar.
 */
const SQL_CONFIG_PADRAO =
  "select pc.config from prospecting_campaigns pc " +
  "join ai_agents a on a.organization_id = pc.organization_id and a.id::text = pc.config->>'agent_id' " +
  "where pc.organization_id = $1 and pc.config->>'agent_id' is not null " +
  "and a.published_version_id is not null and a.archived_at is null " +
  "and a.paused_at is null and a.operation_mode = 'automatic' " +
  "order by pc.updated_at desc limit $2";

export async function configPadraoDaOrganizacao(
  db: LeitorDeConsulta,
  org: string,
): Promise<ConfigPadrao | null> {
  const { rows } = await db.query(SQL_CONFIG_PADRAO, [org, CAMPANHAS_OLHADAS]);
  for (const linha of rows) {
    const cfg = campaignConfigSchema.safeParse(linha.config);
    if (cfg.success && cfg.data.agent_id) return { config: cfg.data, agenteId: cfg.data.agent_id };
  }
  return null;
}
