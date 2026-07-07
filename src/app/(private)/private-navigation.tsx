"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/leads", label: "Leads" },
  { href: "/imports", label: "Importações" },
] as const;

export function PrivateNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="ml-auto lg:ml-0 lg:mt-14"
    >
      <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:block">
        {navigationItems.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="lg:mt-2 first:lg:mt-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="group flex min-h-11 items-center gap-3 border-b border-[oklch(48%_0.065_246)] px-1 py-2 text-sm font-bold transition-colors hover:border-[oklch(77%_0.09_174)] hover:text-[oklch(77%_0.09_174)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)] lg:border-b-0 lg:border-l lg:px-4 lg:py-3 motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className={
                    current
                      ? "size-1.5 rounded-full bg-[oklch(77%_0.09_174)]"
                      : "size-1.5 rounded-full border border-[oklch(58%_0.055_246)]"
                  }
                />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
