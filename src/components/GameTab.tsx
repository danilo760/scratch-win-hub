import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Loader2, Ticket, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScratchCard } from "@/components/ScratchCard";
import { formatBRL, useProfileUpdater } from "@/hooks/useProfile";

type PlayResult = {
  prize: number;
  new_balance: number;
  new_points: number;
  points_earned: number;
};

export function GameTab() {
  const updateProfile = useProfileUpdater();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [result, setResult] = useState<(PlayResult & { title: string }) | null>(null);

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
    const { data, error } = await supabase.rpc("play_scratchcard", { card_id: id });
    setPlayingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as unknown as PlayResult;
    updateProfile({ balance: Number(res.new_balance), points: Number(res.new_points) });
    setResult({ ...res, prize: Number(res.prize), title });
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
            pointsEarned={Number(result.points_earned)}
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
    return <p className="py-16 text-center text-muted-foreground">Nenhuma raspadinha disponível.</p>;
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
              <span className="text-2xl font-black text-success">{formatBRL(Number(card.price))}</span>
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
