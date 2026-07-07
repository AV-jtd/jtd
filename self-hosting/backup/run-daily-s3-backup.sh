#!/usr/bin/env bash
# Обёртка для cron: берёт POSTGRES_PASSWORD из .env.supabase, запускает
# backup.sh с --verify --s3 (дамп идёт из pg-backup контейнера — см.
# комментарий в backup.sh про segfault pg_dump в самом db-контейнере).
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE="../.env.supabase"
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
export POSTGRES_PASSWORD
export BACKUP_DIR=/var/backups/jtd
export S3_BUCKET=jtd-backups
export S3_ENDPOINT=https://s3.regru.cloud

./backup.sh --verify --s3
