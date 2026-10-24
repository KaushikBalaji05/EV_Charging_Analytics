import { NavLinks, type NavItem } from "@/components/dashboard/nav-links";

// Pages are switched on as each build stage lands; unbuilt ones render as disabled.
const NAV: NavItem[] = [
  { href: "/", label: "Overview", ready: true },
  { href: "/demand", label: "Demand analytics", ready: false },
  { href: "/stations", label: "Station explorer", ready: false },
  { href: "/overloads", label: "Overload explorer", ready: false },
  { href: "/sessions", label: "Charging sessions", ready: false },
  { href: "/admin", label: "Administration", ready: false },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-rule bg-panel lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-5">
          <p className="font-semibold leading-tight">
            EV Charging
            <span className="block text-sm font-normal text-muted">Demand &amp; grid load analytics</span>
          </p>
        </div>
        {/* Mobile: collapsible menu. Desktop: always visible. */}
        <details className="group px-2 pb-2 lg:hidden">
          <summary className="cursor-pointer list-none rounded px-3 py-2 text-sm font-medium text-charge">Menu</summary>
          <NavLinks items={NAV} />
        </details>
        <div className="hidden px-2 lg:block">
          <NavLinks items={NAV} />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
