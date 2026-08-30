import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Dices, Loader2, Lock, Mail, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Raspadinha Online — Jogue e Troque Pontos por Prêmios" },
      {
        name: "description",
        content:
          "Entre, raspe cartelas digitais, ganhe prêmios em dinheiro e troque seus pontos por recompensas na loja de resgate.",
      },
      { property: "og:title", content: "Raspadinha Online — Jogue e Troque Pontos por Prêmios" },
      {
        property: "og:description",
        content: "Raspe cartelas digitais, ganhe prêmios e resgate recompensas com seus pontos.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // The form is rendered during SSR. Keep its controls disabled until React
    // owns the page so an early click/Enter cannot fall through to native GET /?.
    setHydrated(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  const handle = async (mode: "login" | "signup", e: React.FormEvent) => {
    e.preventDefault();
    if (!hydrated || loading) return;
    setLoading(true);
    const fn =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/app` },
          });
    const { data, error } = await fn;
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada! Confirme seu e-mail para entrar.");
      return;
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/app", replace: true });
  };

  const formDisabled = !hydrated || loading;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 lg:flex lg:items-center lg:justify-center lg:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(245,158,11,0.14),transparent_26%),linear-gradient(135deg,rgba(2,6,23,0.9),rgba(15,23,42,0.65))]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-card/60 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative min-h-[360px] overflow-hidden border-b border-white/10 p-6 sm:p-10 lg:min-h-[620px] lg:border-b-0 lg:border-r lg:p-14">
          <img
            src="/assets/scratch/ouro.webp"
            alt=""
            aria-hidden="true"
            className="absolute -left-24 top-0 size-[30rem] object-cover opacity-25 blur-[1px]"
          />
          <img
            src="/assets/scratch/diamante.webp"
            alt=""
            aria-hidden="true"
            className="absolute -bottom-32 -right-28 size-[30rem] object-cover opacity-30"
          />
          <div className="relative flex h-full max-w-lg flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.18em] text-primary">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                  <Dices className="size-5" />
                </span>
                Win Streak Games
              </div>
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                  <Sparkles className="size-3.5" /> EXPERIÊNCIA DE RECOMPENSAS
                </p>
                <h1 className="max-w-md text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
                  Sua próxima recompensa está aqui.
                </h1>
                <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Escolha sua raspadinha, revele o resultado e acompanhe suas conquistas em uma
                  experiência feita para jogar no celular.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Raspagem interativa", "Prêmios e pontos", "Loja de recompensas"].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-3 text-xs font-semibold"
                >
                  <Check className="size-4 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="p-5 sm:p-8 lg:flex lg:items-center lg:p-12">
          <div className="w-full space-y-6">
            <div className="space-y-2">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Trophy className="size-6" />
              </div>
              <h2 className="pt-2 text-3xl font-black tracking-tight">Entre e comece a jogar</h2>
              <p className="text-sm text-muted-foreground">
                Acesse sua conta ou crie seu perfil em poucos segundos.
              </p>
            </div>
            <Card className="border-white/10 bg-background/55 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Sua conta</CardTitle>
                <CardDescription>Use seu e-mail para entrar ou criar uma conta.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Entrar</TabsTrigger>
                    <TabsTrigger value="signup">Cadastrar</TabsTrigger>
                  </TabsList>
                  {(["login", "signup"] as const).map((mode) => (
                    <TabsContent key={mode} value={mode}>
                      <form
                        className="space-y-4 pt-2"
                        aria-busy={formDisabled}
                        onSubmit={(e) => handle(mode, e)}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`${mode}-email`}>E-mail</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id={`${mode}-email`}
                              type="email"
                              required
                              disabled={formDisabled}
                              className="h-12 rounded-xl pl-9"
                              placeholder="voce@email.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${mode}-password`}>Senha</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id={`${mode}-password`}
                              type="password"
                              required
                              minLength={6}
                              disabled={formDisabled}
                              className="h-12 rounded-xl pl-9"
                              placeholder="••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          type="submit"
                          variant="glow"
                          className="h-12 w-full rounded-xl text-base"
                          disabled={formDisabled}
                        >
                          {loading && <Loader2 className="size-4 animate-spin" />}
                          {mode === "login" ? "Entrar e jogar" : "Criar minha conta"}
                        </Button>
                      </form>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
