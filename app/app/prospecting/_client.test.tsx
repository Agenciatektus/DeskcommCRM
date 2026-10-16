import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * Tela da Prospecção (ORDEM A): o contador do "Verificar sites" (A4), o erro da
 * prévia que fica na janela e some ao trocar de campanha (A2) e o painel de
 * configuração que não pode sumir num rascunho com config parcial (A3).
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

import { ProspectingClient } from "./_client";

const COMPLETA = "11111111-1111-4111-8111-111111111111";
const PARCIAL = "11111111-1111-4111-8111-111111111112";
const AGENT = "55555555-5555-4555-8555-555555555555";
const CHANNEL = "22222222-2222-4222-8222-222222222222";
const PIPE = "33333333-3333-4333-8333-333333333333";
const STAGE = "44444444-4444-4444-8444-444444444444";
const QUALIFIED = "44444444-4444-4444-8444-444444444445";

const CONFIG = {
  agent_id: AGENT,
  channel_session_id: CHANNEL,
  pipeline_id: PIPE,
  stage_id: STAGE,
  qualified_stage_id: QUALIFIED,
  instruction: "Oferecer uma avaliação comercial.",
  qualification: "Confirmou a necessidade e quer conversar.",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "Avaliação real registrada pelo operador",
  ofertas: ["site"],
  funnel_entry: "on_send",
};

const SITE_OK = {
  ver: 1,
  classe: "site-ok",
  problemas: [],
  checklist: { tem: ["tel"], falta: [] },
  final_url: "https://saudavel.test/",
  http_status: 200,
  tempo_ms: 300,
  conteudo_resumo: null,
  pagespeed: null,
  verificado_em: "2026-10-10T12:00:00.000Z",
  provisorio: false,
  tentativas: 0,
};

const PROVISORIO_VELHO = {
  ...SITE_OK,
  classe: "fora-do-ar",
  problemas: ["fora-do-ar"],
  final_url: null,
  http_status: null,
  // Muito antes do intervalo mínimo: elegível para nova rodada.
  verificado_em: "2020-01-01T00:00:00.000Z",
  provisorio: true,
  tentativas: 1,
};

function empresa(name: string, website: string | null, site: unknown) {
  return {
    name,
    phone: "+5511999990000",
    website,
    category: "Serviços",
    address: "Rua X",
    maps_url: null,
    rating: 4.8,
    reviews: 120,
    emails: [],
    socials: [],
    site,
  };
}

function candidato(id: string, campaignId: string, data: unknown, selected?: boolean) {
  return {
    id,
    campaign_id: campaignId,
    data,
    progress: "new",
    message_status: null,
    error: null,
    conversation_id: null,
    ...(selected === undefined ? {} : { selected }),
  };
}

function fixture() {
  return {
    configured: true,
    campaigns: [
      {
        id: COMPLETA,
        name: "Clínicas de estética",
        status: "draft",
        search_status: "succeeded",
        error: null,
        config: CONFIG,
        result_count: 5,
        skipped_count: 0,
        cost_usd: "0.10",
        next_send_at: "2026-10-10T00:00:00Z",
      },
      {
        id: PARCIAL,
        name: "Imobiliária parcial",
        status: "draft",
        search_status: "succeeded",
        error: null,
        // Config salva pelo meio: instrução e qualificação, SEM agente — a tela
        // não pode tratar isto como campanha configurada.
        config: {
          instruction: "Oferecer uma avaliação comercial.",
          qualification: "Confirmou a necessidade e quer conversar.",
        },
        result_count: 1,
        skipped_count: 0,
        cost_usd: "0.10",
        next_send_at: "2026-10-10T00:00:00Z",
      },
    ],
    candidates: [
      candidato("c1", COMPLETA, empresa("Sem auditoria ainda", "https://a.test/", null)),
      candidato("c2", COMPLETA, empresa("Sem site nenhum", null, null)),
      candidato("c3", COMPLETA, empresa("Com site saudável", "https://saudavel.test/", SITE_OK)),
      candidato(
        "c4",
        COMPLETA,
        empresa("Provisório vencido", "https://b.test/", PROVISORIO_VELHO),
      ),
      candidato("c5", COMPLETA, empresa("Desmarcada", "https://e.test/", null), false),
      candidato("c6", PARCIAL, empresa("Da campanha parcial", "https://f.test/", null)),
    ],
    agents: [{ id: AGENT, name: "Agente existente" }],
    personalizacao: {
      vendedor_nome: "",
      vendedor_apresentacao: "",
      vendedor_diferencial: "",
      vocabulario: {},
    },
    channels: [{ id: CHANNEL, display_name: "Comercial", phone_number: null, status: "WORKING" }],
    stages: [
      { id: STAGE, name: "Novos", pipeline_id: PIPE, pipeline_name: "Comercial" },
      { id: QUALIFIED, name: "Qualificados", pipeline_id: PIPE, pipeline_name: "Comercial" },
    ],
  };
}

function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProspectingClient />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async () => ({ data: fixture() }));
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("A4: contador da verificação e o sem-site derivado", () => {
  it("conta só quem precisa de rede e não deixa o sem-site em 'A verificar'", async () => {
    openPage();
    const botao = await screen.findByRole("button", { name: /Verificar sites/ });
    // c1 (site na web, sem veredito) + c4 (provisório já elegível). c2 é derivado
    // sem-site; c3 é definitivo; c5 está desmarcado.
    expect(botao).toHaveTextContent("Verificar sites (2)");

    const semSite = screen.getByRole("row", { name: /Sem site nenhum/ });
    expect(within(semSite).queryByText("A verificar")).toBeNull();
    expect(within(semSite).getByRole("button", { name: "Ver detalhes" })).toBeVisible();
  });
});

describe("A2: o aviso da prévia e a troca de campanha", () => {
  it("a falha da prévia fica na janela e não vira aviso geral da página", async () => {
    api.post.mockRejectedValueOnce(new Error("A IA demorou demais."));
    openPage();
    const linha = await screen.findByRole("row", { name: /Com site saudável/ });
    fireEvent.click(within(linha).getByRole("button", { name: "Ver detalhes" }));
    const modal = await screen.findByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Prévia da abordagem" }));
    const alerta = await within(modal).findByRole("alert");
    expect(alerta).toHaveTextContent("A IA demorou demais.");
    // Um único alerta: o da janela. Nada sobe para o aviso geral.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("trocar de campanha limpa o aviso geral", async () => {
    api.post.mockRejectedValue(new Error("Falha ao marcar a fila."));
    openPage();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar todas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao marcar a fila.");
    fireEvent.click(screen.getByRole("button", { name: /Imobiliária parcial/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("A3: painel de configuração por estado do rascunho", () => {
  it("config parcial (sem agente) mostra o painel e o formulário não fica travado", async () => {
    openPage();
    fireEvent.click(await screen.findByRole("button", { name: /Imobiliária parcial/ }));
    expect(await screen.findByRole("button", { name: "Configurar por conversa" })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Usar agente existente / configurar manualmente" }),
    );
    expect(screen.getByLabelText("O que a IA deve oferecer e como iniciar")).toBeEnabled();
  });

  it("config completa continua travada e sem 'Configurar por conversa'", async () => {
    openPage();
    expect(await screen.findByLabelText("Agente de IA")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Configurar por conversa" })).toBeNull();
  });
});
