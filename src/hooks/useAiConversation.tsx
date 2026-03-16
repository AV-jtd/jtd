import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  parsedTask?: any;
  projectPlan?: any;
  created?: boolean;
  ts?: number;
}

interface UseAiConversationOptions {
  contextType: "assistant" | "project_chat";
  contextId?: string | null;
}

export function useAiConversation({ contextType, contextId }: UseAiConversationOptions) {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load or create conversation
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      let query = supabase
        .from("ai_conversations")
        .select("id, messages")
        .eq("user_id", user.id)
        .eq("context_type", contextType)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (contextId) {
        query = query.eq("context_id", contextId);
      } else {
        query = query.is("context_id", null);
      }

      const { data } = await (query as any);
      if (data && data.length > 0) {
        setConversationId(data[0].id);
        setMessages((data[0].messages as AiMessage[]) || []);
      } else {
        setConversationId(null);
        setMessages([]);
      }
      setLoading(false);
    };

    load();
  }, [user, contextType, contextId]);

  // Debounced save
  const persistMessages = useCallback(async (msgs: AiMessage[]) => {
    if (!user) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (conversationId) {
          await (supabase.from("ai_conversations") as any)
            .update({ messages: msgs, updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        } else {
          const title = msgs.find(m => m.role === "user")?.content?.slice(0, 100) || "Новый чат";
          const { data } = await (supabase.from("ai_conversations") as any)
            .insert({
              user_id: user.id,
              context_type: contextType,
              context_id: contextId || null,
              title,
              messages: msgs,
            })
            .select("id")
            .single();
          if (data) setConversationId(data.id);
        }
      } catch (e) {
        console.error("Failed to persist AI conversation:", e);
      }
    }, 800);
  }, [user, conversationId, contextType, contextId]);

  const addMessage = useCallback((msg: AiMessage) => {
    setMessages(prev => {
      const next = [...prev, { ...msg, ts: Date.now() }];
      persistMessages(next);
      return next;
    });
  }, [persistMessages]);

  const updateLastAssistant = useCallback((content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        const next = prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
        persistMessages(next);
        return next;
      }
      const next = [...prev, { role: "assistant" as const, content, ts: Date.now() }];
      persistMessages(next);
      return next;
    });
  }, [persistMessages]);

  const updateMessage = useCallback((index: number, updates: Partial<AiMessage>) => {
    setMessages(prev => {
      const next = prev.map((m, i) => i === index ? { ...m, ...updates } : m);
      persistMessages(next);
      return next;
    });
  }, [persistMessages]);

  const clearConversation = useCallback(async () => {
    setMessages([]);
    if (conversationId) {
      await (supabase.from("ai_conversations") as any).delete().eq("id", conversationId);
      setConversationId(null);
    }
  }, [conversationId]);

  return {
    messages,
    setMessages,
    addMessage,
    updateLastAssistant,
    updateMessage,
    clearConversation,
    loading,
    conversationId,
  };
}
