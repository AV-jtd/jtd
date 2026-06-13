#!/bin/sh
# Entrypoint для pg-backup контейнера.
# Запускает pg_dump по расписанию через crond (Alpine).

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
BACKUP_KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-4}"
BACKUP_KEEP_MONTHS="${BACKUP_KEEP_MONTHS:-6}"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly" "${BACKUP_DIR}/logs"

# Записываем скрипт бэкапа
cat > /usr/local/bin/do-backup.sh << 'BACKUP_SCRIPT'
#!/bin/sh
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DOW=$(date +%u)
DOM=$(date +%d)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOG="${BACKUP_DIR}/logs/backup_${TIMESTAMP}.log"

{
  echo "=== Backup started at $(date) ==="

  DUMP_FILE="${BACKUP_DIR}/daily/db_${TIMESTAMP}.dump"

  pg_dump -h db -U postgres -Fc --no-acl postgres > "${DUMP_FILE}"
  echo "Dump OK: ${DUMP_FILE} ($(du -sh "${DUMP_FILE}" | cut -f1))"

  # Еженедельный (воскресенье)
  if [ "$DOW" = "7" ]; then
    cp "${DUMP_FILE}" "${BACKUP_DIR}/weekly/db_week$(date +%V_%Y).dump"
    echo "Weekly copy created"
  fi

  # Ежемесячный (1-е число)
  if [ "$DOM" = "01" ]; then
    cp "${DUMP_FILE}" "${BACKUP_DIR}/monthly/db_$(date +%Y%m).dump"
    echo "Monthly copy created"
  fi

  # Ротация
  find "${BACKUP_DIR}/daily" -name "*.dump" -mtime "+${BACKUP_KEEP_DAYS}" -delete
  find "${BACKUP_DIR}/weekly" -name "*.dump" -mtime "+$((BACKUP_KEEP_WEEKS * 7))" -delete
  find "${BACKUP_DIR}/monthly" -name "*.dump" -mtime "+$((BACKUP_KEEP_MONTHS * 30))" -delete

  echo "${TIMESTAMP}" > "${BACKUP_DIR}/last_backup_timestamp"
  echo "${DUMP_FILE}" > "${BACKUP_DIR}/last_backup_file"

  echo "=== Backup finished at $(date) ==="
} >> "${LOG}" 2>&1
BACKUP_SCRIPT

chmod +x /usr/local/bin/do-backup.sh

# Регистрируем крон: каждый день в 02:00
echo "0 2 * * * /usr/local/bin/do-backup.sh" > /etc/crontabs/root

echo "[pg-backup] Контейнер запущен. Бэкапы каждый день в 02:00."
echo "[pg-backup] Хранение: ${BACKUP_KEEP_DAYS}д daily, ${BACKUP_KEEP_WEEKS}н weekly, ${BACKUP_KEEP_MONTHS}м monthly"
echo "[pg-backup] Каталог: ${BACKUP_DIR}"

# Запускаем первый бэкап немедленно при старте контейнера
echo "[pg-backup] Запуск первоначального бэкапа..."
/usr/local/bin/do-backup.sh

# Запускаем crond в foreground
exec crond -f -l 6
