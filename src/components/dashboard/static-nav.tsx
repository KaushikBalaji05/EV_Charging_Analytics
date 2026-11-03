import Link from "next/link";
import type { NavItem } from "@/components/dashboard/nav-links";

const ICONS: Record<string, string> = {
  "/": "📊",
  "/demand": "📈",
  "/stations": "⚡",
  "/overloads": "⚠️",
  "/sessions": "🔌",
  "/admin/users": "👥",
  "/data-administration": "🗄️",
};

/**
 * Server-rendered sidebar used only as the Suspense fallback while the real NavLinks streams in.
 */
export function StaticNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Primary" className="py-2">
      <ul className="space-y-1">
        {items.map((item) => {
          const icon = item.icon || ICONS[item.href] || "•";
          return (
            <li key={item.href}>
              {item.ready ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted hover:text-ink hover:bg-panel-elevated/70"
                >
                  <span className="text-sm opacity-70">{icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted/50"
                  aria-disabled="true"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm opacity-50">{icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className="rounded bg-panel-elevated px-1.5 py-0.5 text-[10px] text-muted">Soon</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
