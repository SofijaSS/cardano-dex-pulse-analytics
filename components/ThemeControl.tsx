"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { createBrowserPreferenceStore } from "@/lib/browser-preference";

export type ThemePreference = "light" | "dark" | "auto";

function applyTheme(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  const isDark =
    preference === "dark" ||
    (preference === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

const themeStore = createBrowserPreferenceStore<ThemePreference>({
  key: "cardano-dex-pulse:theme",
  defaultValue: "auto",
  values: ["light", "dark", "auto"],
  onValue: applyTheme,
});

const themeOptions = [
  { value: "light" as const, label: "Light", Icon: Sun },
  { value: "dark" as const, label: "Dark", Icon: Moon },
  { value: "auto" as const, label: "Auto", Icon: Laptop },
];

export function ThemeControl() {
  const preference = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemTheme = () => applyTheme(themeStore.getSnapshot());
    handleSystemTheme();
    if (typeof systemTheme.addEventListener === "function") {
      systemTheme.addEventListener("change", handleSystemTheme);
      return () => systemTheme.removeEventListener("change", handleSystemTheme);
    }

    // Safari before 14 exposes the legacy MediaQueryList listener API.
    systemTheme.addListener(handleSystemTheme);
    return () => systemTheme.removeListener(handleSystemTheme);
  }, [preference]);

  return (
    <div className="theme-control" role="group" aria-label="Color theme">
      {themeOptions.map(({ value, label, Icon }) => (
        <button
          type="button"
          key={value}
          className={preference === value ? "is-active" : ""}
          onClick={() => themeStore.set(value)}
          aria-pressed={preference === value}
          title={`${label} theme`}
        >
          <Icon size={13} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
