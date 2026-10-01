#!/usr/bin/env python3
"""Ответ ассистента в чате задачи + копия автору в Telegram (01.10.2026).

Сессия Claude отвечает на просьбы сотрудников в задаче (см. feedback-digest.py).
Ответ уходит через assistant-tools → add_comment с правами владельца и
пометкой meta.via = claude — так же, как пишет коннектор: с уведомлением автору
сообщения, на которое отвечаем. Автор попросил дублировать ответы ему в
Telegram — скрипт отправляет ту же реплику его личным чатом с ботом.

  assistant-reply.py <task_id> <файл с текстом> [--reply-to <comment_id>] [--dry-run]

Без --reply-to отвечаем на последнее сообщение не от ассистента; если сообщений
нет — пишем в задачу без ответа, копия уходит автору задачи.
"""
import argparse
import base64
import hashlib
import hmac
import html
import json
import subprocess
import time
import urllib.request

ENV_FILE = "/opt/jtd/self-hosting/.env.supabase"
BASE = "https://justtodoit.ru/sb"
APP = "https://justtodoit.ru"


def sql(q: str) -> str:
    return subprocess.run(["docker", "exec", "self-hosting-db-1", "psql", "-U", "postgres", "-tAc", q],
                          capture_output=True, text=True, check=True).stdout.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("task_id")
    ap.add_argument("text_file")
    ap.add_argument("--reply-to")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    env = {k: v.strip("'\"") for k, v in (l.split("=", 1) for l in open(ENV_FILE).read().splitlines() if "=" in l and not l.startswith("#"))}
    text = open(a.text_file, encoding="utf-8").read().strip()

    # От чьего имени: администратор (владелец). Пометка via=claude видна в чате.
    owner = sql("select r.user_id from user_roles r where r.role='admin' order by r.user_id limit 1")
    reply_to = a.reply_to or sql(
        f"select id from task_comments where task_id='{a.task_id}' and coalesce(kind,'message')='message' "
        f"and meta->>'via' is distinct from 'claude' order by created_at desc limit 1")
    # Копия в Telegram — автору сообщения, на которое отвечаем; если сообщений
    # ещё нет (задача из одного названия) — автору задачи.
    author = (sql(f"select user_id from task_comments where id='{reply_to}'") if reply_to
              else sql(f"select user_id from tasks where id='{a.task_id}'"))
    title = sql(f"select title from tasks where id='{a.task_id}'")
    chat = sql(f"select telegram_chat_id from profiles where id='{author}'") if author else ""
    print(f"задача «{title}», ответ на {reply_to or '—'}, копия в Telegram: {'да' if chat else 'нет чата'}")
    if a.dry_run:
        print(text)
        return

    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    now = int(time.time())
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps({"sub": owner, "role": "authenticated", "aud": "authenticated", "iss": BASE + "/auth/v1",
                        "iat": now, "exp": now + 300, "app_metadata": {"via": "claude-session"}}).encode())
    tok = f"{h}.{p}." + b64(hmac.new(env["JWT_SECRET"].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    body = {"action": "call", "tool": "add_comment", "input": {"task_id": a.task_id, "content": text, **({"reply_to": reply_to} if reply_to else {})}}
    req = urllib.request.Request(BASE + "/functions/v1/assistant-tools", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "apikey": env["ANON_KEY"], "Authorization": "Bearer " + tok})
    res = json.load(urllib.request.urlopen(req, timeout=60))
    print("в задаче:", res.get("ok"), res.get("text") or res.get("error"))

    if chat and res.get("ok"):
        msg = (f"💬 Ответ в задаче «<a href=\"{APP}/?task={a.task_id}\">{html.escape(title)}</a>»:\n\n"
               f"{html.escape(text)}")[:4000]
        tg = urllib.request.Request(f"https://api.telegram.org/bot{env['TELEGRAM_BOT_TOKEN']}/sendMessage",
                                    json.dumps({"chat_id": int(chat), "text": msg, "parse_mode": "HTML",
                                                "disable_web_page_preview": True}).encode(),
                                    {"Content-Type": "application/json"})
        print("в Telegram:", json.load(urllib.request.urlopen(tg, timeout=20)).get("ok"))


if __name__ == "__main__":
    main()
