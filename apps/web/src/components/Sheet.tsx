"use client";

import { type ReactNode, useEffect } from "react";
import { useI18n } from "@/lib/i18n";

/** A bottom sheet on phones, a centred dialog on desktop. Esc or the backdrop closes it. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <button
        type="button"
        aria-label={t("common.cancel")}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative w-full max-w-md rounded-t-2xl bg-canvas p-5 pb-6 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
