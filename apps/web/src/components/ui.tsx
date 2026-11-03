"use client";

import { AlertCircle, Loader2, WifiOff } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// The few building blocks every screen shares, so states look the same everywhere.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  busy?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed",
        size === "lg" ? "h-12 px-5 text-base" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-accent text-white hover:bg-accent-strong disabled:bg-accent/40 disabled:hover:bg-accent/40",
        variant === "secondary" &&
          "border border-line bg-canvas text-ink hover:bg-surface disabled:text-faint disabled:hover:bg-canvas",
        variant === "ghost" && "text-muted hover:bg-surface hover:text-ink disabled:text-faint",
        variant === "danger" && "bg-risk text-white hover:opacity-90 disabled:bg-risk/40",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-card border border-line bg-canvas", className)}>
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "risk" | "warn" | "ok";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface text-muted",
  accent: "bg-accent-soft text-accent",
  risk: "bg-risk-soft text-risk",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cx(
          "num mt-1 text-2xl font-semibold",
          tone === "risk" && "text-risk",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-surface", className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Explains an error in the user's language; offers a retry when it makes sense. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const offline = error instanceof ApiError && error.status === 0;
  const message = offline
    ? t("common.offline")
    : error instanceof ApiError
      ? error.message
      : t("common.error");
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-risk/20 bg-risk-soft px-4 py-3 text-sm text-risk"
    >
      {offline ? (
        <WifiOff className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
