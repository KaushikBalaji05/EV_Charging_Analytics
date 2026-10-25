"use client";

import { useState } from "react";

const LOGIN_PATH = "/login";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Deliberate full-page navigation (not router.push): it discards the client-side router cache,
      // so a stale authenticated page cannot be shown after signing out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional, see above
      window.location.assign(LOGIN_PATH);
    }
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="rounded border border-rule px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
