#!/usr/bin/env bash
# Проверка доступности синхронизации времени. Ничего не устанавливает и
# ничего не меняет — только читает.
#
# Зачем: 11 сентября системные часы отстали на 4 часа 39 минут, pg_cron
# запускал пятничные рассылки по отставшим часам, и они ушли не вовремя.
# Часы поправили через hwclock --hctosys (аппаратные оказались точными),
# но systemd-timesyncd по-прежнему не может достучаться ни до одного
# ntp.ubuntu.com: все запросы по UDP/123 уходят в таймаут. Скрипт отвечает
# на вопрос, какой путь синхронизации вообще доступен с этой машины.
#
# Запуск: bash self-hosting/check-ntp.sh
#
# Что делать по результату:
#   отвечает хотя бы один NTP  → прописать его в systemd-timesyncd
#   все молчат, HTTPS работает → поставить htpdate
#   не работает ничего         → systemd-таймер с hwclock --hctosys раз в час

set -u

TIMEOUT=5

NTP_SERVERS=(
  ntp.ubuntu.com
  pool.ntp.org
  time.google.com
  time.cloudflare.com
  time.windows.com
  time.apple.com
  ru.pool.ntp.org
)

HTTPS_HOSTS=(
  https://www.google.com
  https://cloudflare.com
  https://ya.ru
)

ok_ntp=""
ok_https=""

echo "=== Текущее состояние часов ==="
date
echo "системные : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "аппаратные: $(hwclock -u -r 2>/dev/null || echo 'недоступны')"
echo "источник  : $(cat /sys/devices/system/clocksource/clocksource0/current_clocksource 2>/dev/null || echo '?')"
timedatectl show -p NTP -p NTPSynchronized 2>/dev/null
echo

echo "=== NTP, UDP/123 (${#NTP_SERVERS[@]} серверов, таймаут ${TIMEOUT}с) ==="
for srv in "${NTP_SERVERS[@]}"; do
  # SNTP-запрос на чистом python3: пакет из 48 байт, первый — LI=0, VN=3,
  # Mode=3 (client). В ответе байты 40..43 — время передачи, секунды от
  # 1900 года; 2208988800 — сдвиг до эпохи Unix.
  res=$(python3 - "$srv" "$TIMEOUT" <<'PY' 2>&1
import socket, struct, sys, time
host, timeout = sys.argv[1], float(sys.argv[2])
try:
    addr = socket.getaddrinfo(host, 123, type=socket.SOCK_DGRAM)[0]
except Exception as e:
    print("DNS-ОШИБКА %s" % e); sys.exit(1)
s = socket.socket(addr[0], socket.SOCK_DGRAM)
s.settimeout(timeout)
try:
    t0 = time.time()
    s.sendto(b'\x1b' + 47 * b'\0', addr[4])
    data, _ = s.recvfrom(48)
    rtt = (time.time() - t0) * 1000
    secs = struct.unpack('!12I', data)[10] - 2208988800
    print("OK offset=%+.3fс rtt=%.0fмс ip=%s" % (secs - time.time(), rtt, addr[4][0]))
except socket.timeout:
    print("ТАЙМАУТ ip=%s" % addr[4][0]); sys.exit(1)
except Exception as e:
    print("ОШИБКА %s" % e); sys.exit(1)
finally:
    s.close()
PY
)
  if [ $? -eq 0 ]; then ok_ntp="${ok_ntp}${srv} "; fi
  printf '  %-22s %s\n' "$srv" "$res"
done
echo

echo "=== Запасной путь: время из заголовка Date по HTTPS ==="
for url in "${HTTPS_HOSTS[@]}"; do
  hdr=$(curl -sS -m "$TIMEOUT" -I "$url" 2>&1 | grep -i '^date:' | tr -d '\r')
  if [ -n "$hdr" ]; then
    ok_https="${ok_https}${url} "
    printf '  %-22s OK %s\n' "${url#https://}" "${hdr#[Dd]ate: }"
  else
    printf '  %-22s НЕДОСТУПЕН\n' "${url#https://}"
  fi
done
echo

echo "=== Итог ==="
if [ -n "$ok_ntp" ]; then
  echo "NTP доступен: $ok_ntp"
  echo "→ прописать эти серверы в systemd-timesyncd и включить синхронизацию"
elif [ -n "$ok_https" ]; then
  echo "UDP/123 молчит везде, HTTPS работает: $ok_https"
  echo "→ ставить htpdate (синхронизация по заголовку Date)"
else
  echo "Не работает ни NTP, ни HTTPS."
  echo "→ systemd-таймер с hwclock --hctosys раз в час"
fi
