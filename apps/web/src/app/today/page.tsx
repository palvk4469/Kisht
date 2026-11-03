"use client";

import { ListChecks, LogOut } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { RequireRole } from "@/components/RequireRole";
import { EmptyState } from "@/components/ui";
import { useSignOut } from "@/components/useSignOut";
import { useI18n } from "@/lib/i18n";

// The officer's prioritised list lands here on day 3; for now a real, signed-in page.
export default function TodayPage() {
  const { t } = useI18n();
  const signOut = useSignOut();
  return (
    <RequireRole roles={["OFFICER"]}>
      {(me) => (
        <div className="mx-auto min-h-dvh max-w-md bg-canvas">
          <header className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-xs text-muted">{t("role.OFFICER")}</div>
              <div className="font-semibold">{me.name}</div>
            </div>
            <div className="flex">
              <LanguageToggle />
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label={t("common.signOut")}
                className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </header>
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title={t("officer.comingSoon")}
            body={t("officer.comingSoonBody")}
          />
        </div>
      )}
    </RequireRole>
  );
}
