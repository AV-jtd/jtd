---
name: SSL на self-hosted VPS
description: Выпуск Let's Encrypt сертификата для justtodoit.ru на VPS 77.222.53.183 через certbot+nginx
type: reference
---
# SSL на VPS justtodoit.ru

**Инфраструктура:** домен `justtodoit.ru` (A-record → `77.222.53.183`) хостится на собственном VPS (не на Lovable). Решение принято: остаёмся на self-hosted, сертификат выпускается через Let's Encrypt + certbot.

**Симптом проблемы:** браузер показывал `NET::ERR_CERT_COMMON_NAME_INVALID`, потому что nginx отдавал дефолтный сертификат провайдера `77-222-53-183.swtest.ru` вместо сертификата для домена.

## Процедура выпуска (на сервере)
```bash
ssh root@77.222.53.183
apt update && apt install -y certbot python3-certbot-nginx
# проверить, что nginx слушает домен на :80
curl -I http://justtodoit.ru/
# выпустить и автоматически прописать в nginx
certbot --nginx -d justtodoit.ru -d www.justtodoit.ru \
  --agree-tos -m admin@justtodoit.ru --redirect --non-interactive
nginx -t && nginx -s reload
```

Если nginx-конфиг отдаёт `server_name _;` — заменить на `server_name justtodoit.ru www.justtodoit.ru;` перед запуском certbot.

## Проверка
```bash
echo | openssl s_client -servername justtodoit.ru -connect justtodoit.ru:443 2>/dev/null \
  | openssl x509 -noout -subject -dates
```
Должно вернуть `subject=CN=justtodoit.ru` и валидные даты.

## Автопродление
Certbot ставит systemd-timer `certbot.timer` — продление автоматическое каждые ~60 дней. Проверить: `systemctl list-timers | grep certbot`.

**Связано:** mem://tech/russia-access-proxy (Cloudflare Worker для Supabase), mem://tech/self-host-migration-plan.