"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  ready: boolean;
  adminOnly?: boolean;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          if (!item.ready) {
            return (
              <li key={item.href}>
                <span className="flex items-center justify-between rounded px-3 py-2 text-sm text-muted/70" aria-disabled="true">
                  {item.label}
                  <span className="text-xs">Soon</span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded px-3 py-2 text-sm ${
                  active ? "bg-charge-soft font-medium text-charge" : "text-ink hover:bg-paper"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
