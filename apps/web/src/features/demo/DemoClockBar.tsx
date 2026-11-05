"use client";

import { DemoClock } from "@kisht/contracts";
import { istDayOf, istDayStart } from "@kisht/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { request } from "@/lib/api";
import { time } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

// Demo mode only (D13): lets a reviewer try the contact window at any hour.
// Simulated time is always on show, so it can't be mistaken for the real thing.

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const CONTACT_HOUR_MS = 11 * 60 * 60 * 1000;

const keys = { clock: ["demo", "clock"] as const };

function useDemoClock() {
  const queryClient = useQueryClient();
  const clock = useQuery({
    queryKey: keys.clock,
    queryFn: () => request("/api/demo/clock", { schema: DemoClock }),
    enabled: DEMO_MODE,
  });
  const set = useMutation({
    mutationFn: (at: string | null) =>
      request("/api/demo/clock", { method: "POST", body: { at }, schema: DemoClock }),
    // The server's rules moved, so everything on screen is stale.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  return { clock, set };
}

/** Offered when contact is closed: move the demo to 11 am today. */
export function DemoTimeButton() {
  const { t } = useI18n();
  const { set } = useDemoClock();
  if (!DEMO_MODE) return null;
  const at = new Date(istDayStart(istDayOf(new Date())).getTime() + CONTACT_HOUR_MS);
  return (
    <button
      type="button"
      onClick={() => set.mutate(at.toISOString())}
      className="mt-2 ml-6 inline-flex min-h-10 items-center gap-1.5 rounded-lg font-medium underline underline-offset-2"
    >
      <FlaskConical className="size-4" aria-hidden />
      {t("demo.setTime")}
    </button>
  );
}

export function DemoClockBar() {
  const { t, locale } = useI18n();
  const { clock, set } = useDemoClock();
  if (!clock.data?.simulated) return null;
  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-accent/20 bg-accent-soft px-4 py-2 text-xs font-semibold text-accent shadow-xs"
      role="status"
    >
      <span className="flex items-center gap-1.5">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden />
        {t("demo.simulated", { time: time(clock.data.now, locale) })}
      </span>
      <button
        type="button"
        onClick={() => set.mutate(null)}
        className="min-h-7 shrink-0 font-bold underline underline-offset-2"
      >
        {t("demo.realTime")}
      </button>
    </div>
  );
}
