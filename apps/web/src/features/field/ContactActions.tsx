"use client";

import { checkContact } from "@kisht/domain";
import { Lock, MapPin, MessageSquareText, Phone } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/ui";
import { time } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useFieldLog } from "./api";
import { ReminderSheet } from "./ReminderSheet";
import { BLOCK_TEXT } from "./useContactWindow";

type Props = {
  loanId: string;
  borrowerName: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  contactPaused: boolean;
  attemptsToday: number;
  now: Date;
  nextAllowedAt: Date;
  /** The loan screen only: on the list, one more button on every card is clutter. */
  withReminder?: boolean;
};

function mapUrl({ lat, lng, address }: Pick<Props, "lat" | "lng" | "address">) {
  const q = lat !== null && lng !== null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const target =
  "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-medium transition-colors";

/**
 * Call and Map, the two things an officer does most. Call goes through the same
 * rule the server enforces. A blocked tap is still recorded (RBI audit trail),
 * and the officer is told why and when contact opens.
 */
export function ContactActions(props: Props) {
  const { t, locale } = useI18n();
  const { recordAttempt } = useFieldLog();
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const block = checkContact({
    at: props.now,
    contactPaused: props.contactPaused,
    allowedAttemptsToday: props.attemptsToday,
  });
  const blockText = block
    ? t(BLOCK_TEXT[block], { time: time(props.nextAllowedAt, locale) })
    : null;

  return (
    <div>
      <div className="flex gap-2">
        {block ? (
          <button
            type="button"
            onClick={() => {
              void recordAttempt(props, "CALL", true);
              setNotice(blockText);
            }}
            className={cx(target, "bg-surface text-muted")}
          >
            <Lock className="size-4" aria-hidden />
            {t("contact.call")}
          </button>
        ) : (
          <a
            href={`tel:${props.phone}`}
            onClick={() => void recordAttempt(props, "CALL", false)}
            className={cx(target, "bg-accent text-on-accent hover:bg-accent-strong")}
          >
            <Phone className="size-4" aria-hidden />
            {t("contact.call")}
          </a>
        )}
        <a
          href={mapUrl(props)}
          target="_blank"
          rel="noreferrer"
          className={cx(target, "border border-line text-ink hover:bg-surface")}
        >
          <MapPin className="size-4" aria-hidden />
          {t("contact.map")}
        </a>
      </div>
      {props.withReminder && (
        <button
          type="button"
          onClick={() => {
            if (block) {
              void recordAttempt(props, "MESSAGE", true);
              setNotice(blockText);
            } else {
              setDrafting(true);
            }
          }}
          className={cx(target, "mt-2 w-full border border-line text-ink hover:bg-surface")}
        >
          <MessageSquareText className="size-4" aria-hidden />
          {t("contact.remind")}
        </button>
      )}
      {drafting && (
        <ReminderSheet
          loanId={props.loanId}
          borrowerName={props.borrowerName}
          nextAllowedAt={props.nextAllowedAt}
          onClose={() => setDrafting(false)}
        />
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm text-warn">
          {notice}
        </p>
      )}
    </div>
  );
}
