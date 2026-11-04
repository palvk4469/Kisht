"use client";

import { isContactAllowed, nextAllowedAt } from "@kisht/domain";
import { useEffect, useState } from "react";

const TICK_MS = 15_000;

/**
 * Follows the 8 am–7 pm window by the server's clock, using the offset measured
 * when the list last arrived. It keeps working with no signal, changes at 7 pm
 * without a refresh, and a wrong phone clock can't fool it.
 */
export function useContactWindow(clockOffsetMs: number | undefined) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = new Date(Date.now() + (clockOffsetMs ?? 0));
  return { now, allowed: isContactAllowed(now), nextAllowedAt: nextAllowedAt(now) };
}
