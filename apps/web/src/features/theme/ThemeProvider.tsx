"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { applyTheme, readPreference, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

type Ctx = { isDark: boolean; toggle: () => void };

const ThemeContext = createContext<Ctx | null>(null);

const DARK_DEVICE = "(prefers-color-scheme: dark)";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [deviceDark, setDeviceDark] = useState(false);

  useEffect(() => {
    setPreference(readPreference());
    setDeviceDark(window.matchMedia(DARK_DEVICE).matches);
  }, []);

  // Follow the device until the first explicit choice.
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const media = window.matchMedia(DARK_DEVICE);
    const onChange = () => {
      setDeviceDark(media.matches);
      applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const isDark = preference === "dark" || (preference === "system" && deviceDark);

  const toggle = useCallback(() => {
    const next = isDark ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    setPreference(next);
  }, [isDark]);

  const value = useMemo(() => ({ isDark, toggle }), [isDark, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
