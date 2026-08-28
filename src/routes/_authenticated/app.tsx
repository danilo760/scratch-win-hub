import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Dices, LogOut, Wallet, Gamepad2, ShoppingBag, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameTab } from "@/components/GameTab";
import { StoreTab } from "@/components/StoreTab";
import { AdminTab } from "@/components/AdminTab";
import { formatBRL, useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Raspadinha Online" },
      { name: "description", content: "Jogue raspadinhas, acompanhe seu saldo e resgate prêmios com pontos." },
      { property: "og:title", content: "Meu Painel — Raspadinha Online" },
      { property: "og:description", content: "Jogue raspadinhas e resgate prêmios com seus pontos." },
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
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold">
              <Wallet className="size-4 text-success" />
              <span className="text-success">{formatBRL(profile?.balance ?? 0)}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold">
              <Coins className="size-4 text-accent" />
              <span className="text-accent">{profile?.points ?? 0}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="play">
          <TabsList className="w-full">
            <TabsTrigger value="play" className="flex-1 gap-1.5">
              <Gamepad2 className="size-4" /> Jogar
            </TabsTrigger>
            <TabsTrigger value="store" className="flex-1 gap-1.5">
              <ShoppingBag className="size-4" /> Loja
            </TabsTrigger>
            {profile?.is_admin && (
              <TabsTrigger value="admin" className="flex-1 gap-1.5">
                <Settings className="size-4" /> Admin
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="play" className="pt-6">
            <GameTab />
          </TabsContent>
          <TabsContent value="store" className="pt-6">
            <StoreTab />
          </TabsContent>
          {profile?.is_admin && (
            <TabsContent value="admin" className="pt-6">
              <AdminTab />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
