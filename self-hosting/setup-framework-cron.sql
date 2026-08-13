-- Одноразовая настройка крона пятничной рассылки «Strategy deck».
--
-- ПОЧЕМУ НЕ В МИГРАЦИИ: команде нужен ANON_KEY конкретного окружения. Миграции
-- версионируются и общие для всех сред, зашивать в них значение окружения —
-- плохая практика. Поэтому крон ставится один раз вручную на VPS.
--
-- Запуск на VPS:
--   ANON=$(grep -E '^ANON_KEY=' /opt/jtd/self-hosting/.env.supabase | cut -d= -f2-)
--   docker exec -i self-hosting-db-1 psql -U postgres \
--     -v anon="$ANON" -f - < /opt/jtd/self-hosting/setup-framework-cron.sql
--
-- Время: пятница 12:00 UTC = 15:00 МСК. Намеренно отдельно от утренних отчётов
-- (08:08 МСК), чтобы знание не терялось в потоке цифр.
--
-- Сама функция дополнительно проверяет, что сегодня пятница по Москве, и что
-- на этой неделе рассылки ещё не было — так что повторный запуск безвреден.

-- Снимаем старую версию, если была (идемпотентность)
SELECT cron.unschedule('send-weekly-framework-friday')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-framework-friday');

SELECT cron.schedule(
  'send-weekly-framework-friday',
  '0 12 * * 5',
  format($job$
    SELECT net.http_post(
      url     := 'http://kong:8000/functions/v1/send-weekly-framework',
      headers := %L::jsonb,
      body    := '{}'::jsonb
    );
  $job$,
  json_build_object(
    'Content-Type', 'application/json',
    'apikey', :'anon',
    'Authorization', 'Bearer ' || :'anon'
  )::text)
);

-- Проверка
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'send-weekly-framework-friday';
