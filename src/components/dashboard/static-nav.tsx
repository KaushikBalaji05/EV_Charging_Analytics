import Link from "next/link";
import type { NavItem } from "@/components/dashboard/nav-links";

/**
 * Server-rendered sidebar used only as the Suspense fallback while the real NavLinks streams in.
 * NavLinks reads the current URL (usePathname), which is request-time data on dynamic routes such as
 * /stations/[id], so it must not be rendered outside a Suspense boundary, and a fallback is outside one.
 */
export function StaticNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Primary">
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            {item.ready ? (
              <Link href={item.href} className="block rounded px-3 py-2 text-sm text-ink hover:bg-paper">{item.label}</Link>
            ) : (
              <span className="flex items-center justify-between rounded px-3 py-2 text-sm text-muted/70" aria-disabled="true">
                {item.label}
                <span className="text-xs">Soon</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
