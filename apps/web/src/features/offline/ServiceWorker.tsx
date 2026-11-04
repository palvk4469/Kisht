"use client";

import { useEffect } from "react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** Production only: a caching service worker makes development confusing. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register(`/sw.js?v=${BUILD_ID}`).catch(() => {
      // Not fatal: the app still works online.
    });
  }, []);
  return null;
}
