"use client";

import { type ContactBlockReason, checkContact } from "@kisht/domain";
import { Lock, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/ui";
import { time } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { useRecordAttempt } from "./api";

const BLOCK_TEXT: Record<ContactBlockReason, MessageKey> = {
  OUTSIDE_CONTACT_WINDOW: "contact.blockedWindow",
  CONTACT_PAUSED: "contact.blockedPaused",
  DAILY_ATTEMPT_CAP: "contact.blockedCap",
};

type Props = {
  loanId: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  contactPaused: boolean;
  attemptsToday: number;
  now: Date;
  nextAllowedAt: Date;
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
  const record = useRecordAttempt();
  const [notice, setNotice] = useState<string | null>(null);
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
              record.mutate({ loanId: props.loanId, channel: "CALL" });
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
            onClick={() => record.mutate({ loanId: props.loanId, channel: "CALL" })}
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
      {notice && (
        <p role="status" className="mt-2 text-sm text-warn">
          {notice}
        </p>
      )}
    </div>
  );
}
