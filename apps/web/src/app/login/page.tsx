"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, cx } from "@/components/ui";
import { fetchMe, homeFor, sessionKeys } from "@/features/session/api";
import { ApiError } from "@/lib/api";
import { signInWithEmail } from "@/lib/auth";
import { type MessageKey, useI18n } from "@/lib/i18n";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

const DEMO_ACCOUNTS: { email: string; name: string; role: MessageKey; branch: string }[] = [
  {
    email: "rahul.chouhan@kisht.example",
    name: "Rahul Chouhan",
    role: "login.demo.officer",
    branch: "Indore Central",
  },
  {
    email: "sanjay.joshi@kisht.example",
    name: "Sanjay Joshi",
    role: "login.demo.manager",
    branch: "Indore Central",
  },
  {
    email: "anil.mehta@kisht.example",
    name: "Anil Mehta",
    role: "login.demo.head",
    branch: "All branches",
  },
];

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(withEmail: string, withPassword: string) {
    setError(null);
    setBusy(withEmail);
    try {
      await signInWithEmail(withEmail, withPassword);
      const me = await queryClient.fetchQuery({
        queryKey: sessionKeys.me(),
        queryFn: fetchMe,
        staleTime: 0,
      });
      router.replace(homeFor(me.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t("login.invalid"));
      else if (err instanceof ApiError && err.status !== 0) setError(err.message);
      else setError(t("common.offline"));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email.trim(), password);
  }

  return (
    <main className="flex min-h-dvh flex-col bg-surface">
      <header className="flex justify-end gap-1 p-3">
        <ThemeToggle />
        <LanguageToggle />
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-on-accent shadow-md">
              क
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{t("app.name")}</h1>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">{t("login.subtitle")}</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-card border border-line bg-canvas p-6 shadow-sm"
            noValidate
          >
            <h2 className="sr-only">{t("login.title")}</h2>
            <label className="block">
              <span className="text-sm font-medium">{t("login.email")}</span>
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-line px-3 text-base outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("login.password")}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-line px-3 text-base outline-none focus:border-accent"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-risk">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              busy={busy === email.trim()}
              disabled={!email || !password}
            >
              {busy === email.trim() ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>

          {DEMO_MODE && DEMO_PASSWORD && (
            <div className="mt-6">
              <p className="text-sm font-medium">{t("login.demo")}</p>
              <p className="text-xs text-muted">{t("login.demoHint")}</p>
              <ul className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      onClick={() => void signIn(a.email, DEMO_PASSWORD)}
                      disabled={busy !== null}
                      className={cx(
                        "flex min-h-14 w-full items-center justify-between rounded-xl border border-line bg-canvas px-4 py-2 text-left hover:border-accent disabled:opacity-60",
                        busy === a.email && "border-accent",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium">{t(a.role)}</span>
                        <span className="block text-xs text-muted">
                          {a.name} · {a.branch}
                        </span>
                      </span>
                      <span className="text-sm text-accent">
                        {busy === a.email ? t("login.submitting") : "→"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
