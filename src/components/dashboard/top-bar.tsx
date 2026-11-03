"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

interface TopBarProps {
  userRole?: string;
  userName?: string;
}

const SECTION_TITLES: Record<string, { title: string; category: string }> = {
  "/": { title: "Executive Overview", category: "Dashboard" },
  "/demand": { title: "Demand Analytics", category: "Analytics" },
  "/stations": { title: "Station Explorer", category: "Infrastructure" },
  "/overloads": { title: "Overload Explorer", category: "Grid Reliability" },
  "/sessions": { title: "Charging Sessions", category: "Operations" },
  "/admin/users": { title: "User Management", category: "Administration" },
  "/data-administration": { title: "Data Administration", category: "Administration" },
};

export function TopBarSkeleton() {
  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-rule/70 bg-panel/90 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">EV Platform</span>
        <span className="text-muted/40">/</span>
        <span className="text-sm font-semibold text-ink">Analytics</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-6 w-32 rounded-full bg-panel-elevated animate-pulse" />
      </div>
    </header>
  );
}

export function DashboardTopBar({ userRole, userName }: TopBarProps) {
  const pathname = usePathname();

  // Determine active section or fallback for nested routes like /stations/1
  let activeInfo = SECTION_TITLES[pathname];
  if (!activeInfo) {
    if (pathname.startsWith("/stations/")) {
      activeInfo = { title: "Station Telemetry & Hardware", category: "Infrastructure" };
    } else {
      activeInfo = { title: "Dashboard", category: "Analytics" };
    }
  }

  const initials = userName
    ? userName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "EV";

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-rule/70 bg-panel/90 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
      {/* Breadcrumb & Section Name */}
      <div className="flex items-center gap-3">
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
          <Link href="/" className="hover:text-ink transition">
            EV Platform
          </Link>
          <span>/</span>
          <span className="text-muted/70">{activeInfo.category}</span>
          <span>/</span>
        </nav>
        <h1 className="text-sm font-semibold tracking-wide text-ink sm:text-base">
          {activeInfo.title}
        </h1>
      </div>

      {/* System Health Status & User Profile Widget */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Live Infrastructure Pills */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] font-medium">PG SQL</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-[11px] font-medium">Mongo Live</span>
          </div>
        </div>

        {/* User Mini Avatar & Role */}
        {userRole && (
          <div className="flex items-center gap-2 border-l border-rule/60 pl-3 sm:pl-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-charge/20 border border-charge/40 text-[11px] font-bold text-charge font-mono">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <span
                className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                  userRole === "ADMIN"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                }`}
              >
                {userRole}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
