import { Suspense } from "react";
import { NavLinks, type NavItem } from "@/components/dashboard/nav-links";
import { StaticNav } from "@/components/dashboard/static-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { DashboardTopBar, TopBarSkeleton } from "@/components/dashboard/top-bar";
import { getCurrentUser } from "@/lib/auth/dal";

const NAV: NavItem[] = [
  { href: "/", label: "Overview", ready: true },
  { href: "/demand", label: "Demand Analytics", ready: true },
  { href: "/stations", label: "Station Explorer", ready: true },
  { href: "/overloads", label: "Overload Explorer", ready: true },
  { href: "/sessions", label: "Charging Sessions", ready: true },
  { href: "/admin/users", label: "User Management", ready: true, adminOnly: true },
  { href: "/data-administration", label: "Data Administration", ready: true, adminOnly: true },
];

const publicItems = NAV.filter((i) => !i.adminOnly);

/** Hides admin-only links from analysts. */
async function SidebarNav() {
  const user = await getCurrentUser().catch(() => null);
  return <NavLinks items={user?.role === "ADMIN" ? NAV : publicItems} />;
}

async function SidebarUser() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;

  return (
    <div className="border-t border-rule/70 bg-panel-elevated/30 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-charge/15 border border-charge/30 font-mono text-xs font-bold text-charge">
          {user.displayName
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{user.displayName}</p>
          <p className="truncate text-[11px] text-muted font-mono">{user.email}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            user.role === "ADMIN"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
              : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
          }`}
        >
          {user.role === "ADMIN" ? "Administrator" : "Analyst"}
        </span>
        <SignOutButton />
      </div>
    </div>
  );
}

async function TopBar() {
  const user = await getCurrentUser().catch(() => null);
  return <DashboardTopBar userRole={user?.role} userName={user?.displayName} />;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr] bg-paper">
      {/* Sidebar */}
      <aside className="flex flex-col border-b border-rule bg-panel lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-rule/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/40 text-lg">
              ⚡
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-ink">EV Charging Analytics</p>
              <p className="text-[11px] font-medium text-muted">Grid Load &amp; Demand Platform</p>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <details className="group px-3 py-2 border-b border-rule/60 lg:hidden">
          <summary className="flex items-center justify-between cursor-pointer list-none rounded-lg bg-panel-elevated/60 px-3 py-2 text-xs font-medium text-charge">
            <span>Navigation Menu</span>
            <span className="text-xs transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="mt-2 space-y-1">
            <Suspense fallback={<StaticNav items={publicItems} />}>
              <SidebarNav />
            </Suspense>
          </div>
        </details>

        {/* Desktop Sidebar Navigation */}
        <div className="hidden flex-1 overflow-y-auto px-3 py-2 lg:block">
          <Suspense fallback={<StaticNav items={publicItems} />}>
            <SidebarNav />
          </Suspense>
        </div>

        {/* User Profile Footer */}
        <Suspense fallback={null}>
          <SidebarUser />
        </Suspense>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col min-w-0">
        <Suspense fallback={<TopBarSkeleton />}>
          <TopBar />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
