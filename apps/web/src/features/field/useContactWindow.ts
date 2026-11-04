"use client";

import { isContactAllowed, nextAllowedAt } from "@kisht/domain";
import { useEffect, useState } from "react";

const TICK_MS = 15_000;

/**
 * Follows the 8 am–7 pm window by the server's clock, not the phone's, so the
 * screen changes at 7 pm without a refresh and a wrong phone clock can't fool it.
 */
export function useContactWindow(serverTime: string | undefined) {
  const [, tick] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (serverTime) setOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = new Date(Date.now() + offset);
  return { now, allowed: isContactAllowed(now), nextAllowedAt: nextAllowedAt(now) };
}
