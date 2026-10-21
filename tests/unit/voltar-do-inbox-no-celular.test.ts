import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { navegarNoInbox } from "@/components/inbox/InboxLayout";

/**
 * VOLTAR DA CONVERSA DESFAZ O PASSO, EM VEZ DE EMPILHAR (F2 da ADR-0006).
 *
 * O botão "‹ Conversas" fazia `pushState` da lista: a pilha crescia a cada ida
 * e volta, e o gesto de voltar do sistema REABRIA a conversa que a pessoa
 * acabou de fechar. Agora a entrada empilhada pelo Inbox leva a profundidade,
 * e voltar anda essa profundidade para trás. Sem marca (deep-link, clique no
 * aviso, recarga) voltar troca a entrada no lugar: a pilha não cresce.
 *
 * O jsdom não tem o patch do Next que copia o estado interno dele para dentro
 * do objeto do `pushState`; a integração com o roteador é provada no e2e
 * `atender-pelo-celular`.
 */

beforeEach(() => {
  window.history.replaceState(null, "", "/app/inbox");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("navegarNoInbox", () => {
  it("lista → abrir → voltar anda UMA entrada para trás e não acrescenta nenhuma", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const antes = window.history.length;

    expect(navegarNoInbox("/app/inbox?id=a", null, "a")).toBe("trocou");
    expect(window.history.length).toBe(antes + 1);

    expect(navegarNoInbox("/app/inbox", "a", null)).toBe("pelo-historico");
    expect(go).toHaveBeenCalledWith(-1);
    expect(window.history.length, "voltar não pode empilhar").toBe(antes + 1);
  });

  it("lista → A → B → voltar cai na LISTA, não em A", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    navegarNoInbox("/app/inbox?id=a", null, "a");
    navegarNoInbox("/app/inbox?id=b", "a", "b");
    navegarNoInbox("/app/inbox", "b", null);
    expect(go).toHaveBeenCalledWith(-2);
  });

  it("deep-link (sem marca) → voltar troca a entrada no lugar e a pilha não cresce", () => {
    window.history.replaceState(null, "", "/app/inbox?id=x");
    const go = vi.spyOn(window.history, "go");
    const troca = vi.spyOn(window.history, "replaceState");
    const antes = window.history.length;

    expect(navegarNoInbox("/app/inbox", "x", null)).toBe("trocou");
    expect(go).not.toHaveBeenCalled();
    expect(troca).toHaveBeenCalledWith(null, "", "/app/inbox");
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(antes);
  });

  it("conversa → conversa sem marca (atalho j/k depois de um deep-link) empilha como sempre, sem inventar profundidade", () => {
    window.history.replaceState(null, "", "/app/inbox?id=x");
    navegarNoInbox("/app/inbox?id=y", "x", "y");
    expect(window.history.state).toBeNull();
  });
});
