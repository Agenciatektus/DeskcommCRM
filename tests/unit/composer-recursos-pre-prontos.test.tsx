import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const postMock = vi.fn();
const getMock = vi.fn();

const TPL = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
/** O caminho que a rota de upload gera: `<org>/templates/<template>/<uuid>.<ext>`. */
const AUDIO_PATH = `${ORG}/templates/${TPL}/0a0b0c0d-0000-4000-8000-000000000001.ogg`;

const RECURSOS = [
  {
    id: "r-texto",
    title: "Boas vindas",
    body: "Oi {{primeiro_nome}}, tudo bem?",
    shortcut: null,
    owner_user_id: null,
    midias: [],
  },
  {
    // Recurso de ÁUDIO (#2833): não há coluna `tipo` — o áudio é uma entrada de
    // `midias`, e é o CAMINHO dela (que a rota escolheu pelos bytes) que diz
    // que este recurso é de áudio.
    id: "r-audio",
    title: "Áudio preço",
    body: "",
    shortcut: null,
    owner_user_id: null,
    midias: [
      { storage_path: AUDIO_PATH, media_mime: "audio/ogg", media_size_bytes: 1234 },
    ],
  },
];

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: RECURSOS, isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args) as Promise<unknown>,
    get: (...args: unknown[]) => getMock(...args) as Promise<unknown>,
  },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
}));

import { Composer } from "@/components/inbox/Composer";
import { BarraDeRecursos } from "@/components/inbox/composer/BarraDeRecursos";
import { ehRecursoDeAudio, planoDoRecurso, type Recurso } from "@/lib/inbox/recursos";

const CONV = "aaaaaaaa-3333-4000-8000-000000000001";
const texto = RECURSOS[0] as unknown as Recurso;
const audio = RECURSOS[1] as unknown as Recurso;

function renderComposer(props: Record<string, unknown> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId={CONV} contactName="Ana" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({
    data: { media_url: "https://storage.local/x.ogg?sig=1", media_mime: "audio/ogg", media_size_bytes: 1234 },
  });
});

describe("planoDoRecurso (puro)", () => {
  it("(a) recurso de TEXTO vira texto interpolado — nunca um envio", () => {
    const plano = planoDoRecurso(texto, { name: "Ana", displayName: null });
    expect(plano).toEqual({ tipo: "texto", texto: "Oi Ana, tudo bem?" });
  });

  it("(b) recurso de ÁUDIO vira anexo pendente — descreve, não envia", () => {
    const plano = planoDoRecurso(audio, { name: "Ana", displayName: null });
    expect(plano.tipo).toBe("audio");
    if (plano.tipo !== "audio") throw new Error("esperava áudio");
    expect(plano.anexo).toMatchObject({
      recursoId: "r-audio",
      titulo: "Áudio preço",
      media_path: AUDIO_PATH,
      media_mime: "audio/ogg",
    });
  });

  it("(c) quem decide que o recurso é de áudio é o CAMINHO, não o `media_mime` da linha", () => {
    // A coluna é gravável pelo PostgREST: um `.ogg` com `media_mime` mentiroso
    // continua sendo áudio (o caminho foi gravado pelo upload), e um `.jpg`
    // marcado como áudio continua sendo imagem.
    expect(
      ehRecursoDeAudio({
        midias: [{ storage_path: AUDIO_PATH, media_mime: "image/jpeg", media_size_bytes: 1 }],
      }),
    ).toBe(true);
    const soImagem = {
      midias: [
        {
          storage_path: `${ORG}/templates/${TPL}/0a0b0c0d-0000-4000-8000-000000000002.jpg`,
          media_mime: "audio/ogg",
          media_size_bytes: 1,
        },
      ],
    };
    expect(ehRecursoDeAudio(soImagem)).toBe(false);
    expect(planoDoRecurso({ id: "r", title: "T", body: "oi", ...soImagem }, { name: null })).toEqual({
      tipo: "texto",
      texto: "oi",
    });
  });
});

describe("BarraDeRecursos", () => {
  it("um botão por título e o clique escolhe o recurso", () => {
    const onEscolher = vi.fn();
    render(<BarraDeRecursos recursos={[texto, audio]} onEscolher={onEscolher} />);
    fireEvent.click(screen.getByRole("button", { name: /boas vindas/i }));
    expect(onEscolher).toHaveBeenCalledWith(expect.objectContaining({ id: "r-texto" }));
  });
});

describe("Composer + recursos pré-prontos", () => {
  it("(a) aplicar um recurso de texto põe o texto NO CAMPO e NÃO envia sozinho", () => {
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /boas vindas/i }));

    const campo = screen.getByLabelText(/mensagem/i);
    expect(campo).toHaveValue("Oi Ana, tudo bem?");
    // Editável: o operador ainda decide o que sai.
    expect(campo).not.toBeDisabled();
    // O critério central da issue: nenhum envio no clique.
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("(b) aplicar um recurso de áudio arma o ANEXO PENDENTE; o envio só sai no clique do operador", async () => {
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /áudio preço/i }));

    const pendente = await screen.findByTestId("anexo-de-recurso-pendente");
    expect(pendente).toHaveTextContent(/áudio preço/i);
    // Armar não envia.
    expect(sendMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /enviar áudio/i }));

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: CONV,
        type: "audio",
        media_url: "https://storage.local/x.ogg?sig=1",
        media_mime: "audio/ogg",
      }),
      expect.anything(),
    );
  });
});
