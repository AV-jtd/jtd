#!/usr/bin/env bash
# Какие серверы времени доступны с этой машины.
#
# Запуск: bash /opt/jtd/self-hosting/check-ntp.sh
#
# Ничего не устанавливает и не меняет: шлёт NTP-пакеты напрямую на python3,
# который есть в системе. Нужно, чтобы понять, чем чинить синхронизацию —
# штатным NTP по UDP/123 или обходным путём поверх HTTPS.
#
# Контекст: systemd-timesyncd не смог достучаться ни до одного сервера
# ntp.ubuntu.com, при этом ufw исходящие разрешает. Похоже, UDP/123 режет
# провайдер. Проверяем, все ли серверы недоступны или только убунтовские.

set -uo pipefail

SERVERS=(
  time.google.com
  time.cloudflare.com
  ru.pool.ntp.org
  0.pool.ntp.org
  ntp1.vniiftri.ru
  ntp.msk-ix.ru
  ntp.ubuntu.com
)

echo "Часы системы сейчас: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo
echo "NTP (UDP порт 123) — расхождение с каждым сервером:"

for s in "${SERVERS[@]}"; do
  python3 - "$s" <<'PY'
import socket, struct, sys, time

server = sys.argv[1]
# NTP: секунды с 1900 года, обычная эпоха — с 1970-го.
NTP_EPOCH_DELTA = 2208988800

pkt = b'\x1b' + 47 * b'\0'   # LI=0, VN=3, Mode=3 (client)
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.settimeout(3)
try:
    t0 = time.time()
    s.sendto(pkt, (server, 123))
    data, _ = s.recvfrom(48)
    t1 = time.time()
    # Байты 40..48 — transmit timestamp ответа сервера.
    secs, frac = struct.unpack('!II', data[40:48])
    server_time = secs - NTP_EPOCH_DELTA + frac / 2**32
    # Грубая поправка на дорогу туда-обратно.
    offset = server_time - (t0 + t1) / 2
    знак = '+' if offset >= 0 else '-'
    print(f"  {server:22s} ОТВЕТИЛ   расхождение {знак}{abs(offset):.1f} с")
except socket.timeout:
    print(f"  {server:22s} нет ответа (таймаут 3 с)")
except Exception as e:
    print(f"  {server:22s} ошибка: {type(e).__name__}: {e}")
finally:
    s.close()
PY
done

echo
echo "Время по HTTPS (порт 443) — запасной путь, если UDP/123 закрыт:"
for host in https://www.google.com https://cloudflare.com; do
  d="$(curl -sSI --max-time 8 "$host" 2>/dev/null | grep -i '^date:' | head -1 | cut -d' ' -f2-)"
  if [ -n "$d" ]; then
    echo "  $host → $d"
  else
    echo "  $host → не ответил"
  fi
done

echo
echo "Аппаратные часы (их ставит гипервизор, у нас они оказались точными):"
hwclock --show 2>/dev/null || echo "  прочитать не удалось"
