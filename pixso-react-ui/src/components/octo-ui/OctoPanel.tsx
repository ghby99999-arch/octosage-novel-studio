import type { HTMLAttributes, ReactNode } from "react";

export type OctoPanelProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export const OctoPanel = ({
  eyebrow,
  title,
  description,
  actions,
  className = "",
  children,
  ...props
}: OctoPanelProps) => (
  <section className={["octo-ui-panel", className].filter(Boolean).join(" ")} {...props}>
    {eyebrow || title || description || actions ? (
      <header className="octo-ui-panel-head">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          {title ? <strong>{title}</strong> : null}
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="octo-ui-panel-actions">{actions}</div> : null}
      </header>
    ) : null}
    <div className="octo-ui-panel-body">{children}</div>
  </section>
);
