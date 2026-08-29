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

type MysteryOpening = {
  mathVersionId: string;
};

type MysteryReveal = {
  prize: number;
  pointsEarned: number;
  rarity: ScratchRarity;
  cardTitle: string;
  mathVersionId: string;
  idempotent: boolean;
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

function parseMysteryOpening(value: unknown): MysteryOpening | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const mathVersionId = raw["math_version_id"];
  if (typeof mathVersionId !== "string" || !mathVersionId) return null;
  return { mathVersionId };
}

function parseMysteryReveal(value: unknown): MysteryReveal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const prize = finiteNumber(raw["prize"]);
  const pointsEarned = finiteNumber(raw["points_earned"]);
  const rarity = parseScratchRarity(raw["rarity_slug"]);
  const cardTitle = raw["card_title"];
  const mathVersionId = raw["math_version_id"];
  if (
    prize === null ||
    pointsEarned === null ||
    !rarity ||
    typeof cardTitle !== "string" ||
    !cardTitle ||
    typeof mathVersionId !== "string" ||
    !mathVersionId
  ) {
    return null;
  }
  return {
    prize,
    pointsEarned,
    rarity,
    cardTitle,
    mathVersionId,
    idempotent: raw["idempotent"] === true,
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
          Uma cortesia por dia. O resultado é definido e persistido no servidor antes da revelação
          visual.
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
  const qc = useQueryClient();
  const { data: status, isLoading } = useSpecialScratchStatus();
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<MysteryReveal | null>(null);
  const pendingRequestId = useRef<string | null>(null);

  const open = async () => {
    if (!status?.mystery_available || busy) return;
    setBusy(true);
    pendingRequestId.current ??= crypto.randomUUID();
    const requestId = pendingRequestId.current;

    const { data: openingData, error: openingError } = await supabase.rpc(
      "open_mystery_scratch_v1",
      { p_client_request_id: requestId },
    );

    if (openingError) {
      setBusy(false);
      toast.error(openingError.message);
      return;
    }

    const opening = parseMysteryOpening(openingData);
    if (!opening) {
      setBusy(false);
      toast.error("O servidor retornou uma seleção misteriosa inválida. Tente novamente.");
      return;
    }

    // The database migration adds play_mystery_scratch_v1 with the same UUID -> JSON
    // contract as open_mystery_scratch_v1. Keep the assertion only until generated
    // Supabase types are regenerated from the migrated database.
    const { data, error } = await supabase.rpc(
      "play_mystery_scratch_v1" as "open_mystery_scratch_v1",
      { p_client_request_id: requestId },
    );
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const parsed = parseMysteryReveal(data);
    if (!parsed) {
      toast.error("O servidor retornou um resultado misterioso inválido. Tente novamente.");
      return;
    }

    if (parsed.mathVersionId !== opening.mathVersionId) {
      toast.error("A versão matemática da Misteriosa não corresponde à seleção persistida.");
      return;
    }

    pendingRequestId.current = null;
    setReveal(parsed);
    await Promise.all([
      qc.invalidateQueries({ queryKey: profileQueryKey }),
      qc.invalidateQueries({ queryKey: specialScratchStatusQueryKey }),
    ]);
    toast.success(
      parsed.idempotent
        ? "Resultado misterioso recuperado com segurança."
        : "Misteriosa registrada. Raspe para revelar o resultado.",
    );
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> Raspadinha misteriosa
        </CardTitle>
        <CardDescription>
          O pool publicado escolhe e persiste a experiência antes da revelação. A jogada usa
          exatamente a versão matemática selecionada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reveal ? (
          <div className="space-y-3">
            <p className="text-center text-sm font-medium">{reveal.cardTitle}</p>
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
