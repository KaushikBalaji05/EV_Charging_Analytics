"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  ready: boolean;
  adminOnly?: boolean;
  icon?: string;
}

const ICONS: Record<string, string> = {
  "/": "📊",
  "/demand": "📈",
  "/stations": "⚡",
  "/overloads": "⚠️",
  "/sessions": "🔌",
  "/admin/users": "👥",
  "/data-administration": "🗄️",
};

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="py-2">
      <ul className="space-y-1">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const icon = item.icon || ICONS[item.href] || "•";

          if (!item.ready) {
            return (
              <li key={item.href}>
                <span
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted/50 cursor-not-allowed"
                  aria-disabled="true"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm opacity-50">{icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className="rounded bg-panel-elevated px-1.5 py-0.5 text-[10px] text-muted">Soon</span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={true}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  active
                    ? "bg-charge/15 text-charge border border-charge/30 font-semibold shadow-sm"
                    : "text-muted hover:text-ink hover:bg-panel-elevated/70"
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <span
                    className={`text-sm transition-transform duration-150 group-hover:scale-110 ${
                      active ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                    }`}
                  >
                    {icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>

                {item.adminOnly && (
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                      active
                        ? "bg-charge/25 text-charge"
                        : "bg-panel-elevated text-muted/80 group-hover:text-muted"
                    }`}
                  >
                    Admin
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
