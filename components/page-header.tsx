import type { ReactNode } from "react";

/** Page title row used by every console page: title, one-line context, optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex animate-rise flex-wrap items-end justify-between gap-4 px-8 pt-6 pb-2">
      <div>
        <h1 className="text-[26px] leading-tight font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
