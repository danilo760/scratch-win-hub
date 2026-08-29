import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import {
  Coins,
  Dices,
  LogOut,
  Wallet,
  Trophy,
  Settings,
  Loader2,
  UserCircle,
  ShoppingBag,
  Gift,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL, useProfile } from "@/hooks/useProfile";
import { HomeTab } from "@/components/HomeTab";
import { GameTab } from "@/components/GameTab";
import { DailyScratchPanel, MysteryScratchPanel } from "@/components/SpecialScratchPanels";
import { RealtimeSyncBadge } from "@/components/RealtimeSyncBadge";

const StoreTab = lazy(async () => ({ default: (await import("@/components/StoreTab")).StoreTab }));
const AdminPanel = lazy(async () => ({
  default: (await import("@/components/AdminPanel")).AdminPanel,
}));

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Raspadinha Online" },
      {
        name: "description",
        content: "Jogue raspadinhas, acompanhe seu saldo e resgate prêmios com pontos.",
      },
      { property: "og:title", content: "Meu Painel — Raspadinha Online" },
      {
        property: "og:description",
        content: "Jogue raspadinhas e resgate prêmios com seus pontos.",
      },
    ],
  }),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Página não encontrada.</div>,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [tab, setTab] = useState("home");

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary shadow-glow">
              <Dices className="size-5 text-primary-foreground" />
            </div>
            <span className="hidden text-sm font-semibold sm:block">{profile?.email}</span>
            <RealtimeSyncBadge userId={profile?.id} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold">
              <Wallet className="size-4 text-success" />
              <span data-testid="header-balance" className="text-success">
                {formatBRL(profile?.balance ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold">
              <Coins className="size-4 text-accent" />
              <span data-testid="header-points" className="text-accent">
                {profile?.points ?? 0}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            <TabsTrigger value="home" className="shrink-0 gap-1.5">
              <Trophy className="size-4" /> Início
            </TabsTrigger>
            <TabsTrigger value="scratch" className="shrink-0 gap-1.5">
              <Sparkles className="size-4" /> Raspadinhas
            </TabsTrigger>
            <TabsTrigger value="store" className="shrink-0 gap-1.5">
              <ShoppingBag className="size-4" /> Loja
            </TabsTrigger>
            <TabsTrigger value="rewards" className="shrink-0 gap-1.5">
              <Gift className="size-4" /> Prêmios
            </TabsTrigger>
            <TabsTrigger value="profile" className="shrink-0 gap-1.5">
              <UserCircle className="size-4" /> Perfil
            </TabsTrigger>
            {profile?.is_admin && (
              <TabsTrigger value="admin" className="shrink-0 gap-1.5">
                <Settings className="size-4" /> Admin
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="home" className="pt-6">
            <HomeTab onNavigate={setTab} />
          </TabsContent>

          <TabsContent value="scratch" className="pt-6">
            <div className="mb-6">
              <h1 className="text-3xl font-black">Raspadinhas</h1>
              <p className="text-muted-foreground">
                Escolha uma raspadinha disponível e revele o resultado definido pelo servidor.
              </p>
            </div>
            <GameTab />
          </TabsContent>

          <TabsContent value="daily" className="pt-6">
            <DailyScratchPanel />
          </TabsContent>

          <TabsContent value="mystery" className="pt-6">
            <MysteryScratchPanel />
          </TabsContent>

          <TabsContent value="store" className="pt-6">
            <Suspense fallback={<Loader2 className="animate-spin" />}>
              <StoreTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="rewards" className="pt-6">
            <MyRewards onOpenStore={() => setTab("store")} />
          </TabsContent>

          <TabsContent value="profile" className="pt-6">
            <ProfilePreferences />
          </TabsContent>

          {profile?.is_admin && (
            <TabsContent value="admin" className="pt-6">
              <Suspense
                fallback={
                  <Loader2 className="animate-spin" aria-label="Carregando administração" />
                }
              >
                <AdminPanel />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

type MyReward = {
  id: string;
  points_spent: number;
  status: string;
  protocol: string | null;
  fulfillment_code: string | null;
  created_at: string;
  item_title_snapshot: string;
  item_image_url_snapshot: string | null;
};

function parseMyRewards(value: unknown): MyReward[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const points =
      typeof raw.points_spent === "number" ? raw.points_spent : Number(raw.points_spent);
    if (
      typeof raw.id !== "string" ||
      typeof raw.status !== "string" ||
      typeof raw.created_at !== "string" ||
      typeof raw.item_title_snapshot !== "string" ||
      !Number.isFinite(points)
    ) {
      return [];
    }
    return [
      {
        id: raw.id,
        points_spent: points,
        status: raw.status,
        protocol: typeof raw.protocol === "string" ? raw.protocol : null,
        fulfillment_code: typeof raw.fulfillment_code === "string" ? raw.fulfillment_code : null,
        created_at: raw.created_at,
        item_title_snapshot: raw.item_title_snapshot,
        item_image_url_snapshot:
          typeof raw.item_image_url_snapshot === "string" ? raw.item_image_url_snapshot : null,
      },
    ];
  });
}

function MyRewards({ onOpenStore }: { onOpenStore: () => void }) {
  const {
    data,
    isLoading,
    error: rewardsError,
  } = useQuery({
    queryKey: ["my-rewards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("redemptions")
        .select(
          "id, points_spent, status, protocol, fulfillment_code, created_at, item_title_snapshot, item_image_url_snapshot",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return parseMyRewards(data);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center" aria-label="Carregando prêmios">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }
  if (rewardsError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-12 text-center text-destructive">
          <p role="alert">Não foi possível carregar seus prêmios.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meus Prêmios</CardTitle>
        <CardDescription>Solicitações, protocolos e andamento das entregas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.length ? (
          data.map((reward) => (
            <div key={reward.id} className="flex items-center gap-3 rounded-lg border p-3">
              {reward.item_image_url_snapshot && (
                <img
                  src={reward.item_image_url_snapshot}
                  alt=""
                  className="size-12 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <strong className="block truncate">{reward.item_title_snapshot}</strong>
                <span className="text-xs text-muted-foreground">
                  {new Date(reward.created_at).toLocaleDateString("pt-BR")} · {reward.points_spent}{" "}
                  pts · {reward.protocol ?? "Protocolo pendente"}
                </span>
              </div>
              <div className="text-right text-sm">
                <strong>{reward.status}</strong>
                {reward.fulfillment_code && (
                  <span className="block text-xs text-muted-foreground">
                    {reward.fulfillment_code}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-secondary/30 px-6 py-10 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Gift className="size-6" aria-hidden="true" />
            </div>
            <h2 className="font-bold">Seus próximos prêmios aparecem aqui</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Troque seus pontos na Loja e acompanhe o protocolo e a entrega em um só lugar.
            </p>
            <Button className="mt-5" onClick={onOpenStore}>
              <ShoppingBag className="size-4" /> Ver Loja
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ProfilePreferencesForm = {
  display_name: string;
  public_slug: string;
  avatar_url: string | null;
  profile_public: boolean;
  show_achievements: boolean;
  show_statistics: boolean;
};

function ProfilePreferences() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-preferences"],
    queryFn: async (): Promise<ProfilePreferencesForm> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão inválida");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, public_slug, avatar_url, profile_public, show_achievements, show_statistics",
        )
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<ProfilePreferencesForm | null>(null);
  const value = form ?? profile;

  if (isLoading || !value) return <Loader2 className="animate-spin" />;

  const update = <K extends keyof ProfilePreferencesForm>(
    key: K,
    next: ProfilePreferencesForm[K],
  ) => {
    setForm({ ...value, [key]: next });
  };

  const save = async () => {
    const { error } = await supabase.rpc("update_profile_preferences", {
      p_display_name: value.display_name,
      p_public_slug: value.public_slug,
      p_avatar_url: value.avatar_url ?? "",
      p_profile_public: value.profile_public,
      p_show_achievements: value.show_achievements,
      p_show_statistics: value.show_statistics,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Preferências salvas");
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["profile-preferences"] });
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Perfil público</CardTitle>
        <CardDescription>Controle o que outras pessoas podem ver no seu perfil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Nome público</Label>
          <Input
            value={value.display_name}
            onChange={(e) => update("display_name", e.target.value)}
          />
        </div>
        <div>
          <Label>Link público</Label>
          <Input
            value={value.public_slug}
            onChange={(e) => update("public_slug", e.target.value.toLowerCase())}
          />
          <p className="mt-1 text-xs text-muted-foreground">/u/{value.public_slug}</p>
        </div>
        <div>
          <Label>Avatar (URL opcional)</Label>
          <Input
            value={value.avatar_url ?? ""}
            onChange={(e) => update("avatar_url", e.target.value || null)}
          />
        </div>
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Label>Perfil público</Label>
            <Switch
              checked={value.profile_public}
              onCheckedChange={(next) => update("profile_public", next)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Mostrar conquistas</Label>
            <Switch
              checked={value.show_achievements}
              onCheckedChange={(next) => update("show_achievements", next)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Mostrar estatísticas</Label>
            <Switch
              checked={value.show_statistics}
              onCheckedChange={(next) => update("show_statistics", next)}
            />
          </div>
        </div>
        <Button onClick={save}>Salvar perfil</Button>
      </CardContent>
    </Card>
  );
}
