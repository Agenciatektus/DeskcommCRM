import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAlturaVisivel } from "./altura-visivel";

/**
 * O TECLADO DO CELULAR, MEDIDO PELO `visualViewport`.
 *
 * A régua é a MAIOR altura já vista, não `innerHeight`: no Android com
 * `interactive-widget=resizes-content` o `innerHeight` encolhe junto com o
 * teclado, e no iOS ele não muda. Comparar com o maior valor visto vale nos dois.
 */

class ViewportFalso extends EventTarget {
  height = 844;
  width = 390;
  offsetTop = 0;
  mudar(parcial: Partial<Pick<ViewportFalso, "height" | "width" | "offsetTop">>) {
    Object.assign(this, parcial);
    this.dispatchEvent(new Event("resize"));
  }
}

let vv: ViewportFalso;
let grosso = true;

beforeEach(() => {
  vv = new ViewportFalso();
  grosso = true;
  vi.stubGlobal("visualViewport", vv);
  vi.stubGlobal(
    "matchMedia",
    (q: string) => ({ matches: q === "(pointer: coarse)" && grosso, media: q }) as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar(ativo = true) {
  const el = document.createElement("div");
  const ref = { current: el };
  const hook = renderHook(({ a }) => useAlturaVisivel(ref, a), { initialProps: { a: ativo } });
  return { el, hook };
}

describe("useAlturaVisivel", () => {
  it("844 → 500 é teclado aberto; voltar a 844 fecha", () => {
    const { el, hook } = montar();
    expect(hook.result.current).toBe(false);
    expect(el.style.getPropertyValue("--vv-altura")).toBe("844px");

    act(() => vv.mudar({ height: 500, offsetTop: 120 }));
    expect(hook.result.current).toBe(true);
    expect(el.style.getPropertyValue("--vv-altura")).toBe("500px");
    expect(el.style.getPropertyValue("--vv-topo")).toBe("120px");

    act(() => vv.mudar({ height: 844, offsetTop: 0 }));
    expect(hook.result.current).toBe(false);
  });

  it("girar o aparelho zera a maior altura — paisagem não conta como teclado", () => {
    const { hook } = montar();
    act(() => vv.mudar({ width: 844, height: 390 }));
    expect(hook.result.current).toBe(false);
  });

  it("encolher pouco (barra do navegador recolhendo) não é teclado", () => {
    const { hook } = montar();
    act(() => vv.mudar({ height: 760 }));
    expect(hook.result.current).toBe(false);
  });

  it("inativo não escuta nem escreve nada", () => {
    const espiao = vi.spyOn(vv, "addEventListener");
    const { el, hook } = montar(false);
    expect(espiao).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue("--vv-altura")).toBe("");
    expect(hook.result.current).toBe(false);
  });

  it("ponteiro fino (computador) não liga: encolher a janela não é teclado", () => {
    grosso = false;
    const { el, hook } = montar();
    act(() => vv.mudar({ height: 400 }));
    expect(hook.result.current).toBe(false);
    expect(el.style.getPropertyValue("--vv-altura")).toBe("");
  });

  it("desligar limpa as variáveis e devolve fechado", () => {
    const { el, hook } = montar();
    act(() => vv.mudar({ height: 500 }));
    expect(hook.result.current).toBe(true);
    hook.rerender({ a: false });
    expect(hook.result.current).toBe(false);
    expect(el.style.getPropertyValue("--vv-altura")).toBe("");
    expect(el.style.getPropertyValue("--vv-topo")).toBe("");
  });

  it("sem visualViewport (navegador antigo) fica fechado e sem variáveis — vale o 100dvh", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { el, hook } = montar();
    expect(hook.result.current).toBe(false);
    expect(el.style.getPropertyValue("--vv-altura")).toBe("");
  });
});
