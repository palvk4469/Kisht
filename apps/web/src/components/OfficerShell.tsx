"use client";

import type { Me } from "@kisht/contracts";
import { LogOut } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DemoClockBar } from "@/features/demo/DemoClockBar";
import { FlashProvider } from "@/features/field/Flash";
import { OfficerTabs } from "@/features/field/OfficerTabs";
import { InstallPrompt } from "@/features/offline/InstallPrompt";
import { SyncBar } from "@/features/offline/SyncBar";
import { SyncProvider } from "@/features/offline/SyncProvider";
import { countUnsent } from "@/features/offline/signOutCleanup";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { Sheet } from "./Sheet";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui";
import { useSignOut } from "./useSignOut";

// Phone-first frame for every officer screen: one column, big targets,
// nothing on screen that the officer doesn't need in the field.
export function OfficerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const signOut = useSignOut(me.id);
  const [unsent, setUnsent] = useState(0);

  async function requestSignOut() {
    const n = await countUnsent(me.id);
    if (n > 0) setUnsent(n);
    else await signOut();
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-xs text-muted">{t("role.OFFICER")}</div>
          <div className="font-semibold">{me.name}</div>
        </div>
        <div className="flex">
          <LanguageToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void requestSignOut()}
            aria-label={t("common.signOut")}
            className="inline-flex size-12 items-center justify-center rounded-xl text-muted hover:bg-surface"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>
      <SyncProvider userId={me.id}>
        <DemoClockBar />
        <SyncBar />
        <InstallPrompt />
        <FlashProvider>
          {/* Room for the tab bar, so the last card can always be reached. */}
          <main className="pb-16">{children}</main>
          <OfficerTabs />
        </FlashProvider>
      </SyncProvider>
      {unsent > 0 && (
        <Sheet title={t("signOut.title", { n: unsent })} onClose={() => setUnsent(0)}>
          <p className="mt-1 text-sm text-muted">{t("signOut.body")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button size="lg" variant="secondary" onClick={() => setUnsent(0)}>
              {t("common.cancel")}
            </Button>
            <Button size="lg" variant="danger" onClick={() => void signOut()}>
              {t("signOut.confirm")}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
