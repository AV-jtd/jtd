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
Ты работаешь НА VPS (189.74.120.232) в рамках переезда приложения JTD
(task-менеджер React + Supabase) с облачного Lovable Supabase на этот
сервер. У тебя прямой доступ к docker, psql и файловой системе — используй
его, не проси пользователя копипастить команды.

Прочитай в этом порядке и скажи в двух строках где мы и какой следующий шаг:
1. /opt/jtd/self-hosting/migration-stream/PLAN.md   ← единый актуальный план
2. /opt/jtd/self-hosting/migration-stream/PROGRESS.md ← статус и реквизиты

Ключевые факты о ситуации:
- VPS иностранный, IP 189.74.120.232, доступ из РФ без VPN уже проверен (Kong отвечает)
- Supabase self-hosted стек работает (11 контейнеров, db healthy)
- Схема БД применена (60 таблиц), 31 таблица данных импортирована из CSV
- Бэкап от Lovable: /tmp/supabase-backup/ (schema.sql + csv/ + manifest.csv)
  — если /tmp очистился после перезагрузки, скачай заново:
    aws s3 cp s3://jtd-backups/supabase-backup.zip /tmp/supabasebackup.zip \
      --endpoint-url https://s3.regru.cloud && cd /tmp && unzip -o supabasebackup.zip
- auth.users НЕ переносятся (нет доступа к паролям облака) → после переезда
  делаем МАССОВЫЙ СБРОС ПАРОЛЕЙ для 56 пользователей. Данные привязаны к UUID,
  не к паролю, поэтому задачи/проекты/чаты не теряются.

Внутренние пароли PostgreSQL и ключи — в /opt/jtd/self-hosting/.env.supabase
(POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY). Читай оттуда, не спрашивай.

Следующий крупный шаг по PLAN.md — Шаг 2: создать пользователей в VPS Supabase
с теми же UUID из profiles.csv (через GoTrue Admin API или прямой INSERT в
auth.users с случайным паролем), затем отключить FK-проверку и залить CSV
задач/проектов/комментариев, затем включить FK и проверить целостность.

Правила:
- Действуй сам через shell, показывай вывод и интерпретируй
- Необратимые шаги (переключение DNS, DROP) — стоп и подтверждение
- Секреты НЕ коммить в git
- После каждого закрытого шага — обнови PROGRESS.md, закоммить и запушь

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
