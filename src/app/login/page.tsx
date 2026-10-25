import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">EV Charging Analytics</h1>
        <p className="mt-1 text-sm text-muted">Sign in to view demand and grid load analytics.</p>
        <div className="mt-6 rounded border border-rule bg-panel p-5">
          <Suspense fallback={<div className="h-48 animate-pulse rounded bg-rule/60 motion-reduce:animate-none" />}>
            <LoginFormLoader searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="mt-4 text-sm text-muted">Accounts are created by an administrator.</p>
      </div>
    </main>
  );
}

async function LoginFormLoader({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).next;
  return <LoginForm next={safeNextPath(Array.isArray(raw) ? raw[0] : raw)} />;
}
