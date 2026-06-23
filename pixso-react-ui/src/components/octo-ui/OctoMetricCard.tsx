import type { ReactNode } from "react";

export const OctoMetricCard = ({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) => (
  <div className="octo-ui-metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    {hint ? <em>{hint}</em> : null}
  </div>
);
