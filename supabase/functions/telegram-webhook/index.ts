import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const body = await req.json();

    // Setup webhook command
    if (body.action === "setup_webhook") {
      const webhookUrl = `https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/telegram-webhook`;
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl }),
        }
      );
      const result = await res.json();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    const message = body.message;
    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const username = message.from?.username;

    // Handle /start command
    if (message.text === "/start") {
      // Save username → chat_id mapping for 2FA (before profile exists)
      if (username) {
        const supabaseEarly = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabaseEarly
          .from("telegram_bot_chats")
          .upsert(
            { telegram_username: username.toLowerCase(), chat_id: chatId, updated_at: new Date().toISOString() },
            { onConflict: "telegram_username" }
          );
      }

      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        "👋 Привет! Я TaskFlow Bot.\n\n" +
        "📝 Отправь сообщение — создам задачу.\n\n" +
        "🔧 Возможности:\n" +
        "• `!` в начале — важная задача\n" +
        "• `#тег` — добавить тег\n" +
        "• `@username` — назначить ответственного\n" +
        "• `завтра`, `послезавтра`, `DD.MM`, `DD.MM.YYYY` — дедлайн\n" +
        "• `/project` — выбрать проект\n" +
        "• `/projects` — список проектов\n" +
        "• `/chat Проект Сообщение` — чат проекта\n" +
        "• `/help` — справка",
        "Markdown"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Handle /help
    if (message.text === "/help") {
      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        "📖 *Справка TaskFlow Bot*\n\n" +
        "Просто отправь текст — создам задачу.\n\n" +
        "*Модификаторы (в любом порядке):*\n" +
        "• `!` в начале текста — пометить как важную\n" +
        "• `#работа` — добавить тег «работа»\n" +
        "• `@ivan` — назначить на пользователя @ivan\n\n" +
        "*Даты (в тексте):*\n" +
        "• `сегодня`, `завтра`, `послезавтра`\n" +
        "• `через 3 дня`, `через неделю`\n" +
        "• `15.03` или `15.03.2026`\n\n" +
        "*Проекты:*\n" +
        "• `/projects` — список ваших проектов\n" +
        "• `/project Название` — выбрать проект\n" +
        "• После выбора все задачи идут в этот проект\n" +
        "• `/project` без аргумента — сбросить проект\n\n" +
        "*Чат проекта:*\n" +
        "• `/chat Название Сообщение` — отправить в чат проекта",
        "Markdown"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (!username) {
      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        "❌ У вас не установлен username в Telegram. Установите его в настройках Telegram."
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find user by telegram_username
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_username", username.toLowerCase())
      .single();

    if (profileError || !profile) {
      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        `❌ Аккаунт с username @${username} не найден.\n\nПривяжите свой Telegram в настройках TaskFlow.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const userId = profile.id;

    // Save telegram chat_id for reverse sync
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: chatId })
      .eq("id", userId);

    // Handle /projects — list user's projects (owned + member)
    if (message.text === "/projects") {
      // Get owned projects
      const { data: ownedGroups } = await supabase
        .from("task_groups")
        .select("id, name, icon, parent_id")
        .eq("user_id", userId)
        .order("position");

      // Get member projects
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      const memberGroupIds = (memberships || []).map(m => m.group_id);
      const ownedIds = new Set((ownedGroups || []).map(g => g.id));
      // Filter out groups user already owns
      const memberOnlyIds = memberGroupIds.filter(id => !ownedIds.has(id));

      let memberGroups: { id: string; name: string; icon: string | null; parent_id: string | null }[] = [];
      if (memberOnlyIds.length > 0) {
        const { data } = await supabase
          .from("task_groups")
          .select("id, name, icon, parent_id")
          .in("id", memberOnlyIds)
          .order("position");
        memberGroups = data || [];
      }

      const allGroups = [...(ownedGroups || []), ...memberGroups];
      if (allGroups.length === 0) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "📂 У вас пока нет проектов.");
      } else {
        let text = "";

        // Own projects
        if (ownedGroups && ownedGroups.length > 0) {
          text += "📂 *Мои проекты:*\n\n";
          const parents = ownedGroups.filter(g => !g.parent_id);
          const children = ownedGroups.filter(g => g.parent_id);
          for (const p of parents) {
            text += `${p.icon || "📁"} *${escapeMarkdown(p.name)}*\n`;
            const subs = children.filter(c => c.parent_id === p.id);
            for (const s of subs) {
              text += `  └ ${s.icon || "📄"} ${escapeMarkdown(s.name)}\n`;
            }
          }
        }

        // Member projects
        if (memberGroups.length > 0) {
          text += "\n👥 *Участник:*\n\n";
          const parents = memberGroups.filter(g => !g.parent_id);
          const children = memberGroups.filter(g => g.parent_id);
          for (const p of parents) {
            text += `${p.icon || "📁"} *${escapeMarkdown(p.name)}*\n`;
            const subs = children.filter(c => c.parent_id === p.id);
            for (const s of subs) {
              text += `  └ ${s.icon || "📄"} ${escapeMarkdown(s.name)}\n`;
            }
          }
        }

        text += "\nИспользуй `/project Название` чтобы выбрать.";
        await sendTelegramMessage(BOT_TOKEN, chatId, text, "Markdown");
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Handle /project — set active project
    if (message.text.startsWith("/project")) {
      const projectName = message.text.replace(/^\/project\s*/, "").trim();
      if (!projectName) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "📂 Проект сброшен. Задачи будут создаваться без проекта.");
        return new Response(JSON.stringify({ ok: true, active_project: null }), { headers: corsHeaders });
      }

      // Search in owned projects first
      let { data: group } = await supabase
        .from("task_groups")
        .select("id, name, icon")
        .eq("user_id", userId)
        .ilike("name", projectName)
        .single();

      // If not found, search in member projects
      if (!group) {
        const { data: membership } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", userId);

        if (membership && membership.length > 0) {
          const { data: memberGroup } = await supabase
            .from("task_groups")
            .select("id, name, icon")
            .in("id", membership.map(m => m.group_id))
            .ilike("name", projectName)
            .single();
          group = memberGroup;
        }
      }

      if (!group) {
        // Fuzzy search for similar project names
        const { data: allUserGroups } = await supabase
          .from("task_groups")
          .select("name, icon")
          .eq("user_id", userId);

        const allNames = (allUserGroups || []).map(g => g);
        // Also check member groups
        if (membership && membership.length > 0) {
          const { data: mGroups } = await supabase
            .from("task_groups")
            .select("name, icon")
            .in("id", membership.map(m => m.group_id));
          if (mGroups) allNames.push(...mGroups);
        }

        const suggestions = allNames
          .filter(g => fuzzyMatch(projectName, g.name))
          .slice(0, 3);

        let hint = "";
        if (suggestions.length > 0) {
          hint = `\n💡 Возможно: ${suggestions.map(s => `${s.icon || "📁"} ${s.name}`).join(", ")}`;
        }

        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `❌ Проект «${projectName}» не найден.${hint}\nИспользуй /projects для списка.`
        );
      } else {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `✅ Проект: ${group.icon || "📁"} *${escapeMarkdown(group.name)}*\n\nТеперь добавляй \`#${escapeMarkdown(group.name)}\` к задачам или просто пиши — задачи попадут в этот проект.`,
          "Markdown"
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Handle /chat — send message to project chat
    if (message.text.startsWith("/chat")) {
      const parts = message.text.replace(/^\/chat\s*/, "").trim();
      const firstSpace = parts.indexOf(" ");
      if (firstSpace === -1 || !parts.trim()) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "💬 Формат: `/chat Название проекта Сообщение`\n\nПример: `/chat Работа Привет всем!`",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Try to find project by matching the beginning of the text (owned + member)
      const { data: ownedGroups } = await supabase
        .from("task_groups")
        .select("id, name, icon")
        .eq("user_id", userId);

      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      let memberGroups: { id: string; name: string; icon: string | null }[] = [];
      const ownedIds = new Set((ownedGroups || []).map(g => g.id));
      const memberOnlyIds = (memberships || []).map(m => m.group_id).filter(id => !ownedIds.has(id));
      if (memberOnlyIds.length > 0) {
        const { data } = await supabase
          .from("task_groups")
          .select("id, name, icon")
          .in("id", memberOnlyIds);
        memberGroups = data || [];
      }

      const allGroups = [...(ownedGroups || []), ...memberGroups];
      let matchedGroup: { id: string; name: string; icon: string | null } | null = null;
      let chatMessage = "";

      if (allGroups.length > 0) {
        const sorted = [...allGroups].sort((a, b) => b.name.length - a.name.length);
        for (const g of sorted) {
          if (parts.toLowerCase().startsWith(g.name.toLowerCase())) {
            matchedGroup = g;
            chatMessage = parts.substring(g.name.length).trim();
            break;
          }
        }
      }

      if (!matchedGroup || !chatMessage) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Не удалось определить проект или сообщение пустое.\nИспользуй `/projects` для списка.",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { error: msgError } = await supabase
        .from("group_messages")
        .insert({
          group_id: matchedGroup.id,
          user_id: userId,
          content: chatMessage,
          source: "telegram",
        });

      if (msgError) {
        console.error("Chat message error:", msgError);
        await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось отправить сообщение в чат.");
      } else {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `💬 Сообщение отправлено в ${matchedGroup.icon || "📁"} *${escapeMarkdown(matchedGroup.name)}*`,
          "Markdown"
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Parse message for task creation ===
    let text = message.text;

    // 1. Check importance (! at the start)
    const isImportant = text.startsWith("!");
    if (isImportant) {
      text = text.substring(1).trim();
    }

    // 2. Extract tags (#tag)
    const tagMatches = text.match(/#(\S+)/g) || [];
    const tagNames = tagMatches.map(t => t.substring(1).toLowerCase());
    text = text.replace(/#\S+/g, "").trim();

    // 3. Extract assignee (@username)
    const assigneeMatch = text.match(/@(\S+)/);
    let assigneeUsername: string | null = null;
    if (assigneeMatch) {
      assigneeUsername = assigneeMatch[1].toLowerCase();
      text = text.replace(/@\S+/, "").trim();
    }

    // 4. Extract deadline from text
    const deadline = parseDeadline(text);
    if (deadline.cleaned !== text) {
      text = deadline.cleaned.trim();
    }

    // 5. Find project by tag name match or first tag
    let groupId: string | null = null;
    if (tagNames.length > 0) {
      // Try to find a project whose linked tag matches one of the tag names
      const { data: matchingGroups } = await supabase
        .from("task_groups")
        .select("id, name, linked_tag_id, tags!task_groups_linked_tag_id_fkey(name)")
        .eq("user_id", userId);

      if (matchingGroups) {
        for (const g of matchingGroups as any[]) {
          const tagName = g.tags?.name?.toLowerCase();
          if (tagName && tagNames.includes(tagName)) {
            groupId = g.id;
            break;
          }
        }
      }
    }

    // 6. Find assignee profile (with fuzzy fallback)
    let assignedTo: string | null = null;
    let assigneeFuzzyHint = "";
    if (assigneeUsername) {
      const { data: assignee } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_username", assigneeUsername)
        .single();

      if (assignee) {
        assignedTo = assignee.id;
      } else {
        // Fuzzy search: find similar usernames from team members
        const { data: teamMembers } = await supabase
          .from("team_members")
          .select("user_id")
          .in("team_id", (await supabase.from("team_members").select("team_id").eq("user_id", userId)).data?.map(t => t.team_id) || []);

        if (teamMembers && teamMembers.length > 0) {
          const memberIds = [...new Set(teamMembers.map(m => m.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("telegram_username, display_name")
            .in("id", memberIds)
            .not("telegram_username", "is", null);

          if (profiles && profiles.length > 0) {
            const suggestions = profiles
              .filter(p => p.telegram_username && fuzzyMatch(assigneeUsername, p.telegram_username))
              .slice(0, 3);
            if (suggestions.length > 0) {
              assigneeFuzzyHint = `\n💡 Возможно: ${suggestions.map(s => `@${s.telegram_username} (${s.display_name || ""})`).join(", ")}`;
            }
          }
        }
      }
    }

    // Clean up extra spaces
    text = text.replace(/\s+/g, " ").trim();

    if (!text) {
      await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Текст задачи не может быть пустым.");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Create the task
    const taskData: Record<string, any> = {
      title: text.substring(0, 500),
      user_id: userId,
      is_important: isImportant,
    };

    if (text.length > 500) taskData.description = text;
    if (deadline.date) taskData.deadline = deadline.date.toISOString();
    if (groupId) taskData.group_id = groupId;
    if (assignedTo) taskData.assigned_to = assignedTo;

    const { data: newTask, error: taskError } = await supabase
      .from("tasks")
      .insert(taskData)
      .select("id")
      .single();

    if (taskError) {
      console.error("Task creation error:", taskError);
      await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Ошибка создания задачи.");
      return new Response(JSON.stringify({ error: taskError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Add tags
    if (tagNames.length > 0 && newTask) {
      for (const tagName of tagNames) {
        // Find or create tag
        let { data: tag } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", tagName)
          .single();

        if (!tag) {
          const { data: newTag } = await supabase
            .from("tags")
            .insert({ name: tagName, user_id: userId })
            .select("id")
            .single();
          tag = newTag;
        }

        if (tag) {
          await supabase.from("task_tags").insert({
            task_id: newTask.id,
            tag_id: tag.id,
          });
        }
      }
    }

    // Build confirmation message
    let confirmation = `✅ Задача создана: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`;
    const extras: string[] = [];
    if (isImportant) extras.push("⭐ важная");
    if (deadline.date) extras.push(`📅 ${formatDate(deadline.date)}`);
    if (tagNames.length > 0) extras.push(`🏷 ${tagNames.map(t => "#" + t).join(" ")}`);
    if (assigneeUsername) {
      if (assignedTo) {
        extras.push(`👤 @${assigneeUsername}`);
      } else {
        extras.push(`⚠️ @${assigneeUsername} не найден${assigneeFuzzyHint}`);
      }
    }
    if (groupId) extras.push("📂 в проекте");
    if (extras.length > 0) confirmation += "\n" + extras.join(" | ");

    await sendTelegramMessage(BOT_TOKEN, chatId, confirmation);

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

// === Helpers ===

async function sendTelegramMessage(token: string, chatId: number, text: string, parseMode?: string) {
  const body: Record<string, any> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function fuzzyMatch(query: string, candidate: string): boolean {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return false; // exact match handled elsewhere
  // Check if one contains the other
  if (c.includes(q) || q.includes(c)) return true;
  // Levenshtein distance <= 2 for short strings
  if (q.length <= 12 && c.length <= 20) {
    return levenshtein(q, c) <= 2;
  }
  // First 3 chars match
  return q.length >= 3 && c.startsWith(q.substring(0, 3));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function parseDeadline(text: string): { date: Date | null; cleaned: string } {
  const now = new Date();
  let cleaned = text;
  let date: Date | null = null;

  // Use non-word-boundary approach for Cyrillic (regex \b doesn't work with Unicode)
  const patterns: [RegExp, (m: RegExpMatchArray) => Date][] = [
    [/(?:^|\s)сегодня(?:\s|$)/i, () => {
      const d = new Date(now); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)завтра(?:\s|$)/i, () => {
      const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)послезавтра(?:\s|$)/i, () => {
      const d = new Date(now); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)через\s+(\d+)\s+(?:день|дня|дней)(?:\s|$)/i, (m) => {
      const d = new Date(now); d.setDate(d.getDate() + parseInt(m[1])); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)через\s+неделю(?:\s|$)/i, () => {
      const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)через\s+месяц(?:\s|$)/i, () => {
      const d = new Date(now); d.setMonth(d.getMonth() + 1); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(\d{1,2})\.(\d{1,2})\.(\d{4})/, (m) => {
      return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
    }],
    [/(\d{1,2})\.(\d{1,2})(?!\.\d)/, (m) => {
      const d = new Date(now.getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }],
  ];

  for (const [regex, handler] of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      date = handler(match);
      cleaned = cleaned.replace(match[0], " ");
      return { date, cleaned };
    }
  }

  return { date: null, cleaned };
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${d}.${m}.${date.getFullYear()}`;
}
