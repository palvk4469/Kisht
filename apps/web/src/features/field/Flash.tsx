"use client";

import { CheckCircle2 } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const FLASH_MS = 4000;

const FlashContext = createContext<(message: string) => void>(() => {});

/** A brief confirmation that survives the hop back to the list. */
export function FlashProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(m);
    timer.current = setTimeout(() => setMessage(null), FLASH_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <FlashContext.Provider value={show}>
      {children}
      {message && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <p
            role="status"
            className="flex max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-canvas shadow-lg"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {message}
          </p>
        </div>
      )}
    </FlashContext.Provider>
  );
}

export const useFlash = () => useContext(FlashContext);
