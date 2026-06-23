import type { ReactNode } from "react";

export const Field = ({
  label,
  hint,
  as = "label",
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  as?: "label" | "div";
  className?: string;
  children: ReactNode;
}) => {
  const Component = as;
  return (
    <Component className={["octo-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      {children}
      {hint ? <em>{hint}</em> : null}
    </Component>
  );
};
