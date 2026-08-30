import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Sparkles, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ScratchCard,
  scratchRarityPresentation,
  type ScratchRarity,
} from "@/components/ScratchCard";
import { MysteryScratchPanel } from "@/components/SpecialScratchPanels";
import { formatBRL, profileQueryKey, useProfileUpdater } from "@/hooks/useProfile";

type ResultType = "none" | "points" | "credits" | "combined";

type ActiveCard = {
  id: string;
  title: string;
  price: number;
  math_version_id: string;
  rarity_slug: ScratchRarity;
  rarity_name: string;
};

type PlayResult = {
  id: string;
  prize: number;
  new_balance: number;
  new_points: number;
  points_earned: number;
  math_version_id: string;
  rarity_slug: ScratchRarity;
  result_type: ResultType;
  idempotent: boolean;
};

const raritySlugs = ["bronze", "prata", "ouro", "diamante"] as const;

function isScratchRarity(value: unknown): value is ScratchRarity {
  return typeof value === "string" && (raritySlugs as readonly string[]).includes(value);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseActiveCards(value: unknown): ActiveCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const price = readFiniteNumber(raw["price"]);
    if (
      typeof raw["id"] !== "string" ||
      typeof raw["title"] !== "string" ||
      typeof raw["math_version_id"] !== "string" ||
      typeof raw["rarity_name"] !== "string" ||
      price === null ||
      !isScratchRarity(raw["rarity_slug"])
    ) {
      return [];
    }
    return [
      {
        id: raw["id"],
        title: raw["title"],
        price,
        math_version_id: raw["math_version_id"],
        rarity_slug: raw["rarity_slug"],
        rarity_name: raw["rarity_name"],
      },
    ];
  });
}

function parsePlayResult(value: unknown): PlayResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const prize = readFiniteNumber(raw["prize"]);
  const newBalance = readFiniteNumber(raw["new_balance"]);
  const newPoints = readFiniteNumber(raw["new_points"]);
  const pointsEarned = readFiniteNumber(raw["points_earned"]);
  const resultType = raw["result_type"];

  if (
    typeof raw["id"] !== "string" ||
    typeof raw["math_version_id"] !== "string" ||
    prize === null ||
    newBalance === null ||
    newPoints === null ||
    pointsEarned === null ||
    !isScratchRarity(raw["rarity_slug"]) ||
    !["none", "points", "credits", "combined"].includes(String(resultType))
  ) {
    return null;
  }

  return {
    id: raw["id"],
    prize,
    new_balance: newBalance,
    new_points: newPoints,
    points_earned: pointsEarned,
    math_version_id: raw["math_version_id"],
    rarity_slug: raw["rarity_slug"],
    result_type: resultType as ResultType,
    idempotent: raw["idempotent"] === true,
  };
}

export function GameTab() {
  const qc = useQueryClient();
  const updateProfile = useProfileUpdater();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [result, setResult] = useState<(PlayResult & { title: string }) | null>(null);
  const pendingRequestIds = useRef(new Map<string, string>());

  const {
    data: cards = [],
    isLoading,
    error: cardsError,
    refetch: refetchCards,
  } = useQuery({
    queryKey: ["active-scratchcards"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_scratchcards_v1");
      if (error) throw error;
      return parseActiveCards(data);
    },
  });

  const play = async (id: string, title: string) => {
    setPlayingId(id);
    const requestId = pendingRequestIds.current.get(id) ?? crypto.randomUUID();
    pendingRequestIds.current.set(id, requestId);
    const { data, error } = await supabase.rpc("play_scratchcard_v1", {
      p_card_id: id,
      p_client_request_id: requestId,
      p_source: "web",
    });
    setPlayingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    const res = parsePlayResult(data);
    if (!res) {
      toast.error("O servidor retornou uma resposta de jogada inválida. Tente novamente.");
      return;
    }

    pendingRequestIds.current.delete(id);
    updateProfile({ balance: res.new_balance, points: res.new_points });
    await qc.invalidateQueries({ queryKey: profileQueryKey });
    setResult({ ...res, title });
  };

  if (result) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Sparkles
              className={`size-5 ${scratchRarityPresentation[result.rarity_slug].iconClass}`}
            />{" "}
            {result.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScratchCard
            prize={result.prize}
            pointsEarned={result.points_earned}
            rarity={result.rarity_slug}
            onReset={() => setResult(null)}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <span>Carregando raspadinhas disponíveis…</span>
        </CardContent>
      </Card>
    );
  }

  if (cardsError) {
    return (
      <div className="space-y-6">
        <MysteryScratchPanel />
        <Card className="border-destructive/30">
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <strong className="block">Não foi possível carregar as raspadinhas.</strong>
              <p role="alert" className="text-sm text-muted-foreground">
                O catálogo não foi tratado como vazio porque a consulta falhou. Tente novamente.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetchCards()}>
              <RefreshCw className="size-4" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="space-y-6">
        <MysteryScratchPanel />
        <Card>
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
            <Ticket className="size-8 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <strong className="block">Nenhuma raspadinha disponível agora.</strong>
              <p className="max-w-md text-sm text-muted-foreground">
                Não há raspadinhas ativas com matemática publicada neste momento.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MysteryScratchPanel />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const theme = scratchRarityPresentation[card.rarity_slug];
          return (
            <Card
              key={card.id}
              data-testid={`scratch-option-${card.rarity_slug}`}
              data-rarity={card.rarity_slug}
              className={`group relative overflow-hidden ${theme.optionClass}`}
            >
              {theme.artworkUrl && (
                <img
                  src={theme.artworkUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 size-full object-cover opacity-20 transition-opacity duration-300 group-hover:opacity-30"
                />
              )}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-card/70" />
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.surface}`}
              />
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Ticket className={`size-5 ${theme.iconClass}`} />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-2xl font-black text-success">{formatBRL(card.price)}</span>
                  <Badge variant="secondary" className={`capitalize ${theme.badgeClass}`}>
                    {card.rarity_name}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Resultado calculado pela versão matemática publicada antes da revelação.
                </p>
                <Button
                  variant="glow"
                  className="w-full"
                  disabled={playingId === card.id}
                  onClick={() => play(card.id, card.title)}
                >
                  {playingId === card.id ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Processando...
                    </>
                  ) : (
                    "Comprar e Jogar"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
