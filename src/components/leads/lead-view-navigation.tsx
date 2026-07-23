import Link from "next/link";

type LeadView = "analysis" | "outside-analysis";

interface LeadViewNavigationProps {
  activeView: LeadView;
}

const views: readonly {
  href: string;
  id: LeadView;
  label: string;
}[] = [
  {
    href: "/leads",
    id: "analysis",
    label: "Para análise",
  },
  {
    href: "/leads/outside-analysis",
    id: "outside-analysis",
    label: "Fora da análise",
  },
];

export function LeadViewNavigation({
  activeView,
}: LeadViewNavigationProps) {
  return (
    <nav
      aria-label="Visões de leads"
      className="border-b border-[oklch(82%_0.025_82)]"
    >
      <div className="flex flex-wrap gap-x-8">
        {views.map((view) => {
          const isCurrent = view.id === activeView;

          return (
            <Link
              key={view.id}
              href={view.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`relative inline-flex min-h-12 items-center px-1 pt-1 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none ${
                isCurrent
                  ? "text-[oklch(31%_0.09_174)] after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:bg-[oklch(45%_0.105_174)]"
                  : "text-[oklch(48%_0.025_252)] hover:text-[oklch(24%_0.035_252)]"
              }`}
            >
              {view.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
