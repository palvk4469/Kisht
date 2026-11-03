// Light, dark, or follow the device. Stored per device; applied before first
// paint by THEME_SCRIPT so the page never flashes the wrong theme.

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "kisht.theme";

/** Runs inline in <head>, before React: no dependencies, no flash. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((p===null||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function readPreference(): ThemePreference {
  try {
    const p = window.localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference): void {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
