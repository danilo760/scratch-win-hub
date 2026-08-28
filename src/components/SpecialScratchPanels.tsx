import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { profileQueryKey } from "@/hooks/useProfile";
import {
  specialScratchStatusQueryKey,
  useSpecialScratchStatus,
} from "@/hooks/useSpecialScratchStatus";

export function DailyScratchPanel() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useSpecialScratchStatus();
  const [busy, setBusy] = useState(false);
  const pendingRequestId = useRef<string | null>(null);

  const claim = async () => {
    if (!status?.daily_available || busy) return;
    setBusy(true);
    pendingRequestId.current ??= crypto.randomUUID();
    const { data, error } = await supabase.rpc(
      "claim_daily_scratch_v2" as never,
      { p_client_request_id: pendingRequestId.current } as never,
    );
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data || typeof data !== "object") {
      toast.error("O servidor retornou uma resposta diária inválida. Tente novamente.");
      return;
    }

    pendingRequestId.current = null;
    await Promise.all([
      qc.invalidateQueries({ queryKey: profileQueryKey }),
      qc.invalidateQueries({ queryKey: specialScratchStatusQueryKey }),
    ]);
    const raw = data as Record<string, unknown>;
    toast.success(
      raw.already_claimed === true
        ? "Sua cortesia de hoje já foi usada."
        : "Cortesia diária registrada com sucesso!",
    );
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-5 text-accent" /> Raspadinha diária
        </CardTitle>
        <CardDescription>
          Uma cortesia por dia. A raspadinha é escolhida exclusivamente pelo servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : status?.daily_available ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status.daily_title ?? "Raspadinha diária configurada"}
            </p>
            <Button className="w-full" disabled={busy} onClick={claim}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Resgatar cortesia"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-dashed p-4 text-center">
              <strong className="block">Configuração pendente</strong>
              <span className="text-sm text-muted-foreground">Em breve</span>
            </div>
            <Button className="w-full" disabled>
              Em breve
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MysteryScratchPanel() {
  const { data: status, isLoading } = useSpecialScratchStatus();
  const [busy, setBusy] = useState(false);
  const pendingRequestId = useRef<string | null>(null);

  const open = async () => {
    if (!status?.mystery_available || busy) return;
    setBusy(true);
    pendingRequestId.current ??= crypto.randomUUID();
    const { data, error } = await supabase.rpc(
      "open_mystery_scratch_v1" as never,
      { p_client_request_id: pendingRequestId.current } as never,
    );
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data || typeof data !== "object") {
      toast.error("O servidor retornou uma resposta misteriosa inválida. Tente novamente.");
      return;
    }

    pendingRequestId.current = null;
    toast.success("Raspadinha misteriosa selecionada com segurança.");
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> Raspadinha misteriosa
        </CardTitle>
        <CardDescription>
          O pool publicado escolhe a experiência antes de qualquer revelação visual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : status?.mystery_available ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status.mystery_name ?? "Pool misterioso publicado"}
            </p>
            <Button className="w-full" variant="glow" disabled={busy} onClick={open}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Abrir misteriosa"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-dashed p-4 text-center">
              <strong className="block">Raspadinha misteriosa</strong>
              <span className="text-sm text-muted-foreground">Em breve</span>
            </div>
            <Button className="w-full" variant="outline" disabled>
              Em breve
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
