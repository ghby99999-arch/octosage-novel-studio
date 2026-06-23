import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export const Card = ({
  title,
  description,
  actions,
  className = "",
  children,
  ...props
}: CardProps) => (
  <section className={["octo-card", className].filter(Boolean).join(" ")} {...props}>
    {title || description || actions ? (
      <header className="octo-card-head">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="octo-card-actions">{actions}</div> : null}
      </header>
    ) : null}
    <div className="octo-card-body">{children}</div>
  </section>
);
