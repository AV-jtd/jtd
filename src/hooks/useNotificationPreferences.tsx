import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface NotificationPrefs {
  id: string;
  user_id: string;
  push_task_assigned: boolean;
  push_task_completed: boolean;
  push_task_commented: boolean;
  push_deadline_approaching: boolean;
  push_added_to_group: boolean;
  push_task_participant_added: boolean;
  push_new_task_in_group: boolean;
  push_task_delegated: boolean;
  telegram_task_assigned: boolean;
  telegram_task_completed: boolean;
  telegram_task_commented: boolean;
  telegram_deadline_approaching: boolean;
  telegram_added_to_group: boolean;
  telegram_task_participant_added: boolean;
  telegram_new_task_in_group: boolean;
  telegram_task_delegated: boolean;
  telegram_weekly_report: boolean;
  telegram_weekly_ai_review: boolean;
  telegram_group_chat_message: boolean;
}

const DEFAULTS: Omit<NotificationPrefs, "id" | "user_id"> = {
  push_task_assigned: true,
  push_task_completed: true,
  push_task_commented: false,
  push_deadline_approaching: false,
  push_added_to_group: true,
  push_task_participant_added: true,
  push_new_task_in_group: false,
  push_task_delegated: true,
  telegram_task_assigned: false,
  telegram_task_completed: false,
  telegram_task_commented: false,
  telegram_deadline_approaching: false,
  telegram_added_to_group: false,
  telegram_task_participant_added: false,
  telegram_new_task_in_group: false,
  telegram_task_delegated: false,
  telegram_weekly_report: false,
  telegram_weekly_ai_review: true,
  telegram_group_chat_message: false,
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notification_preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create default prefs
        const { data: created, error: insertErr } = await supabase
          .from("notification_preferences")
          .insert({ user_id: user!.id, ...DEFAULTS } as any)
          .select()
          .single();
        if (insertErr) throw insertErr;
        return created as unknown as NotificationPrefs;
      }

      return data as unknown as NotificationPrefs;
    },
  });

  const updatePrefs = useMutation({
    mutationFn: async (updates: Partial<NotificationPrefs>) => {
      const { error } = await supabase
        .from("notification_preferences")
        .update(updates as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ["notification_preferences", user?.id] });
      const prev = qc.getQueryData<NotificationPrefs>(["notification_preferences", user?.id]);
      if (prev) {
        qc.setQueryData(["notification_preferences", user?.id], { ...prev, ...updates });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notification_preferences", user?.id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notification_preferences"] }),
  });

  return { prefs: query.data, isLoading: query.isLoading, updatePrefs };
}
