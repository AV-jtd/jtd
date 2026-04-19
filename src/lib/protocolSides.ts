/**
 * Парсинг названия протокола вида:
 *   "Лента x Дороничи"
 *   "Лента × Дороничи"
 *   "Лента — Дороничи"
 *   "Лента – Дороничи"
 *   "Лента vs Дороничи"
 *   "Лента / Дороничи"
 *
 * Договорённость: ВТОРАЯ часть = наша сторона, ПЕРВАЯ = партнёр.
 * Возвращает { partner, ours } или null, если разделитель не найден.
 */

const SEPARATOR_RE = /\s+(?:x|×|vs\.?|—|–|\/|\u00d7)\s+/i;

export interface ProtocolSides {
  partner: string;
  ours: string;
}

export function parseProtocolSides(title: string | null | undefined): ProtocolSides | null {
  if (!title) return null;
  const t = title.trim();
  if (!t) return null;
  const parts = t.split(SEPARATOR_RE).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Берём первые две значимые части (если разделителей было больше — игнорируем хвост)
  const [partner, ours] = parts;
  return { partner, ours };
}

export function namesEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
