import type { ReactNode } from "react";

type StatusPillTone = "neutral" | "running" | "success" | "warning" | "danger";

export const StatusPill = ({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: {
  tone?: StatusPillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) => (
  <span className={["octo-status-pill", `octo-status-pill-${tone}`, dot ? "with-dot" : "", className].filter(Boolean).join(" ")}>
    {dot ? <i aria-hidden="true" /> : null}
    {children}
  </span>
);
