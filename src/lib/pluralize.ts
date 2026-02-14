export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${many}`;
  if (lastDigit > 1 && lastDigit < 5) return `${n} ${few}`;
  if (lastDigit === 1) return `${n} ${one}`;
  return `${n} ${many}`;
}
