"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

interface PrivateNavigationProps {
  readonly importsHref: "/imports" | "/imports/batches";
  readonly showCosts: boolean;
  readonly showImports: boolean;
  readonly showLeads: boolean;
}

export function PrivateNavigation({
  importsHref,
  showCosts,
  showImports,
  showLeads,
}: PrivateNavigationProps) {
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuState, setMenuState] = useState({ pathname, isOpen: false });
  const menuIsOpen = menuState.pathname === pathname && menuState.isOpen;
  if (menuState.pathname !== pathname) {
    setMenuState({ pathname, isOpen: false });
  }
  const visibleNavigationItems = [
    { href: "/inicio", label: "Início", description: "Atalhos para sua rotina" },
    showLeads ? { href: "/leads", label: "Leads", description: "Empresas e avaliações" } : null,
    showImports ? { href: importsHref, label: "Importações", description: "Envio e histórico de listas" } : null,
    showCosts ? { href: "/costs", label: "Custos", description: "Estimativas das análises" } : null,
    { href: "/ajuda", label: "Ajuda", description: "Como usar o Prospecta" },
  ].filter((item): item is { href: string; label: string; description: string } => item !== null);

  function isCurrent(href: string): boolean {
    return href.startsWith("/imports")
      ? pathname === "/imports" || pathname.startsWith("/imports/")
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  const currentItem = visibleNavigationItems.find((item) => isCurrent(item.href));

  return (
    <nav
      aria-label="Navegação principal"
      className="w-full lg:mt-10"
    >
      <button
        ref={menuButtonRef}
        type="button"
        aria-label={menuIsOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
        aria-expanded={menuIsOpen}
        aria-controls="private-navigation-links"
        onClick={() => setMenuState({ pathname, isOpen: !menuIsOpen })}
        className="flex min-h-11 w-full items-center gap-3 border border-[oklch(48%_0.065_246)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)] lg:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0" stroke="currentColor" strokeWidth="1.5">
          {menuIsOpen ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
        </svg>
        <span className="font-bold">Menu</span>
        <span className="ml-auto min-w-0 truncate text-[oklch(84%_0.025_246)]">{currentItem?.label}</span>
      </button>
      <ul id="private-navigation-links" className={`${menuIsOpen ? "mt-3 grid" : "hidden"} gap-1 lg:mt-0 lg:block`}>
        {visibleNavigationItems.map((item) => {
          const current = isCurrent(item.href);

          return (
            <li key={item.href} className="lg:mt-2 first:lg:mt-0">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-describedby={`navigation-description-${item.href.split("/")[1]}`}
                aria-current={current ? "page" : undefined}
                onClick={(event) => {
                  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  setMenuState({ pathname, isOpen: false });
                  if (menuIsOpen && pathname === item.href) menuButtonRef.current?.focus();
                }}
                className={`group flex min-h-11 items-center gap-3 border-b px-2 py-2 text-sm font-bold transition-colors hover:border-[oklch(77%_0.09_174)] hover:text-[oklch(77%_0.09_174)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)] lg:border-b-0 lg:border-l lg:px-4 lg:py-3 motion-reduce:transition-none ${
                  current
                    ? "border-[oklch(77%_0.09_174)] bg-[oklch(27%_0.06_246)] text-[oklch(94%_0.018_85)]"
                    : "border-[oklch(48%_0.065_246)]"
                }`}
                data-current={current ? "true" : undefined}
              >
                <span
                  aria-hidden="true"
                  className={
                    current
                      ? "size-1.5 rounded-full bg-[oklch(77%_0.09_174)]"
                      : "size-1.5 rounded-full border border-[oklch(58%_0.055_246)]"
                  }
                />
                <span>
                  <span className="block">{item.label}</span>
                  <span id={`navigation-description-${item.href.split("/")[1]}`} className="mt-1 block text-xs font-normal leading-5 text-[oklch(84%_0.025_246)]">{item.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
