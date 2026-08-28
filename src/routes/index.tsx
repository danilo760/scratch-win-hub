import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Dices, Loader2, Mail, Lock, Sparkles } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary shadow-glow">
            <Dices className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Raspadinha Online</h1>
          <p className="text-sm text-muted-foreground">
            Raspe, ganhe prêmios e troque pontos por recompensas.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" /> Acesse sua conta
            </CardTitle>
            <CardDescription>Novos jogadores ganham R$ 10,00 de bônus.</CardDescription>
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
                          className="pl-9"
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
                          className="pl-9"
                          placeholder="••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button type="submit" variant="glow" className="w-full" disabled={formDisabled}>
                      {loading && <Loader2 className="size-4 animate-spin" />}
                      {mode === "login" ? "Entrar" : "Criar conta"}
                    </Button>
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
