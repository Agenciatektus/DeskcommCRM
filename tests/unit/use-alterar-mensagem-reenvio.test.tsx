import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

const post = vi.fn();
const showApiError = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: (e: unknown) => showApiError(e) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

import { useAlterarMensagem } from "@/hooks/inbox/useAlterarMensagem";

const conversa = "44444444-4444-4444-8444-444444444444";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidar = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useAlterarMensagem(conversa), { wrapper });
  return { hook, invalidar };
}

async function reenviar(hook: ReturnType<typeof setup>["hook"]) {
  await act(async () => {
    await hook.result.current.reenviar.mutateAsync({ id: "m1", confirmado: false }).catch(() => undefined);
  });
}

afterEach(() => { post.mockReset(); showApiError.mockReset(); });

describe("reenvio pela bolha: depois de uma recusa a bolha mostra o estado real", () => {
  it("recusa do servidor recarrega o fio (a bolha decidiu com o relógio do aparelho)", async () => {
    post.mockRejectedValueOnce(new ApiError(403, "reenvio_indisponivel", undefined, "r", "Esta mensagem não pode ser reenviada."));
    const { hook, invalidar } = setup();
    await reenviar(hook);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["messages", conversa] });
    expect(showApiError).toHaveBeenCalledTimes(1);
  });

  it("'confirme antes' não vira toast de erro: quem responde é a confirmação da bolha", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "confirmacao_necessaria", undefined, "r", "Confirme antes de enviar de novo."));
    const { hook } = setup();
    await reenviar(hook);
    expect(showApiError).not.toHaveBeenCalled();
  });
});
