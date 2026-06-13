# Фаза 0 — Подготовка инфраструктуры

**Цель:** подготовить российский VPS, S3-хранилище, домен и SSL. Без простоя —
прод продолжает работать на облаке.

---

## 0.1 Выбор и заказ VPS

**Рекомендация:** Selectel или Timeweb Cloud (оба — РФ, ФЗ-152 совместимы).

| Параметр | Минимум | Рекомендуется |
|---|---|---|
| vCPU | 4 | 6 |
| RAM | 8 GB | 16 GB |
| Диск | 80 GB SSD | 160 GB NVMe |
| ОС | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Регион | Москва / СПб | Москва |

**Отдельный диск для данных** (best practice из анализа архитектуры):
- Системный раздел: 40 GB
- `/data/postgres`: отдельный том для БД
- `/mnt/backup-disk`: отдельный том/диск для бэкапов (п.1)

---

## 0.2 Заказ S3-хранилища (для п.2)

Создать бакет в том же провайдере:
- Timeweb: S3 Object Storage → бакет `jtd-storage` + `jtd-backups`
- Получить Access Key / Secret Key
- Регион: ru-1

---

## 0.3 Базовая настройка сервера

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 certbot git ufw awscli postgresql-client

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Отдельные тома под данные
mkdir -p /data/postgres /data/storage /mnt/backup-disk/jtd

git clone https://github.com/AV-jtd/jtd.git /opt/jtd
cd /opt/jtd
```

---

## 0.4 Домен и SSL

Для staging используем поддомен, чтобы не трогать боевой `justtodoit.ru`:

```bash
# DNS: создать A-запись stage.justtodoit.ru → IP нового VPS
certbot certonly --standalone -d stage.justtodoit.ru

# Боевой сертификат выпустим в фазе 4 (cutover):
# certbot certonly --standalone -d justtodoit.ru
```

---

## 0.5 Снизить TTL боевого домена ЗАРАНЕЕ

> Критично для быстрого отката. Сделать минимум за 24ч до фазы 4.

```
justtodoit.ru   A   <старый IP>   TTL=60
```

Это позволит при cutover (и при откате) переключать DNS за ~1 минуту.

---

## Проверка фазы 0

```bash
./scripts/preflight-check.sh
```

Скрипт проверяет: Docker, свободное место, доступ к S3, открытые порты,
наличие SSL-сертификата, версии расширений PostgreSQL в образе.

---

## Откат фазы 0

Откатывать нечего — прод не затронут. Просто удалить VPS, если передумали.
