import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const specialScratchStatusQueryKey = ["special-scratch-status"] as const;

export type SpecialScratchStatus = {
  daily_available: boolean;
  daily_card_id: string | null;
  daily_title: string | null;
  mystery_available: boolean;
  mystery_version_id: string | null;
  mystery_name: string | null;
};

function parseSpecialScratchStatus(value: unknown): SpecialScratchStatus {
  if (!value || typeof value !== "object") {
    return {
      daily_available: false,
      daily_card_id: null,
      daily_title: null,
      mystery_available: false,
      mystery_version_id: null,
      mystery_name: null,
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    daily_available: raw.daily_available === true,
    daily_card_id: typeof raw.daily_card_id === "string" ? raw.daily_card_id : null,
    daily_title: typeof raw.daily_title === "string" ? raw.daily_title : null,
    mystery_available: raw.mystery_available === true,
    mystery_version_id:
      typeof raw.mystery_version_id === "string" ? raw.mystery_version_id : null,
    mystery_name: typeof raw.mystery_name === "string" ? raw.mystery_name : null,
  };
}

export function useSpecialScratchStatus() {
  return useQuery({
    queryKey: specialScratchStatusQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_special_scratch_status_v1" as never);
      if (error) throw error;
      return parseSpecialScratchStatus(data);
    },
  });
}
