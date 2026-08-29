import { Gift, Sparkles, Store, Trophy, UserCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, useProfile } from "@/hooks/useProfile";
import { useSpecialScratchStatus } from "@/hooks/useSpecialScratchStatus";

type Props = { onNavigate: (tab: string) => void };

type HighlightCard = {
  id: string;
  title: string;
  price: number;
  rarity_name: string;
};

function parseHighlightCards(value: unknown): HighlightCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const price = typeof raw.price === "number" ? raw.price : Number(raw.price);
    if (
      typeof raw.id !== "string" ||
      typeof raw.title !== "string" ||
      typeof raw.rarity_name !== "string" ||
      !Number.isFinite(price)
    ) {
      return [];
    }
    return [{ id: raw.id, title: raw.title, price, rarity_name: raw.rarity_name }];
  });
}

export function HomeTab({ onNavigate }: Props) {
  const { data: profile } = useProfile();
  const { data: specialStatus, isLoading: specialLoading } = useSpecialScratchStatus();
  const { data: cards = [] } = useQuery({
    queryKey: ["home-scratchcards"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_scratchcards_v1");
      if (error) throw error;
      return parseHighlightCards(data).slice(0, 4);
    },
  });
  const { data: achievements = [] } = useQuery({
    queryKey: ["home-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_achievements").select("id");
      if (error) throw error;
      return data;
    },
  });

  const dailyDescription = specialStatus?.daily_claimed_today
    ? "Sua cortesia de hoje já foi utilizada. Você ainda pode consultar o resultado do dia."
    : specialStatus?.daily_available
      ? "Uma cortesia por dia, escolhida e validada diretamente no servidor."
      : "Configuração pendente. A cortesia diária ficará disponível quando for publicada.";

  const dailyButtonLabel = specialStatus?.daily_claimed_today
    ? "Ver resultado de hoje"
    : specialStatus?.daily_available
      ? "Ver raspadinha diária"
      : "Em breve";

  const canOpenDaily =
    !specialLoading &&
    Boolean(specialStatus?.daily_available || specialStatus?.daily_claimed_today);

  return (
    <div className="space-y-6 pb-6">
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-card to-primary/10">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">
              Olá, {profile?.email?.split("@")[0] ?? "jogador"}
            </p>
            <h1 className="mt-1 text-2xl font-black">{profile?.points ?? 0} pontos</h1>
            <p className="text-xs text-muted-foreground">
              Saldo {formatBRL(profile?.balance ?? 0)} · Nível e XP no seu perfil
            </p>
          </div>
          <UserCircle className="size-12 text-primary" aria-hidden="true" />
        </CardContent>
      </Card>

      <Card className="border-accent/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-accent" /> Raspadinha diária
          </CardTitle>
          <CardDescription>{dailyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!specialLoading && specialStatus?.daily_claimed_today && (
            <Badge variant="secondary">Já utilizada hoje</Badge>
          )}
          {!specialLoading &&
            !specialStatus?.daily_claimed_today &&
            !specialStatus?.daily_configured && <Badge variant="secondary">Em breve</Badge>}
          <Button className="w-full" disabled={!canOpenDaily} onClick={() => onNavigate("daily")}>
            {dailyButtonLabel}
          </Button>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black">
            <Sparkles className="size-5 text-accent" /> Destaques
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("scratch")}>
            Ver todas
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.id} className="min-w-0">
              <CardContent className="p-3">
                <strong className="block truncate text-sm">{card.title}</strong>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary">{formatBRL(card.price)}</Badge>
                  <Badge variant="outline">{card.rarity_name}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" /> Raspadinha misteriosa
          </CardTitle>
          <CardDescription>
            {specialStatus?.mystery_available
              ? "O pool publicado seleciona a experiência antes da revelação."
              : "Nenhum pool misterioso está publicado no momento."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!specialLoading && !specialStatus?.mystery_available && (
            <Badge variant="secondary">Em breve</Badge>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={specialLoading || !specialStatus?.mystery_available}
            onClick={() => onNavigate("mystery")}
          >
            {specialStatus?.mystery_available ? "Abrir misteriosa" : "Em breve"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <Trophy className="size-5 text-accent" />
            <strong className="mt-2 block">{achievements.length} conquistas</strong>
            <Button variant="link" className="h-auto px-0" onClick={() => onNavigate("profile")}>
              Ver perfil
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Store className="size-5 text-primary" />
            <strong className="mt-2 block">Loja de resgate</strong>
            <Button variant="link" className="h-auto px-0" onClick={() => onNavigate("store")}>
              Abrir loja
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Sparkles className="size-5 text-success" />
            <strong className="mt-2 block">Transparência</strong>
            <a className="text-sm text-primary underline" href="/transparencia">
              Como funciona
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
