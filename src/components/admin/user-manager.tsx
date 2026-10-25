"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatInstant } from "@/lib/format";

export interface UserRow {
  userId: number;
  email: string;
  displayName: string;
  role: "ADMIN" | "ANALYST";
  isActive: boolean;
  lastLoginAt: string | null;
}

const th = "px-3 py-2 text-left text-sm font-medium text-muted";
const td = "px-3 py-2 text-sm";
const field = "mt-1 block w-full rounded border border-rule bg-panel px-2 py-1.5 text-sm";

export function UserManager({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: "POST" | "PATCH", body: unknown, success: string): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setMessage({ kind: "ok", text: success });
        router.refresh();
        return true;
      }
      const details = json?.error?.details as { field: string; message: string }[] | undefined;
      setMessage({ kind: "error", text: details?.map((d) => `${d.field}: ${d.message}`).join("; ") ?? json?.error?.message ?? "Request failed." });
    } catch {
      setMessage({ kind: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const created = await call(
      "/api/admin/users",
      "POST",
      { email: f.get("email"), displayName: f.get("displayName"), role: f.get("role"), password: f.get("password") },
      "User created.",
    );
    if (created) formEl.reset();
  }

  function toggleActive(u: UserRow) {
    if (u.isActive && !window.confirm(`Deactivate ${u.email}? They will be signed out immediately.`)) return;
    void call(`/api/admin/users/${u.userId}`, "PATCH", { isActive: !u.isActive }, u.isActive ? "User deactivated." : "User reactivated.");
  }

  function changeRole(u: UserRow, role: string) {
    if (role === u.role) return;
    if (!window.confirm(`Change ${u.email} to ${role}?`)) return;
    void call(`/api/admin/users/${u.userId}`, "PATCH", { role }, "Role updated.");
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite">
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`rounded border px-3 py-2 text-sm ${
              message.kind === "error" ? "border-overload/40 bg-overload-soft text-overload" : "border-charge/30 bg-charge-soft text-charge"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <section className="rounded border border-rule bg-panel">
        <header className="border-b border-rule px-4 py-3">
          <h2 className="font-medium">Users</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem]">
            <caption className="sr-only">Registered users</caption>
            <thead className="border-b border-rule">
              <tr>
                <th scope="col" className={th}>Name</th>
                <th scope="col" className={th}>Role</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Last sign-in</th>
                <th scope="col" className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {users.map((u) => {
                const self = u.userId === currentUserId;
                return (
                  <tr key={u.userId}>
                    <td className={td}>
                      <p className="font-medium">{u.displayName}{self && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</p>
                      <p className="text-muted">{u.email}</p>
                    </td>
                    <td className={td}>
                      <label className="sr-only" htmlFor={`role-${u.userId}`}>Role for {u.email}</label>
                      <select
                        id={`role-${u.userId}`}
                        value={u.role}
                        disabled={busy || self}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="rounded border border-rule bg-panel px-2 py-1 text-sm"
                      >
                        <option value="ADMIN">Administrator</option>
                        <option value="ANALYST">Analyst</option>
                      </select>
                    </td>
                    <td className={td}>
                      <span className={`rounded px-2 py-0.5 text-xs ${u.isActive ? "bg-charge-soft text-charge" : "bg-paper text-muted"}`}>
                        {u.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className={td}>{formatInstant(u.lastLoginAt)}</td>
                    <td className={`${td} text-right`}>
                      {!self && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleActive(u)}
                          className="rounded border border-rule px-3 py-1 text-sm hover:bg-paper disabled:opacity-60"
                        >
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-rule bg-panel">
        <header className="border-b border-rule px-4 py-3">
          <h2 className="font-medium">Create a user</h2>
          <p className="mt-0.5 text-sm text-muted">Passwords need at least 12 characters. Share the initial password securely; there is no email delivery.</p>
        </header>
        <form onSubmit={onCreate} className="grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <label htmlFor="displayName" className="text-sm font-medium">Name</label>
            <input id="displayName" name="displayName" required maxLength={100} className={field} />
          </div>
          <div>
            <label htmlFor="new-email" className="text-sm font-medium">Email</label>
            <input id="new-email" name="email" type="email" required maxLength={254} autoComplete="off" className={field} />
          </div>
          <div>
            <label htmlFor="new-password" className="text-sm font-medium">Initial password</label>
            <input id="new-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className={field} />
          </div>
          <div>
            <label htmlFor="new-role" className="text-sm font-medium">Role</label>
            <select id="new-role" name="role" defaultValue="ANALYST" className={field}>
              <option value="ANALYST">Analyst (view dashboards)</option>
              <option value="ADMIN">Administrator (manage users)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="rounded bg-charge px-4 py-2 text-sm font-medium text-white hover:bg-charge/90 disabled:opacity-60">
              Create user
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
