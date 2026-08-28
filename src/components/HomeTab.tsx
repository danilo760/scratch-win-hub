import { Gift, Sparkles, Store, Trophy, UserCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";

type Props = { onNavigate: (tab: string) => void };

export function HomeTab({ onNavigate }: Props) {
  const { data: profile } = useProfile();
  const { data: cards = [] } = useQuery({
    queryKey: ["home-scratchcards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scratchcards")
        .select("id,title,price,points_reward")
        .eq("active", true)
        .order("price")
        .limit(4);
      if (error) throw error;
      return data;
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
              Saldo {profile?.balance ?? 0} · Nível e XP no seu perfil
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
          <CardDescription>Uma cortesia por dia, validada diretamente no servidor.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => onNavigate("daily")}>
            Ver raspadinha diária
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
                <Badge className="mt-2" variant="secondary">
                  {card.points_reward} pts
                </Badge>
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
          <CardDescription>Descubra sua raridade antes de iniciar a experiência.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => onNavigate("mystery")}>
            Abrir misteriosa
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
