import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="mb-3 mt-2 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="hero-greeting font-display text-3xl font-800 leading-tight text-ink drop-shadow-light">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm font-600 text-ink-soft">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
