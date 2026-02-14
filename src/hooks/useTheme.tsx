import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  accentColor: string; // HSL hue value as string e.g. "217"
  setAccentColor: (hue: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ACCENT_PRESETS = [
  { name: "Синий", hue: "217" },
  { name: "Зелёный", hue: "142" },
  { name: "Фиолетовый", hue: "262" },
  { name: "Красный", hue: "0" },
  { name: "Оранжевый", hue: "25" },
  { name: "Розовый", hue: "330" },
  { name: "Бирюзовый", hue: "174" },
];

export { ACCENT_PRESETS };

function applyAccentHue(hue: string) {
  const root = document.documentElement;
  const h = parseInt(hue);
  // Primary colors
  root.style.setProperty("--primary", `${h} 91% 60%`);
  root.style.setProperty("--ring", `${h} 91% 60%`);
  // Accent
  root.style.setProperty("--accent", `${h} 91% 95%`);
  root.style.setProperty("--accent-foreground", `${h} 91% 40%`);
  // Sidebar
  root.style.setProperty("--sidebar-bg", `${h} 91% 60%`);
  root.style.setProperty("--sidebar-hover", `${h} 91% 55%`);
  root.style.setProperty("--sidebar-active", `${h} 91% 50%`);
  root.style.setProperty("--sidebar-muted", `${h} 91% 70%`);
  root.style.setProperty("--sidebar-background", `${h} 91% 60%`);
  root.style.setProperty("--sidebar-primary-foreground", `${h} 91% 60%`);
  root.style.setProperty("--sidebar-accent", `${h} 91% 55%`);
  root.style.setProperty("--sidebar-border", `${h} 91% 55%`);
  root.style.setProperty("--tag-blue", `${h} 91% 60%`);

  // Dark mode overrides
  const isDark = root.classList.contains("dark");
  if (isDark) {
    root.style.setProperty("--sidebar-bg", `222 47% 8%`);
    root.style.setProperty("--sidebar-hover", `222 47% 12%`);
    root.style.setProperty("--sidebar-active", `${h} 91% 60%`);
    root.style.setProperty("--sidebar-background", `222 47% 8%`);
    root.style.setProperty("--sidebar-accent", `${h} 91% 55%`);
    root.style.setProperty("--sidebar-border", `${h} 91% 55%`);
    root.style.setProperty("--accent", `${h} 32% 17%`);
    root.style.setProperty("--accent-foreground", `210 40% 98%`);
  }
}

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    (localStorage.getItem("theme-mode") as ThemeMode) || "system"
  );
  const [accentColor, setAccentState] = useState<string>(() =>
    localStorage.getItem("theme-accent") || "217"
  );

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("theme-mode", m);
  };

  const setAccentColor = (hue: string) => {
    setAccentState(hue);
    localStorage.setItem("theme-accent", hue);
  };

  // Apply dark/light class
  useEffect(() => {
    const resolved = mode === "system" ? getSystemTheme() : mode;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    // Re-apply accent after mode change
    applyAccentHue(accentColor);

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const r = mq.matches ? "dark" : "light";
        document.documentElement.classList.toggle("dark", r === "dark");
        applyAccentHue(accentColor);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode, accentColor]);

  // Apply accent
  useEffect(() => {
    applyAccentHue(accentColor);
  }, [accentColor]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
