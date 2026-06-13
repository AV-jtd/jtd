# Фаза 3 — Проверка функциональности на staging

**Цель:** убедиться, что приложение полностью работает на VPS с перенесёнными
данными, ДО боевого переключения. Без простоя.

---

## 3.1 Сборка фронтенда для staging

```bash
# .env для staging-сборки
cat > .env.staging <<EOF
VITE_SUPABASE_URL=https://stage.justtodoit.ru
VITE_SUPABASE_PUBLISHABLE_KEY=<новый ANON_KEY>
VITE_SUPABASE_PROXY_URL=
EOF

bun install
bun run build --mode staging
# dist/ раздаётся nginx из стека
```

---

## 3.2 Cron-задания

```bash
# Подставить реальный ANON_KEY и URL в migrate-cron.sql
docker compose -f self-hosting/docker-compose.supabase.yml exec db \
  psql -U postgres postgres < self-hosting/migrate-cron.sql

# Проверить
docker compose ... exec db psql -U postgres -c "SELECT jobname, schedule FROM cron.job;"
```

---

## 3.3 Smoke-тесты (автоматические)

```bash
./scripts/smoke-test.sh https://stage.justtodoit.ru <ANON_KEY> <SERVICE_ROLE_KEY>
```

Проверяет end-to-end:
1. Auth: регистрация/логин тестового пользователя → JWT получен
2. REST: чтение `tasks` с валидным JWT (RLS работает)
3. REST: создание задачи → чтение → удаление
4. Storage: upload → download → delete файла
5. Edge Function: вызов простой функции (например `calendar-feed`)
6. Realtime: подписка на канал, INSERT, получение события

---

## 3.4 Ручные проверки (чек-лист)

- [ ] Логин реального пользователя (пароль из облака работает — JWT_SECRET общий? НЕТ)
  > ⚠️ Пароли хешируются и переносятся с `auth.users`. Они РАБОТАЮТ, т.к.
  > GoTrue использует bcrypt-хеши из таблицы, а не JWT_SECRET. Проверить!
- [ ] Открытие списка задач, фильтры, поиск
- [ ] Создание/редактирование задачи
- [ ] Чат (group_messages) — отправка и realtime-доставка во второй вкладке
- [ ] Загрузка вложения → отображается (S3-бэкенд)
- [ ] Dashboard с графиками рендерится
- [ ] PMO / CRM / NPD / Protocols модули открываются
- [ ] Telegram-уведомление приходит
- [ ] AI-ассистент отвечает (проверка AI Gateway из РФ)
- [ ] Push-уведомление (или фиксируем как известный риск)

---

## 3.5 Критическая проверка: пароли пользователей

> Это самый частый сюрприз при миграции Supabase.

Пароли в `auth.users.encrypted_password` — это bcrypt-хеши, **не зависящие
от JWT_SECRET**. Они переносятся с дампом и продолжают работать.

НО: токены текущих сессий (refresh tokens) подписаны старым JWT_SECRET и
станут невалидны → **все пользователи будут разлогинены** после cutover.
Это ожидаемо и приемлемо. Предупредить пользователей: "потребуется повторный вход".

```bash
# Проверка: взять реального пользователя и залогиниться его паролем на staging
./scripts/test-real-login.sh stage.justtodoit.ru <email> <password>
```

---

## Проверка фазы 3

- [ ] smoke-test.sh = OK (все 6 пунктов)
- [ ] Реальный пользователь логинится на staging
- [ ] Весь ручной чек-лист пройден

---

## Откат фазы 3

Нечего откатывать — staging изолирован. При провале возвращаемся к фазам 1–2,
чиним, повторяем. Прод не затронут.
