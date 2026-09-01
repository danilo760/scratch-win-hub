import { useEffect, useState } from "react";
import {
  ArrowRight,
  Dices,
  Gift,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  UserCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, useProfile } from "@/hooks/useProfile";
import { useSpecialScratchStatus } from "@/hooks/useSpecialScratchStatus";
import { scratchRarityPresentation, type ScratchRarity } from "@/components/ScratchCard";

type Props = { onNavigate: (tab: string) => void };

type HighlightCard = {
  id: string;
  title: string;
  price: number;
  rarity_name: string;
  rarity_slug: ScratchRarity;
};

type Popularity = { card_id: string; play_count: number };

const promoSlides = [
  {
    eyebrow: "COMECE AQUI",
    title: "Sua próxima raspadinha está a um toque.",
    description: "Escolha uma experiência, revele o resultado e acompanhe seus pontos.",
    action: "Ver raspadinhas",
    tab: "scratch",
    artworkUrl: "/assets/scratch/diamante.webp",
    artworkClass: "from-cyan-500/20 via-card to-card",
  },
  {
    eyebrow: "CORTESIA DIÁRIA",
    title: "Volte todo dia para uma nova chance.",
    description: "A raspadinha diária fica disponível uma vez por dia quando estiver publicada.",
    action: "Ver diária",
    tab: "daily",
    artworkUrl: "/assets/scratch/ouro.webp",
    artworkClass: "from-amber-500/20 via-card to-card",
  },
  {
    eyebrow: "EXPERIÊNCIA MISTERIOSA",
    title: "Uma revelação diferente espera por você.",
    description: "Abra a misteriosa quando houver um pool publicado.",
    action: "Explorar misteriosa",
    tab: "mystery",
    artworkUrl: "/assets/scratch/misteriosa.webp",
    artworkClass: "from-fuchsia-500/20 via-card to-card",
  },
] as const;

function isScratchRarity(value: unknown): value is ScratchRarity {
  return value === "bronze" || value === "prata" || value === "ouro" || value === "diamante";
}

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
      !isScratchRarity(raw.rarity_slug) ||
      !Number.isFinite(price)
    ) {
      return [];
    }
    return [
      {
        id: raw.id,
        title: raw.title,
        price,
        rarity_name: raw.rarity_name,
        rarity_slug: raw.rarity_slug,
      },
    ];
  });
}

function parsePopularity(value: unknown): Popularity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const count = typeof raw.play_count === "number" ? raw.play_count : Number(raw.play_count);
    return typeof raw.card_id === "string" && Number.isFinite(count) && count > 0
      ? [{ card_id: raw.card_id, play_count: count }]
      : [];
  });
}

export function HomeTab({ onNavigate }: Props) {
  const [activePromo, setActivePromo] = useState(0);
  const { data: profile } = useProfile();
  const {
    data: specialStatus,
    isLoading: specialLoading,
    isFetching: specialFetching,
    error: specialError,
    refetch: refetchSpecialStatus,
  } = useSpecialScratchStatus();
  const { data: cards = [] } = useQuery({
    queryKey: ["home-scratchcards"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_scratchcards_v1");
      if (error) throw error;
      return parseHighlightCards(data).slice(0, 4);
    },
  });
  const { data: popularity = [] } = useQuery({
    queryKey: ["scratchcard-popularity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scratchcard_popularity_v1" as never);
      if (error) throw error;
      return parsePopularity(data);
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

  const isAdmin = profile?.admin_role === "admin" || profile?.admin_role === "admin_master";
  const specialFailed = Boolean(specialError);
  const promo = promoSlides[activePromo] ?? promoSlides[0]!;
  const mostPlayedId = popularity[0]?.card_id;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePromo((current) => (current + 1) % promoSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const dailyDescription = specialLoading
    ? "Verificando a disponibilidade da cortesia diária…"
    : specialFailed
      ? "Não foi possível verificar a disponibilidade da cortesia diária."
      : specialStatus?.daily_claimed_today
        ? "Sua cortesia de hoje já foi utilizada. Você ainda pode consultar o resultado do dia."
        : specialStatus?.daily_available
          ? "Uma cortesia por dia, escolhida e validada diretamente no servidor."
          : "Configuração pendente. A cortesia diária ficará disponível quando for publicada.";

  const dailyButtonLabel = specialFailed
    ? specialFetching
      ? "Tentando novamente…"
      : "Tentar novamente"
    : specialStatus?.daily_claimed_today
      ? "Ver resultado de hoje"
      : specialStatus?.daily_available
        ? "Ver raspadinha diária"
        : "Em breve";

  const canOpenDaily =
    !specialLoading &&
    !specialFailed &&
    Boolean(specialStatus?.daily_available || specialStatus?.daily_claimed_today);

  const handleDailyAction = () => {
    if (specialFailed) {
      void refetchSpecialStatus();
      return;
    }
    onNavigate("daily");
  };

  const handleMysteryAction = () => {
    if (specialFailed) {
      void refetchSpecialStatus();
      return;
    }
    onNavigate("mystery");
  };

  return (
    <div className="space-y-6 pb-6">
      <Card
        className={`relative min-h-72 overflow-hidden border-primary/30 bg-gradient-to-br shadow-[0_18px_50px_rgba(16,185,129,0.12)] ${promo.artworkClass}`}
      >
        <img
          src={promo.artworkUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rotate-12 object-cover opacity-20 sm:-right-16 sm:-top-16 sm:size-80"
        />
        <CardContent className="relative flex items-center justify-between gap-4 p-5 sm:p-7">
          <div className="min-w-0 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              {promo.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{promo.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{promo.description}</p>
            <Button
              className="mt-5 h-10 rounded-xl"
              variant="glow"
              onClick={() => onNavigate(promo.tab)}
            >
              <Dices className="size-4" /> {promo.action}
            </Button>
            <div className="mt-5 flex gap-2" aria-label="Banners promocionais">
              {promoSlides.map((slide, index) => (
                <button
                  key={slide.eyebrow}
                  type="button"
                  aria-label={`Exibir banner ${index + 1}`}
                  aria-current={index === activePromo}
                  onClick={() => setActivePromo(index)}
                  className={`h-2 rounded-full transition-all ${index === activePromo ? "w-7 bg-primary" : "w-2 bg-muted-foreground/40"}`}
                />
              ))}
            </div>
          </div>
          <div className="hidden size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 sm:flex">
            <UserCircle className="size-8 text-primary" aria-hidden="true" />
          </div>
          <div className="absolute bottom-5 right-7 hidden rounded-xl border border-white/10 bg-background/50 px-4 py-2 text-right backdrop-blur sm:block">
            <p className="text-lg font-black">{profile?.points ?? 0} pontos</p>
            <p className="text-xs text-muted-foreground">
              Saldo {formatBRL(profile?.balance ?? 0)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card
        className={`relative overflow-hidden ${specialFailed ? "border-destructive/30" : "border-accent/40 bg-gradient-to-br from-amber-950/30 via-card to-card"}`}
      >
        <img
          src={scratchRarityPresentation.ouro.artworkUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-16 size-60 object-cover opacity-15"
        />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-accent" /> Raspadinha diária
          </CardTitle>
          <CardDescription>{dailyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-3">
          {specialFailed && (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Erro ao verificar disponibilidade
            </Badge>
          )}
          {!specialLoading && !specialFailed && specialStatus?.daily_claimed_today && (
            <Badge variant="secondary">Já utilizada hoje</Badge>
          )}
          {!specialLoading &&
            !specialFailed &&
            !specialStatus?.daily_claimed_today &&
            !specialStatus?.daily_configured && <Badge variant="secondary">Em breve</Badge>}
          <Button
            className="h-11 w-full rounded-xl"
            variant={specialFailed ? "outline" : "default"}
            disabled={specialFailed ? specialFetching : !canOpenDaily}
            onClick={handleDailyAction}
          >
            {dailyButtonLabel}
          </Button>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Sparkles className="size-5 text-accent" /> Destaques
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha a sua próxima chance de ganhar.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("scratch")}>
            Ver todas <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...cards]
            .sort((a, b) => Number(b.id === mostPlayedId) - Number(a.id === mostPlayedId))
            .map((card) => {
              const artworkUrl = scratchRarityPresentation[card.rarity_slug].artworkUrl;
              return (
                <Card
                  key={card.id}
                  className="group relative min-w-0 overflow-hidden border-white/10 transition-transform duration-300 hover:-translate-y-1"
                >
                  {artworkUrl && (
                    <img
                      src={artworkUrl}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 size-full object-cover opacity-35 transition-opacity duration-300 group-hover:opacity-50"
                    />
                  )}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/75 to-card/25"
                  />
                  <CardContent className="relative flex min-h-36 flex-col justify-end p-3 sm:min-h-40">
                    <div className="mb-auto flex flex-wrap gap-1">
                      <Badge variant="outline">{card.rarity_name}</Badge>
                      {card.id === mostPlayedId && (
                        <Badge variant="secondary">Mais escolhida</Badge>
                      )}
                    </div>
                    <strong className="mt-5 block truncate text-sm">{card.title}</strong>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">{formatBRL(card.price)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      <Card
        className={`relative overflow-hidden ${specialFailed ? "border-destructive/30" : "border-fuchsia-400/30 bg-gradient-to-br from-violet-950/35 via-card to-card"}`}
      >
        <img
          src={scratchRarityPresentation.misteriosa.artworkUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-12 size-56 object-cover opacity-20"
        />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" /> Raspadinha misteriosa
          </CardTitle>
          <CardDescription>
            {specialLoading
              ? "Verificando o pool misterioso publicado…"
              : specialFailed
                ? "Não foi possível verificar a disponibilidade da raspadinha misteriosa."
                : specialStatus?.mystery_available
                  ? "O pool publicado seleciona a experiência antes da revelação."
                  : "Nenhum pool misterioso está publicado no momento."}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-3">
          {specialFailed ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Erro ao verificar disponibilidade
            </Badge>
          ) : (
            !specialLoading &&
            !specialStatus?.mystery_available && <Badge variant="secondary">Em breve</Badge>
          )}
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl"
            disabled={
              specialFailed ? specialFetching : specialLoading || !specialStatus?.mystery_available
            }
            onClick={handleMysteryAction}
          >
            {specialFailed
              ? specialFetching
                ? "Tentando novamente…"
                : "Tentar novamente"
              : specialStatus?.mystery_available
                ? "Abrir misteriosa"
                : "Em breve"}
          </Button>
        </CardContent>
      </Card>

      <div className={`grid gap-3 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {isAdmin && (
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <ShieldCheck className="size-5 text-primary" />
              <strong className="mt-2 block">Painel administrativo</strong>
              <Button variant="link" className="h-auto px-0" onClick={() => onNavigate("admin")}>
                Abrir painel
              </Button>
            </CardContent>
          </Card>
        )}
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
