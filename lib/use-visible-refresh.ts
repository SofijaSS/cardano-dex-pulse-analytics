"use client";

import { useEffect, useEffectEvent } from "react";

export function useVisibleRefresh(callback: () => void, intervalMs: number) {
  const refresh = useEffectEvent(callback);

  useEffect(() => {
    let lastRun = Date.now();

    const runIfDue = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun < intervalMs) return;
      lastRun = now;
      refresh();
    };

    const timer = window.setInterval(runIfDue, Math.min(intervalMs, 60_000));
    document.addEventListener("visibilitychange", runIfDue);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", runIfDue);
    };
  }, [intervalMs]);
}
