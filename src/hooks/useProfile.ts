import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminRole = "user" | "admin" | "admin_master";

export type Profile = {
  id: string;
  email: string | null;
  balance: number;
  points: number;
  is_admin: boolean;
  admin_role: AdminRole;
};

export const profileQueryKey = ["profile"] as const;

function parseAdminRole(value: unknown, isAdmin: boolean): AdminRole {
  if (value === "admin_master" || value === "admin" || value === "user") return value;
  return isAdmin ? "admin" : "user";
}

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async (): Promise<Profile | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, balance, points, is_admin, admin_role")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const adminRole = parseAdminRole(data.admin_role, data.is_admin);
      const isAdmin = adminRole === "admin" || adminRole === "admin_master";

      return {
        id: data.id,
        email: data.email ?? auth.user.email ?? null,
        balance: Number(data.balance),
        points: data.points,
        is_admin: isAdmin,
        admin_role: adminRole,
      };
    },
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
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
