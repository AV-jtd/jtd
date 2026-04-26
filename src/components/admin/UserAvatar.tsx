import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-amber-500",
  "bg-emerald-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-rose-500", "bg-teal-500",
];

function hashIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function UserAvatar({ name, email, id, size = 36 }: { name?: string | null; email?: string | null; id: string; size?: number }) {
  const initial = (name?.trim()?.[0] || email?.[0] || "?").toUpperCase();
  const color = PALETTE[hashIndex(id, PALETTE.length)];
  return (
    <div
      className={cn("rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none", color)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}
