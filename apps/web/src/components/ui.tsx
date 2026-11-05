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
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "lg" ? "h-12 px-5 text-base" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-accent text-on-accent shadow-xs hover:bg-accent-strong hover:shadow-sm disabled:bg-accent/40 disabled:hover:bg-accent/40 disabled:shadow-none",
        variant === "secondary" &&
          "border border-line bg-canvas text-ink shadow-xs hover:border-line/80 hover:bg-surface disabled:text-faint disabled:hover:bg-canvas disabled:shadow-none",
        variant === "ghost" && "text-muted hover:bg-surface hover:text-ink disabled:text-faint",
        variant === "danger" &&
          "bg-risk text-on-accent shadow-xs hover:opacity-90 disabled:bg-risk/40 disabled:shadow-none",
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
    <section
      className={cx(
        "rounded-card border border-line bg-canvas shadow-xs transition-shadow duration-200",
        className,
      )}
    >
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "risk" | "warn" | "ok";

const toneClass: Record<Tone, string> = {
  neutral: "border-line bg-surface text-muted",
  accent: "border-accent/20 bg-accent-soft text-accent",
  risk: "border-risk/20 bg-risk-soft text-risk",
  warn: "border-warn/25 bg-warn-soft text-warn",
  ok: "border-ok/25 bg-ok-soft text-ok",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight",
        toneClass[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cx(
            "size-1.5 shrink-0 rounded-full",
            tone === "risk" && "bg-risk",
            tone === "warn" && "bg-warn",
            tone === "ok" && "bg-ok",
            tone === "accent" && "bg-accent",
            tone === "neutral" && "bg-muted",
          )}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line/60 bg-surface/70 p-3.5 transition-colors hover:bg-surface sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted/70">{icon}</span>}
      </div>
      <div
        className={cx(
          "num mt-1 text-2xl font-bold tracking-tight sm:text-[1.75rem]",
          tone === "risk" && "text-risk",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted leading-relaxed">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-xl border border-line/40 bg-surface/80", className)}
    />
  );
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
