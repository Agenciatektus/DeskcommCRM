/**
 * AS CASCAS AUTENTICADAS PEDEM A VERIFICAÇÃO EM DUAS ETAPAS A QUEM JÁ A TEM.
 *
 * As rotas já faziam essa pergunta (`mfaEmDivida` → 403 `mfa_required`), e o
 * login por senha já leva ao desafio. As cascas de `/app`, `/onboarding` e
 * `/admin` respondem agora a mesma pergunta: tem fator verificado e a sessão
 * não o provou → desafio, com `next` de volta para onde estava.
 *
 * Cadastrar e provar são perguntas diferentes (CLAUDE.md, Auth & RBAC): os
 * controles abaixo seguram o outro lado — sem fator, com fator não verificado,
 * com a sessão já provada, e o bloqueador de CADASTRO da política, que não muda.
 *
 * Executa os layouts com o `lib/auth/server` REAL (só a identidade e a política
 * são fixadas); o que varia é o que o Supabase responde sobre fatores e sessão.
 */
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const U = "11111111-1111-4111-8111-111111111111";
const O = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  caminho: "/app/inbox",
  org: null as null | { orgId: string; role: string; interface_settings: null },
  politica: false,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/server")>();
  const user = { id: U, idioma: "pt-BR", is_platform_admin: false, support: null, organizations: [] };
  return {
    ...real,
    loadAuthUser: async () => user,
    requireAuth: async () => user,
    resolveActiveOrg: async () => h.org,
    requiresMfa: async () => h.politica,
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-pathname": h.caminho }),
}));
vi.mock("next/navigation", () => ({
  redirect: (d: string) => {
    throw new Error(`REDIRECT:${d}`);
  },
}));
vi.mock("@/lib/channels/health", () => ({ listarConexoesCaidas: async () => [] }));
vi.mock("@/lib/instalacao/modulos", () => ({ modulosLigados: async () => [] }));
vi.mock("@/lib/auth/vinculo-revogado", () => ({ acessoFoiRevogado: async () => false }));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => null }));
vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: async () => ({ nome: "Deskcomm", logoUrl: null }),
}));
vi.mock("@/lib/branding/organizacao", () => ({
  resolverMarcaDaOrganizacao: () => ({
    name: "x",
    logoUrl: null,
    cor: "#000000",
    origens: { nome: "instalacao", logoUrl: "instalacao", cor: "instalacao" },
  }),
}));
vi.mock("@/app/actions/onboarding/_shared", () => ({
  loadOnboardingState: async () => ({ state: {}, onboardedAt: null }),
}));

type Fatores = { status: string }[] | "falha";

/** O que a sessão diz sobre si: fatores (pela rede) e nível de garantia (do token). */
function sessao(fatores: Fatores, nivel: string | null, paRow: unknown = null) {
  const consulta: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) consulta[m] = () => consulta;
  consulta.maybeSingle = async () => ({ data: paRow, error: null });
  vi.mocked(createClient).mockResolvedValue({
    from: () => consulta,
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: U,
            factors:
              fatores === "falha"
                ? undefined
                : fatores.map((f) => ({ factor_type: "totp", status: f.status })),
          },
        },
        error: null,
      }),
      mfa: {
        listFactors: async () =>
          fatores === "falha"
            ? { data: null, error: new Error("GoTrue indisponível") }
            : { data: { totp: fatores }, error: null },
        getAuthenticatorAssuranceLevel: async () => ({
          data: nivel === null ? null : { currentLevel: nivel },
          error: null,
        }),
      },
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function bancoDaOrganizacao() {
  const linhas: Record<string, unknown> = {
    organizations: { onboarded_at: "2026-01-01", status: "active", settings: null, timezone: null },
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from(t: string) {
      const r = async () => ({ data: linhas[t] ?? null, error: null });
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit", "in"]) q[m] = () => q;
      q.maybeSingle = r;
      q.then = (ok: (v: unknown) => unknown, f: (e: unknown) => unknown) => r().then(ok, f);
      return q;
    },
  } as unknown as ReturnType<typeof createAdminClient>);
}

/** Procura um componente pelo nome na árvore devolvida pelo layout. */
function acha(no: unknown, nome: string): ReactElement<Record<string, unknown>> | null {
  if (!no || typeof no !== "object") return null;
  if (Array.isArray(no)) {
    for (const filho of no) {
      const r = acha(filho, nome);
      if (r) return r;
    }
    return null;
  }
  const el = no as ReactElement<Record<string, unknown>>;
  const tipo = el.type as { name?: string } | string | undefined;
  if (typeof tipo === "function" && tipo.name === nome) return el;
  return acha(el.props?.children, nome);
}

async function casca() {
  const { default: AppLayout } = await import("@/app/app/layout");
  return AppLayout({ children: null }) as Promise<ReactElement>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.caminho = "/app/inbox";
  h.org = { orgId: O, role: "admin", interface_settings: null };
  h.politica = false;
  bancoDaOrganizacao();
});

describe("/app: quem tem fator prova a sessão antes de ver a casca", () => {
  it("fator verificado + sessão aal1 → desafio, de volta ao caminho atual", async () => {
    sessao([{ status: "verified" }], "aal1");
    await expect(casca()).rejects.toThrow("REDIRECT:/login/mfa?next=%2Fapp%2Finbox");
  });

  it("o mesmo sem organização ativa (o outro ramo do layout)", async () => {
    h.org = null;
    h.caminho = "/app";
    sessao([{ status: "verified" }], "aal1");
    await expect(casca()).rejects.toThrow("REDIRECT:/login/mfa?next=%2Fapp");
  });

  it("nível de garantia ilegível conta como não provado (falha fechada)", async () => {
    sessao([{ status: "verified" }], null);
    await expect(casca()).rejects.toThrow(/^REDIRECT:\/login\/mfa/);
  });

  it("falha ao ler os fatores: a casca NÃO renderiza (lança, como nas rotas)", async () => {
    sessao("falha", "aal1");
    await expect(casca()).rejects.toThrow("GoTrue indisponível");
  });

  it("controle: sem fator → renderiza", async () => {
    sessao([], "aal1");
    await expect(casca()).resolves.toBeTruthy();
  });

  it("controle: fator NÃO verificado não conta como inscrito → renderiza", async () => {
    sessao([{ status: "unverified" }], "aal1");
    await expect(casca()).resolves.toBeTruthy();
  });

  it("controle: fator verificado + sessão aal2 → renderiza", async () => {
    sessao([{ status: "verified" }], "aal2");
    const arvore = await casca();
    expect(acha(arvore, "AppShell")).not.toBeNull();
    expect(acha(arvore, "MfaEnrollGate")).toBeNull();
  });

  it("controle: política exige e não há fator → o bloqueador de CADASTRO segue igual", async () => {
    h.politica = true;
    sessao([], "aal1");
    const gate = acha(await casca(), "MfaEnrollGate");
    expect(gate).not.toBeNull();
    expect(gate?.props.enrolled).toBe(false);
  });
});

describe("/onboarding: a mesma regra", () => {
  async function onboarding() {
    const { default: OnboardingLayout } = await import("@/app/onboarding/layout");
    return OnboardingLayout({ children: null });
  }

  it("fator verificado + sessão aal1 → desafio", async () => {
    h.caminho = "/onboarding/welcome";
    sessao([{ status: "verified" }], "aal1");
    await expect(onboarding()).rejects.toThrow("REDIRECT:/login/mfa?next=%2Fonboarding%2Fwelcome");
  });

  it("controle: sem fator → renderiza", async () => {
    sessao([], "aal1");
    await expect(onboarding()).resolves.toBeTruthy();
  });
});

describe("/admin: a mesma regra, com a política da plataforma desligada", () => {
  const linha = { user_id: U, scope: "full", mfa_required: false, revoked_at: null };
  async function guarda() {
    const { requirePlatformAdmin } = await import("@/lib/auth/requirePlatformAdmin");
    return requirePlatformAdmin();
  }

  it("fator verificado + sessão aal1 → desafio", async () => {
    sessao([{ status: "verified" }], "aal1", linha);
    await expect(guarda()).rejects.toThrow("REDIRECT:/login/mfa?next=/admin");
  });

  it("controle: sem fator → entra", async () => {
    sessao([], "aal1", linha);
    await expect(guarda()).resolves.toMatchObject({ platformAdmin: { scope: "full" } });
  });

  it("controle: fator NÃO verificado → entra", async () => {
    sessao([{ status: "unverified" }], "aal1", linha);
    await expect(guarda()).resolves.toMatchObject({ platformAdmin: { scope: "full" } });
  });

  it("controle: fator verificado + sessão aal2 → entra", async () => {
    sessao([{ status: "verified" }], "aal2", linha);
    await expect(guarda()).resolves.toMatchObject({ platformAdmin: { scope: "full" } });
  });

  it("controle: política exige + aal1 → desafio, como antes", async () => {
    sessao([], "aal1", { ...linha, mfa_required: true });
    await expect(guarda()).rejects.toThrow("REDIRECT:/login/mfa?next=/admin");
  });
});
