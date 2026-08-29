import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/hooks/useProfile";

export const Route = createFileRoute("/transparencia")({
  head: () => ({
    meta: [
      { title: "Centro de Transparência — Raspadinha Online" },
      {
        name: "description",
        content:
          "Consulte as versões publicadas, raridades e probabilidades configuradas das raspadinhas ativas.",
      },
    ],
  }),
  component: TransparencyPage,
});

type TransparencyOutcome = {
  name: string;
  prize: number;
  points: number;
  expected_percent: number;
};

type TransparencyCampaign = {
  title: string;
  price: number;
  version_name: string;
  published_at: string | null;
  rarity: { slug: string; name: string };
  outcomes: TransparencyOutcome[];
};

type TransparencyData = {
  generated_at: string;
  timezone: string;
  campaigns: TransparencyCampaign[];
};

function parseTransparency(value: unknown): TransparencyData {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const campaigns = Array.isArray(raw.campaigns)
    ? raw.campaigns.flatMap((entry): TransparencyCampaign[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        const rarityRaw =
          item.rarity && typeof item.rarity === "object" && !Array.isArray(item.rarity)
            ? (item.rarity as Record<string, unknown>)
            : {};
        const title = typeof item.title === "string" ? item.title : "";
        const versionName = typeof item.version_name === "string" ? item.version_name : "";
        const price = typeof item.price === "number" ? item.price : Number(item.price);
        if (!title || !versionName || !Number.isFinite(price)) return [];
        const outcomes = Array.isArray(item.outcomes)
          ? item.outcomes.flatMap((outcomeEntry): TransparencyOutcome[] => {
              if (!outcomeEntry || typeof outcomeEntry !== "object" || Array.isArray(outcomeEntry))
                return [];
              const outcome = outcomeEntry as Record<string, unknown>;
              const name = typeof outcome.name === "string" ? outcome.name : "";
              const prize =
                typeof outcome.prize === "number" ? outcome.prize : Number(outcome.prize);
              const points =
                typeof outcome.points === "number" ? outcome.points : Number(outcome.points);
              const expectedPercent =
                typeof outcome.expected_percent === "number"
                  ? outcome.expected_percent
                  : Number(outcome.expected_percent);
              if (!name || ![prize, points, expectedPercent].every(Number.isFinite)) return [];
              return [{ name, prize, points, expected_percent: expectedPercent }];
            })
          : [];
        return [
          {
            title,
            price,
            version_name: versionName,
            published_at: typeof item.published_at === "string" ? item.published_at : null,
            rarity: {
              slug: typeof rarityRaw.slug === "string" ? rarityRaw.slug : "",
              name: typeof rarityRaw.name === "string" ? rarityRaw.name : "Não informada",
            },
            outcomes,
          },
        ];
      })
    : [];
  return {
    generated_at: typeof raw.generated_at === "string" ? raw.generated_at : "",
    timezone: typeof raw.timezone === "string" ? raw.timezone : "America/Sao_Paulo",
    campaigns,
  };
}

function TransparencyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-transparency-v1"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_transparency_v1");
      if (error) throw error;
      return parseTransparency(data);
    },
  });

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-3xl font-black">Centro de Transparência</h1>
          <p className="mt-2 text-muted-foreground">
            Consulte o funcionamento do resultado e as probabilidades atualmente publicadas para
            cada raspadinha ativa.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-5 text-success" /> Resultado no servidor
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              O resultado é definido e persistido antes da raspagem visual. Raspar não altera o
              resultado.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-5 text-accent" /> Versões imutáveis
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A matemática publicada não é editada silenciosamente. Mudanças exigem uma nova versão.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="size-5 text-primary" /> Repetições protegidas
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Jogadas e resgates usam identificadores de requisição para impedir duplicidade em
              retries.
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campanhas publicadas</CardTitle>
            <CardDescription>
              Percentual configurado = peso do resultado ÷ soma dos pesos da versão publicada.
              Nenhum dado de usuário ou ledger é exposto aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && <Loader2 className="animate-spin" />}
            {error && (
              <p role="alert" className="text-destructive">
                Não foi possível carregar as informações publicadas.
              </p>
            )}
            {data?.campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha publicada está disponível no momento.
              </p>
            )}
            {data?.campaigns.map((campaign) => (
              <section
                key={`${campaign.title}-${campaign.version_name}`}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{campaign.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      Versão {campaign.version_name}
                      {campaign.published_at
                        ? ` · publicada em ${new Date(campaign.published_at).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{campaign.rarity.name}</Badge>
                    <Badge>{formatBRL(campaign.price)}</Badge>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2">Resultado</th>
                        <th className="p-2">Probabilidade configurada</th>
                        <th className="p-2">Créditos</th>
                        <th className="p-2">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaign.outcomes.map((outcome) => (
                        <tr key={outcome.name} className="border-b">
                          <td className="p-2 font-medium">{outcome.name}</td>
                          <td className="p-2">{outcome.expected_percent.toFixed(4)}%</td>
                          <td className="p-2">{outcome.prize}</td>
                          <td className="p-2">{outcome.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        {data?.generated_at && (
          <p className="text-center text-xs text-muted-foreground">
            Consulta atualizada em {new Date(data.generated_at).toLocaleString("pt-BR")} ·
            referência {data.timezone}
          </p>
        )}
      </div>
    </main>
  );
}
