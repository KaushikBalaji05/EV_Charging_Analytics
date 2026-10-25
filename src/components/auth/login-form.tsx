"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        window.location.assign(next); // full navigation so the server renders with the new session
        return;
      }
      const details = body?.error?.details as { message: string }[] | undefined;
      setError(details?.[0]?.message ?? body?.error?.message ?? "Sign in failed. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  const field = "mt-1 block w-full rounded border border-rule bg-panel px-3 py-2 text-sm";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded border border-overload/40 bg-overload-soft px-3 py-2 text-sm text-overload">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={field} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-charge px-4 py-2 text-sm font-medium text-white hover:bg-charge/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
