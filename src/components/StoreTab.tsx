import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile, useProfileUpdater } from "@/hooks/useProfile";

export function StoreTab() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const updateProfile = useProfileUpdater();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["store_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_items")
        .select("id, title, description, image_url, points_cost, stock_available, per_user_limit")
        .eq("active", true)
        .order("points_cost");
      if (error) throw error;
      return data;
    },
  });

  const redeem = async (id: string) => {
    setBusyId(id);
    const { data, error } = await supabase.rpc(
      "redeem_reward_v1" as never,
      {
        p_item_id: id,
        p_client_request_id: crypto.randomUUID(),
      } as never,
    );
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as unknown as { new_points: number; protocol: string };
    updateProfile({ points: Number(res.new_points) });
    qc.invalidateQueries({ queryKey: ["store_items"] });
    toast.success(`Prêmio solicitado! Protocolo: ${res.protocol}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
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
        return (
          <Card key={item.id} className="flex flex-col">
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
              <div className="flex items-center justify-between">
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
              <Button
                variant="glow"
                className="w-full"
                disabled={busyId === item.id || noStock || noPoints}
                onClick={() => redeem(item.id)}
              >
                {busyId === item.id ? (
                  <Loader2 className="size-4 animate-spin" />
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
