/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Coins,
  Dices,
  LogOut,
  Wallet,
  Trophy,
  Ticket,
  Settings,
  Loader2,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL, useProfile } from "@/hooks/useProfile";

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
  const [quantity, setQuantity] = useState<Record<string, number>>({});
  const { data: raffles, isLoading } = useQuery({
    queryKey: ["raffles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raffles")
        .select("*, raffle_tickets(count)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const buy = async (raffle: any) => {
    const count = quantity[raffle.id] || 1;
    const { error } = await supabase.rpc("buy_raffle_tickets", {
      p_raffle_id: raffle.id,
      p_quantity: count,
    });
    if (error) toast.error("Não foi possível comprar: " + error.message);
    else {
      toast.success("Bilhetes reservados com sucesso!");
      qc.invalidateQueries({ queryKey: ["raffles"] });
    }
  };

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
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="home" className="flex-1 gap-1.5">
              <Trophy className="size-4" /> Sorteios
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex-1 gap-1.5">
              <Ticket className="size-4" /> Meus bilhetes
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex-1 gap-1.5">
              <Wallet className="size-4" /> Carteira
            </TabsTrigger>
            {profile?.is_admin && (
              <TabsTrigger value="admin" className="flex-1 gap-1.5">
                <Settings className="size-4" /> Admin
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="home" className="pt-6">
            <div className="mb-6">
              <h1 className="text-3xl font-black">Escolha seu próximo prêmio</h1>
              <p className="text-muted-foreground">
                Bilhetes digitais, sorteios transparentes e muita sorte.
              </p>
            </div>
            {isLoading ? (
              <Loader2 className="mx-auto animate-spin" />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {raffles?.map((r: any) => (
                  <Card key={r.id} className="overflow-hidden">
                    <img src={r.image_url} className="h-48 w-full object-cover" />
                    <CardHeader>
                      <CardTitle>{r.title}</CardTitle>
                      <CardDescription>{r.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span>R$ {r.ticket_price / 100} por bilhete</span>
                        <span>{r.total_tickets} bilhetes</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, ((r.raffle_tickets?.[0]?.count || 0) / r.total_tickets) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={quantity[r.id] || 1}
                          onChange={(e) =>
                            setQuantity({ ...quantity, [r.id]: Number(e.target.value) })
                          }
                        />
                        <Button className="flex-1" onClick={() => buy(r)}>
                          <Ticket className="size-4" /> Comprar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="tickets" className="pt-6">
            <Card>
              <CardHeader>
                <CardTitle>Meus bilhetes</CardTitle>
                <CardDescription>Acompanhe suas participações e resultados.</CardDescription>
              </CardHeader>
              <CardContent>
                <TicketList />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="wallet" className="pt-6">
            <WalletPanel />
          </TabsContent>
          {profile?.is_admin && (
            <TabsContent value="admin" className="pt-6">
              <AdminPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function TicketList() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("raffle_tickets")
        .select("ticket_number, purchased_at, raffles(title, status, winner_ticket)")
        .eq("user_id", user.user?.id)
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <Loader2 className="animate-spin" />;
  return (
    <div className="space-y-3">
      {data?.length ? (
        data.map((t: any) => (
          <div
            key={`${t.ticket_number}-${t.purchased_at}`}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <span>
              {t.raffles?.title} · Bilhete #{t.ticket_number}
            </span>
            <span className="text-sm text-muted-foreground">
              {t.raffles?.status === "drawn"
                ? t.raffles.winner_ticket === t.ticket_number
                  ? "Vencedor!"
                  : "Encerrado"
                : "Participando"}
            </span>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">Você ainda não possui bilhetes.</p>
      )}
    </div>
  );
}

function WalletPanel() {
  const [amount, setAmount] = useState(100);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("credit_transactions").insert({
      user_id: user.user?.id,
      amount,
      type: "pix_pending",
      status: "pending",
      pix_key: "21988744783",
    });
    if (error) toast.error(error.message);
    else {
      setSent(true);
      toast.success("Solicitação enviada para aprovação");
    }
  };
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Adicionar créditos via PIX</CardTitle>
        <CardDescription>
          Faça o pagamento para a chave 21988744783 e envie a solicitação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label>Quantidade de créditos</Label>
        <Input
          type="number"
          min="10"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <div className="rounded-lg bg-secondary p-4 text-sm">
          Chave PIX: <strong>21988744783</strong> <Copy className="ml-2 inline size-4" />
          <br />
          Status: {sent ? "Aguardando confirmação do administrador" : "Ainda não solicitado"}
        </div>
        <Button onClick={submit} disabled={sent}>
          Já fiz o pagamento
        </Button>
      </CardContent>
    </Card>
  );
}

function AdminPanel() {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState(10);
  const [total, setTotal] = useState(100);
  const [description, setDescription] = useState("");
  const create = async () => {
    const { error } = await supabase
      .from("raffles")
      .insert({ title, description, ticket_price: price, total_tickets: total });
    if (error) toast.error(error.message);
    else {
      toast.success("Sorteio criado");
      setTitle("");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Administração de sorteios</CardTitle>
        <CardDescription>Cadastre novos prêmios e acompanhe a operação.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Título</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do prêmio"
          />
        </div>
        <div>
          <Label>Preço do bilhete (créditos)</Label>
          <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <div>
          <Label>Total de bilhetes</Label>
          <Input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button className="sm:col-span-2" onClick={create}>
          Criar sorteio
        </Button>
      </CardContent>
    </Card>
  );
}
