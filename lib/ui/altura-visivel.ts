"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Quanto a área visível precisa ficar abaixo da maior já vista para contar
 * como teclado. A barra de endereço do Safari recolhendo muda ~80px; o teclado
 * mais baixo do iPhone tira ~260px.
 */
export const ENCOLHIMENTO_DO_TECLADO = 150;

/**
 * O TECLADO VIRTUAL, MEDIDO ENQUANTO HÁ CONVERSA ABERTA NO CELULAR (F2 da ADR-0006).
 *
 * Escreve `--vv-altura` e `--vv-topo` direto no `style` do elemento — e não em
 * estado de React: o `scroll` do `visualViewport` dispara a cada quadro da
 * animação do teclado no iOS, e cada estado novo re-renderizaria o Inbox
 * inteiro. Só `tecladoAberto` é estado, e só muda quando vira.
 *
 * A régua é a MAIOR altura já vista, zerada quando a largura muda (rotação):
 * no Android com `interactive-widget=resizes-content` o `innerHeight` encolhe
 * junto com o teclado, e no iOS (que ignora `interactive-widget`) não muda.
 *
 * Só liga com ponteiro grosso, lido aqui dentro (sem divergência de
 * hidratação): no computador, abrir o DevTools embaixo encolhe a janela do
 * mesmo jeito, e isso não pode esconder as ações da conversa.
 *
 * Sem `visualViewport` nada é escrito, e quem lê as variáveis cai no `100dvh`.
 */
export function useAlturaVisivel(alvo: RefObject<HTMLElement | null>, ativo: boolean): boolean {
  const [tecladoAberto, setTecladoAberto] = useState(false);

  useEffect(() => {
    const elemento = alvo.current;
    const vv = window.visualViewport;
    if (!ativo || !elemento || !vv) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;

    let maior = 0;
    let largura = vv.width;
    const medir = (): boolean => {
      if (vv.width !== largura) {
        largura = vv.width;
        maior = 0;
      }
      maior = Math.max(maior, vv.height);
      elemento.style.setProperty("--vv-altura", `${vv.height}px`);
      elemento.style.setProperty("--vv-topo", `${vv.offsetTop}px`);
      return vv.height < maior - ENCOLHIMENTO_DO_TECLADO;
    };
    const aoMudar = () => setTecladoAberto(medir());

    // A primeira medida só registra a régua: com ela a altura é a maior vista.
    medir();
    vv.addEventListener("resize", aoMudar);
    vv.addEventListener("scroll", aoMudar);
    return () => {
      vv.removeEventListener("resize", aoMudar);
      vv.removeEventListener("scroll", aoMudar);
      elemento.style.removeProperty("--vv-altura");
      elemento.style.removeProperty("--vv-topo");
      setTecladoAberto(false);
    };
  }, [alvo, ativo]);

  return tecladoAberto;
}
