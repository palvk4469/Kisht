"use client";

import { type ReactNode, useEffect, useRef } from "react";

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
      className="m-auto mb-0 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-canvas text-ink shadow-xl backdrop:bg-ink/40 sm:mb-auto sm:rounded-2xl"
    >
      <div className="p-5 pb-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
