import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calculator,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const dashboardQueryKey = ["admin-dashboard-v1"] as const;
const mathConfigQueryKey = ["admin-math-config"] as const;

type DashboardCards = {
  plays_today: number;
  winning_results: number;
  points_distributed: number;
  points_used: number;
  pending_redemptions: number;
  low_stock: number;
  active_users: number;
  daily_claims: number;
};

type CountPoint = { label: string; count: number };
type DayPoint = { day: string; count: number };
type PointsDay = { day: string; issued: number; consumed: number };

type AdminDashboard = {
  timezone: string;
  local_date: string;
  cards: DashboardCards;
  plays_by_day: DayPoint[];
  plays_by_rarity: CountPoint[];
  outcomes_today: CountPoint[];
  points_by_day: PointsDay[];
  redemptions_by_status: CountPoint[];
  active_users_by_day: DayPoint[];
};

type MathVersion = {
  id: string;
  scratchcard_id: string;
  version_name: string;
  status: string;
  rarity_name: string | null;
  rarity_slug: string | null;
  outcomes: { id: string; name: string; weight: number }[];
};

type MathCard = { id: string; title: string };

type MathConfig = { cards: MathCard[]; versions: MathVersion[] };

type MathAuditOutcome = {
  outcome_id: string;
  name: string;
  prize: number;
  points: number;
  weight: number;
  expected_percent: number;
  observed_count: number;
  observed_percent: number;
};

type MathAudit = { version_id: string; total_plays: number; outcomes: MathAuditOutcome[] };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseCountPoints(value: unknown, labelKey: string): CountPoint[] {
  return list(value).flatMap((entry) => {
    const raw = record(entry);
    if (!raw) return [];
    const label = str(raw[labelKey]);
    if (!label) return [];
    return [{ label, count: num(raw.count) }];
  });
}

function parseDayPoints(value: unknown): DayPoint[] {
  return list(value).flatMap((entry) => {
    const raw = record(entry);
    if (!raw) return [];
    const day = str(raw.day);
    if (!day) return [];
    return [{ day, count: num(raw.count) }];
  });
}

function parseDashboard(value: unknown): AdminDashboard {
  const raw = record(value) ?? {};
  const cards = record(raw.cards) ?? {};
  return {
    timezone: str(raw.timezone) || "America/Sao_Paulo",
    local_date: str(raw.local_date),
    cards: {
      plays_today: num(cards.plays_today),
      winning_results: num(cards.winning_results),
      points_distributed: num(cards.points_distributed),
      points_used: num(cards.points_used),
      pending_redemptions: num(cards.pending_redemptions),
      low_stock: num(cards.low_stock),
      active_users: num(cards.active_users),
      daily_claims: num(cards.daily_claims),
    },
    plays_by_day: parseDayPoints(raw.plays_by_day),
    plays_by_rarity: parseCountPoints(raw.plays_by_rarity, "rarity"),
    outcomes_today: parseCountPoints(raw.outcomes_today, "outcome"),
    points_by_day: list(raw.points_by_day).flatMap((entry) => {
      const point = record(entry);
      if (!point || !str(point.day)) return [];
      return [{ day: str(point.day), issued: num(point.issued), consumed: num(point.consumed) }];
    }),
    redemptions_by_status: parseCountPoints(raw.redemptions_by_status, "status"),
    active_users_by_day: parseDayPoints(raw.active_users_by_day),
  };
}

function parseMathConfig(value: unknown): MathConfig {
  const raw = record(value) ?? {};
  const cards: MathCard[] = list(raw.cards).flatMap((entry) => {
    const item = record(entry);
    if (!item || !str(item.id) || !str(item.title)) return [];
    return [{ id: str(item.id), title: str(item.title) }];
  });
  const versions: MathVersion[] = list(raw.versions).flatMap((entry) => {
    const item = record(entry);
    if (
      !item ||
      !str(item.id) ||
      !str(item.scratchcard_id) ||
      !str(item.version_name) ||
      !str(item.status)
    )
      return [];
    const outcomes = list(item.outcomes).flatMap((outcomeEntry) => {
      const outcome = record(outcomeEntry);
      if (!outcome || !str(outcome.id) || !str(outcome.name)) return [];
      return [{ id: str(outcome.id), name: str(outcome.name), weight: num(outcome.weight) }];
    });
    return [
      {
        id: str(item.id),
        scratchcard_id: str(item.scratchcard_id),
        version_name: str(item.version_name),
        status: str(item.status),
        rarity_name: str(item.rarity_name) || null,
        rarity_slug: str(item.rarity_slug) || null,
        outcomes,
      },
    ];
  });
  return { cards, versions };
}

function parseMathAudit(value: unknown): MathAudit | null {
  const raw = record(value);
  if (!raw || !str(raw.version_id)) return null;
  const outcomes: MathAuditOutcome[] = list(raw.outcomes).flatMap((entry) => {
    const item = record(entry);
    if (!item || !str(item.outcome_id) || !str(item.name)) return [];
    return [
      {
        outcome_id: str(item.outcome_id),
        name: str(item.name),
        prize: num(item.prize),
        points: num(item.points),
        weight: num(item.weight),
        expected_percent: num(item.expected_percent),
        observed_count: num(item.observed_count),
        observed_percent: num(item.observed_percent),
      },
    ];
  });
  return { version_id: str(raw.version_id), total_plays: num(raw.total_plays), outcomes };
}

function Kpi({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <strong className={warning ? "text-2xl text-warning" : "text-2xl"}>{value}</strong>
      </CardContent>
    </Card>
  );
}

function Distribution({ title, rows }: { title: string; rows: CountPoint[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm">
                <span>{row.label}</span>
                <strong>{row.count.toLocaleString("pt-BR")}</strong>
              </div>
              <div className="h-2 overflow-hidden rounded bg-secondary">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminInsightPanel() {
  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_v1" as never);
      if (error) throw error;
      return parseDashboard(data);
    },
  });
  const mathQuery = useQuery({
    queryKey: mathConfigQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_math_config_v1" as never);
      if (error) throw error;
      return parseMathConfig(data);
    },
  });

  return (
    <Tabs defaultValue="operations" className="mb-6 space-y-4">
      <TabsList>
        <TabsTrigger value="operations">
          <BarChart3 className="mr-1 size-4" /> Operação
        </TabsTrigger>
        <TabsTrigger value="math-audit">
          <Calculator className="mr-1 size-4" /> Auditoria Matemática
        </TabsTrigger>
      </TabsList>
      <TabsContent value="operations">
        <OperationsPanel query={dashboardQuery} />
      </TabsContent>
      <TabsContent value="math-audit">
        <MathAuditPanel
          config={mathQuery.data ?? { cards: [], versions: [] }}
          loading={mathQuery.isLoading}
          configError={mathQuery.error ? "Não foi possível carregar as versões matemáticas." : null}
          onRetry={() => void mathQuery.refetch()}
        />
      </TabsContent>
    </Tabs>
  );
}

function OperationsPanel({ query }: { query: ReturnType<typeof useQuery<AdminDashboard>> }) {
  if (query.isLoading) return <Loader2 className="animate-spin" />;
  if (query.error || !query.data)
    return (
      <p role="alert" className="text-destructive">
        Não foi possível carregar os indicadores administrativos.
      </p>
    );
  const { cards } = query.data;
  const winRate = cards.plays_today > 0 ? (cards.winning_results / cards.plays_today) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Indicadores operacionais</h2>
          <p className="text-xs text-muted-foreground">
            Dia operacional: {query.data.local_date || "—"} · {query.data.timezone}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Jogadas hoje" value={cards.plays_today.toLocaleString("pt-BR")} />
        <Kpi
          label="Resultados premiados"
          value={`${cards.winning_results.toLocaleString("pt-BR")} (${winRate.toFixed(2)}%)`}
        />
        <Kpi label="Pontos distribuídos" value={cards.points_distributed.toLocaleString("pt-BR")} />
        <Kpi label="Pontos utilizados" value={cards.points_used.toLocaleString("pt-BR")} />
        <Kpi
          label="Resgates em andamento"
          value={cards.pending_redemptions.toLocaleString("pt-BR")}
          warning={cards.pending_redemptions > 0}
        />
        <Kpi
          label="Itens com estoque baixo"
          value={cards.low_stock.toLocaleString("pt-BR")}
          warning={cards.low_stock > 0}
        />
        <Kpi label="Usuários ativos hoje" value={cards.active_users.toLocaleString("pt-BR")} />
        <Kpi label="Raspadinhas diárias" value={cards.daily_claims.toLocaleString("pt-BR")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Distribution title="Jogadas por raridade" rows={query.data.plays_by_rarity} />
        <Distribution title="Resultados de hoje" rows={query.data.outcomes_today} />
        <Distribution title="Resgates por status" rows={query.data.redemptions_by_status} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Últimos 30 dias
          </CardTitle>
          <CardDescription>Resumo diário em America/Sao_Paulo.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Dia</th>
                <th className="p-2">Jogadas</th>
                <th className="p-2">Usuários ativos</th>
                <th className="p-2">Pontos emitidos</th>
                <th className="p-2">Pontos consumidos</th>
              </tr>
            </thead>
            <tbody>
              {query.data.plays_by_day.map((day) => {
                const users =
                  query.data.active_users_by_day.find((row) => row.day === day.day)?.count ?? 0;
                const points = query.data.points_by_day.find((row) => row.day === day.day);
                return (
                  <tr key={day.day} className="border-b">
                    <td className="p-2">
                      {new Date(`${day.day}T12:00:00`).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-2">{day.count}</td>
                    <td className="p-2">{users}</td>
                    <td className="p-2">{points?.issued ?? 0}</td>
                    <td className="p-2">{points?.consumed ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MathAuditPanel({
  config,
  loading,
  configError,
  onRetry,
}: {
  config: MathConfig;
  loading: boolean;
  configError: string | null;
  onRetry: () => void;
}) {
  const validVersions = useMemo(
    () => config.versions.filter((version) => version.outcomes.length > 0),
    [config.versions],
  );
  const [versionId, setVersionId] = useState("");
  useEffect(() => {
    if (!versionId && validVersions[0]) setVersionId(validVersions[0].id);
    if (versionId && !validVersions.some((version) => version.id === versionId))
      setVersionId(validVersions[0]?.id ?? "");
  }, [validVersions, versionId]);
  const selected = validVersions.find((version) => version.id === versionId) ?? null;
  const auditQuery = useQuery({
    queryKey: ["math-audit-v1", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_math_audit_v1" as never,
        { p_math_version_id: versionId } as never,
      );
      if (error) throw error;
      const parsed = parseMathAudit(data);
      if (!parsed) throw new Error("Resposta inválida da auditoria matemática.");
      return parsed;
    },
  });
  if (loading) return <Loader2 className="animate-spin" />;
  if (configError) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p role="alert" className="text-destructive">
            {configError}
          </p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  const card = selected ? config.cards.find((item) => item.id === selected.scratchcard_id) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurado × observado</CardTitle>
        <CardDescription>
          Compara a probabilidade da versão com as jogadas realmente registradas nessa mesma versão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 min-w-[280px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={versionId}
            onChange={(event) => setVersionId(event.target.value)}
          >
            {validVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {config.cards.find((item) => item.id === version.scratchcard_id)?.title ??
                  "Raspadinha"}{" "}
                — {version.version_name} — {version.status}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void auditQuery.refetch()}
            disabled={!versionId || auditQuery.isFetching}
          >
            <RefreshCw className={auditQuery.isFetching ? "size-4 animate-spin" : "size-4"} />{" "}
            Atualizar
          </Button>
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>{card?.title ?? "Raspadinha"}</strong>
            <Badge variant={selected.status === "PUBLISHED" ? "default" : "secondary"}>
              {selected.status}
            </Badge>
            <Badge variant="outline">
              {selected.rarity_name ?? selected.rarity_slug ?? "Sem raridade"}
            </Badge>
          </div>
        )}
        {auditQuery.error && (
          <p role="alert" className="text-destructive">
            Não foi possível carregar a auditoria matemática.
          </p>
        )}
        {auditQuery.data && (
          <>
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Users className="size-4" />
              <strong>{auditQuery.data.total_plays.toLocaleString("pt-BR")}</strong> jogadas
              observadas nesta versão.
            </div>
            {auditQuery.data.total_plays === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-warning" />
                <span>
                  Sem amostra observada. A configuração pode ser inspecionada, mas ainda não há base
                  estatística real para comparação.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Resultado</th>
                    <th className="p-2">Configurado</th>
                    <th className="p-2">Observado</th>
                    <th className="p-2">Diferença</th>
                    <th className="p-2">Ocorrências</th>
                    <th className="p-2">Prêmio/Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {auditQuery.data.outcomes.map((outcome) => {
                    const diff = outcome.observed_percent - outcome.expected_percent;
                    return (
                      <tr key={outcome.outcome_id} className="border-b">
                        <td className="p-2 font-medium">{outcome.name}</td>
                        <td className="p-2">{outcome.expected_percent.toFixed(4)}%</td>
                        <td className="p-2">{outcome.observed_percent.toFixed(4)}%</td>
                        <td className="p-2">
                          {diff >= 0 ? "+" : ""}
                          {diff.toFixed(4)} pp
                        </td>
                        <td className="p-2">{outcome.observed_count.toLocaleString("pt-BR")}</td>
                        <td className="p-2">
                          {outcome.prize} cr · {outcome.points} pts
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
