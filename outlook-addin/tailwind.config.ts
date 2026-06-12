import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#e0e9ff",
          500: "#4f63d2",
          600: "#3d4fc0",
          700: "#2e3da8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
