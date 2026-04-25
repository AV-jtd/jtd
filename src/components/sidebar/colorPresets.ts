/**
 * Shared HSL hue presets used for project group color and folder color
 * pickers. Centralised so both pickers stay visually consistent.
 */
export const COLOR_PRESETS = [
  { hue: 220, label: "Синий" },
  { hue: 160, label: "Зелёный" },
  { hue: 40, label: "Жёлтый" },
  { hue: 270, label: "Фиолет" },
  { hue: 0, label: "Красный" },
  { hue: 330, label: "Розовый" },
  { hue: 190, label: "Голубой" },
  { hue: 90, label: "Лайм" },
  { hue: 25, label: "Оранж" },
] as const;

/** CSS hsl() string for a preset hue. */
export function presetColor(hue: number): string {
  return `hsl(${hue}, 70%, 50%)`;
}