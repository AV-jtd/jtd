# Фаза 4 — Боевое переключение (cutover)

**Цель:** перевести боевой трафик `justtodoit.ru` на VPS.
**Простой:** ~15–40 минут. Окно: ночь ВС→ПН по МСК.

> Выполнять ТОЛЬКО после успешного прохождения фаз 1–3.
> Держать под рукой [PHASE-5-aftercare.md](PHASE-5-aftercare.md) — план отката.

---

## Предусловия (за 24ч)

- [ ] TTL боевого домена снижен до 60с (фаза 0.5)
- [ ] Staging полностью зелёный (фаза 3)
- [ ] Пользователи предупреждены об окне обслуживания и повторном входе
- [ ] Боевой SSL-сертификат для `justtodoit.ru` готов выпуститься

---

## Runbook cutover (по шагам)

### Шаг 1 — Включить режим обслуживания (T+0)
```bash
# Опционально: на старом фронтенде показать баннер "идёт обслуживание"
# Минимально: предупреждение в Telegram-канале
```

### Шаг 2 — Заморозить запись в облаке (T+2мин)
```bash
# Перевести облачную БД в read-only, чтобы не было новых изменений
# Supabase Dashboard или:
psql "$CLOUD_DB" -c "ALTER DATABASE postgres SET default_transaction_read_only = on;"
```

### Шаг 3 — Снять финальный дамп дельты (T+3мин)
```bash
# Полный свежий дамп (данные могли измениться с фазы 2)
pg_dump "$CLOUD_DB" --no-owner --no-privileges -Fc \
  -f /mnt/backup-disk/jtd/cutover_final.dump

./scripts/snapshot-counts.sh "$CLOUD_DB" > /mnt/backup-disk/jtd/cutover_counts.txt
```

### Шаг 4 — Залить на VPS и сверить (T+5мин)
```bash
# Пересоздать чистую БД и залить финальный дамп
./scripts/restore-cloud-dump.sh /mnt/backup-disk/jtd/cutover_final.dump
./scripts/verify-migration.sh "$CLOUD_DB" self-hosting-db-1
# ОБЯЗАТЕЛЬНО: STATUS должен быть OK. Если ПРОВАЛ → СТОП, откат (фаза 5).
```

### Шаг 5 — Боевой SSL и конфиг (T+12мин)
```bash
# В .env.supabase: SITE_URL и API_EXTERNAL_URL → https://justtodoit.ru
# Выпустить боевой сертификат (DNS ещё на старом IP — используем DNS-01 или
# временно переключаем, см. ниже)
certbot certonly --standalone -d justtodoit.ru

# Пересобрать фронтенд с боевым URL
bun run build  # .env: VITE_SUPABASE_URL=https://justtodoit.ru
docker compose ... restart nginx storage rest auth realtime
```

### Шаг 6 — Пересоздать cron на боевые URL (T+15мин)
```bash
docker compose ... exec db psql -U postgres postgres < self-hosting/migrate-cron.sql
```

### Шаг 7 — Переключить DNS (T+17мин)
```
justtodoit.ru   A   <НОВЫЙ IP VPS>   TTL=60
```

### Шаг 8 — Smoke-тест на бою (T+20мин)
```bash
./scripts/smoke-test.sh https://justtodoit.ru <ANON_KEY> <SERVICE_ROLE_KEY>
./scripts/test-real-login.sh justtodoit.ru <email> <password>
```

### Шаг 9 — Снять режим обслуживания (T+25мин)
Объявить в Telegram: переезд завершён, нужен повторный вход.

---

## Точка невозврата

Точкой невозврата считается **Шаг 7 (переключение DNS)**. До него откат
мгновенный (ничего не трогали на проде). После — откат через возврат DNS
(см. фаза 5), данные за время работы на VPS придётся переносить обратно.

**Решение идти дальше Шага 7 принимать ТОЛЬКО если Шаг 4 (verify) = OK.**

---

## Чек-лист завершения cutover

- [ ] verify-migration.sh = OK на финальном дампе
- [ ] smoke-test.sh = OK на `justtodoit.ru`
- [ ] Реальный логин работает
- [ ] Realtime в двух вкладках работает
- [ ] Cron-задания активны
- [ ] Бэкап на VPS отработал (п.1)
- [ ] Облачный Supabase оставлен в read-only как standby (НЕ удалять 7 дней)
