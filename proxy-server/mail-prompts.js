/**
 * Prompt builders for mail analysis tasks.
 * Each function returns a { prompt, tier } object.
 */

// ── Schemas ─────────────────────────────────────────────────────────────────

const ANALYSIS_SCHEMA = `{
  "summary": "краткое резюме 1-2 предложения",
  "keyPoints": ["ключевой момент"],
  "actionItems": ["конкретное действие"],
  "priority": "low|medium|high",
  "sentiment": "positive|neutral|negative",
  "tags": ["тег"]
}`;

const CATEGORISE_SCHEMA = `{
  "categories": [
    {
      "id": "строка-id из входных данных",
      "category": "action|info|newsletter|auto|trash",
      "priority": "low|medium|high",
      "gist": "суть в 10 словах"
    }
  ]
}`;

// category legend:
//   action     — требует ответа или действия
//   info       — к сведению, не требует ответа
//   newsletter — рассылка, маркетинг, новости
//   auto       — авто-уведомление (CI, мониторинг, система)
//   trash      — спам, мусор

const DAY_SUMMARY_SCHEMA = `{
  "totalEmails": число,
  "unreadCount": число,
  "topThreads": [{"subject": "...", "count": число, "insight": "кратко"}],
  "topPeople": [{"name": "...", "email": "...", "count": число}],
  "actionItems": ["срочное действие"],
  "overallInsight": "общий вывод о дне в 2-3 предложениях",
  "byProject": [{"project": "название", "count": число, "summary": "кратко"}]
}`;

const PROMISES_SCHEMA = `{
  "openPromises": [
    {
      "from": "имя отправителя",
      "email": "email",
      "promise": "что именно обещали",
      "promisedDate": "когда обещали (словами)",
      "daysSince": число,
      "subject": "тема письма",
      "urgency": "low|medium|high"
    }
  ],
  "openQuestions": [
    {
      "askedBy": "ты или имя",
      "to": "кому вопрос",
      "question": "суть вопроса",
      "daysSince": число,
      "subject": "тема"
    }
  ],
  "summary": "общий вывод по незакрытым договорённостям"
}`;

const PERSON_DOSSIER_SCHEMA = `{
  "name": "имя",
  "email": "email",
  "relationship": "краткая характеристика отношений",
  "totalEmails": число,
  "openItems": ["незакрытый вопрос или задача"],
  "recentTopics": ["тема переписки"],
  "promises": [{"direction": "they|you", "text": "суть", "status": "open|done"}],
  "recommendedAction": "что стоит сделать прямо сейчас"
}`;

// ── Builders ─────────────────────────────────────────────────────────────────

export function buildCategorisePrompt(emails) {
  // emails: [{id, subject, from, date, gist}]
  const list = emails
    .map((e) => `[${e.id}] От: ${e.from} | ${e.date} | ${e.subject} | ${e.gist}`)
    .join("\n");

  return {
    tier: "fast",
    prompt: `Категоризируй письма. Для каждого укажи category и priority.

Категории:
- action     = требует ответа или действия
- info       = к сведению
- newsletter = рассылка/маркетинг
- auto       = авто-уведомление системы
- trash      = спам/мусор

Письма:
${list}

Верни JSON по схеме:
${CATEGORISE_SCHEMA}`,
  };
}

export function buildEmailAnalysisPrompt(email) {
  return {
    tier: "smart",
    prompt: `Проанализируй письмо:
Тема: ${email.subject}
От: ${email.from}
Дата: ${email.date}
Текст: ${email.body?.substring(0, 2000) || "(нет текста)"}

Верни JSON:
${ANALYSIS_SCHEMA}`,
  };
}

export function buildThreadAnalysisPrompt(thread) {
  const msgs = thread.emails
    .map((e, i) => `[${i + 1}] От: ${e.from} (${e.date})\n${e.body?.substring(0, 400)}`)
    .join("\n---\n");

  return {
    tier: "smart",
    prompt: `Проанализируй переписку по теме "${thread.subject}".
Участники: ${thread.participants?.join(", ")}

${msgs}

Верни JSON:
${ANALYSIS_SCHEMA}`,
  };
}

export function buildDaySummaryPrompt(data) {
  const threads = data.topThreads
    .map((t) => `- "${t.subject}" (${t.count} писем): ${t.emails?.map((e) => e.gist).join(" | ")}`)
    .join("\n");
  const people = data.topPeople.map((p) => `- ${p.name} (${p.count})`).join("\n");
  const samples = data.sampleBodies
    ?.map((e) => `[${e.from}] ${e.subject}: ${e.gist}`)
    .join("\n") || "";

  return {
    tier: "smart",
    prompt: `Создай дайджест рабочего дня.
Всего: ${data.totalEmails} писем, непрочитанных: ${data.unreadCount}.

Топ переписок:
${threads}

Активные отправители:
${people}

Образцы непрочитанных:
${samples}

Определи проекты/темы, выдели срочные задачи, дай общий вывод.
Верни JSON:
${DAY_SUMMARY_SCHEMA}`,
  };
}

export function buildPromisesPrompt(threads) {
  // threads: [{subject, participants, emails:[{from,date,body}]}]
  const text = threads
    .map((t) => {
      const msgs = t.emails
        .map((e) => `  [${e.date}] ${e.from}: ${e.body?.substring(0, 300)}`)
        .join("\n");
      return `=== ${t.subject} (${t.participants?.join(", ")}) ===\n${msgs}`;
    })
    .join("\n\n");

  return {
    tier: "smart",
    prompt: `Проанализируй переписку на предмет невыполненных обещаний и зависших вопросов.

Ищи:
1. Фразы вида "пришлю", "вернусь", "сделаю к...", "на этой неделе", "завтра" — и нет ли продолжения
2. Вопросы, на которые не было ответа N дней
3. Договорённости без подтверждения выполнения

${text}

Верни JSON:
${PROMISES_SCHEMA}`,
  };
}

export function buildPersonDossierPrompt(person) {
  // person: {name, email, emails:[{subject,from,date,body}]}
  const history = person.emails
    .slice(0, 30)
    .map((e) => `[${e.date}] От: ${e.from} | ${e.subject}\n${e.body?.substring(0, 300)}`)
    .join("\n---\n");

  return {
    tier: "smart",
    prompt: `Составь досье по переписке с человеком.
Имя: ${person.name}
Email: ${person.email}

История (последние ${Math.min(person.emails.length, 30)} писем):
${history}

Верни JSON:
${PERSON_DOSSIER_SCHEMA}`,
  };
}
