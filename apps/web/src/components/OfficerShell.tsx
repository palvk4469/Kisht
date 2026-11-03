"use client";

import type { Me } from "@kisht/contracts";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { useSignOut } from "./useSignOut";

// Phone-first frame for every officer screen: one column, big targets,
// nothing on screen that the officer doesn't need in the field.
export function OfficerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const signOut = useSignOut();
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur">
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
            className="inline-flex size-12 items-center justify-center rounded-xl text-muted hover:bg-surface"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
