import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type ProtocolColumnType = "number" | "text" | "user" | "date" | "status" | "project";

export type ProtocolColumn = {
  key: string;
  label: string;
  type: ProtocolColumnType;
  required?: boolean;
};

export type ProtocolTemplate = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_system: boolean;
  system_key: string | null;
  required_axes: string[];
  optional_axes: string[];
  default_columns: ProtocolColumn[];
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * Список шаблонов протоколов текущего пользователя.
 * Системные шаблоны идут первыми (по position).
 */
export function useProtocolTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["protocol_templates", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocol_templates" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ProtocolTemplate[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
