import { forwardRef, isValidElement } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
  type = "button",
  ...props
}, ref) => {
  const hasStructuredChildren = Array.isArray(children)
    ? children.some((child) => isValidElement(child))
    : isValidElement(children);

  return (
    <button
      ref={ref}
      type={type}
      className={["octo-btn", `octo-btn-${variant}`, `octo-btn-${size}`, className].filter(Boolean).join(" ")}
      {...props}
    >
      {icon ? <span className="octo-btn-icon">{icon}</span> : null}
      {hasStructuredChildren ? children : <span>{children}</span>}
    </button>
  );
});

Button.displayName = "Button";
