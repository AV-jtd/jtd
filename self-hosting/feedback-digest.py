#!/usr/bin/env python3
"""Сводка просьб по доработкам JTD владельцу в Telegram (решение владельца 01.10.2026).

Сотрудники пишут замечания и просьбы в отдельные задачи (список — FEEDBACK_TASKS
ниже). Два раза в неделю, в понедельник и четверг в 09:00 МСК, скрипт присылает
администраторам новые сообщения из этих задач с момента прошлой сводки. Нового
нет — ничего не приходит. Ответы ассистента (meta.via = claude) и служебные
записи журнала (kind = log) в сводку не попадают.

Разбор просьб делает сессия Claude по запросу владельца; ответ автору — в той же
задаче, через add_comment (с пометкой «написал Claude»).

Крон хоста:
  0 9 * * 1,4 /opt/jtd/self-hosting/feedback-digest.py >> /var/log/jtd-feedback.log 2>&1
Проверка без отправки и без сдвига отметки: feedback-digest.py --dry-run
"""
import html
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

# Задачи с просьбами по доработкам. Имена людей сюда не пишем — репозиторий публичный.
FEEDBACK_TASKS = [
    "e8f1a950-b6eb-427d-aee5-3c87195bbd57",  # «jtd Логи», заведена 01.10.2026
]
# Проекты-бэклоги: новые задачи и сообщения во всех их задачах. Записи
# администраторов не берём — это их собственные заметки, а не просьбы.
FEEDBACK_PROJECTS = [
    "c2404aa8-d7ee-4d4f-8caf-bac0f8c9bab7",  # проект «JTD»
]
ENV_FILE = "/opt/jtd/self-hosting/.env.supabase"
STATE = "/var/lib/jtd/feedback-digest.state"
APP = "https://justtodoit.ru"
DRY = "--dry-run" in sys.argv


def sql(q: str) -> str:
    r = subprocess.run(["docker", "exec", "self-hosting-db-1", "psql", "-U", "postgres", "-tAc", q],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def main() -> None:
    env = dict(l.split("=", 1) for l in open(ENV_FILE).read().splitlines() if "=" in l and not l.startswith("#"))
    bot = env["TELEGRAM_BOT_TOKEN"].strip("'\"")
    try:
        since = open(STATE).read().strip()
    except FileNotFoundError:
        since = "2026-10-01T00:00:00+03:00"
    now = datetime.now(timezone.utc).isoformat()
    ids = ",".join(f"'{t}'" for t in FEEDBACK_TASKS)
    projects = ",".join(f"'{p}'" for p in FEEDBACK_PROJECTS) or "null"
    not_admin = "not exists (select 1 from user_roles r where r.user_id = {} and r.role = 'admin')"
    rows = sql(f"""
      select coalesce(json_agg(x order by x.created_at), '[]') from (
        select c.task_id, t.title, coalesce(p.display_name, '—') as who, c.content, c.created_at,
               to_char(c.created_at at time zone 'Europe/Moscow', 'DD.MM HH24:MI') as at
        from task_comments c
        join tasks t on t.id = c.task_id
        left join profiles p on p.id = c.user_id
        where (c.task_id in ({ids}) or (t.group_id in ({projects}) and {not_admin.format('c.user_id')}))
          and c.created_at > '{since}'::timestamptz
          and coalesce(c.kind, 'message') = 'message'
          and c.meta->>'via' is distinct from 'claude'
        union all
        -- Новая задача в проекте-бэклоге: её название и есть просьба.
        select t.id, t.title, coalesce(p.display_name, '—'), '🆕 новая задача' ||
               coalesce(': ' || nullif(t.description, ''), ''), t.created_at,
               to_char(t.created_at at time zone 'Europe/Moscow', 'DD.MM HH24:MI')
        from tasks t left join profiles p on p.id = t.user_id
        where t.group_id in ({projects}) and t.created_at > '{since}'::timestamptz
          and {not_admin.format('t.user_id')}
      ) x""")
    msgs = json.loads(rows or "[]")
    print(f"{datetime.now():%F %T} новых сообщений: {len(msgs)} (с {since})")
    if not msgs:
        if not DRY:
            open(STATE, "w").write(now)
        return

    lines = [f"🛠 <b>Просьбы по доработкам JTD</b> — новых: {len(msgs)}"]
    by_task: dict[str, list] = {}
    for m in msgs:
        by_task.setdefault(m["task_id"], []).append(m)
    for tid, ms in by_task.items():
        lines.append(f"\n📌 <a href=\"{APP}/?task={tid}\">{html.escape(ms[0]['title'])}</a>")
        for m in ms:
            text = m["content"] if len(m["content"]) <= 600 else m["content"][:600] + "…"
            lines.append(f"• <i>{html.escape(m['who'])}, {m['at']}</i>\n{html.escape(text)}")
    lines.append("\nРазобрать: напишите Claude «разбери просьбы по JTD».")
    text = "\n".join(lines)[:4000]

    chats = sql("""select distinct b.chat_id from user_roles r join profiles p on p.id = r.user_id
                   join telegram_bot_chats b on lower(b.telegram_username) = lower(p.telegram_username)
                   where r.role = 'admin' and b.chat_id > 0""").split()
    if DRY:
        print(f"--dry-run, получателей: {len(chats)}\n{text}")
        return
    for c in chats:
        req = urllib.request.Request(f"https://api.telegram.org/bot{bot}/sendMessage",
                                     json.dumps({"chat_id": int(c), "text": text, "parse_mode": "HTML",
                                                 "disable_web_page_preview": True}).encode(),
                                     {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=20)
    open(STATE, "w").write(now)


if __name__ == "__main__":
    main()
