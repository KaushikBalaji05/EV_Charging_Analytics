import { Suspense } from "react";
import { NavLinks, type NavItem } from "@/components/dashboard/nav-links";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth/dal";

// Pages are switched on as each build stage lands; unbuilt ones render as disabled.
const NAV: NavItem[] = [
  { href: "/", label: "Overview", ready: true },
  { href: "/demand", label: "Demand analytics", ready: false },
  { href: "/stations", label: "Station explorer", ready: false },
  { href: "/overloads", label: "Overload explorer", ready: false },
  { href: "/sessions", label: "Charging sessions", ready: false },
  { href: "/admin/users", label: "User management", ready: true, adminOnly: true },
  { href: "/admin", label: "Data administration", ready: false, adminOnly: true },
];

const publicItems = NAV.filter((i) => !i.adminOnly);

/** Hides admin-only links from analysts. This is cosmetic: the pages and APIs enforce roles themselves. */
async function SidebarNav() {
  const user = await getCurrentUser().catch(() => null);
  return <NavLinks items={user?.role === "ADMIN" ? NAV : publicItems} />;
}

async function SidebarUser() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  return (
    <div className="border-t border-rule px-4 py-4">
      <p className="truncate text-sm font-medium">{user.displayName}</p>
      <p className="truncate text-xs text-muted">{user.email}</p>
      <p className="mt-1 text-xs text-muted">Role: {user.role === "ADMIN" ? "Administrator" : "Analyst"}</p>
      <div className="mt-3">
        <SignOutButton />
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col border-b border-rule bg-panel lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-5">
          <p className="font-semibold leading-tight">
            EV Charging
            <span className="block text-sm font-normal text-muted">Demand &amp; grid load analytics</span>
          </p>
        </div>
        {/* Mobile: collapsible menu. Desktop: always visible. */}
        <details className="group px-2 pb-2 lg:hidden">
          <summary className="cursor-pointer list-none rounded px-3 py-2 text-sm font-medium text-charge">Menu</summary>
          <Suspense fallback={<NavLinks items={publicItems} />}>
            <SidebarNav />
          </Suspense>
        </details>
        <div className="hidden flex-1 px-2 lg:block">
          <Suspense fallback={<NavLinks items={publicItems} />}>
            <SidebarNav />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <SidebarUser />
        </Suspense>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
