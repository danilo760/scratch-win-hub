import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const mathConfigQueryKey = ["admin-math-config", "editor"] as const;

type MathCard = {
  id: string;
  title: string;
  price: number;
  active: boolean;
};

type MathRarity = {
  id: string;
  slug: "bronze" | "prata" | "ouro" | "diamante";
  name: string;
};

type MathOutcome = {
  id: string;
  name: string;
  prize: number;
  points: number;
  weight: number;
};

type MathVersion = {
  id: string;
  scratchcard_id: string;
  version_name: string;
  status: string;
  rarity_id: string | null;
  rarity_slug: string | null;
  rarity_name: string | null;
  published_at: string | null;
  created_at: string;
  outcomes: MathOutcome[];
};

type MathConfig = {
  cards: MathCard[];
  rarities: MathRarity[];
  versions: MathVersion[];
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseMathConfig(value: unknown): MathConfig {
  if (!value || typeof value !== "object") return { cards: [], rarities: [], versions: [] };
  const raw = value as Record<string, unknown>;

  const cards: MathCard[] = Array.isArray(raw.cards)
    ? raw.cards.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const card = entry as Record<string, unknown>;
        const price = numberValue(card.price);
        if (typeof card.id !== "string" || typeof card.title !== "string" || price === null)
          return [];
        return [{ id: card.id, title: card.title, price, active: card.active === true }];
      })
    : [];

  const rarities: MathRarity[] = Array.isArray(raw.rarities)
    ? raw.rarities.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const rarity = entry as Record<string, unknown>;
        if (
          typeof rarity.id !== "string" ||
          typeof rarity.name !== "string" ||
          !["bronze", "prata", "ouro", "diamante"].includes(String(rarity.slug))
        ) {
          return [];
        }
        return [
          {
            id: rarity.id,
            slug: rarity.slug as MathRarity["slug"],
            name: rarity.name,
          },
        ];
      })
    : [];

  const versions: MathVersion[] = Array.isArray(raw.versions)
    ? raw.versions.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const version = entry as Record<string, unknown>;
        if (
          typeof version.id !== "string" ||
          typeof version.scratchcard_id !== "string" ||
          typeof version.version_name !== "string" ||
          typeof version.status !== "string" ||
          typeof version.created_at !== "string"
        ) {
          return [];
        }
        const outcomes: MathOutcome[] = Array.isArray(version.outcomes)
          ? version.outcomes.flatMap((outcomeEntry) => {
              if (!outcomeEntry || typeof outcomeEntry !== "object") return [];
              const outcome = outcomeEntry as Record<string, unknown>;
              const prize = numberValue(outcome.prize);
              const points = numberValue(outcome.points);
              const weight = numberValue(outcome.weight);
              if (
                typeof outcome.id !== "string" ||
                typeof outcome.name !== "string" ||
                prize === null ||
                points === null ||
                weight === null
              ) {
                return [];
              }
              return [{ id: outcome.id, name: outcome.name, prize, points, weight }];
            })
          : [];
        return [
          {
            id: version.id,
            scratchcard_id: version.scratchcard_id,
            version_name: version.version_name,
            status: version.status,
            rarity_id: typeof version.rarity_id === "string" ? version.rarity_id : null,
            rarity_slug: typeof version.rarity_slug === "string" ? version.rarity_slug : null,
            rarity_name: typeof version.rarity_name === "string" ? version.rarity_name : null,
            published_at: typeof version.published_at === "string" ? version.published_at : null,
            created_at: version.created_at,
            outcomes,
          },
        ];
      })
    : [];

  return { cards, rarities, versions };
}

export function MathAdminPanel() {
  const qc = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [cardId, setCardId] = useState("");
  const [versionName, setVersionName] = useState("");
  const [raritySlug, setRaritySlug] = useState("bronze");
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const mathQuery = useQuery({
    queryKey: mathConfigQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_math_config_v1");
      if (error) throw error;
      return parseMathConfig(data);
    },
  });
  const { data = { cards: [], rarities: [], versions: [] }, isLoading, error } = mathQuery;

  useEffect(() => {
    if (!cardId && data.cards[0]) setCardId(data.cards[0].id);
  }, [cardId, data.cards]);

  useEffect(() => {
    if (!data.rarities.some((rarity) => rarity.slug === raritySlug) && data.rarities[0]) {
      setRaritySlug(data.rarities[0].slug);
    }
  }, [data.rarities, raritySlug]);

  useEffect(() => {
    if (!selectedVersionId && data.versions[0]) setSelectedVersionId(data.versions[0].id);
    if (selectedVersionId && !data.versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(data.versions[0]?.id ?? "");
    }
  }, [data.versions, selectedVersionId]);

  const selected = data.versions.find((version) => version.id === selectedVersionId) ?? null;
  const totalWeight = selected?.outcomes.reduce((total, outcome) => total + outcome.weight, 0) ?? 0;
  const expectedPrize =
    selected && totalWeight > 0
      ? selected.outcomes.reduce((total, outcome) => total + outcome.prize * outcome.weight, 0) /
        totalWeight
      : 0;
  const expectedPoints =
    selected && totalWeight > 0
      ? selected.outcomes.reduce((total, outcome) => total + outcome.points * outcome.weight, 0) /
        totalWeight
      : 0;

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-math-config"] });

  const createDraft = async () => {
    if (!cardId || !versionName.trim()) {
      toast.error("Informe a raspadinha e o nome da versão.");
      return;
    }
    setCreating(true);
    const { data: id, error } = await supabase.rpc("create_math_draft_v1", {
      p_card_id: cardId,
      p_version_name: versionName.trim(),
      p_rarity_slug: raritySlug,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setVersionName("");
    if (typeof id === "string") setSelectedVersionId(id);
    await refresh();
    toast.success("Versão DRAFT criada.");
  };

  const publish = async () => {
    if (!selected || selected.status !== "DRAFT") return;
    setPublishing(true);
    const { error } = await supabase.rpc("publish_math_version_v1", {
      p_math_version_id: selected.id,
    });
    setPublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await Promise.all([
      refresh(),
      qc.invalidateQueries({ queryKey: ["active-scratchcards"] }),
      qc.invalidateQueries({ queryKey: ["home-scratchcards"] }),
    ]);
    toast.success("Versão publicada e bloqueada para edição.");
  };

  if (isLoading) return <Loader2 className="animate-spin" />;
  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p role="alert" className="text-destructive">
            Não foi possível carregar a configuração matemática.
          </p>
          <Button variant="outline" onClick={() => void mathQuery.refetch()}>
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Nova versão matemática</CardTitle>
          <CardDescription>
            Sempre crie uma DRAFT. Versões publicadas permanecem imutáveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="math-card">Raspadinha</Label>
            <select
              id="math-card"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
            >
              {data.cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title}
                  {card.active ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="math-version-name">Nome da versão</Label>
            <Input
              id="math-version-name"
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
              placeholder="Ex.: V2 Agosto"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="math-rarity">Raridade</Label>
            <select
              id="math-rarity"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={raritySlug}
              onChange={(event) => setRaritySlug(event.target.value)}
            >
              {data.rarities.map((rarity) => (
                <option key={rarity.id} value={rarity.slug}>
                  {rarity.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            className="md:col-span-3"
            onClick={createDraft}
            disabled={creating || !data.cards.length}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Criar DRAFT
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versões e resultados</CardTitle>
          <CardDescription>
            Probabilidade informativa = peso do outcome ÷ soma dos pesos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="math-version">Versão</Label>
            <select
              id="math-version"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.target.value)}
            >
              {data.versions.map((version) => {
                const card = data.cards.find((item) => item.id === version.scratchcard_id);
                return (
                  <option key={version.id} value={version.id}>
                    {card?.title ?? "Raspadinha"} — {version.version_name} — {version.status}
                  </option>
                );
              })}
            </select>
          </div>

          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selected.status === "PUBLISHED" ? "default" : "secondary"}>
                  {selected.status}
                </Badge>
                <Badge variant="outline">
                  {selected.rarity_name ?? selected.rarity_slug ?? "Sem raridade"}
                </Badge>
                {selected.status === "PUBLISHED" && (
                  <span className="text-xs text-muted-foreground">READ ONLY</span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Soma dos pesos" value={totalWeight.toLocaleString("pt-BR")} />
                <Metric label="Retorno esperado (créditos)" value={expectedPrize.toFixed(4)} />
                <Metric label="Pontos esperados" value={expectedPoints.toFixed(4)} />
              </div>

              <div className="space-y-3">
                {selected.outcomes.map((outcome) => (
                  <OutcomeRow
                    key={outcome.id}
                    outcome={outcome}
                    totalWeight={totalWeight}
                    readOnly={selected.status !== "DRAFT"}
                    onChanged={refresh}
                  />
                ))}
              </div>

              {selected.status === "DRAFT" && (
                <>
                  <NewOutcome versionId={selected.id} onChanged={refresh} />
                  <Button
                    variant="glow"
                    className="w-full"
                    onClick={publish}
                    disabled={publishing || selected.outcomes.length === 0 || totalWeight <= 0}
                  >
                    {publishing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Publicar versão
                  </Button>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma versão matemática cadastrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="text-lg">{value}</strong>
    </div>
  );
}

function OutcomeRow({
  outcome,
  totalWeight,
  readOnly,
  onChanged,
}: {
  outcome: MathOutcome;
  totalWeight: number;
  readOnly: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const [name, setName] = useState(outcome.name);
  const [prize, setPrize] = useState(String(outcome.prize));
  const [points, setPoints] = useState(String(outcome.points));
  const [weight, setWeight] = useState(String(outcome.weight));
  const [busy, setBusy] = useState(false);
  const probability = totalWeight > 0 ? (outcome.weight / totalWeight) * 100 : 0;

  useEffect(() => {
    setName(outcome.name);
    setPrize(String(outcome.prize));
    setPoints(String(outcome.points));
    setWeight(String(outcome.weight));
  }, [outcome]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("update_math_outcome_v1", {
      p_outcome_id: outcome.id,
      p_name: name,
      p_prize: Number(prize),
      p_points: Number(points),
      p_weight: Number(weight),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
    toast.success("Outcome atualizado.");
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_math_outcome_v1", { p_outcome_id: outcome.id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
    toast.success("Outcome removido.");
  };

  return (
    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <Input
        aria-label="Nome do outcome"
        value={name}
        disabled={readOnly}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        aria-label="Prêmio em créditos"
        type="number"
        min="0"
        step="0.01"
        value={prize}
        disabled={readOnly}
        onChange={(e) => setPrize(e.target.value)}
      />
      <Input
        aria-label="Pontos"
        type="number"
        min="0"
        step="1"
        value={points}
        disabled={readOnly}
        onChange={(e) => setPoints(e.target.value)}
      />
      <div className="space-y-1">
        <Input
          aria-label="Peso"
          type="number"
          min="0.0001"
          step="0.0001"
          value={weight}
          disabled={readOnly}
          onChange={(e) => setWeight(e.target.value)}
        />
        <p className="text-center text-[11px] text-muted-foreground">{probability.toFixed(4)}%</p>
      </div>
      {!readOnly && (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            disabled={busy}
            onClick={save}
            aria-label="Salvar outcome"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            disabled={busy}
            onClick={remove}
            aria-label="Remover outcome"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function NewOutcome({
  versionId,
  onChanged,
}: {
  versionId: string;
  onChanged: () => Promise<unknown> | void;
}) {
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("0");
  const [points, setPoints] = useState("0");
  const [weight, setWeight] = useState("1");
  const [busy, setBusy] = useState(false);

  const canSave = useMemo(
    () => name.trim() && Number(prize) >= 0 && Number(points) >= 0 && Number(weight) > 0,
    [name, points, prize, weight],
  );

  const add = async () => {
    if (!canSave) return;
    setBusy(true);
    const { error } = await supabase.rpc("add_math_outcome_v1", {
      p_math_version_id: versionId,
      p_name: name.trim(),
      p_prize: Number(prize),
      p_points: Number(points),
      p_weight: Number(weight),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setPrize("0");
    setPoints("0");
    setWeight("1");
    await onChanged();
    toast.success("Outcome adicionado.");
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4" /> Novo outcome
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Prêmio"
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Pontos"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
        <Input
          type="number"
          min="0.0001"
          step="0.0001"
          placeholder="Peso"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        <Button
          size="icon"
          disabled={busy || !canSave}
          onClick={add}
          aria-label="Adicionar outcome"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </CardContent>
    </Card>
  );
}
