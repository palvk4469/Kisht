"use client";

import type { Locale } from "@kisht/contracts";
import type { ContactBlockReason } from "@kisht/domain";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Badge, Button, cx, ErrorState, Skeleton } from "@/components/ui";
import { time } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useReminderDraft, useSendReminder } from "./api";
import { useFlash } from "./Flash";
import { BLOCK_TEXT } from "./useContactWindow";

type Props = {
  loanId: string;
  borrowerName: string;
  nextAllowedAt: Date;
  onClose: () => void;
};

const LANGUAGES: { lang: Locale; label: string }[] = [
  { lang: "hi", label: "हिंदी" },
  { lang: "en", label: "English" },
];

/**
 * The officer reads the draft and decides. It can't be edited, so what passed
 * the server's checks is exactly what goes out, and only Send sends it.
 */
export function ReminderSheet({ loanId, borrowerName, nextAllowedAt, onClose }: Props) {
  const { t, locale } = useI18n();
  const flash = useFlash();
  const [lang, setLang] = useState<Locale | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const draft = useReminderDraft(loanId, lang);
  const send = useSendReminder();
  const shownLang = lang ?? draft.data?.lang;

  function submit(draftId: string) {
    send.mutate(draftId, {
      onSuccess: ({ status, reason }) => {
        if (status === "blocked") {
          const key = BLOCK_TEXT[reason as ContactBlockReason];
          setBlocked(t(key, { time: time(nextAllowedAt, locale) }));
          return;
        }
        flash(t("reminder.sent", { name: borrowerName }));
        onClose();
      },
    });
  }

  return (
    <Sheet title={t("reminder.title", { name: borrowerName })} onClose={onClose}>
      {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a fieldset. */}
      <div role="group" aria-label={t("reminder.language")} className="mt-3 flex gap-2">
        {LANGUAGES.map((option) => (
          <button
            key={option.lang}
            type="button"
            aria-pressed={shownLang === option.lang}
            onClick={() => {
              setLang(option.lang);
              setBlocked(null);
              send.reset();
            }}
            className={cx(
              "min-h-12 flex-1 rounded-xl border text-sm font-medium",
              shownLang === option.lang
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-muted hover:bg-surface",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {draft.isPending && (
          <div role="status" aria-label={t("reminder.drafting")}>
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {draft.error && <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />}
        {draft.data && (
          <>
            <Badge tone={draft.data.source === "AI" ? "accent" : "neutral"} dot>
              {t(draft.data.source === "AI" ? "reminder.fromAi" : "reminder.fromTemplate")}
            </Badge>
            <p
              lang={draft.data.lang}
              className="mt-2 rounded-xl border border-line/60 bg-surface/70 px-4 py-3 text-base leading-relaxed text-ink"
            >
              {draft.data.body}
            </p>
            <p className="mt-2 text-sm text-muted">{t("reminder.hint")}</p>
          </>
        )}
      </div>

      {blocked && (
        <p role="status" className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {blocked}
        </p>
      )}
      {send.error && (
        <div className="mt-3">
          <ErrorState
            error={send.error}
            onRetry={() => {
              send.reset();
              void draft.refetch();
            }}
          />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
          {t("reminder.cancel")}
        </Button>
        <Button
          size="lg"
          className="flex-1"
          disabled={!draft.data || blocked !== null}
          busy={send.isPending}
          onClick={() => draft.data && submit(draft.data.id)}
        >
          {t("reminder.send")}
        </Button>
      </div>
    </Sheet>
  );
}
