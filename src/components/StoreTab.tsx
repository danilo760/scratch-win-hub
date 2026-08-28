import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { profileQueryKey, useProfile, useProfileUpdater } from "@/hooks/useProfile";

type RedemptionResult = {
  id: string;
  protocol: string;
  status: string;
  new_points: number;
  idempotent: boolean;
};

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseRedemptionResult(value: unknown): RedemptionResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const newPoints = readFiniteNumber(raw.new_points);
  if (
    typeof raw.id !== "string" ||
    typeof raw.protocol !== "string" ||
    raw.protocol.trim() === "" ||
    typeof raw.status !== "string" ||
    newPoints === null
  ) {
    return null;
  }
  return {
    id: raw.id,
    protocol: raw.protocol,
    status: raw.status,
    new_points: newPoints,
    idempotent: raw.idempotent === true,
  };
}

export function StoreTab() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const updateProfile = useProfileUpdater();
  const [busyId, setBusyId] = useState<string | null>(null);
  const pendingRequestIds = useRef(new Map<string, string>());

  const {
    data: items,
    isLoading,
    error: storeError,
  } = useQuery({
    queryKey: ["store_items"],
    queryFn: async () => {
      const [itemsResult, redemptionsResult] = await Promise.all([
        supabase
          .from("store_items")
          .select(
            "id, title, description, image_url, points_cost, stock_available, per_user_limit, display_order",
          )
          .eq("active", true)
          .order("display_order")
          .order("points_cost"),
        supabase.from("redemptions").select("item_id, status").neq("status", "CANCELADO"),
      ]);

      if (itemsResult.error) throw itemsResult.error;
      if (redemptionsResult.error) throw redemptionsResult.error;

      const usedByItem = new Map<string, number>();
      for (const redemption of redemptionsResult.data) {
        usedByItem.set(redemption.item_id, (usedByItem.get(redemption.item_id) ?? 0) + 1);
      }

      return itemsResult.data.map((item) => ({
        ...item,
        redeemed_count: usedByItem.get(item.id) ?? 0,
      }));
    },
  });

  const redeem = async (id: string) => {
    setBusyId(id);
    const requestId = pendingRequestIds.current.get(id) ?? crypto.randomUUID();
    pendingRequestIds.current.set(id, requestId);
    const { data, error } = await supabase.rpc("redeem_reward_v1", {
      p_item_id: id,
      p_client_request_id: requestId,
    });
    setBusyId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    const res = parseRedemptionResult(data);
    if (!res) {
      toast.error("O servidor retornou uma resposta de resgate inválida. Tente novamente.");
      return;
    }

    pendingRequestIds.current.delete(id);
    updateProfile({ points: res.new_points });
    await Promise.all([
      qc.invalidateQueries({ queryKey: profileQueryKey }),
      qc.invalidateQueries({ queryKey: ["store_items"] }),
      qc.invalidateQueries({ queryKey: ["my-rewards"] }),
    ]);
    toast.success(`Prêmio solicitado! Protocolo: ${res.protocol}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (storeError) {
    return (
      <p role="alert" className="py-16 text-center text-destructive">
        Não foi possível carregar a loja. Tente novamente.
      </p>
    );
  }

  if (!items?.length) {
    return (
      <p className="py-16 text-center text-muted-foreground">Nenhum item disponível na loja.</p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const noStock = item.stock_available <= 0;
        const noPoints = (profile?.points ?? 0) < item.points_cost;
        const limitReached = item.redeemed_count >= item.per_user_limit;
        return (
          <Card key={item.id} className="flex flex-col overflow-hidden">
            {item.image_url && (
              <img src={item.image_url} alt="" className="h-36 w-full object-cover" />
            )}
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="size-5 text-accent" />
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-black text-accent">{item.points_cost} pts</span>
                  <Badge variant={noStock ? "destructive" : "secondary"} className="gap-1">
                    <Package className="size-3.5" />
                    {noStock
                      ? "ESGOTADO"
                      : item.stock_available <= 3
                        ? `🔥 Restam apenas ${item.stock_available}`
                        : `${item.stock_available} em estoque`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Limite por usuário: {item.redeemed_count}/{item.per_user_limit}
                </p>
              </div>
              <Button
                variant="glow"
                className="w-full"
                disabled={busyId === item.id || noStock || noPoints || limitReached}
                onClick={() => redeem(item.id)}
              >
                {busyId === item.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : limitReached ? (
                  "Limite atingido"
                ) : noPoints ? (
                  "Pontos insuficientes"
                ) : (
                  "Resgatar Item"
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
