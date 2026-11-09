"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * A bottom sheet on phones, a centred dialog on desktop. A native <dialog>, so
 * focus stays inside, Esc closes it, and it sits above everything else.
 */
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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself can only be the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line/50 bg-canvas text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-xs sm:mb-auto sm:rounded-2xl sm:border sm:border-line"
    >
      <div className="p-5 pb-6 sm:p-6">
        {/* Mobile drag handle */}
        <div
          className="mx-auto -mt-1 mb-3.5 h-1.5 w-12 rounded-full bg-line/90 sm:hidden"
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mt-3 -mr-3 inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
