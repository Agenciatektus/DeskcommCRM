"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import type { TipoDeRecurso } from "@/lib/inbox/recursos";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}

interface CreateInput {
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
  tipo: TipoDeRecurso;
  media_path?: string;
  media_mime?: string;
  media_size_bytes?: number;
}

interface UpdateInput {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  tipo: TipoDeRecurso;
  media_path: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
}

interface MidiaSubida {
  storage_path: string;
  media_mime: string;
  media_size_bytes: number;
}

/**
 * Sobe o áudio do recurso e devolve o caminho no Storage. Rota própria
 * (`/message-templates/media`) porque o arquivo pertence à BIBLIOTECA, não a
 * uma conversa — o upload de mídia de conversa exige um `conversationId` que
 * aqui não existe.
 */
async function subirAudio(file: File): Promise<MidiaSubida> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/api/v1/message-templates/media", { method: "POST", body: form });
  const json = (await res.json()) as { data?: MidiaSubida; error?: { message?: string } };
  if (!res.ok || !json.data) {
    throw new Error(json.error?.message ?? "Falha ao subir o áudio.");
  }
  return json.data;
}

export function TemplateFormDialog({ open, onOpenChange, canShare, template }: Props) {
  const t = useT();
  const isEdit = !!template;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoDeRecurso>("texto");
  // O arquivo novo escolhido nesta edição; quando null, o recurso mantém o
  // áudio que já tinha (template.media_path).
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [subindo, setSubindo] = React.useState(false);

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: CreateInput) =>
      apiClient.post<{ data: MessageTemplate }>("/api/v1/message-templates", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) =>
      apiClient.patch<{ data: MessageTemplate }>(`/api/v1/message-templates/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const pending = create.isPending || update.isPending || subindo;

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setBody(template?.body ?? "");
    setShortcut(template?.shortcut ?? "");
    setShared(template ? template.owner_user_id === null : false);
    setTipo(template?.tipo ?? "texto");
    setArquivo(null);
  }, [open, template]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // O áudio precisa de um arquivo — o novo desta edição ou o que o recurso
    // já tinha. Sem nenhum dos dois, o banco recusaria pelo CHECK.
    const midiaExistente = template?.media_path ?? null;
    if (tipo === "audio" && !arquivo && !midiaExistente) {
      toast.error(t("Escolha um arquivo de áudio para o recurso."));
      return;
    }
    try {
      let midia: MidiaSubida | null = null;
      if (tipo === "audio" && arquivo) {
        setSubindo(true);
        try {
          midia = await subirAudio(arquivo);
        } finally {
          setSubindo(false);
        }
      }
      const media_path = tipo === "audio" ? (midia?.storage_path ?? midiaExistente) : null;
      const media_mime = tipo === "audio" ? (midia?.media_mime ?? template?.media_mime ?? null) : null;
      const media_size_bytes =
        tipo === "audio" ? (midia?.media_size_bytes ?? template?.media_size_bytes ?? null) : null;
      // Recurso de áudio não tem corpo: o conteúdo é o arquivo. Mandar texto
      // vazio é o que o CHECK e o schema esperam.
      const corpo = tipo === "audio" ? "" : body;

      if (isEdit) {
        await update.mutateAsync({
          id: template.id,
          title,
          body: corpo,
          shortcut: shortcut.trim() || null,
          tipo,
          media_path,
          media_mime,
          media_size_bytes,
        });
        toast.success(t("Recurso atualizado."));
      } else {
        await create.mutateAsync({
          title,
          body: corpo,
          shortcut: shortcut.trim() || undefined,
          shared: canShare ? shared : false,
          tipo,
          ...(media_path ? { media_path } : {}),
          ...(media_mime ? { media_mime } : {}),
          ...(media_size_bytes !== null ? { media_size_bytes } : {}),
        });
        toast.success(t("Recurso criado."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar recurso") : t("Novo recurso")}</DialogTitle>
          <DialogDescription>
            {t("Recursos pré-prontos: o texto cai no campo editável do Inbox; o áudio vira anexo pendente.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Tipo de recurso")}</Label>
            <div className="flex gap-1">
              {(["texto", "audio"] as const).map((opcao) => (
                <Button
                  key={opcao}
                  type="button"
                  variant={tipo === opcao ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setTipo(opcao)}
                >
                  {opcao === "texto" ? t("Texto") : t("Áudio")}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t("Título")}</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Saudação inicial")}
              minLength={1}
              maxLength={80}
              required
            />
          </div>
          {tipo === "texto" ? (
            <div className="space-y-2">
              <Label htmlFor="tpl-body">{t("Mensagem")}</Label>
              <Textarea
                id="tpl-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("Oi {{primeiro_nome}}, tudo bem?")}
                minLength={1}
                maxLength={4096}
                required
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                {t("Use")} {"{{primeiro_nome}}"} {t("e")} {"{{nome}}"} {t("para personalizar.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tpl-audio">{t("Arquivo de áudio")}</Label>
              <Input
                id="tpl-audio"
                type="file"
                accept="audio/*"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                required={!template?.media_path}
              />
              <p className="text-xs text-muted-foreground">
                {template?.media_path && !arquivo
                  ? t("Áudio atual mantido. Escolha outro arquivo para substituir.")
                  : t("O áudio fica na biblioteca e entra no Inbox como anexo pendente.")}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">{t("Atalho (opcional)")}</Label>
            <Input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="oi"
              maxLength={40}
            />
          </div>
          {canShare && (
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-shared"
                checked={shared}
                onCheckedChange={setShared}
                disabled={isEdit}
              />
              <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? t("Salvar") : t("Criar recurso")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
