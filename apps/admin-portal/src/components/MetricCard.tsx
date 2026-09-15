/** A single labelled metric tile used across dashboard-style pages. */

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="metric-card">
      <span className="metric-card__label">{label}</span>
      <span className="metric-card__value">{value}</span>
      {hint ? <span className="metric-card__hint">{hint}</span> : null}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}
