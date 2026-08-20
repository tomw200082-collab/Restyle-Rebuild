import Link from 'next/link';
import { cn } from '@/lib/utils';

export function DashboardTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  active: string;
  basePath: string;
}) {
  return (
    <nav aria-label="תצוגות" className="border-b border-line">
      <ul className="flex gap-6 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.key === tabs[0]?.key ? basePath : `${basePath}?tab=${tab.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 pb-3 text-body-sm transition-colors',
                  isActive
                    ? 'border-clay text-clay'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span className="ms-1.5 text-ink-subtle tabular">{tab.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
