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

      // Register bot command menus
      const privateCommands = [
        { command: "help", description: "📖 Справка" },
        { command: "projects", description: "📂 Список проектов" },
        { command: "project", description: "📁 Выбрать проект" },
        { command: "chat", description: "💬 Отправить сообщение в чат проекта" },
        { command: "ai", description: "✨ ИИ-ассистент" },
      ];
      const groupCommands = [
        { command: "link", description: "🔗 Привязать чат к проекту" },
        { command: "task", description: "📝 Создать задачу" },
        { command: "tasks", description: "📋 Список открытых задач" },
        { command: "done", description: "✅ Выполнить задачу" },
        { command: "assign", description: "👤 Назначить ответственного" },
        { command: "my", description: "🙋 Мои задачи" },
        { command: "ai", description: "✨ ИИ-ассистент" },
        { command: "projects", description: "📂 Список проектов" },
        { command: "help", description: "📖 Справка" },
      ];

      // Set commands for private chats
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: privateCommands, scope: { type: "all_private_chats" } }),
      });
      // Set commands for group chats
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: groupCommands, scope: { type: "all_group_chats" } }),
      });

      return new Response(JSON.stringify({ ...result, commands_registered: true }), { headers: corsHeaders });
    }

    // === Handle inline button callbacks ===
    const callbackQuery = body.callback_query;
    if (callbackQuery) {
      const cbData = callbackQuery.data || "";
      const cbChatId = callbackQuery.message?.chat?.id;
      const cbMessageId = callbackQuery.message?.message_id;
      const cbUsername = callbackQuery.from?.username;

      if (!cbUsername || !cbChatId) {
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Ошибка");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const supabaseCb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: cbProfile } = await supabaseCb
        .from("profiles")
        .select("id")
        .eq("telegram_username", cbUsername.toLowerCase())
        .single();

      if (!cbProfile) {
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Вы не зарегистрированы");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Handle "done:<task_id>"
      if (cbData.startsWith("done:")) {
        const taskId = cbData.substring(5);
        const { data: task } = await supabaseCb
          .from("tasks")
          .select("id, title")
          .eq("id", taskId)
          .eq("is_completed", false)
          .single();

        if (!task) {
          await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Задача не найдена или уже выполнена");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabaseCb.from("tasks").update({ is_completed: true, completed_at: new Date().toISOString() }).eq("id", taskId);
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, `✅ ${task.title.substring(0, 40)}`);
        await sendTelegramMessage(BOT_TOKEN, cbChatId, `✅ Выполнено: "${escapeMarkdown(task.title.substring(0, 60))}" (@${cbUsername})`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Handle "assign:<task_id>"
      if (cbData.startsWith("assign:")) {
        const taskId = cbData.substring(7);
        const { data: task } = await supabaseCb
          .from("tasks")
          .select("id, title")
          .eq("id", taskId)
          .single();

        if (!task) {
          await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Задача не найдена");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabaseCb.from("tasks").update({ assigned_to: cbProfile.id }).eq("id", taskId);
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, `👤 Назначено на вас`);
        await sendTelegramMessage(BOT_TOKEN, cbChatId, `👤 "${escapeMarkdown(task.title.substring(0, 60))}" → @${cbUsername}`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "🤷");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const message = body.message;
    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const chatType = message.chat.type; // "private", "group", "supergroup"
    const username = message.from?.username;
    const isGroupChat = chatType === "group" || chatType === "supergroup";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ==================== GROUP CHAT HANDLING ====================
    if (isGroupChat) {
      // In group chats, only respond to commands directed at the bot
      const botCommand = extractBotCommand(message.text);
      if (!botCommand) {
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { command, args } = botCommand;

      // /start in group — welcome message
      if (command === "start") {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "👋 Привет! Я TaskFlow Bot для групповых чатов.\n\n" +
          "🔗 `/link Название проекта` — привязать чат к проекту\n" +
          "📝 `/task Текст @ответственный !срок` — создать задачу\n" +
          "📋 `/tasks` — список открытых задач\n" +
          "✅ `/done 1` — выполнить задачу по номеру\n" +
          "👤 `/assign 1 @user` — назначить ответственного\n" +
          "👤 `/my` — мои задачи",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // For all other commands, user must have a profile
      if (!username) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Установите username в настройках Telegram.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("telegram_username", username.toLowerCase())
        .single();

      if (!profile) {
        await sendTelegramMessage(BOT_TOKEN, chatId, `❌ @${username} не зарегистрирован в TaskFlow.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const userId = profile.id;

      // Save chat_id
      await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", userId);

      // === /link — link this Telegram group to a project ===
      if (command === "link") {
        if (!args.trim()) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "📎 Формат: `/link Название проекта`\nИспользуй `/projects` для списка.", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const projectName = args.trim();
        const group = await findProject(supabase, userId, projectName);

        if (!group) {
          const suggestions = await fuzzyFindProjects(supabase, userId, projectName);
          let hint = suggestions.length > 0
            ? `\n💡 Возможно: ${suggestions.map(s => `${s.icon || "📁"} ${s.name}`).join(", ")}`
            : "";
          await sendTelegramMessage(BOT_TOKEN, chatId, `❌ Проект «${projectName}» не найден.${hint}\nИспользуй /projects для списка.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // Upsert link
        const { error: linkError } = await supabase
          .from("telegram_group_chats")
          .upsert(
            {
              telegram_chat_id: chatId,
              telegram_chat_title: message.chat.title || null,
              group_id: group.id,
              linked_by: userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "telegram_chat_id" }
          );

        if (linkError) {
          console.error("Link error:", linkError);
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось привязать чат.");
        } else {
          await sendTelegramMessage(
            BOT_TOKEN, chatId,
            `✅ Чат привязан к проекту ${group.icon || "📁"} *${escapeMarkdown(group.name)}*\n\nТеперь используйте /task для создания задач.`,
            "Markdown"
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // For /task, /tasks, /done, /my — need linked project
      const { data: chatLink } = await supabase
        .from("telegram_group_chats")
        .select("group_id, task_groups(id, name, icon, user_id)")
        .eq("telegram_chat_id", chatId)
        .single();

      if (!chatLink || !chatLink.task_groups) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Чат не привязан к проекту. Используйте `/link Название проекта`", "Markdown");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const linkedGroup = chatLink.task_groups as any;
      const groupId = linkedGroup.id;

      // === /task — create task in linked project ===
      if (command === "task") {
        if (!args.trim()) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "📝 Формат: `/task Текст задачи @ответственный !срок`", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        let taskText = args;
        const isImportant = taskText.startsWith("!");
        if (isImportant) taskText = taskText.substring(1).trim();

        // Extract @assignee
        const assigneeMatch = taskText.match(/@(\S+)/);
        let assigneeUsername: string | null = null;
        let assignedTo: string | null = null;
        let assigneeFuzzyHint = "";
        if (assigneeMatch) {
          assigneeUsername = assigneeMatch[1].toLowerCase();
          taskText = taskText.replace(/@\S+/, "").trim();

          // Look for assignee among group members + owner
          const memberIds = await getGroupMemberIds(supabase, groupId, linkedGroup.user_id);
          const { data: assignee } = await supabase
            .from("profiles")
            .select("id, telegram_username")
            .eq("telegram_username", assigneeUsername)
            .in("id", memberIds)
            .single();

          if (assignee) {
            assignedTo = assignee.id;
          } else {
            // Fuzzy hint
            const { data: profiles } = await supabase
              .from("profiles")
              .select("telegram_username, display_name")
              .in("id", memberIds)
              .not("telegram_username", "is", null);
            if (profiles) {
              const suggestions = profiles
                .filter(p => p.telegram_username && fuzzyMatch(assigneeUsername!, p.telegram_username))
                .slice(0, 3);
              if (suggestions.length > 0) {
                assigneeFuzzyHint = `\n💡 Возможно: ${suggestions.map(s => `@${s.telegram_username}`).join(", ")}`;
              }
            }
          }
        }

        // Extract deadline
        const deadline = parseDeadline(taskText);
        if (deadline.cleaned !== taskText) taskText = deadline.cleaned.trim();

        // Extract tags
        const tagMatches = taskText.match(/#(\S+)/g) || [];
        const tagNames = tagMatches.map(t => t.substring(1).toLowerCase());
        taskText = taskText.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();

        if (!taskText) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Текст задачи не может быть пустым.");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // === AI Enrichment: if no assignee or deadline found, ask AI ===
        let aiEnrichment: AiTaskEnrichment | null = null;
        let aiApplied: string[] = [];
        if (!assignedTo || !deadline.date) {
          const members = await getProjectMembers(supabase, groupId, linkedGroup.user_id);
          if (members.length > 0) {
            aiEnrichment = await aiEnrichTask(taskText, members, linkedGroup.name);
            if (aiEnrichment) {
              // Apply assignee if not set manually
              if (!assignedTo && aiEnrichment.assigned_to_id) {
                // Verify this ID is actually a member
                const memberIds = members.map(m => m.id);
                if (memberIds.includes(aiEnrichment.assigned_to_id)) {
                  assignedTo = aiEnrichment.assigned_to_id;
                  assigneeUsername = aiEnrichment.assigned_to_name || null;
                  aiApplied.push(`👤 ${aiEnrichment.assigned_to_name || "ответственный"}`);
                }
              }
              // Apply deadline if not set manually
              if (!deadline.date && aiEnrichment.deadline) {
                try {
                  deadline.date = new Date(aiEnrichment.deadline + "T23:59:00");
                  aiApplied.push(`📅 ${formatDate(deadline.date)}`);
                } catch { /* ignore bad date */ }
              }
            }
          }
        }

        const taskData: Record<string, any> = {
          title: taskText.substring(0, 500),
          user_id: userId,
          group_id: groupId,
          is_important: isImportant,
        };
        if (deadline.date) taskData.deadline = deadline.date.toISOString();
        if (assignedTo) taskData.assigned_to = assignedTo;
        if (aiEnrichment?.priority && !isImportant) taskData.priority = aiEnrichment.priority;

        const { data: newTask, error: taskError } = await supabase
          .from("tasks")
          .insert(taskData)
          .select("id")
          .single();

        if (taskError) {
          console.error("Group task creation error:", taskError);
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Ошибка создания задачи.");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // Add creator as participant
        await supabase.from("task_participants").insert({
          task_id: newTask.id,
          user_id: userId,
          role: "creator",
        });

        // Add AI-suggested subtasks
        if (aiEnrichment?.subtasks && aiEnrichment.subtasks.length > 0 && newTask) {
          for (let i = 0; i < aiEnrichment.subtasks.length; i++) {
            await supabase.from("subtasks").insert({
              task_id: newTask.id,
              title: aiEnrichment.subtasks[i],
              position: i,
            });
          }
          aiApplied.push(`📋 ${aiEnrichment.subtasks.length} шагов`);
        }

        // Add tags
        for (const tagName of tagNames) {
          let { data: tag } = await supabase.from("tags").select("id").eq("user_id", linkedGroup.user_id).ilike("name", tagName).single();
          if (!tag) {
            const { data: newTag } = await supabase.from("tags").insert({ name: tagName, user_id: linkedGroup.user_id }).select("id").single();
            tag = newTag;
          }
          if (tag && newTask) {
            await supabase.from("task_tags").insert({ task_id: newTask.id, tag_id: tag.id });
          }
        }

        let confirmation = `✅ Задача: "${taskText.substring(0, 80)}${taskText.length > 80 ? "..." : ""}"`;
        const extras: string[] = [];
        if (isImportant) extras.push("⭐ важная");
        if (deadline.date) extras.push(`📅 ${formatDate(deadline.date)}`);
        if (assigneeUsername) {
          extras.push(assignedTo ? `👤 ${assigneeUsername}` : `⚠️ @${assigneeUsername} не найден${assigneeFuzzyHint}`);
        }
        extras.push(`📂 ${linkedGroup.icon || "📁"} ${linkedGroup.name}`);
        if (extras.length > 0) confirmation += "\n" + extras.join(" | ");
        if (aiApplied.length > 0) confirmation += "\n🤖 ИИ: " + aiApplied.join(", ");

        await sendTelegramMessage(BOT_TOKEN, chatId, confirmation);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /tasks — list open tasks ===
      if (command === "tasks") {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, deadline, assigned_to, is_important, is_completed")
          .eq("group_id", groupId)
          .eq("is_completed", false)
          .order("position")
          .limit(20);

        if (!tasks || tasks.length === 0) {
          await sendTelegramMessage(BOT_TOKEN, chatId, `📋 Нет открытых задач в ${linkedGroup.icon || "📁"} ${linkedGroup.name}`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // Fetch assignee names
        const assigneeIds = [...new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to!))];
        const profileMap = new Map<string, string>();
        if (assigneeIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, telegram_username")
            .in("id", assigneeIds);
          if (profiles) profiles.forEach(p => profileMap.set(p.id, p.telegram_username ? `@${p.telegram_username}` : p.display_name || ""));
        }

        let text = `📋 *${escapeMarkdown(linkedGroup.name)}* — задачи:\n\n`;
        const inlineKeyboard: any[][] = [];
        tasks.forEach((t, i) => {
          const imp = t.is_important ? "⭐ " : "";
          const dl = t.deadline ? ` 📅 ${formatDate(new Date(t.deadline))}` : "";
          const assignee = t.assigned_to && profileMap.get(t.assigned_to) ? ` 👤 ${profileMap.get(t.assigned_to)}` : "";
          text += `${i + 1}. ${imp}${escapeMarkdown(t.title.substring(0, 60))}${dl}${assignee}\n`;
          // Add inline buttons row for each task
          inlineKeyboard.push([
            { text: `✅ ${i + 1}`, callback_data: `done:${t.id}` },
            { text: `👤 ${i + 1} Взять`, callback_data: `assign:${t.id}` },
          ]);
        });

        await sendTelegramMessageWithKeyboard(BOT_TOKEN, chatId, text, inlineKeyboard, "Markdown");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /done — mark task as done (reply to /tasks message or by number) ===
      if (command === "done") {
        const num = parseInt(args.trim());
        if (isNaN(num) || num < 1) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "✅ Формат: `/done 1` (номер задачи из /tasks)", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title")
          .eq("group_id", groupId)
          .eq("is_completed", false)
          .order("position")
          .limit(20);

        if (!tasks || num > tasks.length) {
          await sendTelegramMessage(BOT_TOKEN, chatId, `❌ Задача #${num} не найдена. Используй /tasks`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const task = tasks[num - 1];
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq("id", task.id);

        if (updateError) {
          console.error("Done error:", updateError);
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось выполнить задачу.");
        } else {
          await sendTelegramMessage(BOT_TOKEN, chatId, `✅ Выполнено: "${escapeMarkdown(task.title.substring(0, 60))}"`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /assign — assign user to existing task ===
      if (command === "assign") {
        // Format: /assign 1 @username
        const assignMatch = args.match(/^(\d+)\s+@(\S+)/);
        if (!assignMatch) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "👤 Формат: `/assign 1 @username` (номер задачи из /tasks)", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const taskNum = parseInt(assignMatch[1]);
        const targetUsername = assignMatch[2].toLowerCase();

        // Get task list (same order as /tasks)
        const { data: tasksList } = await supabase
          .from("tasks")
          .select("id, title, assigned_to")
          .eq("group_id", groupId)
          .eq("is_completed", false)
          .order("position")
          .limit(20);

        if (!tasksList || taskNum < 1 || taskNum > tasksList.length) {
          await sendTelegramMessage(BOT_TOKEN, chatId, `❌ Задача #${taskNum} не найдена. Используй /tasks`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const targetTask = tasksList[taskNum - 1];

        // Find assignee among group members
        const memberIds = await getGroupMemberIds(supabase, groupId, linkedGroup.user_id);
        const { data: assigneeProfile } = await supabase
          .from("profiles")
          .select("id, display_name, telegram_username")
          .eq("telegram_username", targetUsername)
          .in("id", memberIds)
          .single();

        if (!assigneeProfile) {
          // Fuzzy suggestions
          const { data: profiles } = await supabase
            .from("profiles")
            .select("telegram_username, display_name")
            .in("id", memberIds)
            .not("telegram_username", "is", null);
          const suggestions = (profiles || [])
            .filter(p => p.telegram_username && fuzzyMatch(targetUsername, p.telegram_username))
            .slice(0, 3);
          const hint = suggestions.length > 0
            ? `\n💡 Возможно: ${suggestions.map(s => `@${s.telegram_username}`).join(", ")}`
            : "";
          await sendTelegramMessage(BOT_TOKEN, chatId, `❌ @${targetUsername} не найден среди участников проекта.${hint}`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const { error: assignError } = await supabase
          .from("tasks")
          .update({ assigned_to: assigneeProfile.id })
          .eq("id", targetTask.id);

        if (assignError) {
          console.error("Assign error:", assignError);
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось назначить ответственного.");
        } else {
          await sendTelegramMessage(
            BOT_TOKEN, chatId,
            `✅ Задача "${escapeMarkdown(targetTask.title.substring(0, 60))}" → 👤 @${assigneeProfile.telegram_username || assigneeProfile.display_name}`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /my — my tasks in this project ===
      if (command === "my") {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, deadline, is_important, is_completed")
          .eq("group_id", groupId)
          .eq("is_completed", false)
          .or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
          .order("position")
          .limit(20);

        if (!tasks || tasks.length === 0) {
          await sendTelegramMessage(BOT_TOKEN, chatId, `👤 У вас нет открытых задач в ${linkedGroup.icon || "📁"} ${linkedGroup.name}`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        let text = `👤 *Мои задачи в ${escapeMarkdown(linkedGroup.name)}:*\n\n`;
        tasks.forEach((t, i) => {
          const imp = t.is_important ? "⭐ " : "";
          const dl = t.deadline ? ` 📅 ${formatDate(new Date(t.deadline))}` : "";
          text += `${i + 1}. ${imp}${escapeMarkdown(t.title.substring(0, 60))}${dl}\n`;
        });

        await sendTelegramMessage(BOT_TOKEN, chatId, text, "Markdown");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /projects in group — list available projects ===
      if (command === "projects") {
        const groups = await getUserProjects(supabase, userId);
        if (groups.length === 0) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "📂 У вас нет проектов.");
        } else {
          let text = "📂 *Доступные проекты:*\n\n";
          groups.forEach(g => { text += `${g.icon || "📁"} ${escapeMarkdown(g.name)}\n`; });
          text += "\nИспользуй `/link Название` чтобы привязать.";
          await sendTelegramMessage(BOT_TOKEN, chatId, text, "Markdown");
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /ai — AI assistant in group chat ===
      if (command === "ai") {
        if (!args.trim()) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "✨ Формат: `/ai Ваш вопрос`\n\nПримеры:\n• `/ai Какой статус проекта?`\n• `/ai Какие задачи просрочены?`\n• `/ai Что нужно сделать на этой неделе?`", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const aiResponse = await handleAiChat(supabase, BOT_TOKEN, chatId, userId, args, groupId, linkedGroup.name);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /help in group ===
      if (command === "help") {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "📖 *Справка для группового чата*\n\n" +
          "🔗 `/link Проект` — привязать чат к проекту\n" +
          "📝 `/task Текст @user !срок` — создать задачу\n" +
          "📋 `/tasks` — открытые задачи\n" +
          "✅ `/done 1` — выполнить задачу по номеру\n" +
          "👤 `/assign 1 @user` — назначить ответственного\n" +
          "👤 `/my` — мои задачи\n" +
          "✨ `/ai Вопрос` — ИИ\\-ассистент\n" +
          "📂 `/projects` — список проектов\n\n" +
          "*В тексте задачи:*\n" +
          "• `!` в начале — важная\n" +
          "• `@username` — ответственный\n" +
          "• `завтра`, `15.03` — срок\n" +
          "• `#тег` — тег",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ==================== PRIVATE CHAT HANDLING (existing logic) ====================

    // Handle /start command
    if (message.text === "/start") {
      if (username) {
        await supabase
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
        "• `/ai Вопрос` — ИИ-ассистент\n" +
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
        "• `/chat Название Сообщение` — отправить в чат проекта\n\n" +
        "*ИИ\\-ассистент:*\n" +
        "• `/ai Вопрос` — спросить ИИ о проектах, статусе, советах",
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

    // Save telegram chat_id
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: chatId })
      .eq("id", userId);

    // Handle /projects
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

      const group = await findProject(supabase, userId, projectName);

      if (!group) {
        const suggestions = await fuzzyFindProjects(supabase, userId, projectName);
        let hint = suggestions.length > 0
          ? `\n💡 Возможно: ${suggestions.map(s => `${s.icon || "📁"} ${s.name}`).join(", ")}`
          : "";
        await sendTelegramMessage(
          BOT_TOKEN, chatId,
          `❌ Проект «${projectName}» не найден.${hint}\nИспользуй /projects для списка.`
        );
      } else {
        await sendTelegramMessage(
          BOT_TOKEN, chatId,
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

      const allGroups = await getUserProjects(supabase, userId);
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

    // === /ai in private chat ===
    if (message.text.startsWith("/ai")) {
      const aiQuestion = message.text.replace(/^\/ai\s*/, "").trim();
      if (!aiQuestion) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "✨ Формат: `/ai Ваш вопрос`\n\nПримеры:\n• `/ai Какие задачи просрочены?`\n• `/ai Что сделать сегодня?`\n• `/ai Подскажи как организовать задачи`", "Markdown");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await handleAiChat(supabase, BOT_TOKEN, chatId, userId, aiQuestion, null, null);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Parse message for task creation (private chat) ===
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

    // === AI Enrichment for private chat ===
    let aiEnrichment: AiTaskEnrichment | null = null;
    let aiApplied: string[] = [];
    if (groupId && (!assignedTo || !deadline.date)) {
      // Get project owner to fetch members
      const { data: groupInfo } = await supabase
        .from("task_groups")
        .select("user_id, name")
        .eq("id", groupId)
        .single();
      if (groupInfo) {
        const members = await getProjectMembers(supabase, groupId, groupInfo.user_id);
        if (members.length > 0) {
          aiEnrichment = await aiEnrichTask(text, members, groupInfo.name);
          if (aiEnrichment) {
            if (!assignedTo && aiEnrichment.assigned_to_id) {
              const memberIds = members.map(m => m.id);
              if (memberIds.includes(aiEnrichment.assigned_to_id)) {
                assignedTo = aiEnrichment.assigned_to_id;
                aiApplied.push(`👤 ${aiEnrichment.assigned_to_name || "ответственный"}`);
              }
            }
            if (!deadline.date && aiEnrichment.deadline) {
              try {
                deadline.date = new Date(aiEnrichment.deadline + "T23:59:00");
                aiApplied.push(`📅 ${formatDate(deadline.date)}`);
              } catch { /* ignore */ }
            }
          }
        }
      }
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
    if (aiEnrichment?.priority && !isImportant) taskData.priority = aiEnrichment.priority;

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

    // Add AI-suggested subtasks
    if (aiEnrichment?.subtasks && aiEnrichment.subtasks.length > 0 && newTask) {
      for (let i = 0; i < aiEnrichment.subtasks.length; i++) {
        await supabase.from("subtasks").insert({
          task_id: newTask.id,
          title: aiEnrichment.subtasks[i],
          position: i,
        });
      }
      aiApplied.push(`📋 ${aiEnrichment.subtasks.length} шагов`);
    }

    // Add tags
    if (tagNames.length > 0 && newTask) {
      for (const tagName of tagNames) {
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
    if (aiApplied.length > 0) confirmation += "\n🤖 ИИ: " + aiApplied.join(", ");

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

// === AI Task Enrichment ===

interface AiTaskEnrichment {
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
  deadline?: string | null;
  priority?: number | null;
  subtasks?: string[];
}

async function aiEnrichTask(
  taskText: string,
  users: { id: string; name: string; telegram_username: string | null }[],
  projectName?: string,
): Promise<AiTaskEnrichment | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const userList = users
    .map(u => `- "${u.name}" (id: ${u.id}${u.telegram_username ? `, tg: @${u.telegram_username}` : ""})`)
    .join("\n");

  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Ты — AI-помощник для обогащения задач. Анализируй текст задачи и определяй:
1. Кто должен быть ответственным (из списка участников) — по смыслу задачи, упоминанию имени/роли
2. Какой разумный срок (deadline) — по контексту ("срочно" = завтра, "на этой неделе" = конец недели, и т.д.)
3. Приоритет (1=высокий, 2=средний, 3=низкий)
4. Подзадачи, если задача комплексная

Если не удаётся определить — оставляй null. Не выдумывай.
${projectName ? `Проект: "${projectName}"` : ""}

Доступные участники:
${userList || "нет участников"}

Текущая дата: ${today}`,
          },
          {
            role: "user",
            content: `Обогати задачу: "${taskText}"`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "enrich_task",
              description: "Обогатить задачу: назначить ответственного, определить срок, приоритет и подзадачи",
              parameters: {
                type: "object",
                properties: {
                  assigned_to_id: { type: "string", description: "ID ответственного из списка участников, или null" },
                  assigned_to_name: { type: "string", description: "Имя ответственного" },
                  deadline: { type: "string", description: "Дедлайн в формате YYYY-MM-DD, или null" },
                  priority: { type: "number", description: "Приоритет: 1=высокий, 2=средний, 3=низкий, null=не определён" },
                  subtasks: { type: "array", items: { type: "string" }, description: "Подзадачи, если задача комплексная" },
                },
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "enrich_task" } },
      }),
    });

    if (!response.ok) {
      console.error("AI enrich error:", response.status);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return JSON.parse(toolCall.function.arguments);
    }
  } catch (e) {
    console.error("AI enrich failed:", e);
  }
  return null;
}

async function getProjectMembers(supabase: any, groupId: string, ownerId: string) {
  const memberIds = await getGroupMemberIds(supabase, groupId, ownerId);
  if (memberIds.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_username")
    .in("id", memberIds);
  return (profiles || []).map((p: any) => ({
    id: p.id,
    name: p.display_name || "Без имени",
    telegram_username: p.telegram_username,
  }));
}

async function handleAiChat(
  supabase: any,
  botToken: string,
  chatId: number,
  userId: string,
  question: string,
  groupId: string | null,
  projectName: string | null,
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    await sendTelegramMessage(botToken, chatId, "❌ ИИ-ассистент временно недоступен.");
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const contextParts: string[] = [];

    if (groupId) {
      // Focused project context
      const { data: tasks } = await supabase
        .from("tasks")
        .select("title, deadline, is_completed, assigned_to, is_important, priority")
        .eq("group_id", groupId)
        .order("position")
        .limit(50);

      if (tasks && tasks.length > 0) {
        const openTasks = tasks.filter((t: any) => !t.is_completed);
        const doneTasks = tasks.filter((t: any) => t.is_completed);
        const overdue = openTasks.filter((t: any) => t.deadline && new Date(t.deadline) < new Date());

        contextParts.push(`Проект: "${projectName}"`);
        contextParts.push(`Открытых задач: ${openTasks.length}, Завершённых: ${doneTasks.length}, Просрочено: ${overdue.length}`);

        if (openTasks.length > 0) {
          const taskList = openTasks.slice(0, 20).map((t: any) => {
            const dl = t.deadline ? ` (📅 ${t.deadline.split("T")[0]})` : "";
            const imp = t.is_important ? " ⭐" : "";
            return `• ${t.title}${dl}${imp}`;
          }).join("\n");
          contextParts.push(`\nОткрытые задачи:\n${taskList}`);
        }

        if (overdue.length > 0) {
          const overdueList = overdue.map((t: any) => `• ${t.title} (📅 ${t.deadline.split("T")[0]})`).join("\n");
          contextParts.push(`\n⚠️ Просроченные:\n${overdueList}`);
        }
      }

      const { data: groupInfo } = await supabase.from("task_groups").select("user_id").eq("id", groupId).single();
      if (groupInfo) {
        const members = await getProjectMembers(supabase, groupId, groupInfo.user_id);
        if (members.length > 0) {
          contextParts.push(`\nУчастники: ${members.map((m: any) => m.name).join(", ")}`);
        }
      }

      const { data: subprojects } = await supabase
        .from("task_groups")
        .select("name, icon")
        .eq("parent_id", groupId)
        .order("position")
        .limit(10);
      if (subprojects && subprojects.length > 0) {
        contextParts.push(`\nПодпроекты: ${subprojects.map((s: any) => `${s.icon || "📁"} ${s.name}`).join(", ")}`);
      }
    } else {
      // Broad context: all user projects
      const { data: groups } = await supabase
        .from("task_groups")
        .select("id, name, icon, parent_id")
        .eq("user_id", userId)
        .is("parent_id", null)
        .order("position")
        .limit(15);

      if (groups && groups.length > 0) {
        const projectSummaries: string[] = [];
        for (const g of groups) {
          const { count: openCount } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("group_id", g.id)
            .eq("is_completed", false);
          const { count: overdueCount } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("group_id", g.id)
            .eq("is_completed", false)
            .lt("deadline", today);
          projectSummaries.push(`${g.icon || "📁"} ${g.name}: ${openCount || 0} задач${overdueCount ? `, ⚠️${overdueCount} просрочено` : ""}`);
        }
        contextParts.push(`Ваши проекты:\n${projectSummaries.join("\n")}`);
      }

      const { data: todayTasks } = await supabase
        .from("tasks")
        .select("title, deadline, group_id")
        .eq("user_id", userId)
        .eq("is_completed", false)
        .lte("deadline", new Date().toISOString())
        .order("deadline")
        .limit(10);

      if (todayTasks && todayTasks.length > 0) {
        contextParts.push(`\n⚠️ Задачи на сегодня и просроченные:\n${todayTasks.map((t: any) => `• ${t.title}`).join("\n")}`);
      }
    }

    const contextStr = contextParts.length > 0 ? contextParts.join("\n") : "Нет данных о проектах.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Ты — ИИ-ассистент для управления проектами JustTODOit, доступный через Telegram.
Отвечай кратко, по делу, на русском языке.
Используй данные из контекста для ответа. Не придумывай данные, которых нет.
Форматируй ответ для Telegram (без Markdown-ссылок, используй эмодзи для наглядности).
Максимум 500 символов, если не требуется развёрнутый ответ.

Текущая дата: ${today}

Контекст:
${contextStr}`,
          },
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      await response.text();
      if (status === 429) {
        await sendTelegramMessage(botToken, chatId, "⏳ Слишком много запросов. Попробуйте через минуту.");
      } else if (status === 402) {
        await sendTelegramMessage(botToken, chatId, "💳 Лимит ИИ-запросов исчерпан.");
      } else {
        await sendTelegramMessage(botToken, chatId, "❌ Ошибка ИИ-ассистента. Попробуйте позже.");
      }
      return;
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content;

    if (aiText) {
      const truncated = aiText.length > 4000 ? aiText.substring(0, 4000) + "..." : aiText;
      await sendTelegramMessage(botToken, chatId, `✨ ${truncated}`);
    } else {
      await sendTelegramMessage(botToken, chatId, "🤔 Не удалось получить ответ. Попробуйте переформулировать.");
    }
  } catch (e) {
    console.error("AI chat error:", e);
    await sendTelegramMessage(botToken, chatId, "❌ Ошибка ИИ-ассистента.");
  }
}

// === Helpers ===

function extractBotCommand(text: string): { command: string; args: string } | null {
  // Match /command or /command@botname
  const match = text.match(/^\/(\w+)(?:@\S+)?\s*(.*)?$/s);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: (match[2] || "").trim() };
}

async function getGroupMemberIds(supabase: any, groupId: string, ownerId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  const ids = new Set<string>([ownerId]);
  if (members) members.forEach((m: any) => ids.add(m.user_id));
  return [...ids];
}

async function findProject(supabase: any, userId: string, name: string) {
  // Search owned
  let { data: group } = await supabase
    .from("task_groups")
    .select("id, name, icon, user_id")
    .eq("user_id", userId)
    .ilike("name", name)
    .single();

  if (!group) {
    // Search member projects
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);
    if (membership && membership.length > 0) {
      const { data: memberGroup } = await supabase
        .from("task_groups")
        .select("id, name, icon, user_id")
        .in("id", membership.map((m: any) => m.group_id))
        .ilike("name", name)
        .single();
      group = memberGroup;
    }
  }
  return group;
}

async function fuzzyFindProjects(supabase: any, userId: string, query: string) {
  const all = await getUserProjects(supabase, userId);
  return all.filter(g => fuzzyMatch(query, g.name)).slice(0, 3);
}

async function getUserProjects(supabase: any, userId: string) {
  const { data: owned } = await supabase
    .from("task_groups")
    .select("id, name, icon")
    .eq("user_id", userId);

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  const ownedIds = new Set((owned || []).map((g: any) => g.id));
  const memberOnlyIds = (memberships || []).map((m: any) => m.group_id).filter((id: string) => !ownedIds.has(id));

  let memberGroups: any[] = [];
  if (memberOnlyIds.length > 0) {
    const { data } = await supabase
      .from("task_groups")
      .select("id, name, icon")
      .in("id", memberOnlyIds);
    memberGroups = data || [];
  }

  return [...(owned || []), ...memberGroups];
}

async function sendTelegramMessage(token: string, chatId: number, text: string, parseMode?: string) {
  const body: Record<string, any> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendTelegramMessageWithKeyboard(token: string, chatId: number, text: string, inlineKeyboard: any[][], parseMode?: string) {
  const body: Record<string, any> = {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: inlineKeyboard },
  };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(token: string, callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
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
