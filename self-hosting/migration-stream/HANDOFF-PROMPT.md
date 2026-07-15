# Промпт для передачи управления Claude Code на VPS

Запусти Claude Code **прямо на VPS** — тогда у него прямой доступ к docker,
psql и файлам, без ручного копипаста команд.

## Как запустить

```bash
# 1. Подключись к VPS
ssh root@189.74.120.232

# 2. Перейди в репозиторий и обнови его
cd /opt/jtd
git fetch origin && git checkout claude/modest-hawking-sfszra && git pull

# 3. Запусти Claude Code
claude

# 4. Вставь промпт ниже
```

Если `claude` не установлен:
```bash
curl -fsSL https://raw.githubusercontent.com/AV-jtd/jtd/claude/modest-hawking-sfszra/self-hosting/migration-stream/scripts/bootstrap-vps.sh | bash
```

---

## Промпт (копировать целиком)

```
Ты работаешь НА VPS (189.74.120.232) с приложением JTD (task-менеджер
React + Supabase), уже переехавшим с Lovable Cloud на self-hosted
Supabase на этом сервере. Переезд ПОЛНОСТЬЮ завершён (go-live
2026-07-06) — это не миграция, а обычная поддержка и доработки. У тебя
прямой доступ к docker, psql и файловой системе — используй его, не
проси пользователя копипастить команды.

Прочитай в этом порядке и скажи в двух строках где мы и какой следующий шаг:
1. /opt/jtd/self-hosting/migration-stream/PLAN.md   ← бэклог, что открыто/закрыто
2. /opt/jtd/self-hosting/migration-stream/PROGRESS.md ← подробный журнал по датам

Ключевые факты о текущем состоянии (2026-07-15):
- Стек: 11 контейнеров self-hosted Supabase (auth/rest/realtime/storage/
  edge-runtime/kong/db) + nginx, все Up, схема и данные полные (59 юзеров,
  все таблицы, FK-целостность OK)
- Прод: https://justtodoit.ru — DNS, SSL, фронтенд, RLS, realtime — всё
  рабочее. www.justtodoit.ru отдельно ещё не переключён (см. бэклог #10)
- CI/CD: GitHub Actions `deploy-vps.yml` — push в main → SSH на VPS →
  self-hosting/deploy.sh (build + миграции + nginx). Чинили 2026-07-15
  (секрет VPS_SSH_KEY указывал не на тот ключ) — сейчас проходит.
- Ветка разработки: claude/modest-hawking-sfszra (обгоняет origin/main
  на инфра-коммиты; deploy.sh мёржит main в неё при каждом деплое)
- Регистрация новых пользователей — через Telegram-бота (@Scope_todo_bot,
  /register), НЕ через сайт: SMTP всё ещё не настроен (бэклог #5)

Внутренние пароли PostgreSQL и ключи — в /opt/jtd/self-hosting/.env.supabase
(POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY). Читай оттуда, не спрашивай.

Открытый бэклог (см. PLAN.md за подробностями) — по приоритету:
1. SMTP (noreply@justtodoit.ru, smtp.yandex.ru) — без него нет
   самообслуживания сброса пароля
2. email_queue_dispatch() шлёт на чужой облачный Lovable URL — либо
   переписать на локальный edge-function, либо отключить cron
3. www.justtodoit.ru DNS (canChange:false, нужна заявка в SpaceWeb)
4. Косметика: самохостинг шрифтов, FCM push смоук-тест
Плюс: реагировать на баг-репорты пользователей по мере поступления
(так была найдена и закрыта серия багов STM Mission Control 2026-07-15).

Правила:
- Действуй сам через shell, показывай вывод и интерпретируй
- Необратимые шаги (переключение DNS, push в main, DROP) — стоп и подтверждение
- Секреты НЕ коммить в git
- После каждого закрытого шага — обнови PROGRESS.md (и PLAN.md, если
  меняется статус бэклога), закоммить и запушь в claude/modest-hawking-sfszra

Начинай с чтения PLAN.md и PROGRESS.md.
```

---

## Как обновлять статус между сессиями

После завершения шага попроси:
```
Отметь в PROGRESS.md выполненные пункты, запиши в журнал сессий,
закоммить и запушь.
```

---

## Про Lovable

Lovable продолжает работать для UI-изменений. После переезда единственное
отличие: `VITE_SUPABASE_URL` указывает на VPS вместо облака. GitHub Actions
(deploy-vps.yml) автоматически собирает фронтенд и применяет миграции на VPS
при каждом пуше в main. Claude на VPS управляет инфраструктурой, Lovable —
фронтендом. Не конфликтуют.
