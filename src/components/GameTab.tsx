import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, Ticket, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScratchCard } from "@/components/ScratchCard";
import { formatBRL, profileQueryKey, useProfileUpdater } from "@/hooks/useProfile";

type ResultType = "none" | "points" | "credits" | "combined";

type PlayResult = {
  id: string;
  prize: number;
  new_balance: number;
  new_points: number;
  points_earned: number;
  math_version_id: string;
  result_type: ResultType;
  idempotent: boolean;
};

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePlayResult(value: unknown): PlayResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const prize = readFiniteNumber(raw.prize);
  const newBalance = readFiniteNumber(raw.new_balance);
  const newPoints = readFiniteNumber(raw.new_points);
  const pointsEarned = readFiniteNumber(raw.points_earned);
  const resultType = raw.result_type;

  if (
    typeof raw.id !== "string" ||
    typeof raw.math_version_id !== "string" ||
    prize === null ||
    newBalance === null ||
    newPoints === null ||
    pointsEarned === null ||
    !["none", "points", "credits", "combined"].includes(String(resultType))
  ) {
    return null;
  }

  return {
    id: raw.id,
    prize,
    new_balance: newBalance,
    new_points: newPoints,
    points_earned: pointsEarned,
    math_version_id: raw.math_version_id,
    result_type: resultType as ResultType,
    idempotent: raw.idempotent === true,
  };
}

export function GameTab() {
  const qc = useQueryClient();
  const updateProfile = useProfileUpdater();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [result, setResult] = useState<(PlayResult & { title: string }) | null>(null);
  const pendingRequestIds = useRef(new Map<string, string>());

  const { data: cards, isLoading } = useQuery({
    queryKey: ["scratchcards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scratchcards")
        .select("id, title, price, points_reward")
        .eq("active", true)
        .order("price");
      if (error) throw error;
      return data;
    },
  });

  const play = async (id: string, title: string) => {
    setPlayingId(id);
    const requestId = pendingRequestIds.current.get(id) ?? crypto.randomUUID();
    pendingRequestIds.current.set(id, requestId);
    const { data, error } = await supabase.rpc(
      "play_scratchcard_v1" as never,
      {
        p_card_id: id,
        p_client_request_id: requestId,
        p_source: "web",
      } as never,
    );
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
            <Sparkles className="size-5 text-accent" /> {result.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScratchCard
            prize={result.prize}
            pointsEarned={result.points_earned}
            onReset={() => setResult(null)}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!cards?.length) {
    return (
      <p className="py-16 text-center text-muted-foreground">Nenhuma raspadinha disponível.</p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.id} className="group relative overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="size-5 text-accent" />
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-success">
                {formatBRL(Number(card.price))}
              </span>
              <Badge variant="secondary" className="gap-1">
                <Coins className="size-3.5 text-accent" />+{card.points_reward} pts
              </Badge>
            </div>
            <Button
              variant="glow"
              className="w-full"
              disabled={playingId === card.id}
              onClick={() => play(card.id, card.title)}
            >
              {playingId === card.id ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Comprando...
                </>
              ) : (
                "Comprar e Jogar"
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
