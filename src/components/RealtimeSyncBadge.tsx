import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { profileQueryKey } from "@/hooks/useProfile";

type RealtimeSyncStatus = "connecting" | "live" | "offline";

type Props = {
  userId: string | undefined;
};

export function RealtimeSyncBadge({ userId }: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeSyncStatus>("connecting");

  useEffect(() => {
    if (!userId) {
      setStatus("connecting");
      return;
    }

    setStatus("connecting");

    const invalidateProfile = () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["profile-preferences"] });
    };

    const invalidateRewards = () => {
      void queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["store_items"] });
    };

    const channel = supabase
      .channel(`user:${userId}:visual-sync`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        invalidateProfile,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "redemptions",
          filter: `user_id=eq.${userId}`,
        },
        invalidateRewards,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "redemptions",
          filter: `user_id=eq.${userId}`,
        },
        invalidateRewards,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_items" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["store_items"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_achievements",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["home-achievements"] });
        },
      )
      .subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED") {
          setStatus("live");
          return;
        }
        if (
          nextStatus === "CHANNEL_ERROR" ||
          nextStatus === "TIMED_OUT" ||
          nextStatus === "CLOSED"
        ) {
          setStatus("offline");
          return;
        }
        setStatus("connecting");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const label =
    status === "live"
      ? "Atualizações em tempo real conectadas"
      : status === "connecting"
        ? "Conectando atualizações em tempo real"
        : "Atualizações em tempo real indisponíveis";
  const text =
    status === "live" ? "Ao vivo" : status === "connecting" ? "Conectando" : "Offline";
  const dotClass =
    status === "live"
      ? "bg-success"
      : status === "connecting"
        ? "bg-accent"
        : "bg-muted-foreground";

  return (
    <div
      role="status"
      aria-label={label}
      data-testid="realtime-status"
      className="hidden items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium sm:flex"
    >
      <span className={`size-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
