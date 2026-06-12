// Simple script to generate placeholder PNG icons
// Run: node scripts/generate-icons.js
// For production, replace with proper icons

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dir, "../public");
mkdirSync(publicDir, { recursive: true });

// 1x1 blue pixel PNG (base64)
const BLUE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

for (const size of [16, 32, 64, 80]) {
  const buf = Buffer.from(BLUE_PNG_BASE64, "base64");
  writeFileSync(join(publicDir, `icon-${size}.png`), buf);
  console.log(`Created icon-${size}.png`);
}
