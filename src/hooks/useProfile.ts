import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string | null;
  balance: number;
  points: number;
  is_admin: boolean;
};

export const profileQueryKey = ["profile"] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async (): Promise<Profile | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, balance, points, is_admin")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        email: data.email ?? auth.user.email ?? null,
        balance: Number(data.balance),
        points: data.points,
        is_admin: data.is_admin,
      };
    },
  });
}

export function useProfileUpdater() {
  const qc = useQueryClient();
  return (patch: Partial<Pick<Profile, "balance" | "points">>) => {
    qc.setQueryData(profileQueryKey, (old: Profile | null | undefined) =>
      old ? { ...old, ...patch } : old,
    );
  };
}

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
