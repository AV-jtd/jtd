/**
 * Универсальный helper для аватаров-инициалов.
 * Правила:
 *  - Всегда первые 2 символа имени (в верхнем регистре).
 *  - Корректно обрабатывает пустые имена, лишние пробелы и одиночные эмодзи.
 *  - Цвет фона генерируется детерминированно из имени (HSL),
 *    поэтому одинаковые инициалы у разных людей визуально различаются.
 */

export function getInitials(name?: string | null): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "—";
  // Берём первые 2 «значимых» символа (буква/цифра/эмодзи), пропуская пробелы.
  const chars = Array.from(trimmed.replace(/\s+/g, ""));
  return chars.slice(0, 2).join("").toUpperCase();
}

/**
 * Стабильный hash строки (djb2). Возвращает unsigned 32-bit число.
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Возвращает inline-стиль для аватара: пастельный фон + контрастный текст.
 * Цвет детерминирован по имени — одинаковые имена всегда дают один цвет,
 * разные «АЛ» (Александр / Александра) визуально различимы.
 */
export function getAvatarColors(name?: string | null): { backgroundColor: string; color: string } {
  const key = (name || "").trim().toLowerCase() || "—";
  const hue = hashString(key) % 360;
  return {
    backgroundColor: `hsl(${hue}, 70%, 88%)`,
    color: `hsl(${hue}, 60%, 28%)`,
  };
}

/**
 * Удобный shortcut: возвращает и инициалы, и цвета одним вызовом.
 */
export function getAvatarProps(name?: string | null) {
  return {
    initials: getInitials(name),
    style: getAvatarColors(name),
  };
}
