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

    // Internal action: auto-flush stale protocol buffers (called by cron)
    if (body.action === "internal_flush_protocol_buffer" && body.chat_id) {
      const supabaseInt = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: ctx } = await supabaseInt
        .from("telegram_pending_context")
        .select("*")
        .eq("chat_id", body.chat_id)
        .maybeSingle();
      if (!ctx) {
        return new Response(JSON.stringify({ ok: false, reason: "no_context" }), { headers: corsHeaders });
      }
      await sendTelegramMessage(BOT_TOKEN, body.chat_id,
        `⏰ 60 сек тишины — запускаю разбор автоматически.`,
      );
      await flushProtocolBuffer(supabaseInt, BOT_TOKEN, body.chat_id, ctx.user_id, ctx);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }


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
        { command: "spisok", description: "📦 Пакетное создание задач" },
        { command: "protocol", description: "📋 Создать протокол встречи" },
        { command: "chat", description: "💬 Отправить сообщение в чат проекта" },
        { command: "ai", description: "✨ ИИ-ассистент" },
        { command: "cancel", description: "❌ Отменить текущую операцию" },
      ];
      const groupCommands = [
        { command: "link", description: "🔗 Привязать чат к проекту" },
        { command: "task", description: "📝 Создать задачу" },
        { command: "spisok", description: "📦 Пакетное создание задач" },
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

      // Handle "proto_tpl:<template_key>"
      if (cbData.startsWith("proto_tpl:")) {
        const templateKey = cbData.substring(10);
        const { data: protoCtx } = await supabaseCb
          .from("telegram_pending_context")
          .select("*")
          .eq("chat_id", cbChatId)
          .maybeSingle();

        if (!protoCtx || protoCtx.context_type !== "protocol_template") {
          await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Контекст устарел, начните /protocol заново");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabaseCb.from("telegram_pending_context").update({
          context_type: "protocol_buffer",
          template_key: templateKey,
          awaiting_axis: "__buffer__",
          raw_messages: [],
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }).eq("chat_id", cbChatId);

        const tplName = TEMPLATE_LABELS[templateKey] || templateKey;
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, `✅ ${tplName}`);
        await sendTelegramMessageWithKeyboard(BOT_TOKEN, cbChatId,
          `✅ Шаблон: *${escapeMarkdown(tplName)}*\n\n` +
          `Шаг 3/4. Пришлите материал встречи:\n\n` +
          `• 📝 Текст одним или несколькими сообщениями\n` +
          `• 📨 Перешлите переписку (несколько сообщений подряд)\n` +
          `• 🎤 Голосовые — расшифруются и попадут в общий буфер\n\n` +
          `Когда закончите — нажмите *«✅ Разобрать всё»* или просто подождите 60 сек тишины.\n\n` +
          `⏰ Контекст активен 15 минут. Отмена: /cancel`,
          [
            [{ text: "✅ Разобрать всё сейчас", callback_data: "proto_finish" }],
            [{ text: "❌ Отмена", callback_data: "proto_cancel" }],
          ],
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Handle "proto_finish" — flush buffer and start parsing
      if (cbData === "proto_finish") {
        const { data: protoCtx } = await supabaseCb
          .from("telegram_pending_context")
          .select("*")
          .eq("chat_id", cbChatId)
          .maybeSingle();

        if (!protoCtx || protoCtx.context_type !== "protocol_buffer") {
          await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Нет активного сбора");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const buf = Array.isArray(protoCtx.raw_messages) ? protoCtx.raw_messages : [];
        if (buf.length === 0) {
          await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "⚠️ Буфер пуст — пришлите материал");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "🤖 Разбираю…");
        await flushProtocolBuffer(supabaseCb, BOT_TOKEN, cbChatId, protoCtx.user_id, protoCtx);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Handle "proto_cancel"
      if (cbData === "proto_cancel") {
        await supabaseCb.from("telegram_pending_context").delete().eq("chat_id", cbChatId);
        await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "❌ Отменено");
        await sendTelegramMessage(BOT_TOKEN, cbChatId, "❌ Создание протокола отменено.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await answerCallbackQuery(BOT_TOKEN, callbackQuery.id, "🤷");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const message = body.message;

    // Handle forwarded messages: extract text or caption
    if (message && !message.text && message.forward_date) {
      // Forwarded message might have caption (for media) but no text
      if (message.caption) {
        message.text = message.caption;
        message._forwarded = true;
      }
    }
    // Mark forwarded text messages
    if (message && message.text && message.forward_date) {
      message._forwarded = true;
    }
    
    // Handle voice messages: transcribe first (including forwarded voice)
    if (message && (message.voice || message.audio) && !message.text) {
      const BOT_TOKEN_V = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
      const fileId = message.voice?.file_id || message.audio?.file_id;
      const transcription = await transcribeVoiceMessage(BOT_TOKEN_V, fileId);
      if (transcription) {
        message.text = transcription;
        message._from_voice = true;
      } else {
        const chatId = message.chat.id;
        await sendTelegramMessage(BOT_TOKEN_V, chatId, "❌ Не удалось распознать голосовое сообщение. Попробуйте ещё раз или отправьте текстом.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }
    
    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const chatType = message.chat.type; // "private", "group", "supergroup"
    const username = message.from?.username;
    const isGroupChat = chatType === "group" || chatType === "supergroup";
    const isFromVoice = message._from_voice === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ==================== GROUP CHAT HANDLING ====================
    if (isGroupChat) {
      // In group chats, only respond to commands directed at the bot
      const botCommand = extractBotCommand(message.text);
      if (!botCommand) {
        // Check for pending /spisok context (voice, forwarded, or bulk messages in group)
        const isPendingInGroup = isFromVoice || message._forwarded || detectBulkMessage(message.text);
        if (isPendingInGroup) {
          // Need user profile for context check
          const grpUsername = message.from?.username;
          if (grpUsername) {
            const supabaseGrp = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
            const { data: grpProfile } = await supabaseGrp
              .from("profiles")
              .select("id")
              .eq("telegram_username", grpUsername.toLowerCase())
              .single();

            if (grpProfile) {
              const grpUserId = grpProfile.id;
              const { data: pendingCtx } = await supabaseGrp
                .from("telegram_pending_context")
                .select("*")
                .eq("chat_id", chatId)
                .single();

              if (pendingCtx && (Date.now() - new Date(pendingCtx.created_at).getTime()) < 10 * 60 * 1000) {
                const ctxGroupId = pendingCtx.group_id;
                const ctxGroupName = pendingCtx.group_name;

                const { data: ctxGroup } = await supabaseGrp.from("task_groups").select("user_id").eq("id", ctxGroupId!).single();
                const members = ctxGroupId
                  ? await getProjectMembers(supabaseGrp, ctxGroupId, ctxGroup?.user_id || grpUserId)
                  : [];
                const parsedTasks = await aiBulkParse(message.text, members, ctxGroupName || undefined);

                if (parsedTasks && parsedTasks.length >= 1) {
                  await supabaseGrp.from("telegram_pending_context").delete().eq("chat_id", chatId);

                  const results = await createBulkTasks(supabaseGrp, parsedTasks, grpUserId, ctxGroupId, members);
                  const confirmLines = results.map((r: any, i: number) =>
                    `${i + 1}. ✅ ${r.title}${r.assignee ? ` 👤 ${r.assignee}` : ""}${r.participants?.length ? ` 👥 ${r.participants.join(", ")}` : ""}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
                  );

                  const projectInfo = ctxGroupName ? ` в 📁 ${escapeMarkdown(ctxGroupName)}` : "";
                  const sourceHint = isFromVoice ? "\n\n🎤 Из голосового сообщения" : message._forwarded ? "\n\n📨 Из пересланного сообщения" : "";
                  await sendTelegramMessage(BOT_TOKEN, chatId,
                    `📦 Создано ${results.length} задач${projectInfo}:\n\n${confirmLines.join("\n")}${sourceHint}`
                  );
                  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
                }
              }
            }
          }
        }
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

      // NOTE: do NOT save chatId here — in group chats chatId is the group's
      // negative ID. We must only persist private (positive) chat_ids in
      // profiles.telegram_chat_id, otherwise personal notifications get sent
      // to the whole Telegram group.

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

      // === /spisok — bulk create tasks in linked project ===
      if (command === "spisok") {
        if (!args.trim()) {
          // Save pending context so next voice/forwarded/text goes to linked project
          await supabase.from("telegram_pending_context").upsert({
            chat_id: chatId,
            user_id: userId,
            context_type: "spisok",
            group_id: groupId,
            group_name: linkedGroup.name,
            created_at: new Date().toISOString(),
          }, { onConflict: "chat_id" });

          await sendTelegramMessage(BOT_TOKEN, chatId,
            `📦 Контекст: ${linkedGroup.icon || "📁"} *${escapeMarkdown(linkedGroup.name)}*\n\n` +
            "Теперь отправь:\n" +
            "• 📝 Список задач текстом\n" +
            "• 🎤 Голосовое сообщение\n" +
            "• 📨 Перешли сообщение\n\n" +
            "⏰ Контекст активен 10 минут.",
            "Markdown"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const members = await getProjectMembers(supabase, groupId, linkedGroup.user_id);
        const parsedTasks = await aiBulkParse(args, members, linkedGroup.name);

        if (!parsedTasks || parsedTasks.length === 0) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось распознать задачи. Попробуйте переформулировать.");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const results = await createBulkTasks(supabase, parsedTasks, userId, groupId, members);
        const confirmLines = results.map((r, i) =>
          `${i + 1}. ✅ ${r.title}${r.assignee ? ` 👤 ${r.assignee}` : ""}${r.participants?.length ? ` 👥 ${r.participants.join(", ")}` : ""}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
        );

        await sendTelegramMessage(BOT_TOKEN, chatId,
          `📦 Создано ${results.length} задач в ${linkedGroup.icon || "📁"} ${escapeMarkdown(linkedGroup.name)}:\n\n${confirmLines.join("\n")}${isFromVoice ? "\n\n🎤 Из голосового сообщения" : ""}`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // === /task — create task in linked project ===
      if (command === "task") {
        if (!args.trim()) {
          await sendTelegramMessage(BOT_TOKEN, chatId, "📝 Формат: `/task Текст задачи @ответственный @участник1 @участник2 !срок`", "Markdown");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        let taskText = args;
        const isImportant = taskText.startsWith("!");
        if (isImportant) taskText = taskText.substring(1).trim();

        // Extract ALL @mentions: first = assignee, rest = participants
        const allMentions = taskText.match(/@(\S+)/g) || [];
        const mentionUsernames = allMentions.map(m => m.substring(1).toLowerCase());
        let assigneeUsername: string | null = null;
        let assignedTo: string | null = null;
        let assigneeFuzzyHint = "";
        const explicitParticipantIds: string[] = [];
        const explicitParticipantNames: string[] = [];

        if (mentionUsernames.length > 0) {
          // Remove all @mentions from text
          taskText = taskText.replace(/@\S+/g, "").replace(/\s+/g, " ").trim();

          const memberIds = await getGroupMemberIds(supabase, groupId, linkedGroup.user_id);
          const { data: allProfiles } = await supabase
            .from("profiles")
            .select("id, telegram_username, display_name")
            .in("id", memberIds)
            .not("telegram_username", "is", null);

          const profileMap = new Map((allProfiles || []).map(p => [p.telegram_username?.toLowerCase(), p]));

          for (let i = 0; i < mentionUsernames.length; i++) {
            const uname = mentionUsernames[i];
            const profile = profileMap.get(uname);
            if (i === 0) {
              // First mention = assignee
              assigneeUsername = uname;
              if (profile) {
                assignedTo = profile.id;
              } else {
                // Fuzzy hint for assignee only
                if (allProfiles) {
                  const suggestions = allProfiles
                    .filter(p => p.telegram_username && fuzzyMatch(uname, p.telegram_username))
                    .slice(0, 3);
                  if (suggestions.length > 0) {
                    assigneeFuzzyHint = `\n💡 Возможно: ${suggestions.map(s => `@${s.telegram_username}`).join(", ")}`;
                  }
                }
              }
            } else {
              // Remaining mentions = participants
              if (profile) {
                explicitParticipantIds.push(profile.id);
                explicitParticipantNames.push(profile.display_name || profile.telegram_username || uname);
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
                const memberIds = members.map((m: any) => m.id);
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
          start_at: new Date().toISOString(),
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

        // Add AI-suggested participants
        if (aiEnrichment?.participant_ids && aiEnrichment.participant_ids.length > 0 && newTask) {
          const memberIds = await getGroupMemberIds(supabase, groupId, linkedGroup.user_id);
          const validParticipants = aiEnrichment.participant_ids.filter(
            pid => memberIds.includes(pid) && pid !== userId && pid !== assignedTo
          );
          for (const pid of validParticipants) {
            await supabase.from("task_participants").insert({
              task_id: newTask.id,
              user_id: pid,
              role: "participant",
            });
          }
          if (validParticipants.length > 0) {
            const names = aiEnrichment.participant_names?.slice(0, validParticipants.length) || [];
            aiApplied.push(`👥 ${names.join(", ") || validParticipants.length + " уч."}`);
          }
        }

        // Add assignee as participant
        if (assignedTo && assignedTo !== userId && newTask) {
          await supabase.from("task_participants").insert({
            task_id: newTask.id,
            user_id: assignedTo,
            role: "assignee",
          });
        }

        // Add explicitly mentioned participants (@user2, @user3, etc.)
        if (explicitParticipantIds.length > 0 && newTask) {
          for (const pid of explicitParticipantIds) {
            if (pid !== userId && pid !== assignedTo) {
              await supabase.from("task_participants").insert({
                task_id: newTask.id,
                user_id: pid,
                role: "participant",
              });
            }
          }
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
        if (explicitParticipantNames.length > 0) extras.push(`👥 ${explicitParticipantNames.join(", ")}`);
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
          "📦 `/spisok` — пакетное создание задач\n" +
          "📋 `/tasks` — открытые задачи\n" +
          "✅ `/done 1` — выполнить задачу по номеру\n" +
          "👤 `/assign 1 @user` — назначить ответственного\n" +
          "👤 `/my` — мои задачи\n" +
          "✨ `/ai Вопрос` — ИИ\\-ассистент\n" +
          "📂 `/projects` — список проектов\n\n" +
          "🎤 Голосовые сообщения распознаются автоматически\n\n" +
          "*В тексте задачи:*\n" +
          "• `!` в начале — важная\n" +
          "• `@username` — ответственный\n" +
          "• `завтра`, `15.03`, `3д` — срок\n" +
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

        // Auto-update profiles.telegram_chat_id with the personal (positive) chat_id.
        // This overwrites any previously stored group chat_id (negative) so weekly
        // personal reports reach the user's private chat.
        if (chatId > 0) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, telegram_chat_id")
            .ilike("telegram_username", username)
            .maybeSingle();

          if (profile && profile.telegram_chat_id !== chatId) {
            await supabase
              .from("profiles")
              .update({ telegram_chat_id: chatId })
              .eq("id", profile.id);
            console.log(`[/start] Updated telegram_chat_id for @${username}: ${profile.telegram_chat_id} → ${chatId}`);
          }
        }
      }

      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        "👋 Привет! Я TaskFlow Bot.\n\n" +
        "📝 Отправь сообщение — создам задачу.\n" +
        "📦 Отправь список — создам пакетно.\n" +
        "🎤 Отправь голосовое — распознаю и создам.\n" +
        "📨 Перешли сообщение — создам задачу из него.\n\n" +
        "🔧 Возможности:\n" +
        "• `!` в начале — важная задача\n" +
        "• `#тег` — добавить тег\n" +
        "• `@username` — назначить ответственного\n" +
        "• `завтра`, `послезавтра`, `DD.MM`, `3д` — дедлайн\n" +
        "• `/project` — выбрать проект\n" +
        "• `/projects` — список проектов\n" +
        "• `/spisok` — пакетное создание задач\n" +
        "• `/protocol` — создать протокол встречи\n" +
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
        "*Пакетное создание:*\n" +
        "• `/spisok Проект` \\+ список задач\n" +
        "• `/spisok Проект` → затем голосовое или пересланное сообщение\n" +
        "• Или просто отправь список \\(-, •, 1\\.\\) — распознаю автоматически\n" +
        "• 🎤 Голосовые сообщения распознаются в задачи\n" +
        "• 📨 Пересланные сообщения создаются как задачи\n\n" +
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

    // Save telegram chat_id — but ONLY for private chats. Negative chat_ids
    // belong to groups/channels and must never be stored as a personal
    // notification target (otherwise DM notifications leak into group chats).
    if (chatId > 0) {
      await supabase
        .from("profiles")
        .update({ telegram_chat_id: chatId })
        .eq("id", userId);
    }

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

    // === /protocol in private chat (multi-step wizard) ===
    if (message.text.startsWith("/protocol") || message.text === "/proto") {
      const protoArgs = message.text.replace(/^\/(protocol|proto)\s*/, "").trim();

      // If user typed "/protocol Название" — save name and ask for template
      if (protoArgs) {
        await supabase.from("telegram_pending_context").upsert({
          chat_id: chatId,
          user_id: userId,
          context_type: "protocol_template",
          protocol_name: protoArgs,
          group_id: null,
          group_name: null,
          collected_axes: {},
          parsed_payload: null,
          template_key: null,
          awaiting_axis: null,
          created_at: new Date().toISOString(),
        }, { onConflict: "chat_id" });

        await sendTelegramMessageWithKeyboard(BOT_TOKEN, chatId,
          `📋 *Создание протокола*\n\n` +
          `Название: *${escapeMarkdown(protoArgs)}*\n\n` +
          `Выберите шаблон:`,
          [
            [{ text: "🔀 Кросс-функциональный", callback_data: "proto_tpl:cross_functional" }],
            [{ text: "🤝 Переговоры с клиентом", callback_data: "proto_tpl:client_negotiation" }],
            [{ text: "🎯 Гейт NPD", callback_data: "proto_tpl:npd_gate" }],
            [{ text: "📋 Пустой", callback_data: "proto_tpl:blank" }],
            [{ text: "❌ Отмена", callback_data: "proto_cancel" }],
          ],
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // No args — ask for name first
      await supabase.from("telegram_pending_context").upsert({
        chat_id: chatId,
        user_id: userId,
        context_type: "protocol_name",
        group_id: null,
        group_name: null,
        collected_axes: {},
        parsed_payload: null,
        template_key: null,
        awaiting_axis: null,
        protocol_name: null,
        created_at: new Date().toISOString(),
      }, { onConflict: "chat_id" });

      await sendTelegramMessage(BOT_TOKEN, chatId,
        "📋 *Создание протокола встречи*\n\n" +
        "Шаг 1/4. Как назвать протокол?\n\n" +
        "_Например: «Встреча по запуску линейки X», «Переговоры с Магнит 18.04»_\n\n" +
        "⏰ Контекст активен 15 минут. Отмена: /cancel",
        "Markdown"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === /cancel — drop any pending context ===
    if (message.text === "/cancel") {
      const { data: existing } = await supabase
        .from("telegram_pending_context")
        .select("context_type")
        .eq("chat_id", chatId)
        .maybeSingle();
      await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);
      await sendTelegramMessage(BOT_TOKEN, chatId,
        existing ? "❌ Текущая операция отменена." : "Нет активной операции."
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Handle pending protocol context (multi-step wizard) ===
    {
      const { data: protoCtx } = await supabase
        .from("telegram_pending_context")
        .select("*")
        .eq("chat_id", chatId)
        .maybeSingle();

      if (protoCtx?.context_type?.startsWith("protocol_") &&
          (Date.now() - new Date(protoCtx.created_at).getTime()) < 15 * 60 * 1000 &&
          !message.text.startsWith("/")) {

        // STEP: awaiting protocol name
        if (protoCtx.context_type === "protocol_name") {
          const name = message.text.trim().slice(0, 200);
          await supabase.from("telegram_pending_context").update({
            context_type: "protocol_template",
            protocol_name: name,
            created_at: new Date().toISOString(),
          }).eq("chat_id", chatId);

          await sendTelegramMessageWithKeyboard(BOT_TOKEN, chatId,
            `✅ Название: *${escapeMarkdown(name)}*\n\n` +
            `Шаг 2/4. Выберите шаблон протокола:`,
            [
              [{ text: "🔀 Кросс-функциональный", callback_data: "proto_tpl:cross_functional" }],
              [{ text: "🤝 Переговоры с клиентом", callback_data: "proto_tpl:client_negotiation" }],
              [{ text: "🎯 Гейт NPD", callback_data: "proto_tpl:npd_gate" }],
              [{ text: "📋 Пустой", callback_data: "proto_tpl:blank" }],
              [{ text: "❌ Отмена", callback_data: "proto_cancel" }],
            ],
            "Markdown"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // STEP: accumulating raw messages into buffer (text/forwarded/voice)
        if (protoCtx.context_type === "protocol_buffer") {
          const buf = Array.isArray(protoCtx.raw_messages) ? [...protoCtx.raw_messages] : [];

          // Build entry with author/date/source for AI context
          let authorName = "";
          let authorDate = "";
          let isForwarded = false;
          if (message.forward_date) {
            isForwarded = true;
            authorDate = new Date(message.forward_date * 1000).toISOString();
            const fwdFrom = message.forward_from || message.forward_from_chat;
            const sender = message.forward_sender_name
              || [fwdFrom?.first_name, fwdFrom?.last_name].filter(Boolean).join(" ")
              || fwdFrom?.title
              || (fwdFrom?.username ? `@${fwdFrom.username}` : "");
            authorName = sender || "Неизвестно";
          } else {
            authorName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ")
              || (message.from?.username ? `@${message.from.username}` : "Автор");
            authorDate = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString();
          }

          const sourceType = isFromVoice ? "voice" : (isForwarded ? "forwarded" : "text");
          buf.push({
            text: message.text,
            author: authorName,
            date: authorDate,
            source: sourceType,
          });

          await supabase.from("telegram_pending_context").update({
            raw_messages: buf,
            last_message_at: new Date().toISOString(),
          }).eq("chat_id", chatId);

          const totalChars = buf.reduce((s, m) => s + (m.text?.length || 0), 0);
          const sourceLabel = sourceType === "voice" ? "🎤 голос" : (sourceType === "forwarded" ? "📨 пересылка" : "📝 текст");
          await sendTelegramMessageWithKeyboard(BOT_TOKEN, chatId,
            `📥 Принял (${sourceLabel}). В буфере: *${buf.length}* сообщ., ${totalChars} симв.\n\n` +
            `Жду ещё материалов. Когда закончите — нажмите кнопку или просто подождите 60 сек.`,
            [
              [{ text: `✅ Разобрать всё (${buf.length})`, callback_data: "proto_finish" }],
              [{ text: "❌ Отмена", callback_data: "proto_cancel" }],
            ],
            "Markdown"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // STEP: collecting axis answers
        if (protoCtx.context_type === "protocol_axes" && protoCtx.awaiting_axis) {
          const axisValue = message.text.trim();
          const collected = { ...(protoCtx.collected_axes || {}) };
          if (axisValue !== "-" && axisValue !== "—") {
            collected[protoCtx.awaiting_axis] = axisValue.slice(0, 200);
          }

          const requiredAxes = REQUIRED_AXES_BY_TEMPLATE[protoCtx.template_key as string] || [];
          const nextMissing = requiredAxes.find((a) => !collected[a] && a !== protoCtx.awaiting_axis);

          await supabase.from("telegram_pending_context").update({
            collected_axes: collected,
            awaiting_axis: nextMissing || null,
            created_at: new Date().toISOString(),
          }).eq("chat_id", chatId);

          if (nextMissing) {
            await sendTelegramMessage(BOT_TOKEN, chatId,
              `✅ Записал.\n\nЕщё уточните: *${AXIS_LABELS[nextMissing]}*?\n\n` +
              `_Например: ${AXIS_EXAMPLES[nextMissing] || "название"}_\n\n` +
              `Или «-» чтобы пропустить.`,
              "Markdown"
            );
          } else {
            await finalizeProtocolDraft(
              supabase, BOT_TOKEN, chatId, userId, protoCtx,
              protoCtx.parsed_payload, collected,
            );
          }
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }
    }

    // === /spisok in private chat ===
    if (message.text.startsWith("/spisok") || message.text === "/s" || message.text === "/t" || message.text === "/p" || message.text === "/d"
        || message.text.startsWith("/s ") || message.text.startsWith("/t ") || message.text.startsWith("/p ") || message.text.startsWith("/d ")) {
      const bulkArgs = message.text.replace(/^\/(spisok|s|t|p|d)\s*/, "").trim();
      if (!bulkArgs) {
        // Save pending context WITHOUT project — next message (voice/text/forward) will be parsed as tasks
        await supabase.from("telegram_pending_context").upsert({
          chat_id: chatId,
          user_id: userId,
          context_type: "spisok",
          group_id: null,
          group_name: null,
          created_at: new Date().toISOString(),
        }, { onConflict: "chat_id" });

        await sendTelegramMessage(BOT_TOKEN, chatId,
          "📦 *Режим пакетного создания задач*\n\n" +
          "Теперь отправь:\n" +
          "• 📝 Список задач текстом\n" +
          "• 🎤 Голосовое сообщение\n" +
          "• 📨 Перешли сообщение\n\n" +
          "💡 Чтобы привязать к проекту: `/spisok Название проекта`\n\n" +
          "⏰ Контекст активен 10 минут.",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Try to detect project from first line
      let bulkGroupId: string | null = null;
      let bulkGroupName: string | null = null;
      let bulkText = bulkArgs;
      
      const firstLine = bulkArgs.split("\n")[0].trim();
      const restText = bulkArgs.substring(firstLine.length).trim();
      
      if (!firstLine.startsWith("-") && !firstLine.startsWith("•") && !firstLine.startsWith("*") && !/^\d+[\.\)]/.test(firstLine)) {
        const group = await findProject(supabase, userId, firstLine);
        if (group) {
          bulkGroupId = group.id;
          bulkGroupName = group.name;
          bulkText = restText;
        }
      }

      // If only project name was provided (no task list) — save context for next message
      if (bulkGroupId && !bulkText) {
        await supabase.from("telegram_pending_context").upsert({
          chat_id: chatId,
          user_id: userId,
          context_type: "spisok",
          group_id: bulkGroupId,
          group_name: bulkGroupName,
          created_at: new Date().toISOString(),
        }, { onConflict: "chat_id" });

        await sendTelegramMessage(BOT_TOKEN, chatId,
          `📦 Проект: ${escapeMarkdown(bulkGroupName || "")}\n\n` +
          "Теперь отправь:\n" +
          "• 📝 Список задач текстом\n" +
          "• 🎤 Голосовое сообщение\n" +
          "• 📨 Перешли сообщение из другого чата\n\n" +
          "⏰ Контекст активен 10 минут.",
          "Markdown"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const members = bulkGroupId 
        ? await getProjectMembers(supabase, bulkGroupId, (await supabase.from("task_groups").select("user_id").eq("id", bulkGroupId).single()).data?.user_id || userId)
        : [];
      const parsedTasks = await aiBulkParse(bulkText, members, bulkGroupName || undefined);

      if (!parsedTasks || parsedTasks.length === 0) {
        await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось распознать задачи. Попробуйте переформулировать.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Clear any pending context
      await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);

      const results = await createBulkTasks(supabase, parsedTasks, userId, bulkGroupId, members);
      const confirmLines = results.map((r, i) =>
        `${i + 1}. ✅ ${r.title}${r.assignee ? ` 👤 ${r.assignee}` : ""}${r.participants?.length ? ` 👥 ${r.participants.join(", ")}` : ""}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
      );

      const projectInfo = bulkGroupName ? ` в 📁 ${escapeMarkdown(bulkGroupName)}` : "";
      await sendTelegramMessage(BOT_TOKEN, chatId,
        `📦 Создано ${results.length} задач${projectInfo}:\n\n${confirmLines.join("\n")}${isFromVoice ? "\n\n🎤 Из голосового сообщения" : ""}`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Check pending /spisok context (for voice, forwarded, or bulk-like messages) ===
    // Voice messages ALWAYS check pending context (transcriptions often don't have list markers)
    const isPendingContextCandidate = isFromVoice || message._forwarded || detectBulkMessage(message.text);
    if (isPendingContextCandidate && !message.text.startsWith("/")) {
      const { data: pendingCtx } = await supabase
        .from("telegram_pending_context")
        .select("*")
        .eq("chat_id", chatId)
        .single();

      // Check if context exists and is fresh (< 10 minutes)
      if (pendingCtx && (Date.now() - new Date(pendingCtx.created_at).getTime()) < 10 * 60 * 1000) {
        const ctxGroupId = pendingCtx.group_id;
        const ctxGroupName = pendingCtx.group_name;
        
        const members = ctxGroupId
          ? await getProjectMembers(supabase, ctxGroupId, (await supabase.from("task_groups").select("user_id").eq("id", ctxGroupId).single()).data?.user_id || userId)
          : [];
        const parsedTasks = await aiBulkParse(message.text, members, ctxGroupName || undefined);

        if (parsedTasks && parsedTasks.length >= 1) {
          // Clear context after use
          await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);

          const results = await createBulkTasks(supabase, parsedTasks, userId, ctxGroupId, members);
          const confirmLines = results.map((r: any, i: number) =>
            `${i + 1}. ✅ ${r.title}${r.assignee ? ` 👤 ${r.assignee}` : ""}${r.participants?.length ? ` 👥 ${r.participants.join(", ")}` : ""}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
          );

          const projectInfo = ctxGroupName ? ` в 📁 ${escapeMarkdown(ctxGroupName)}` : "";
          const sourceHint = isFromVoice ? "\n\n🎤 Из голосового сообщения" : message._forwarded ? "\n\n📨 Из пересланного сообщения" : "";
          await sendTelegramMessage(BOT_TOKEN, chatId,
            `📦 Создано ${results.length} задач${projectInfo}:\n\n${confirmLines.join("\n")}${sourceHint}`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }
    }

    // === Voice messages without pending context → always try AI bulk parse ===
    if (isFromVoice && !message.text.startsWith("/")) {
      const parsedTasks = await aiBulkParse(message.text, [], undefined);
      if (parsedTasks && parsedTasks.length >= 1) {
        const results = await createBulkTasks(supabase, parsedTasks, userId, null, []);
        const confirmLines = results.map((r: any, i: number) =>
          `${i + 1}. ✅ ${r.title}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
        );

        await sendTelegramMessage(BOT_TOKEN, chatId,
          `🎤📦 Создано ${results.length} задач из голосового:\n\n${confirmLines.join("\n")}\n\n💡 Используй /spisok Проект для привязки к проекту`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // If AI couldn't parse multiple tasks, fall through to single task creation
    }

    // === Auto-detect bulk task lists in private chat ===
    const isBulkCandidate = detectBulkMessage(message.text);
    if (isBulkCandidate && !message.text.startsWith("/")) {
      // Auto-detected as bulk list
      const members: any[] = [];
      const parsedTasks = await aiBulkParse(message.text, members, undefined);
      
      if (parsedTasks && parsedTasks.length >= 2) {
        const results = await createBulkTasks(supabase, parsedTasks, userId, null, members);
        const confirmLines = results.map((r: any, i: number) =>
          `${i + 1}. ✅ ${r.title}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`
        );
        
        const sourceHint = isFromVoice ? "\n\n🎤 Из голосового сообщения" : message._forwarded ? "\n\n📨 Из пересланного сообщения" : "";
        await sendTelegramMessage(BOT_TOKEN, chatId,
          `📦 Распознано ${results.length} задач:\n\n${confirmLines.join("\n")}${sourceHint}\n\n💡 Используй /spisok Проект для создания в конкретном проекте`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }

    // === Forwarded single message → create as single task ===
    if (message._forwarded && !message.text.startsWith("/")) {
      // Forwarded message that wasn't detected as bulk — create as single task
      const forwardFrom = message.forward_from?.first_name || message.forward_sender_name || "";
      const taskTitle = message.text.length > 100 ? message.text.substring(0, 100) + "…" : message.text;
      const taskDesc = forwardFrom ? `📨 Переслано от: ${forwardFrom}\n\n${message.text}` : message.text;
      
      const { error: taskErr } = await supabase.from("tasks").insert({
        title: taskTitle,
        description: message.text.length > 100 ? taskDesc : undefined,
        user_id: userId,
        position: Date.now(),
        start_at: new Date().toISOString(),
      });

      if (!taskErr) {
        await sendTelegramMessage(BOT_TOKEN, chatId,
          `📨 Задача из пересланного сообщения:\n✅ ${escapeMarkdown(taskTitle)}${forwardFrom ? `\n👤 От: ${escapeMarkdown(forwardFrom)}` : ""}\n\n💡 Используй /spisok Проект для пакетного создания`
        );
      } else {
        await sendTelegramMessage(BOT_TOKEN, chatId, "❌ Не удалось создать задачу.");
      }
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
    const tagNames = tagMatches.map((t: string) => t.substring(1).toLowerCase());
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

    // === AI Enrichment for private chat (always runs) ===
    let aiEnrichment: AiTaskEnrichment | null = null;
    let aiApplied: string[] = [];
    if (!assignedTo || !deadline.date) {
      let members: { id: string; name: string; telegram_username: string | null }[] = [];
      let projectNameForAi: string | undefined;

      if (groupId) {
        const { data: groupInfo } = await supabase
          .from("task_groups")
          .select("user_id, name")
          .eq("id", groupId)
          .single();
        if (groupInfo) {
          members = await getProjectMembers(supabase, groupId, groupInfo.user_id);
          projectNameForAi = groupInfo.name;
        }
      }

      // Run AI enrichment even without project (will still determine deadline, priority, subtasks)
      aiEnrichment = await aiEnrichTask(text, members, projectNameForAi);
      if (aiEnrichment) {
        if (!assignedTo && aiEnrichment.assigned_to_id && members.length > 0) {
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

    // Create the task
    const taskData: Record<string, any> = {
      title: text.substring(0, 500),
      user_id: userId,
      is_important: isImportant,
      start_at: new Date().toISOString(),
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

    // Add AI-suggested participants
    if (aiEnrichment?.participant_ids && aiEnrichment.participant_ids.length > 0 && newTask && groupId) {
      const { data: groupInfo2 } = await supabase.from("task_groups").select("user_id").eq("id", groupId).single();
      if (groupInfo2) {
        const memberIds = await getGroupMemberIds(supabase, groupId, groupInfo2.user_id);
        const validParticipants = aiEnrichment.participant_ids.filter(
          pid => memberIds.includes(pid) && pid !== userId && pid !== assignedTo
        );
        for (const pid of validParticipants) {
          await supabase.from("task_participants").insert({
            task_id: newTask.id,
            user_id: pid,
            role: "participant",
          });
        }
        if (validParticipants.length > 0) {
          const names = aiEnrichment.participant_names?.slice(0, validParticipants.length) || [];
          aiApplied.push(`👥 ${names.join(", ") || validParticipants.length + " уч."}`);
        }
      }
    }

    // Add assignee as participant
    if (assignedTo && assignedTo !== userId && newTask) {
      await supabase.from("task_participants").insert({
        task_id: newTask.id,
        user_id: assignedTo,
        role: "assignee",
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
    if (tagNames.length > 0) extras.push(`🏷 ${tagNames.map((t: string) => "#" + t).join(" ")}`);
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
  } catch (err: any) {
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
  participant_ids?: string[];
  participant_names?: string[];
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
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Ты — AI-помощник для обогащения задач. Анализируй текст задачи и определяй:
1. Кто должен быть ответственным (assigned_to) — по смыслу задачи, упоминанию имени/роли
2. Кто ещё должен участвовать (participants) — все, кто упомянут или задействован по контексту
3. Какой разумный срок (deadline) — по контексту ("срочно" = завтра, "на этой неделе" = конец недели, и т.д.)
4. Приоритет (1=высокий, 2=средний, 3=низкий)
5. Подзадачи, если задача комплексная

ВАЖНО: Если в тексте упоминаются имена людей или роли (@username, имя) — обязательно распознай их и назначь как ответственного или участника.
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
                  participant_ids: { type: "array", items: { type: "string" }, description: "IDs участников (кроме ответственного), которые упомянуты или задействованы" },
                  participant_names: { type: "array", items: { type: "string" }, description: "Имена участников" },
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
    // +Nд / +Nдн (sync with web quickTaskParse)
    [/(?:^|\s)\+(\d{1,3})\s*д(?:н\w*)?(?:\s|$)/i, (m) => {
      const d = new Date(now); d.setDate(d.getDate() + parseInt(m[1])); d.setHours(23, 59, 0, 0); return d;
    }],
    // "до DD.MM" / "до DD.MM.YYYY" (sync with web quickTaskParse)
    [/(?:^|\s)до\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s|$)/i, (m) => {
      let y = parseInt(m[3]); if (y < 100) y += 2000;
      return new Date(y, parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
    }],
    [/(?:^|\s)до\s+(\d{1,2})[./-](\d{1,2})(?!\.\d)(?:\s|$)/i, (m) => {
      const d = new Date(now.getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }],
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

// === Voice Message Transcription ===

async function transcribeVoiceMessage(botToken: string, fileId: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    // Download the file
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const audioRes = await fetch(downloadUrl);
    if (!audioRes.ok) return null;

    const audioBuffer = await audioRes.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    // Chunk-safe base64 encoding (avoid stack overflow on large files)
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // Transcribe with Gemini (supports audio natively)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Ты — транскрибатор. Точно расшифруй голосовое сообщение. Верни ТОЛЬКО текст сообщения, без комментариев. Если это список задач — сохрани формат списка.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: "ogg",
                },
              },
              { type: "text", text: "Расшифруй это голосовое сообщение:" },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Transcription error:", response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("Voice transcription failed:", e);
    return null;
  }
}

// === Bulk Task Parsing via AI ===

interface BulkParsedTask {
  title: string;
  assigned_to_id?: string | null;
  participant_ids?: string[] | null;
  assigned_to_name?: string | null;
  participant_names?: string[] | null;
  deadline_days?: number | null;
  deadline_date?: string | null;
  subtasks?: string[];
  priority?: number | null;
}

async function aiBulkParse(
  text: string,
  users: { id: string; name: string; telegram_username: string | null }[],
  projectName?: string,
): Promise<BulkParsedTask[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const userList = users.length > 0
    ? users.map(u => `- id="${u.id}" name="${u.name}"${u.telegram_username ? ` username="@${u.telegram_username}"` : ""}`).join("\n")
    : "нет участников";

  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Ты — парсер задач. Из произвольного текста извлекай список задач.
Распознавай:
- Маркированные списки (-, •, *, 1., 2.)
- Перечисления через запятую
- Свободный текст с несколькими действиями
- Голосовые транскрипции (могут быть без пунктуации)

Для каждой задачи определи:
- title: краткое название задачи (глагол + объект)
- assigned_to_id: UUID ответственного из списка участников ниже. Сопоставляй ЛЮБОЕ упоминание человека (имя, фамилия, @username, уменьшительное) с записями списка. Например: "Шулакова" → ищи в name; "Витя", "Викуся" → "Виктория"; "Марк", "Гозман" → "Марк Гозман".
- participant_ids: массив UUID участников задачи (все остальные люди, кроме ответственного), сопоставленных по тому же правилу.
- assigned_to_name: запасное поле — имя/фамилия/@username, если не уверен в id (тёзки или нет совпадения).
- participant_names: запасной массив имён, если не уверен в id.
- deadline_days: срок в днях от сегодня (если указано "3д", "через 5 дней", "неделю" и т.п.)
- deadline_date: конкретная дата YYYY-MM-DD (если указана дата)
- subtasks: подзадачи, если задача комплексная (вложенные пункты)
- priority: 1=высокий, 2=средний, 3=низкий

${projectName ? `Проект: "${projectName}"` : ""}
Доступные участники проекта (используй ИХ id для assigned_to_id):
${userList}
Текущая дата: ${today}

ВАЖНО: 
- Имена могут быть встроены в текст без маркеров: "забрать матрицы Виктория Журавлёва" → "Виктория" = ответственный, "Журавлёва" = участник (если оба есть в списке) или контекст.
- Сопоставляй по ЛЮБОМУ токену ФИО (имя ИЛИ фамилия), уменьшительным (Витя=Виктория, Маша=Мария, Саша=Александр), регистр игнорируй.
- Если упомянуто несколько людей — первый или явно указанный как ответственный → assigned_to_id, остальные → participant_ids.
- ВСЕГДА возвращай assigned_to_id, если в тексте есть упоминание человека из списка. Не пропускай!
- Если текст содержит одну задачу — верни массив из одного элемента. Минимум: title.`,
          },
          { role: "user", content: `Извлеки задачи из:\n\n${text}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_tasks",
              description: "Извлечь список задач из текста",
              parameters: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        assigned_to_id: { type: "string", description: "UUID ответственного из списка участников" },
                        participant_ids: { type: "array", items: { type: "string" }, description: "UUID участников задачи" },
                        assigned_to_name: { type: "string", description: "Резервно: имя/@username, если не нашёл id" },
                        participant_names: { type: "array", items: { type: "string" }, description: "Резервно: имена участников" },
                        deadline_days: { type: "number", description: "Срок в днях от сегодня" },
                        deadline_date: { type: "string", description: "Дата YYYY-MM-DD" },
                        subtasks: { type: "array", items: { type: "string" } },
                        priority: { type: "number" },
                      },
                      required: ["title"],
                    },
                  },
                },
                required: ["tasks"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_tasks" } },
      }),
    });

    if (!response.ok) {
      console.error("AI bulk parse error:", response.status);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.tasks || null;
    }
  } catch (e) {
    console.error("AI bulk parse failed:", e);
  }
  return null;
}

// === Bulk Task Creation ===

interface BulkTaskResult {
  title: string;
  assignee?: string;
  participants?: string[];
  deadline?: string;
  subtaskCount?: number;
}

// Уменьшительные / варианты имён для русских ФИО
const NAME_ALIASES: Record<string, string[]> = {
  "виктория": ["вика", "викуся", "витя"],
  "александр": ["саша", "шура", "саня"],
  "александра": ["саша", "шура", "сашуля"],
  "мария": ["маша", "маня", "мара"],
  "екатерина": ["катя", "катюша"],
  "анастасия": ["настя", "ася"],
  "наталья": ["наташа", "ната"],
  "наталия": ["наташа", "ната"],
  "ольга": ["оля", "оляша"],
  "елена": ["лена", "ленуся"],
  "татьяна": ["таня", "танюша"],
  "ирина": ["ира", "иришка"],
  "светлана": ["света", "светик"],
  "юлия": ["юля", "юляша"],
  "анна": ["аня", "анюта"],
  "людмила": ["люда", "люся"],
  "галина": ["галя", "галюся"],
  "владимир": ["вова", "володя"],
  "дмитрий": ["дима", "митя"],
  "сергей": ["серёжа", "сережа", "серый"],
  "андрей": ["андрюша", "дрюша"],
  "алексей": ["лёша", "леша", "алёша"],
  "михаил": ["миша", "мишаня"],
  "николай": ["коля", "колян"],
  "евгений": ["женя", "жека"],
  "артём": ["тёма", "тема", "артемка"],
  "артем": ["тёма", "тема", "артемка"],
  "максим": ["макс", "максимка"],
  "иван": ["ваня", "ванюша"],
  "павел": ["паша", "пашка"],
  "константин": ["костя", "костик"],
  "роман": ["рома", "ромка"],
  "пётр": ["петя", "петруша"],
  "петр": ["петя", "петруша"],
  "виктор": ["витя", "витёк"],
  "марк": ["марик"],
};

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "").trim();
}

function nameTokens(fullName: string): string[] {
  return fullName.split(/\s+/).map(normalizeToken).filter(t => t.length >= 2);
}

function expandWithAliases(token: string): string[] {
  const t = token.toLowerCase().replace(/ё/g, "е");
  const result = new Set<string>([t]);
  if (NAME_ALIASES[t]) NAME_ALIASES[t].forEach(a => result.add(a));
  // обратное: если t — уменьшительное, найти полное
  for (const [full, aliases] of Object.entries(NAME_ALIASES)) {
    if (aliases.includes(t)) result.add(full);
  }
  return [...result];
}

/**
 * Поиск участника по имени/фамилии/нику. Считает совпадение, если:
 * - точное совпадение по telegram_username
 * - нужный токен совпадает с любым токеном ФИО (или его уменьшительным/полным эквивалентом)
 */
function findMemberByName(
  needle: string,
  members: { id: string; name: string; telegram_username: string | null }[],
): { id: string; name: string; telegram_username: string | null } | null {
  if (!needle) return null;
  const cleaned = needle.replace(/^@/, "").trim();
  if (!cleaned) return null;
  const needleNorm = normalizeToken(cleaned);

  // 1. Точное совпадение по @username
  const byUsername = members.find(m => m.telegram_username?.toLowerCase() === cleaned.toLowerCase());
  if (byUsername) return byUsername;

  // 2. Точное совпадение по полному имени
  const byFullName = members.find(m => normalizeToken(m.name) === needleNorm);
  if (byFullName) return byFullName;

  // 3. Совпадение токена с алиасами
  const needleVariants = new Set(expandWithAliases(needleNorm));
  for (const m of members) {
    const tokens = nameTokens(m.name);
    for (const tok of tokens) {
      const variants = expandWithAliases(tok);
      if (variants.some(v => needleVariants.has(v))) return m;
    }
  }

  // 4. Подстрока (на случай опечаток типа "Журавлев"/"Журавлева")
  for (const m of members) {
    const fullNorm = normalizeToken(m.name);
    if (needleNorm.length >= 4 && (fullNorm.includes(needleNorm) || needleNorm.includes(fullNorm))) {
      return m;
    }
  }

  return null;
}

async function createBulkTasks(
  supabase: any,
  tasks: BulkParsedTask[],
  userId: string,
  groupId: string | null,
  members: { id: string; name: string; telegram_username: string | null }[],
): Promise<BulkTaskResult[]> {
  const results: BulkTaskResult[] = [];
  const now = new Date();
  const memberById = new Map(members.map(m => [m.id, m]));

  for (const task of tasks) {
    const taskData: Record<string, any> = {
      title: task.title.substring(0, 500),
      user_id: userId,
      start_at: new Date().toISOString(),
    };
    if (groupId) taskData.group_id = groupId;
    if (task.priority) taskData.priority = task.priority;

    // Resolve deadline
    let deadlineStr: string | undefined;
    if (task.deadline_date) {
      taskData.deadline = new Date(task.deadline_date + "T23:59:00").toISOString();
      deadlineStr = task.deadline_date;
    } else if (task.deadline_days && task.deadline_days > 0) {
      const d = new Date(now);
      d.setDate(d.getDate() + task.deadline_days);
      d.setHours(23, 59, 0, 0);
      taskData.deadline = d.toISOString();
      deadlineStr = formatDate(d);
    }

    // Resolve assignee — приоритет: id от ИИ → имя/фамилия с алиасами
    let assigneeName: string | undefined;
    if (task.assigned_to_id && memberById.has(task.assigned_to_id)) {
      const m = memberById.get(task.assigned_to_id)!;
      taskData.assigned_to = m.id;
      assigneeName = m.name;
    } else if (task.assigned_to_name && members.length > 0) {
      const match = findMemberByName(task.assigned_to_name, members);
      if (match) {
        taskData.assigned_to = match.id;
        assigneeName = match.name;
      }
    }

    const { data: newTask, error } = await supabase
      .from("tasks")
      .insert(taskData)
      .select("id")
      .single();

    if (error || !newTask) {
      console.error("Bulk task creation error:", error);
      continue;
    }

    // Add assignee as participant
    if (taskData.assigned_to && taskData.assigned_to !== userId) {
      await supabase.from("task_participants").insert({
        task_id: newTask.id,
        user_id: taskData.assigned_to,
        role: "assignee",
      });
    }

    // Resolve and add participants — сначала id от ИИ, потом имена с алиасами
    const resolvedParticipantNames: string[] = [];
    const seenIds = new Set<string>();
    if (taskData.assigned_to) seenIds.add(taskData.assigned_to);
    if (task.participant_ids && task.participant_ids.length > 0) {
      for (const pid of task.participant_ids) {
        if (seenIds.has(pid) || pid === userId) continue;
        const m = memberById.get(pid);
        if (!m) continue;
        await supabase.from("task_participants").insert({
          task_id: newTask.id,
          user_id: m.id,
          role: "participant",
        });
        resolvedParticipantNames.push(m.name);
        seenIds.add(m.id);
      }
    }
    if (task.participant_names && task.participant_names.length > 0 && members.length > 0) {
      for (const pName of task.participant_names) {
        const match = findMemberByName(pName, members);
        if (match && !seenIds.has(match.id) && match.id !== userId) {
          await supabase.from("task_participants").insert({
            task_id: newTask.id,
            user_id: match.id,
            role: "participant",
          });
          resolvedParticipantNames.push(match.name);
          seenIds.add(match.id);
        }
      }
    }

    // Add subtasks
    let subtaskCount = 0;
    if (task.subtasks && task.subtasks.length > 0) {
      for (let i = 0; i < task.subtasks.length; i++) {
        await supabase.from("subtasks").insert({
          task_id: newTask.id,
          title: task.subtasks[i],
          position: i,
        });
      }
      subtaskCount = task.subtasks.length;
    }

    results.push({
      title: task.title.substring(0, 60),
      assignee: assigneeName,
      participants: resolvedParticipantNames.length > 0 ? resolvedParticipantNames : undefined,
      deadline: deadlineStr,
      subtaskCount: subtaskCount || undefined,
    });
  }

  return results;
}

// === Auto-detect bulk message ===

function detectBulkMessage(text: string): boolean {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return false;

  // Check for list patterns
  let listLineCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-•*]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
      listLineCount++;
    }
  }

  // If 2+ lines are list items, treat as bulk
  if (listLineCount >= 2) return true;

  // Check for comma-separated tasks (3+ items with action verbs)
  const commaItems = text.split(/[,;]/).filter(s => s.trim().length > 3);
  if (commaItems.length >= 3) return true;

  return false;
}

// ==================== PROTOCOL WIZARD HELPERS ====================

const TEMPLATE_LABELS: Record<string, string> = {
  cross_functional: "Кросс-функциональный",
  client_negotiation: "Переговоры с клиентом",
  npd_gate: "Гейт NPD",
  blank: "Пустой",
};

const TEMPLATE_ICONS: Record<string, string> = {
  cross_functional: "🔀",
  client_negotiation: "🤝",
  npd_gate: "🎯",
  blank: "📋",
};

// Required axes per template (mirrors seed_protocol_templates SQL function)
const REQUIRED_AXES_BY_TEMPLATE: Record<string, string[]> = {
  cross_functional: ["site", "product_category"],
  client_negotiation: ["clients", "territory"],
  npd_gate: ["site", "product_category"],
  blank: [],
};

const AXIS_LABELS: Record<string, string> = {
  clients: "Клиент / контрагент",
  territory: "Территория / регион",
  site: "Площадка / БЕ / завод",
  brand: "Бренд",
  product_category: "Категория продукта",
  department: "Отдел",
  event_topic: "Тема встречи",
  stm: "СТМ",
  product_state: "Состояние продукта",
};

const AXIS_EXAMPLES: Record<string, string> = {
  clients: "Магнит, X5, Лента",
  territory: "ЦФО, Урал, СЗФО",
  site: "Доронеево, Курск, Калининград",
  brand: "ВкусВилл, Премьера",
  product_category: "молочка, кондитерка, замороженные",
  department: "продажи, маркетинг, R&D",
  event_topic: "запуск линейки, ценовая политика",
};

function pluralizeRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

interface ParsedProtocolRow {
  title: string;
  description?: string | null;
  assignee_hint?: string | null;
  deadline?: string | null;
  axes?: Record<string, string | null>;
}

interface ParsedProtocol {
  meeting_title?: string | null;
  meeting_date?: string | null;
  participants?: string[];
  summary?: string | null;
  rows: ParsedProtocolRow[];
}

async function parseProtocolText(text: string): Promise<ParsedProtocol | null> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-protocol-text`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      console.error("parse-protocol-text failed:", resp.status, await resp.text());
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error("parseProtocolText error:", e);
    return null;
  }
}

/** Try to match a Russian name (e.g. "Иван Петров", "Иван") to a workspace user. */
async function findUserByName(
  supabase: any,
  ownerId: string,
  hint: string,
): Promise<string | null> {
  if (!hint || typeof hint !== "string") return null;
  const cleaned = hint.replace(/[«»"'()]/g, "").trim();
  if (!cleaned) return null;

  // Build candidate users: owner + group members of any group owned by user
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_username")
    .eq("id", ownerId)
    .maybeSingle();

  const { data: ownedGroups } = await supabase
    .from("task_groups")
    .select("id")
    .eq("user_id", ownerId);
  const groupIds = (ownedGroups || []).map((g: any) => g.id);

  let memberProfiles: any[] = [];
  if (groupIds.length > 0) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("user_id, profiles!inner(id, display_name, telegram_username)")
      .in("group_id", groupIds);
    memberProfiles = (gm || []).map((m: any) => m.profiles).filter(Boolean);
  }

  const candidates: { id: string; name: string; tg: string | null }[] = [];
  if (ownerProfile) {
    candidates.push({
      id: ownerProfile.id,
      name: ownerProfile.display_name || "",
      tg: ownerProfile.telegram_username,
    });
  }
  for (const p of memberProfiles) {
    if (!candidates.find((c) => c.id === p.id)) {
      candidates.push({ id: p.id, name: p.display_name || "", tg: p.telegram_username });
    }
  }

  const lower = cleaned.toLowerCase();
  // Exact telegram match (with or without @)
  const tgMatch = candidates.find(
    (c) => c.tg && c.tg.toLowerCase() === lower.replace(/^@/, ""),
  );
  if (tgMatch) return tgMatch.id;

  // Substring match on display_name (try both directions)
  const nameMatch = candidates.find((c) => {
    const n = c.name.toLowerCase();
    if (!n) return false;
    return n.includes(lower) || lower.includes(n);
  });
  if (nameMatch) return nameMatch.id;

  // Token match: any token of cleaned matches any token of name
  const hintTokens = lower.split(/\s+/).filter((t) => t.length >= 3);
  for (const c of candidates) {
    const nameTokens = c.name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    if (hintTokens.some((ht) => nameTokens.some((nt) => nt === ht))) return c.id;
  }
  return null;
}

async function finalizeProtocolDraft(
  supabase: any,
  botToken: string,
  chatId: number,
  userId: string,
  protoCtx: any,
  parsed: ParsedProtocol,
  collected: Record<string, string>,
): Promise<void> {
  try {
    const templateKey = protoCtx.template_key as string;
    const templateLabel = TEMPLATE_LABELS[templateKey] || "Протокол";
    const templateIcon = TEMPLATE_ICONS[templateKey] || "📋";

    const meetingDate =
      parsed.meeting_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.meeting_date)
        ? parsed.meeting_date
        : new Date().toISOString().slice(0, 10);

    const protocolName =
      protoCtx.protocol_name ||
      parsed.meeting_title ||
      `${templateLabel} — ${meetingDate}`;

    const descriptionParts: string[] = [
      `Шаблон: ${templateLabel}`,
      `Дата встречи: ${meetingDate}`,
      `Создано через Telegram-бот`,
    ];
    if (parsed.summary) descriptionParts.push("", parsed.summary);
    if (parsed.participants?.length)
      descriptionParts.push(`Участники: ${parsed.participants.join(", ")}`);
    for (const [axis, val] of Object.entries(collected)) {
      if (val) descriptionParts.push(`${AXIS_LABELS[axis] || axis}: ${val}`);
    }

    // 1) Create draft protocol group
    const { data: group, error: gErr } = await supabase
      .from("task_groups")
      .insert({
        name: protocolName.trim().slice(0, 200),
        user_id: userId,
        icon: templateIcon,
        color: "#6366f1",
        project_type: "protocol",
        draft_status: "draft",
        description: descriptionParts.join("\n"),
        protocol_meta: {
          meeting_date: meetingDate,
          format: "offline",
          template_key: templateKey,
          axes: collected,
          source: "telegram",
        },
      })
      .select()
      .single();

    if (gErr || !group) {
      console.error("create protocol group error:", gErr);
      await sendTelegramMessage(botToken, chatId, "❌ Не удалось создать протокол: " + (gErr?.message || "unknown"));
      await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);
      return;
    }

    // 2) Create draft tasks (with assignee resolution)
    const taskRows: any[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const r = parsed.rows[i];
      let assignedTo: string | null = null;
      if (r.assignee_hint) {
        assignedTo = await findUserByName(supabase, userId, r.assignee_hint);
      }
      const descParts: string[] = [];
      if (r.description) descParts.push(r.description);
      if (r.assignee_hint && !assignedTo) {
        descParts.push(`Ответственный (из текста): ${r.assignee_hint}`);
      }
      taskRows.push({
        title: r.title.slice(0, 200),
        description: descParts.join("\n\n") || null,
        deadline: r.deadline && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : null,
        assigned_to: assignedTo,
        is_draft: true,
        group_id: group.id,
        user_id: userId,
        position: i,
      });
    }

    let createdCount = 0;
    if (taskRows.length > 0) {
      const { data: insertedTasks, error: tErr } = await supabase
        .from("tasks")
        .insert(taskRows)
        .select("id");
      if (tErr) {
        console.error("create protocol tasks error:", tErr);
      } else {
        createdCount = insertedTasks?.length || 0;
      }
    }

    await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);

    // 3) Build summary message with link to web
    const webBase = "https://justtodoit.ru";
    const webUrl = `${webBase}/protocols/${group.id}`;

    const previewLines = parsed.rows.slice(0, 5).map((r, i) => {
      const dl = r.deadline ? ` 📅 ${r.deadline}` : "";
      const ass = r.assignee_hint ? ` 👤 ${r.assignee_hint}` : "";
      return `${i + 1}. ${escapeMarkdown(r.title.slice(0, 80))}${ass}${dl}`;
    });
    const moreHint =
      parsed.rows.length > 5
        ? `\n_…и ещё ${parsed.rows.length - 5} ${pluralizeRu(parsed.rows.length - 5, ["задача", "задачи", "задач"])}_`
        : "";

    const axesLine = Object.entries(collected)
      .filter(([, v]) => v)
      .map(([k, v]) => `${AXIS_LABELS[k] || k}: *${escapeMarkdown(v)}*`)
      .join(" · ");

    await sendTelegramMessageWithKeyboard(
      botToken,
      chatId,
      `✅ *Черновик протокола создан*\n\n` +
        `${templateIcon} *${escapeMarkdown(protocolName)}*\n` +
        `📅 ${meetingDate}\n` +
        (axesLine ? `${axesLine}\n` : "") +
        `\n📝 Создано задач: *${createdCount}*\n\n` +
        previewLines.join("\n") +
        moreHint +
        `\n\n_Откройте в вебе, чтобы доработать ответственных, теги и опубликовать._`,
      [[{ text: "📋 Открыть протокол", url: webUrl }]],
      "Markdown",
    );
  } catch (e) {
    console.error("finalizeProtocolDraft error:", e);
    await sendTelegramMessage(botToken, chatId, "❌ Ошибка при сохранении протокола.");
    await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);
  }
}

/**
 * Склеивает буфер сырых сообщений (текст/forwarded/voice) в единый текст для AI-разбора,
 * затем переиспользует логику осей и финализации, как в обычном wizard.
 */
async function flushProtocolBuffer(
  supabase: any,
  botToken: string,
  chatId: number,
  userId: string,
  protoCtx: any,
): Promise<void> {
  const buf: any[] = Array.isArray(protoCtx.raw_messages) ? protoCtx.raw_messages : [];
  if (buf.length === 0) {
    await sendTelegramMessage(botToken, chatId, "⚠️ Буфер пуст — пришлите хотя бы одно сообщение.");
    return;
  }

  const lines: string[] = [];
  for (const m of buf) {
    const dateShort = m.date ? String(m.date).replace("T", " ").slice(0, 16) : "";
    const srcLabel = m.source === "voice" ? "[голос]" : (m.source === "forwarded" ? "[пересылка]" : "[текст]");
    lines.push(`--- ${srcLabel} От: ${m.author || "?"} (${dateShort}) ---`);
    lines.push(String(m.text || "").trim());
    lines.push("");
  }
  const merged = lines.join("\n").trim();

  if (merged.length < 20) {
    await sendTelegramMessage(botToken, chatId,
      "⚠️ Слишком мало текста в буфере. Пришлите развёрнутый материал."
    );
    return;
  }

  await sendTelegramMessage(botToken, chatId,
    `🤖 Разбираю *${buf.length}* фрагмент${pluralizeRu(buf.length, ["", "а", "ов"])}, ${merged.length} симв… Это займёт 5–20 секунд.`,
    "Markdown",
  );

  const parsed = await parseProtocolText(merged);
  if (!parsed || !parsed.rows || parsed.rows.length === 0) {
    await sendTelegramMessage(botToken, chatId,
      "❌ Не удалось извлечь задачи из материала. Попробуйте /protocol заново и пришлите более структурированный текст."
    );
    await supabase.from("telegram_pending_context").delete().eq("chat_id", chatId);
    return;
  }

  const requiredAxes = REQUIRED_AXES_BY_TEMPLATE[protoCtx.template_key as string] || [];
  const collected: Record<string, string> = {};
  for (const axis of requiredAxes) {
    const counts: Record<string, number> = {};
    for (const r of parsed.rows) {
      const v = r.axes?.[axis];
      if (v && typeof v === "string" && v.trim()) {
        counts[v.trim()] = (counts[v.trim()] || 0) + 1;
      }
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= Math.ceil(parsed.rows.length * 0.5)) {
      collected[axis] = best[0];
    }
  }

  await supabase.from("telegram_pending_context").update({
    context_type: "protocol_axes",
    parsed_payload: parsed,
    collected_axes: collected,
    awaiting_axis: null,
    last_message_at: null,
    created_at: new Date().toISOString(),
  }).eq("chat_id", chatId);

  const missingAxis = requiredAxes.find((a) => !collected[a]);
  if (missingAxis) {
    await supabase.from("telegram_pending_context").update({
      awaiting_axis: missingAxis,
    }).eq("chat_id", chatId);

    await sendTelegramMessage(botToken, chatId,
      `✅ ИИ извлёк *${parsed.rows.length}* задач${pluralizeRu(parsed.rows.length, ["у", "и", ""])}.\n\n` +
      `Шаг 4/4. Уточните: *${AXIS_LABELS[missingAxis]}*?\n\n` +
      `_Например: ${AXIS_EXAMPLES[missingAxis] || "название"}_\n\n` +
      `Или пришлите «-» чтобы пропустить.`,
      "Markdown"
    );
  } else {
    const { data: freshCtx } = await supabase
      .from("telegram_pending_context")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();
    await finalizeProtocolDraft(supabase, botToken, chatId, userId, freshCtx || protoCtx, parsed, collected);
  }
}
