/**
 * Presentational helpers for loading, error, and empty states shared by pages.
 */
import type { ReactNode } from 'react';

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return <div className="status status--loading">{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="status status--error">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message = 'No records found.' }: { message?: string }) {
  return <div className="status status--empty">{message}</div>;
}

interface PageProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">{title}</h1>
          {subtitle ? <p className="page__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
