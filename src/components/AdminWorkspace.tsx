import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  Calculator,
  ClipboardList,
  Gift,
  Layers3,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Store,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathAdminPanel } from "@/components/MathAdminPanel";
import { formatBRL } from "@/hooks/useProfile";
import { specialScratchStatusQueryKey } from "@/hooks/useSpecialScratchStatus";

const adminOperationsQueryKey = ["admin-operations"] as const;
const adminMathQueryKey = ["admin-math-config"] as const;

type ScratchcardAdmin = {
  id: string;
  title: string;
  price: number;
  active: boolean;
  is_daily_eligible: boolean;
  published_version_id: string | null;
  published_version_name: string | null;
  rarity_slug: string | null;
  rarity_name: string | null;
};

type StoreItemAdmin = {
  id: string;
  title: string;
  description: string | null;
  points_cost: number;
  stock_total: number;
  stock_available: number;
  per_user_limit: number;
  category: string | null;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  image_url: string | null;
  active: boolean;
};

type RedemptionAdmin = {
  id: string;
  protocol: string | null;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  item_id: string;
  item_title: string | null;
  points_spent: number;
  status: string;
  fulfillment_code: string | null;
  created_at: string;
  updated_at: string;
};

type AchievementAdmin = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  criteria: unknown;
  sort_order: number;
  active: boolean;
};

type UserAdmin = {
  id: string;
  email: string | null;
  display_name: string;
  public_slug: string;
  balance: number;
  points: number;
  xp: number;
  level: number;
  is_admin: boolean;
  created_at: string;
};

type LedgerAdmin = {
  id: string;
  user_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  transaction_type: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
};

type AuditAdmin = {
  id: string;
  admin_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  metadata: unknown;
};

type MysteryEntryAdmin = {
  id: string;
  scratchcard_id: string;
  scratchcard_title: string;
  weight: number;
};

type MysteryVersionAdmin = {
  id: string;
  name: string;
  status: string;
  published_at: string | null;
  created_at: string;
  entries: MysteryEntryAdmin[];
};

type AdminOperations = {
  scratchcards: ScratchcardAdmin[];
  store_items: StoreItemAdmin[];
  redemptions: RedemptionAdmin[];
  achievements: AchievementAdmin[];
  users: UserAdmin[];
  credit_ledger: LedgerAdmin[];
  points_ledger: LedgerAdmin[];
  audit_logs: AuditAdmin[];
  mystery_versions: MysteryVersionAdmin[];
};

type MathOutcomeSnapshot = {
  id: string;
  name: string;
  prize: number;
  points: number;
  weight: number;
};

type MathVersionSnapshot = {
  id: string;
  scratchcard_id: string;
  version_name: string;
  status: string;
  rarity_slug: string | null;
  rarity_name: string | null;
  outcomes: MathOutcomeSnapshot[];
};

type RaritySnapshot = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: unknown;
};

type MathSnapshot = {
  versions: MathVersionSnapshot[];
  rarities: RaritySnapshot[];
};

type SimulatorOutcome = {
  outcome_id: string;
  name: string;
  count: number;
  percent: number;
};

type SimulatorResult = {
  simulations: number;
  outcomes: SimulatorOutcome[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseList<T>(value: unknown, parser: (value: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.flatMap((item) => parser(item) ?? []) : [];
}

function parseScratchcard(value: unknown): ScratchcardAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const title = text(raw.title);
  const price = numberValue(raw.price);
  if (!id || !title || price === null) return null;
  return {
    id,
    title,
    price,
    active: raw.active === true,
    is_daily_eligible: raw.is_daily_eligible === true,
    published_version_id: text(raw.published_version_id),
    published_version_name: text(raw.published_version_name),
    rarity_slug: text(raw.rarity_slug),
    rarity_name: text(raw.rarity_name),
  };
}

function parseStoreItem(value: unknown): StoreItemAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const title = text(raw.title);
  const pointsCost = numberValue(raw.points_cost);
  const stockTotal = numberValue(raw.stock_total);
  const stockAvailable = numberValue(raw.stock_available);
  const perUserLimit = numberValue(raw.per_user_limit);
  const displayOrder = numberValue(raw.display_order);
  if (
    !id ||
    !title ||
    pointsCost === null ||
    stockTotal === null ||
    stockAvailable === null ||
    perUserLimit === null ||
    displayOrder === null
  ) {
    return null;
  }
  return {
    id,
    title,
    description: text(raw.description),
    points_cost: pointsCost,
    stock_total: stockTotal,
    stock_available: stockAvailable,
    per_user_limit: perUserLimit,
    category: text(raw.category),
    starts_at: text(raw.starts_at),
    ends_at: text(raw.ends_at),
    display_order: displayOrder,
    image_url: text(raw.image_url),
    active: raw.active === true,
  };
}

function parseRedemption(value: unknown): RedemptionAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const userId = text(raw.user_id);
  const itemId = text(raw.item_id);
  const points = numberValue(raw.points_spent);
  const status = text(raw.status);
  const createdAt = text(raw.created_at);
  const updatedAt = text(raw.updated_at);
  if (!id || !userId || !itemId || points === null || !status || !createdAt || !updatedAt)
    return null;
  return {
    id,
    protocol: text(raw.protocol),
    user_id: userId,
    user_email: text(raw.user_email),
    user_name: text(raw.user_name),
    item_id: itemId,
    item_title: text(raw.item_title),
    points_spent: points,
    status,
    fulfillment_code: text(raw.fulfillment_code),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function parseAchievement(value: unknown): AchievementAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const slug = text(raw.slug);
  const name = text(raw.name);
  const description = text(raw.description);
  const icon = text(raw.icon);
  const sortOrder = numberValue(raw.sort_order);
  if (!id || !slug || !name || !description || !icon || sortOrder === null) return null;
  return {
    id,
    slug,
    name,
    description,
    icon,
    criteria: raw.criteria,
    sort_order: sortOrder,
    active: raw.active === true,
  };
}

function parseUser(value: unknown): UserAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const displayName = text(raw.display_name);
  const publicSlug = text(raw.public_slug);
  const balance = numberValue(raw.balance);
  const points = numberValue(raw.points);
  const xp = numberValue(raw.xp);
  const level = numberValue(raw.level);
  const createdAt = text(raw.created_at);
  if (
    !id ||
    !displayName ||
    !publicSlug ||
    balance === null ||
    points === null ||
    xp === null ||
    level === null ||
    !createdAt
  )
    return null;
  return {
    id,
    email: text(raw.email),
    display_name: displayName,
    public_slug: publicSlug,
    balance,
    points,
    xp,
    level,
    is_admin: raw.is_admin === true,
    created_at: createdAt,
  };
}

function parseLedger(value: unknown): LedgerAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const userId = text(raw.user_id);
  const amount = numberValue(raw.amount);
  const before = numberValue(raw.balance_before);
  const after = numberValue(raw.balance_after);
  const transactionType = text(raw.transaction_type);
  const referenceType = text(raw.reference_type);
  const referenceId = text(raw.reference_id);
  const createdAt = text(raw.created_at);
  if (
    !id ||
    !userId ||
    amount === null ||
    before === null ||
    after === null ||
    !transactionType ||
    !referenceType ||
    !referenceId ||
    !createdAt
  )
    return null;
  return {
    id,
    user_id: userId,
    amount,
    balance_before: before,
    balance_after: after,
    transaction_type: transactionType,
    reference_type: referenceType,
    reference_id: referenceId,
    created_at: createdAt,
  };
}

function parseAudit(value: unknown): AuditAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const action = text(raw.action);
  const entityType = text(raw.entity_type);
  const entityId = text(raw.entity_id);
  const createdAt = text(raw.created_at);
  if (!id || !action || !entityType || !entityId || !createdAt) return null;
  return {
    id,
    admin_id: text(raw.admin_id),
    action,
    entity_type: entityType,
    entity_id: entityId,
    created_at: createdAt,
    metadata: raw.metadata,
  };
}

function parseMysteryEntry(value: unknown): MysteryEntryAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const scratchcardId = text(raw.scratchcard_id);
  const scratchcardTitle = text(raw.scratchcard_title);
  const weight = numberValue(raw.weight);
  if (!id || !scratchcardId || !scratchcardTitle || weight === null) return null;
  return { id, scratchcard_id: scratchcardId, scratchcard_title: scratchcardTitle, weight };
}

function parseMysteryVersion(value: unknown): MysteryVersionAdmin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  const status = text(raw.status);
  const createdAt = text(raw.created_at);
  if (!id || !name || !status || !createdAt) return null;
  return {
    id,
    name,
    status,
    published_at: text(raw.published_at),
    created_at: createdAt,
    entries: parseList(raw.entries, parseMysteryEntry),
  };
}

function parseAdminOperations(value: unknown): AdminOperations {
  const raw = asRecord(value) ?? {};
  return {
    scratchcards: parseList(raw.scratchcards, parseScratchcard),
    store_items: parseList(raw.store_items, parseStoreItem),
    redemptions: parseList(raw.redemptions, parseRedemption),
    achievements: parseList(raw.achievements, parseAchievement),
    users: parseList(raw.users, parseUser),
    credit_ledger: parseList(raw.credit_ledger, parseLedger),
    points_ledger: parseList(raw.points_ledger, parseLedger),
    audit_logs: parseList(raw.audit_logs, parseAudit),
    mystery_versions: parseList(raw.mystery_versions, parseMysteryVersion),
  };
}

function parseMathOutcome(value: unknown): MathOutcomeSnapshot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  const prize = numberValue(raw.prize);
  const points = numberValue(raw.points);
  const weight = numberValue(raw.weight);
  if (!id || !name || prize === null || points === null || weight === null) return null;
  return { id, name, prize, points, weight };
}

function parseMathVersion(value: unknown): MathVersionSnapshot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const cardId = text(raw.scratchcard_id);
  const versionName = text(raw.version_name);
  const status = text(raw.status);
  if (!id || !cardId || !versionName || !status) return null;
  return {
    id,
    scratchcard_id: cardId,
    version_name: versionName,
    status,
    rarity_slug: text(raw.rarity_slug),
    rarity_name: text(raw.rarity_name),
    outcomes: parseList(raw.outcomes, parseMathOutcome),
  };
}

function parseRarity(value: unknown): RaritySnapshot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = text(raw.id);
  const slug = text(raw.slug);
  const name = text(raw.name);
  if (!id || !slug || !name) return null;
  return { id, slug, name, description: text(raw.description), theme: raw.theme };
}

function parseMathSnapshot(value: unknown): MathSnapshot {
  const raw = asRecord(value) ?? {};
  return {
    versions: parseList(raw.versions, parseMathVersion),
    rarities: parseList(raw.rarities, parseRarity),
  };
}

function parseSimulatorResult(value: unknown): SimulatorResult | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const simulations = numberValue(raw.simulations);
  if (simulations === null) return null;
  const outcomes = parseList(raw.outcomes, (item): SimulatorOutcome | null => {
    const outcome = asRecord(item);
    if (!outcome) return null;
    const outcomeId = text(outcome.outcome_id);
    const name = text(outcome.name);
    const count = numberValue(outcome.count);
    const percent = numberValue(outcome.percent);
    if (!outcomeId || !name || count === null || percent === null) return null;
    return { outcome_id: outcomeId, name, count, percent };
  });
  return { simulations, outcomes };
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function AdminWorkspace() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: adminOperationsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_operations_v1" as never);
      if (error) throw error;
      return parseAdminOperations(data);
    },
  });
  const { data: math = { versions: [], rarities: [] } } = useQuery({
    queryKey: adminMathQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_math_config_v1" as never);
      if (error) throw error;
      return parseMathSnapshot(data);
    },
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminOperationsQueryKey }),
      qc.invalidateQueries({ queryKey: adminMathQueryKey }),
      qc.invalidateQueries({ queryKey: ["active-scratchcards"] }),
      qc.invalidateQueries({ queryKey: ["home-scratchcards"] }),
      qc.invalidateQueries({ queryKey: specialScratchStatusQueryKey }),
      qc.invalidateQueries({ queryKey: ["store_items"] }),
    ]);
  };

  if (isLoading || !data) return <Loader2 className="mx-auto animate-spin" />;
  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-destructive">
          Não foi possível carregar a administração.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        <AdminTrigger value="overview" label="Visão Geral" />
        <AdminTrigger value="scratchcards" label="Raspadinhas" />
        <AdminTrigger value="math" label="Versões Matemáticas" />
        <AdminTrigger value="outcomes" label="Resultados" />
        <AdminTrigger value="rarities" label="Raridades" />
        <AdminTrigger value="daily" label="Diária" />
        <AdminTrigger value="mystery" label="Misteriosa" />
        <AdminTrigger value="store" label="Loja" />
        <AdminTrigger value="redemptions" label="Resgates" />
        <AdminTrigger value="achievements" label="Conquistas" />
        <AdminTrigger value="users" label="Usuários" />
        <AdminTrigger value="ledger" label="Ledger" />
        <AdminTrigger value="audit" label="Auditoria" />
        <AdminTrigger value="simulator" label="Simulador" />
      </TabsList>

      <TabsContent value="overview">
        <OverviewPanel data={data} onRefresh={refresh} />
      </TabsContent>
      <TabsContent value="scratchcards">
        <ScratchcardsPanel cards={data.scratchcards} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="math">
        <MathAdminPanel />
      </TabsContent>
      <TabsContent value="outcomes">
        <OutcomesPanel versions={math.versions} cards={data.scratchcards} />
      </TabsContent>
      <TabsContent value="rarities">
        <RaritiesPanel rarities={math.rarities} />
      </TabsContent>
      <TabsContent value="daily">
        <DailyAdminPanel cards={data.scratchcards} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="mystery">
        <MysteryAdminPanel
          versions={data.mystery_versions}
          cards={data.scratchcards}
          onChanged={refresh}
        />
      </TabsContent>
      <TabsContent value="store">
        <StoreAdminPanel items={data.store_items} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="redemptions">
        <RedemptionsPanel redemptions={data.redemptions} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="achievements">
        <AchievementsPanel achievements={data.achievements} />
      </TabsContent>
      <TabsContent value="users">
        <UsersPanel users={data.users} />
      </TabsContent>
      <TabsContent value="ledger">
        <LedgerPanel credit={data.credit_ledger} points={data.points_ledger} />
      </TabsContent>
      <TabsContent value="audit">
        <AuditPanel logs={data.audit_logs} />
      </TabsContent>
      <TabsContent value="simulator">
        <SimulatorPanel versions={math.versions} cards={data.scratchcards} />
      </TabsContent>
    </Tabs>
  );
}

function AdminTrigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger value={value} className="shrink-0 text-xs">
      {label}
    </TabsTrigger>
  );
}

function OverviewPanel({
  data,
  onRefresh,
}: {
  data: AdminOperations;
  onRefresh: () => Promise<void>;
}) {
  const pending = data.redemptions.filter(
    (item) => !["ENTREGUE", "CANCELADO"].includes(item.status),
  ).length;
  const activeCards = data.scratchcards.filter((item) => item.active).length;
  const activeStore = data.store_items.filter((item) => item.active).length;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Ticket className="size-5" />}
          label="Raspadinhas ativas"
          value={activeCards}
        />
        <MetricCard
          icon={<Users className="size-5" />}
          label="Usuários"
          value={data.users.length}
        />
        <MetricCard
          icon={<Gift className="size-5" />}
          label="Resgates em andamento"
          value={pending}
        />
        <MetricCard icon={<Store className="size-5" />} label="Itens ativos" value={activeStore} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Operação de raspadinhas</CardTitle>
          <CardDescription>
            Sorteios e depósito PIX legados não fazem parte da experiência atual. Matemática
            publicada é somente leitura.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-primary">{icon}</div>
        <p className="mt-2 text-xs text-muted-foreground">{label}</p>
        <strong className="text-2xl">{value}</strong>
      </CardContent>
    </Card>
  );
}

function ScratchcardsPanel({
  cards,
  onChanged,
}: {
  cards: ScratchcardAdmin[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ScratchcardAdmin | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("1");
  const [active, setActive] = useState(true);
  const [daily, setDaily] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title);
    setPrice(String(editing.price));
    setActive(editing.active);
    setDaily(editing.is_daily_eligible);
  }, [editing]);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setPrice("1");
    setActive(true);
    setDaily(false);
  };

  const save = async () => {
    const parsedPrice = Number(price);
    if (!title.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Informe título e preço válidos.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_upsert_scratchcard_v1" as never,
      {
        p_id: editing?.id ?? null,
        p_title: title.trim(),
        p_price: parsedPrice,
        p_active: active,
        p_is_daily_eligible: daily,
      } as never,
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    reset();
    await onChanged();
    toast.success("Raspadinha salva.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Raspadinhas</CardTitle>
          <CardDescription>Cadastros operacionais e versão publicada atual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <strong>{card.title}</strong>
                <p className="text-xs text-muted-foreground">
                  {formatBRL(card.price)} · {card.published_version_name ?? "sem versão publicada"}
                  {card.rarity_name ? ` · ${card.rarity_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {card.is_daily_eligible && <Badge>Diária</Badge>}
                <Badge variant={card.active ? "secondary" : "outline"}>
                  {card.active ? "Ativa" : "Inativa"}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setEditing(card)}>
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Editar raspadinha" : "Nova raspadinha"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Preço">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Toggle label="Ativa" checked={active} onCheckedChange={setActive} />
          <Toggle label="Configurar como diária" checked={daily} onCheckedChange={setDaily} />
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
            Salvar
          </Button>
          {editing && (
            <Button className="w-full" variant="ghost" onClick={reset}>
              Cancelar edição
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OutcomesPanel({
  versions,
  cards,
}: {
  versions: MathVersionSnapshot[];
  cards: ScratchcardAdmin[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultados matemáticos</CardTitle>
        <CardDescription>
          Pesos são a fonte de verdade; probabilidades abaixo são informativas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {versions.map((version) => {
          const total = version.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
          const card = cards.find((item) => item.id === version.scratchcard_id);
          return (
            <div key={version.id} className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <strong>
                  {card?.title ?? "Raspadinha"} — {version.version_name}
                </strong>
                <Badge variant={version.status === "PUBLISHED" ? "default" : "secondary"}>
                  {version.status}
                </Badge>
                {version.rarity_name && <Badge variant="outline">{version.rarity_name}</Badge>}
              </div>
              <div className="space-y-2">
                {version.outcomes.map((outcome) => (
                  <div
                    key={outcome.id}
                    className="grid gap-1 rounded bg-secondary/40 p-2 text-sm sm:grid-cols-5"
                  >
                    <span>{outcome.name}</span>
                    <span>{formatBRL(outcome.prize)}</span>
                    <span>{outcome.points} pts</span>
                    <span>peso {outcome.weight}</span>
                    <span>
                      {total > 0 ? ((outcome.weight / total) * 100).toFixed(4) : "0.0000"}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RaritiesPanel({ rarities }: { rarities: RaritySnapshot[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Raridades</CardTitle>
        <CardDescription>
          Slugs reais do banco. Não são traduzidos para nomes internos em inglês.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rarities.map((rarity) => (
          <div key={rarity.id} className="rounded-lg border p-4">
            <Badge variant="outline">{rarity.slug}</Badge>
            <strong className="mt-2 block">{rarity.name}</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              {rarity.description ?? "Sem descrição"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DailyAdminPanel({
  cards,
  onChanged,
}: {
  cards: ScratchcardAdmin[];
  onChanged: () => Promise<void>;
}) {
  const current = cards.find((card) => card.is_daily_eligible)?.id ?? "";
  const [selected, setSelected] = useState(current);
  const [busy, setBusy] = useState(false);
  const eligible = cards.filter((card) => card.active && card.published_version_id);

  useEffect(() => setSelected(current), [current]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_set_daily_scratch_v1" as never,
      { p_card_id: selected || null } as never,
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
    toast.success(selected ? "Raspadinha diária configurada." : "Raspadinha diária desativada.");
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Configuração da Diária</CardTitle>
        <CardDescription>
          O cliente nunca escolhe o card_id; a RPC v2 resolve esta configuração no servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Raspadinha diária">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Nenhuma — mostrar Em breve</option>
            {eligible.map((card) => (
              <option key={card.id} value={card.id}>
                {card.title} — {card.rarity_name}
              </option>
            ))}
          </select>
        </Field>
        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
          configuração
        </Button>
      </CardContent>
    </Card>
  );
}

function MysteryAdminPanel({
  versions,
  cards,
  onChanged,
}: {
  versions: MysteryVersionAdmin[];
  cards: ScratchcardAdmin[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedVersion, setSelectedVersion] = useState(versions[0]?.id ?? "");
  const [cardId, setCardId] = useState(
    cards.find((card) => card.active && card.published_version_id)?.id ?? "",
  );
  const [weight, setWeight] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!versions.some((version) => version.id === selectedVersion))
      setSelectedVersion(versions[0]?.id ?? "");
  }, [selectedVersion, versions]);

  const selected = versions.find((version) => version.id === selectedVersion) ?? null;
  const validCards = cards.filter((card) => card.active && card.published_version_id);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc(
      "admin_create_mystery_draft_v1" as never,
      { p_name: name.trim() } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    setName("");
    if (typeof data === "string") setSelectedVersion(data);
    await onChanged();
    toast.success("Pool Misteriosa DRAFT criado.");
  };

  const addEntry = async () => {
    const parsedWeight = Number(weight);
    if (
      !selected ||
      selected.status !== "DRAFT" ||
      !cardId ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_add_mystery_entry_v1" as never,
      {
        p_mystery_version_id: selected.id,
        p_scratchcard_id: cardId,
        p_weight: parsedWeight,
      } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    await onChanged();
    toast.success("Entrada adicionada ao pool.");
  };

  const publish = async () => {
    if (!selected || selected.status !== "DRAFT") return;
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_publish_mystery_v1" as never,
      { p_mystery_version_id: selected.id } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    await onChanged();
    toast.success("Pool Misteriosa publicado e bloqueado para edição.");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Novo pool Misteriosa</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="Nome da versão"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={create} disabled={busy || !name.trim()}>
            <Plus className="size-4" /> Criar DRAFT
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pool e pesos</CardTitle>
          <CardDescription>
            Somente DRAFT pode ser alterada; publicação exige cards ativos com matemática publicada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
          >
            <option value="">Selecione um pool</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name} — {version.status}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <div className="space-y-2">
                {selected.entries.map((entry) => (
                  <MysteryEntryRow
                    key={entry.id}
                    entry={entry}
                    readOnly={selected.status !== "DRAFT"}
                    onChanged={onChanged}
                  />
                ))}
              </div>
              {selected.status === "DRAFT" ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                  >
                    {validCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.title} — {card.rarity_name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <Button onClick={addEntry} disabled={busy || !cardId}>
                    <Plus className="size-4" /> Adicionar
                  </Button>
                </div>
              ) : (
                <BadgeCheck className="size-5 text-success" />
              )}
              {selected.status === "DRAFT" && (
                <Button
                  className="w-full"
                  variant="glow"
                  onClick={publish}
                  disabled={busy || selected.entries.length === 0}
                >
                  <Send className="size-4" /> Publicar pool
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MysteryEntryRow({
  entry,
  readOnly,
  onChanged,
}: {
  entry: MysteryEntryAdmin;
  readOnly: boolean;
  onChanged: () => Promise<void>;
}) {
  const [weight, setWeight] = useState(String(entry.weight));
  const [busy, setBusy] = useState(false);
  useEffect(() => setWeight(String(entry.weight)), [entry.weight]);

  const save = async () => {
    const parsed = Number(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_update_mystery_entry_v1" as never,
      { p_entry_id: entry.id, p_weight: parsed } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    await onChanged();
    toast.success("Peso atualizado.");
  };
  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_delete_mystery_entry_v1" as never,
      { p_entry_id: entry.id } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    await onChanged();
    toast.success("Entrada removida.");
  };
  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_160px_auto]">
      <span className="self-center text-sm">{entry.scratchcard_title}</span>
      <Input
        type="number"
        min="0.0001"
        step="0.0001"
        value={weight}
        disabled={readOnly}
        onChange={(e) => setWeight(e.target.value)}
      />
      {!readOnly && (
        <div className="flex gap-1">
          <Button size="icon" variant="outline" onClick={save} disabled={busy}>
            <Save className="size-4" />
          </Button>
          <Button size="icon" variant="destructive" onClick={remove} disabled={busy}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function StoreAdminPanel({
  items,
  onChanged,
}: {
  items: StoreItemAdmin[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<StoreItemAdmin | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pointsCost, setPointsCost] = useState("100");
  const [stockTotal, setStockTotal] = useState("1");
  const [stockAvailable, setStockAvailable] = useState("1");
  const [limit, setLimit] = useState("1");
  const [category, setCategory] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title);
    setDescription(editing.description ?? "");
    setPointsCost(String(editing.points_cost));
    setStockTotal(String(editing.stock_total));
    setStockAvailable(String(editing.stock_available));
    setLimit(String(editing.per_user_limit));
    setCategory(editing.category ?? "");
    setStartsAt(toLocalInput(editing.starts_at));
    setEndsAt(toLocalInput(editing.ends_at));
    setDisplayOrder(String(editing.display_order));
    setImageUrl(editing.image_url ?? "");
    setActive(editing.active);
  }, [editing]);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setPointsCost("100");
    setStockTotal("1");
    setStockAvailable("1");
    setLimit("1");
    setCategory("");
    setStartsAt("");
    setEndsAt("");
    setDisplayOrder("0");
    setImageUrl("");
    setActive(true);
  };

  const save = async () => {
    const cost = Number(pointsCost);
    const total = Number(stockTotal);
    const available = Number(stockAvailable);
    const perUser = Number(limit);
    const order = Number(displayOrder);
    if (
      !title.trim() ||
      ![cost, total, available, perUser, order].every(Number.isFinite) ||
      cost < 0 ||
      total < 0 ||
      available < 0 ||
      available > total ||
      perUser < 1
    ) {
      toast.error("Revise os dados do item e do estoque.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_upsert_store_item_v1" as never,
      {
        p_id: editing?.id ?? null,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_points_cost: cost,
        p_stock_total: total,
        p_stock_available: available,
        p_per_user_limit: perUser,
        p_category: category.trim() || null,
        p_starts_at: fromLocalInput(startsAt),
        p_ends_at: fromLocalInput(endsAt),
        p_display_order: order,
        p_image_url: imageUrl.trim() || null,
        p_active: active,
      } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    reset();
    await onChanged();
    toast.success("Item da loja salvo.");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Itens da loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <strong>{item.title}</strong>
                <p className="text-xs text-muted-foreground">
                  {item.points_cost} pts · {item.stock_available}/{item.stock_total} disponíveis ·
                  limite {item.per_user_limit}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant={item.active ? "secondary" : "outline"}>
                  {item.active ? "Ativo" : "Inativo"}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Editar item" : "Novo item"}</CardTitle>
          <CardDescription>
            Formulário baseado em stock_total, stock_available e per_user_limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Descrição">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pontos">
              <Input
                type="number"
                min="0"
                value={pointsCost}
                onChange={(e) => setPointsCost(e.target.value)}
              />
            </Field>
            <Field label="Limite por usuário">
              <Input
                type="number"
                min="1"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Estoque total">
              <Input
                type="number"
                min="0"
                value={stockTotal}
                onChange={(e) => setStockTotal(e.target.value)}
              />
            </Field>
            <Field label="Disponível">
              <Input
                type="number"
                min="0"
                value={stockAvailable}
                onChange={(e) => setStockAvailable(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Categoria">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início">
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label="Fim">
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Ordem">
            <Input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
            />
          </Field>
          <Field label="Imagem (URL)">
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </Field>
          <Toggle label="Ativo" checked={active} onCheckedChange={setActive} />
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
            Salvar item
          </Button>
          {editing && (
            <Button className="w-full" variant="ghost" onClick={reset}>
              Cancelar edição
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RedemptionsPanel({
  redemptions,
  onChanged,
}: {
  redemptions: RedemptionAdmin[];
  onChanged: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resgates</CardTitle>
        <CardDescription>
          Transições executadas exclusivamente por admin_update_redemption_v1.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {redemptions.length ? (
          redemptions.map((redemption) => (
            <RedemptionRow key={redemption.id} redemption={redemption} onChanged={onChanged} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum resgate encontrado.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RedemptionRow({
  redemption,
  onChanged,
}: {
  redemption: RedemptionAdmin;
  onChanged: () => Promise<void>;
}) {
  const transitions: Record<string, string[]> = {
    SOLICITADO: ["APROVADO", "CANCELADO"],
    APROVADO: ["PREPARANDO", "CANCELADO"],
    PREPARANDO: ["DISPONIVEL", "CANCELADO"],
    DISPONIVEL: ["ENTREGUE", "CANCELADO"],
    ENTREGUE: [],
    CANCELADO: [],
  };
  const allowed = transitions[redemption.status] ?? [];
  const [status, setStatus] = useState(allowed[0] ?? "");
  const [code, setCode] = useState(redemption.fulfillment_code ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setStatus(allowed[0] ?? "");
    setCode(redemption.fulfillment_code ?? "");
  }, [redemption.fulfillment_code, redemption.status]);

  const update = async () => {
    if (!status) return;
    setBusy(true);
    const { error } = await supabase.rpc(
      "admin_update_redemption_v1" as never,
      {
        p_redemption_id: redemption.id,
        p_status: status,
        p_fulfillment_code: code.trim() || null,
      } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    await onChanged();
    toast.success(`Resgate atualizado para ${status}.`);
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <strong>{redemption.protocol ?? shortId(redemption.id)}</strong>
          <p className="text-xs text-muted-foreground">
            {redemption.user_name ?? redemption.user_email ?? shortId(redemption.user_id)} ·{" "}
            {redemption.item_title ?? shortId(redemption.item_id)} · {redemption.points_spent} pts
          </p>
        </div>
        <Badge>{redemption.status}</Badge>
      </div>
      {allowed.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {allowed.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Input
            placeholder="Fulfillment code (opcional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button onClick={update} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}

function AchievementsPanel({ achievements }: { achievements: AchievementAdmin[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conquistas</CardTitle>
        <CardDescription>
          Leitura dos critérios atuais. A validação semântica dos critérios é tratada na fase
          específica de conquistas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {achievements.map((achievement) => (
          <div key={achievement.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <strong>
                {achievement.icon} {achievement.name}
              </strong>
              <Badge variant={achievement.active ? "secondary" : "outline"}>
                {achievement.active ? "Ativa" : "Inativa"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{achievement.description}</p>
            <pre className="mt-2 overflow-x-auto rounded bg-secondary p-2 text-[11px]">
              {JSON.stringify(achievement.criteria, null, 2)}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function UsersPanel({ users }: { users: UserAdmin[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários</CardTitle>
        <CardDescription>
          Visão administrativa sem alteração direta de saldo ou pontos.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Usuário</th>
              <th className="p-2">Saldo</th>
              <th className="p-2">Pontos</th>
              <th className="p-2">XP</th>
              <th className="p-2">Nível</th>
              <th className="p-2">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="p-2">
                  <strong>{user.display_name}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {user.email ?? shortId(user.id)}
                  </span>
                </td>
                <td className="p-2">{formatBRL(user.balance)}</td>
                <td className="p-2">{user.points}</td>
                <td className="p-2">{user.xp}</td>
                <td className="p-2">{user.level}</td>
                <td className="p-2">
                  <Badge variant={user.is_admin ? "default" : "outline"}>
                    {user.is_admin ? "Admin" : "Usuário"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LedgerPanel({ credit, points }: { credit: LedgerAdmin[]; points: LedgerAdmin[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <LedgerTable title="Ledger de créditos" rows={credit} currency />
      <LedgerTable title="Ledger de pontos" rows={points} />
    </div>
  );
}

function LedgerTable({
  title,
  rows,
  currency = false,
}: {
  title: string;
  rows: LedgerAdmin[];
  currency?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Últimos 200 registros append-only.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[600px] space-y-2 overflow-auto">
        {rows.map((row) => (
          <div key={row.id} className="rounded border p-2 text-xs">
            <div className="flex justify-between gap-2">
              <strong>{row.transaction_type}</strong>
              <span>{currency ? formatBRL(row.amount) : row.amount}</span>
            </div>
            <p className="text-muted-foreground">
              {shortId(row.user_id)} · {row.reference_type}:{shortId(row.reference_id)}
            </p>
            <p>
              {row.balance_before} → {row.balance_after}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ logs }: { logs: AuditAdmin[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoria</CardTitle>
        <CardDescription>
          Últimos 200 eventos administrativos e transacionais auditados.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[680px] space-y-2 overflow-auto">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{log.action}</strong>
              <span className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {log.entity_type} · {shortId(log.entity_id)} · admin{" "}
              {log.admin_id ? shortId(log.admin_id) : "sistema"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SimulatorPanel({
  versions,
  cards,
}: {
  versions: MathVersionSnapshot[];
  cards: ScratchcardAdmin[];
}) {
  const validVersions = versions.filter((version) => version.outcomes.length > 0);
  const [versionId, setVersionId] = useState(validVersions[0]?.id ?? "");
  const [simulations, setSimulations] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulatorResult | null>(null);
  const selected = validVersions.find((version) => version.id === versionId) ?? null;

  useEffect(() => {
    if (!validVersions.some((version) => version.id === versionId))
      setVersionId(validVersions[0]?.id ?? "");
  }, [validVersions, versionId]);

  const expected = useMemo(() => {
    if (!selected) return new Map<string, number>();
    const total = selected.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    return new Map(
      selected.outcomes.map((outcome) => [
        outcome.id,
        total > 0 ? (outcome.weight / total) * 100 : 0,
      ]),
    );
  }, [selected]);

  const run = async () => {
    if (!versionId) return;
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.rpc(
      "simulate_math_v1" as never,
      { p_math_version_id: versionId, p_simulations: Number(simulations) } as never,
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    const parsed = parseSimulatorResult(data);
    if (!parsed) return void toast.error("Resposta inválida do simulador.");
    setResult(parsed);
  };

  const card = selected ? cards.find((item) => item.id === selected.scratchcard_id) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-5" /> Simulador
        </CardTitle>
        <CardDescription>
          Execução somente sob demanda; quantidades permitidas pelo backend: 1.000, 10.000, 100.000
          ou 1.000.000.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[1fr_200px_auto]">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
          >
            {validVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {cards.find((item) => item.id === version.scratchcard_id)?.title ?? "Raspadinha"} —{" "}
                {version.version_name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={simulations}
            onChange={(e) => setSimulations(e.target.value)}
          >
            {[1000, 10000, 100000, 1000000].map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString("pt-BR")}
              </option>
            ))}
          </select>
          <Button onClick={run} disabled={busy || !versionId}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}{" "}
            Simular
          </Button>
        </div>
        {selected && (
          <p className="text-sm text-muted-foreground">
            {card?.title} · {selected.version_name} · {selected.rarity_name ?? selected.rarity_slug}
          </p>
        )}
        {result && (
          <div className="space-y-2">
            {result.outcomes.map((outcome) => {
              const expectedPercent = expected.get(outcome.outcome_id) ?? 0;
              const diff = outcome.percent - expectedPercent;
              return (
                <div
                  key={outcome.outcome_id}
                  className="grid gap-1 rounded-lg border p-3 text-sm sm:grid-cols-5"
                >
                  <strong>{outcome.name}</strong>
                  <span>Esperado {expectedPercent.toFixed(4)}%</span>
                  <span>Simulado {outcome.percent.toFixed(4)}%</span>
                  <span>
                    Dif. {diff >= 0 ? "+" : ""}
                    {diff.toFixed(4)} pp
                  </span>
                  <span>{outcome.count.toLocaleString("pt-BR")} vezes</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
