import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSendMessage } from "@/hooks/inbox/useSendMessage";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const conversa = "44444444-4444-4444-8444-444444444444";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useSendMessage(), { wrapper });
}

const chaveDa = (n: number) => (post.mock.calls[n]![2] as { idempotencyKey: string }).idempotencyKey;

async function enviar(hook: ReturnType<typeof setup>, body: string) {
  await act(async () => {
    await hook.result.current.mutateAsync({ conversation_id: conversa, body }).catch(() => undefined);
  });
}

afterEach(() => post.mockReset());

describe("envio pelo composer: chave de idempotência estável por conteúdo", () => {
  it("o mesmo texto reenviado depois de erro leva a MESMA chave", async () => {
    post.mockRejectedValueOnce(new Error("rede caiu"));
    post.mockResolvedValueOnce({ data: { id: "m1", conversation_id: conversa } });
    const hook = setup();
    await enviar(hook, "oi");
    await enviar(hook, "oi");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(chaveDa(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(chaveDa(1)).toBe(chaveDa(0));
  });

  it("texto diferente é outra mensagem e ganha outra chave", async () => {
    post.mockRejectedValue(new Error("rede caiu"));
    const hook = setup();
    await enviar(hook, "oi");
    await enviar(hook, "oi, tudo bem?");
    expect(chaveDa(1)).not.toBe(chaveDa(0));
  });

  it("depois do sucesso a entrada é limpa: o mesmo texto de novo é um envio novo", async () => {
    post.mockResolvedValue({ data: { id: "m1", conversation_id: conversa } });
    const hook = setup();
    await enviar(hook, "ok");
    await enviar(hook, "ok");
    expect(chaveDa(1)).not.toBe(chaveDa(0));
  });
});
