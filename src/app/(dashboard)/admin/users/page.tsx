import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/dal";
import { listUsers } from "@/lib/db/queries/users";
import { UserManager } from "@/components/admin/user-manager";
import { ErrorPanel } from "@/components/dashboard/states";

export const metadata: Metadata = { title: "User management" };

export default function UsersPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">User management</h1>
      <Suspense fallback={<div role="status" aria-label="Loading users" className="h-64 animate-pulse rounded bg-rule/60 motion-reduce:animate-none" />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}

async function UsersContent() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    unstable_rethrow(err);
    return <ErrorPanel title="Could not verify your session" message={toPublicError(err).message} />;
  }
  if (!user) redirect("/login");
  // Server-side authorization: hiding the nav link is cosmetic, this check is the real one.
  if (user.role !== "ADMIN") {
    return <ErrorPanel title="Administrator access required" message="Your account does not have permission to manage users." />;
  }

  let users;
  try {
    users = await listUsers();
  } catch (err) {
    unstable_rethrow(err);
    return <ErrorPanel title="Could not load users" message={toPublicError(err).message} />;
  }
  return (
    <UserManager
      currentUserId={user.userId}
      users={users.map((u) => ({
        userId: u.userId,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      }))}
    />
  );
}
