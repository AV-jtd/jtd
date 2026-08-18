-- Баг: у бакета protocol-logos не было SELECT-политики в storage.objects.
-- Загрузка логотипа через браузер (роль authenticated) всегда делает
-- INSERT ... RETURNING * — а без права на SELECT для только что вставленной
-- строки Postgres не может подтвердить её видимость и блокирует INSERT
-- целиком с "new row violates row-level security policy", хотя WITH CHECK
-- для самого INSERT формально проходит. Поймано на живой загрузке логотипа
-- клиента (2026-08-16), проверено прямым воспроизведением через psql:
-- тот же INSERT без RETURNING проходит, с RETURNING — падает.
--
-- Бакет и так публичный (buckets.public = true, Kong отдаёт объекты без
-- ключа) — открыть SELECT всем ничего не ослабляет.
CREATE POLICY "Public can view protocol logos"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'protocol-logos');
