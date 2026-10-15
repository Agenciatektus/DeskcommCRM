"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { AuditoriaDoSite } from "@/components/prospecting/AuditoriaDoSite";
import { descreverProblema } from "@/lib/prospecting/site-classify";
import {
  pontuarCandidato,
  rotuloDaClasse,
  type EstrategiaDoLead,
  type OfertaDaCampanha,
  type Pontuacao,
} from "@/lib/prospecting/estrategia-site";
import type { Prospect } from "@/lib/prospecting/schema";

export interface PreviaDaAbordagem {
  mensagem: string;
  estrategia: EstrategiaDoLead;
  score: Pontuacao;
}

/**
 * Célula de auditoria da fila de prospecção: resumo de uma linha + modal.
 * A apresentação completa é `AuditoriaDoSite` (compartilhada com o inbox);
 * aqui moram só o resumo, o modal e os botões que falam com a rota.
 */
export function AuditoriaDoCandidato({
  candidateId,
  data,
  ofertas,
  nicho,
  status,
  disabled,
  sobrescritaVocabulario,
  onReanalisar,
  onPrevia,
}: {
  candidateId: string;
  data: Prospect;
  ofertas: OfertaDaCampanha[];
  nicho: string;
  status: string;
  disabled: boolean;
  sobrescritaVocabulario?: Record<string, string> | null;
  onReanalisar: (candidateId: string) => Promise<void>;
  onPrevia: (candidateId: string) => Promise<PreviaDaAbordagem | null>;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<PreviaDaAbordagem | null>(null);
  const [gerando, setGerando] = useState(false);
  const site = data.site ?? null;
  if (!site) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("A verificar")}</p>
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }
  const temInstagram = /instagram/i.test((data.socials ?? []).join(","));
  const score = pontuarCandidato(data.rating, data.reviews, site.classe, ofertas[0] ?? "site", site.provisorio ?? false);
  // Resumo de UMA linha: classe + até 2 problemas. O resto mora no modal.
  const veredito = [rotuloDaClasse(site.classe, t), ...site.problemas.slice(0, 2).map(descreverProblema)].join(" · ");
  const auditoria = (
    <AuditoriaDoSite
      site={site}
      nota={data.rating}
      numAvaliacoes={data.reviews}
      temInstagram={temInstagram}
      ofertas={ofertas}
      nicho={nicho}
      status={status}
      sobrescritaVocabulario={sobrescritaVocabulario}
    />
  );
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          Score {score.valor}
        </Badge>
        <span className="text-xs text-muted-foreground" title={score.motivo}>
          {score.motivo}
        </span>
      </div>
      <p className="truncate text-xs" title={veredito}>
        {veredito}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setPrevia(null);
          setAberto(true);
        }}
      >
        {t("Ver detalhes")}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Auditoria do site")}</DialogTitle>
            <DialogDescription>{data.name}</DialogDescription>
          </DialogHeader>
          {auditoria}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void onReanalisar(candidateId)}
            >
              {t("Reanalisar site")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || gerando}
              onClick={() => {
                setGerando(true);
                void onPrevia(candidateId)
                  .then(setPrevia)
                  .finally(() => setGerando(false));
              }}
            >
              {gerando ? t("Gerando prévia…") : t("Prévia da abordagem")}
            </Button>
          </div>
          {previa && (
            <div className="rounded-md border p-3 text-xs">
              <p className="whitespace-pre-wrap">{previa.mensagem}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
