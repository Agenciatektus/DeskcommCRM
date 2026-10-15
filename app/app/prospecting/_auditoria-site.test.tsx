import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuditoriaDoCandidato } from "./_auditoria-site";
import type { Prospect } from "@/lib/prospecting/schema";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

function candidato(site: Prospect["site"]): Prospect {
  return {
    key: "k",
    name: "Clínica Vitta",
    phone: "+5511999990000",
    website: "https://vitta.test/",
    category: "Estética",
    address: "Rua X",
    maps_url: null,
    rating: 5.0,
    reviews: 120,
    emails: [],
    socials: [],
    site,
  };
}

const SITE_OK: NonNullable<Prospect["site"]> = {
  ver: 1,
  classe: "site-ok",
  problemas: [],
  checklist: { tem: ["tel"], falta: [] },
  final_url: "https://vitta.test/",
  http_status: 200,
  tempo_ms: 300,
  conteudo_resumo: null,
  pagespeed: null,
  verificado_em: "2026-10-10T12:00:00.000Z",
  provisorio: false,
  tentativas: 0,
};

function props(data: Prospect) {
  return {
    candidateId: "cand-1",
    data,
    ofertas: ["site"] as Array<"site">,
    nicho: "clínica",
    status: "new",
    disabled: false,
    onReanalisar: vi.fn(async () => undefined),
    onPrevia: vi.fn(async () => null),
  };
}

describe("AuditoriaDoCandidato: resumo na linha, total no modal", () => {
  it("sem site mostra só o pendente com esqueleto, sem botões", () => {
    render(<AuditoriaDoCandidato {...props(candidato(null))} />);
    expect(screen.getByText("A verificar")).toBeVisible();
    expect(document.querySelector("[data-esqueleto]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Ver detalhes" })).toBeNull();
    expect(screen.queryByText(/Score/)).toBeNull();
  });

  it("com site mostra score + veredito de uma linha, sem o total", () => {
    render(<AuditoriaDoCandidato {...props(candidato({ ...SITE_OK }))} />);
    // "Score" e o número vivem em nós de texto separados dentro do Badge.
    // site-ok + nota 5.0 + 120 avaliações = 40 + 30 + 10 = 80.
    expect(screen.getByText((_, el) => el?.textContent === "Score 80")).toBeVisible();
    // Estratégia e objeções moram no modal, não na linha.
    expect(screen.queryByText("Estratégia de abordagem")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reanalisar site" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver detalhes" })).toBeVisible();
  });

  it("abrir o modal mostra o total + ações, e a prévia renderiza a mensagem", async () => {
    const onPrevia = vi.fn(async () => ({
      mensagem: "Olá!",
      estrategia: { cenario: "", angulo: "", ganchos: [], objecoes: [], proximoPasso: "" },
      score: { valor: 0, motivo: "" },
    }));
    render(<AuditoriaDoCandidato {...props(candidato({ ...SITE_OK }))} onPrevia={onPrevia} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reanalisar site" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Prévia da abordagem" }));
    await waitFor(() => expect(screen.getByText("Olá!")).toBeVisible());
    expect(onPrevia).toHaveBeenCalledWith("cand-1");
  });
});
