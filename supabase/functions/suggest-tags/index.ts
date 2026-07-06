import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const { taskTitle, taskDescription, availableTags } = await req.json();

    if (!taskTitle || !availableTags || availableTags.length === 0) {
      return new Response(JSON.stringify({ suggestedTagIds: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const tagList = availableTags.map((t: { id: string; name: string }) => `- id: "${t.id}", name: "${t.name}"`).join("\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a tag suggestion assistant. Given a task title and description, suggest the most relevant tags from the available list. Return ONLY the IDs of 1-5 most relevant tags. If none are relevant, return an empty array.`,
          },
          {
            role: "user",
            content: `Task title: "${taskTitle}"
${taskDescription ? `Task description: "${taskDescription}"` : ""}

Available tags:
${tagList}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_tags",
              description: "Return the IDs of the most relevant tags for this task",
              parameters: {
                type: "object",
                properties: {
                  tag_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of tag IDs that are most relevant to the task",
                  },
                },
                required: ["tag_ids"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_tags" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ suggestedTagIds: [], error: "rate_limited" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ suggestedTagIds: [], error: "payment_required" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ suggestedTagIds: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      const validIds = (parsed.tag_ids || []).filter((id: string) =>
        availableTags.some((t: { id: string }) => t.id === id)
      );
      return new Response(JSON.stringify({ suggestedTagIds: validIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggestedTagIds: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-tags error:", e);
    return new Response(JSON.stringify({ suggestedTagIds: [], error: e instanceof Error ? e.message : "Unknown" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
