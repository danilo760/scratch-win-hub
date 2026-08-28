import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScratchCard, type ScratchRarity } from "@/components/ScratchCard";
import { profileQueryKey } from "@/hooks/useProfile";
import {
  specialScratchStatusQueryKey,
  useSpecialScratchStatus,
} from "@/hooks/useSpecialScratchStatus";

type DailyReveal = {
  prize: number;
  pointsEarned: number;
  rarity: ScratchRarity;
  cardTitle: string | null;
  alreadyClaimed: boolean;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseScratchRarity(value: unknown): ScratchRarity | null {
  return value === "bronze" || value === "prata" || value === "ouro" || value === "diamante"
    ? value
    : null;
}

function parseDailyReveal(value: unknown): DailyReveal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const prize = finiteNumber(raw["prize"]);
  const pointsEarned = finiteNumber(raw["points_earned"]);
  const rarity = parseScratchRarity(raw["rarity_slug"]);
  if (prize === null || pointsEarned === null || !rarity) return null;
  return {
    prize,
    pointsEarned,
    rarity,
    cardTitle: typeof raw["card_title"] === "string" ? raw["card_title"] : null,
    alreadyClaimed: raw["already_claimed"] === true,
  };
}

export function DailyScratchPanel() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useSpecialScratchStatus();
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<DailyReveal | null>(null);
  const pendingRequestId = useRef<string | null>(null);

  const claim = async () => {
    if (!status?.daily_configured || busy) return;
    setBusy(true);
    pendingRequestId.current ??= crypto.randomUUID();
    const { data, error } = await supabase.rpc("claim_daily_scratch_v2", {
      p_client_request_id: pendingRequestId.current,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const parsed = parseDailyReveal(data);
    if (!parsed) {
      toast.error("O servidor retornou uma resposta diária inválida. Tente novamente.");
      return;
    }

    pendingRequestId.current = null;
    setReveal(parsed);
    await Promise.all([
      qc.invalidateQueries({ queryKey: profileQueryKey }),
      qc.invalidateQueries({ queryKey: specialScratchStatusQueryKey }),
    ]);
    toast.success(
      parsed.alreadyClaimed
        ? "Resultado da cortesia de hoje recuperado."
        : "Cortesia diária registrada. Raspe para revelar o resultado.",
    );
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-5 text-accent" /> Raspadinha diária
        </CardTitle>
        <CardDescription>
          Uma cortesia por dia. O resultado é definido e persistido no servidor antes da revelação visual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reveal ? (
          <div className="space-y-3">
            {reveal.cardTitle && (
              <p className="text-center text-sm font-medium">{reveal.cardTitle}</p>
            )}
            <ScratchCard
              prize={reveal.prize}
              pointsEarned={reveal.pointsEarned}
              rarity={reveal.rarity}
              onReset={() => setReveal(null)}
              resetLabel="Fechar resultado"
            />
          </div>
        ) : isLoading ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : status?.daily_available ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status.daily_title ?? "Raspadinha diária configurada"}
            </p>
            <Button className="w-full" disabled={busy} onClick={claim}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Resgatar cortesia"}
            </Button>
          </>
        ) : status?.daily_claimed_today ? (
          <>
            <div className="rounded-lg border p-4 text-center">
              <strong className="block">Cortesia de hoje já utilizada</strong>
              <span className="text-sm text-muted-foreground">
                O próximo resgate fica disponível no próximo dia de São Paulo.
              </span>
            </div>
            <Button
              className="w-full"
              variant="outline"
              disabled={busy || !status.daily_configured}
              onClick={claim}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Ver resultado de hoje"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-dashed p-4 text-center">
              <strong className="block">Configuração pendente</strong>
              <span className="text-sm text-muted-foreground">Em breve</span>
            </div>
            <Button className="w-full" disabled>
              Em breve
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MysteryScratchPanel() {
  const { data: status, isLoading } = useSpecialScratchStatus();
  const [busy, setBusy] = useState(false);
  const pendingRequestId = useRef<string | null>(null);

  const open = async () => {
    if (!status?.mystery_available || busy) return;
    setBusy(true);
    pendingRequestId.current ??= crypto.randomUUID();
    const { data, error } = await supabase.rpc("open_mystery_scratch_v1", {
      p_client_request_id: pendingRequestId.current,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data || typeof data !== "object") {
      toast.error("O servidor retornou uma resposta misteriosa inválida. Tente novamente.");
      return;
    }

    pendingRequestId.current = null;
    toast.success("Raspadinha misteriosa selecionada com segurança.");
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> Raspadinha misteriosa
        </CardTitle>
        <CardDescription>
          O pool publicado escolhe a experiência antes de qualquer revelação visual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : status?.mystery_available ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status.mystery_name ?? "Pool misterioso publicado"}
            </p>
            <Button className="w-full" variant="glow" disabled={busy} onClick={open}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Abrir misteriosa"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-dashed p-4 text-center">
              <strong className="block">Raspadinha misteriosa</strong>
              <span className="text-sm text-muted-foreground">Em breve</span>
            </div>
            <Button className="w-full" variant="outline" disabled>
              Em breve
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
