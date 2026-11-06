"use client";

import type { Me } from "@kisht/contracts";
import { type ReactNode, useState } from "react";
import { DemoClockBar } from "@/features/demo/DemoClockBar";
import { FlashProvider } from "@/features/field/Flash";
import { OfficerTabs, useOfficerNav } from "@/features/field/OfficerTabs";
import { InstallPrompt } from "@/features/offline/InstallPrompt";
import { SyncBar } from "@/features/offline/SyncBar";
import { SyncProvider } from "@/features/offline/SyncProvider";
import { countUnsent } from "@/features/offline/signOutCleanup";
import { useI18n } from "@/lib/i18n";
import { AppHeader } from "./AppHeader";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { useSignOut } from "./useSignOut";

// Phone-first frame for every officer screen: one column, big targets, tabs at the
// thumb on a phone. On a larger screen it has the same header as every other role.
export function OfficerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const signOut = useSignOut(me.id);
  const nav = useOfficerNav();
  const [unsent, setUnsent] = useState(0);

  async function requestSignOut() {
    const n = await countUnsent(me.id);
    if (n > 0) setUnsent(n);
    else await signOut();
  }
  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader me={me} nav={nav} onSignOut={() => void requestSignOut()} />
      <SyncProvider userId={me.id}>
        <DemoClockBar />
        <SyncBar />
        <InstallPrompt />
        <FlashProvider>
          {/* Room for the phone's tab bar, so the last card can always be reached. */}
          <main className="mx-auto max-w-2xl pb-20 sm:pt-4 lg:pb-4">{children}</main>
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
