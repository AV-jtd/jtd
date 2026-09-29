#!/usr/bin/env bash
# Зашифрованная копия ключей сервера: .env.supabase, kong.yml, secrets/.
#
# Зачем. Эти файлы не в git (в них ключи) и до 28.09.2026 существовали только на
# самом сервере. Без .env.supabase копия базы на новом сервере бесполезна: там
# JWT_SECRET и ключи подписи, от которых зависят все ключи сайта и сессии.
#
# Шифруется ОТКРЫТЫМ ключом владельца (age). Закрытого ключа на сервере нет —
# расшифровать может только владелец. Поэтому копию можно класть рядом с
# дампами и в тот же S3: утечка бакета или сервера ключи из неё не раскроет.
#
# Открытые ключи получателей — secrets-recipients.txt рядом (по одному в
# строке, можно несколько: копию расшифрует любой из них). Файл в git: открытый
# ключ не секрет.
#
# Расшифровка (на машине владельца):
#   age -d -i ключ.txt secrets_ДАТА.tar.gz.age | tar -xz
#
# Вызывается из run-daily-s3-backup.sh. Параметры — как у backup.sh:
#   BACKUP_DIR, BACKUP_KEEP_DAYS, S3_BUCKET, S3_ENDPOINT; --s3 — выгрузить.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOSTING_DIR="$(dirname "$SCRIPT_DIR")"
RECIPIENTS="${RECIPIENTS:-$SCRIPT_DIR/secrets-recipients.txt}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DO_S3=false
[ "${1:-}" = "--s3" ] && DO_S3=true

if ! grep -qE '^age1[0-9a-z]+$' "$RECIPIENTS" 2>/dev/null; then
  echo "[secrets] нет открытого ключа получателя в $RECIPIENTS — копия ключей НЕ снята"
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/daily/secrets_${TS}.tar.gz.age"
mkdir -p "$BACKUP_DIR/daily"
umask 077

# Только то, чего нет в git. Отсутствующий файл — ошибка: копия без него
# молча оказалась бы неполной.
tar -C "$HOSTING_DIR" -czf - .env.supabase kong.yml secrets \
  | age -R <(grep -E '^age1[0-9a-z]+$' "$RECIPIENTS") -o "$OUT"

# Проверка: файл — зашифрованный age, не пустой. Расшифровать здесь нечем.
head -c 21 "$OUT" | grep -q '^age-encryption.org/v1' || { echo "[secrets] ОШИБКА: $OUT не похож на age"; exit 1; }
echo "[secrets] OK: $OUT ($(du -h "$OUT" | cut -f1), получателей: $(grep -cE '^age1' "$RECIPIENTS"))"

find "$BACKUP_DIR/daily" -name "secrets_*.tar.gz.age" -mtime "+${BACKUP_KEEP_DAYS}" -delete

if $DO_S3; then
  aws s3 cp "$OUT" "s3://${S3_BUCKET}/backups/$(hostname)/secrets_${TS}.tar.gz.age" \
    ${S3_ENDPOINT:+--endpoint-url "${S3_ENDPOINT}"} >/dev/null
  echo "[secrets] OK: s3://${S3_BUCKET}/backups/$(hostname)/secrets_${TS}.tar.gz.age"
fi
