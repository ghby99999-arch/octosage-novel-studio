import type { ReactNode } from "react";

export const Dialog = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className = "",
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}) => {
  if (!open) return null;
  return (
    <div className="octo-modal-backdrop" role="presentation">
      <div className={["octo-modal", "octo-dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true">
        <header className="octo-modal-head">
          <div>
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </div>
          <button type="button" className="octo-icon-button" aria-label="关闭" onClick={onClose}>x</button>
        </header>
        <div className="octo-dialog-body">{children}</div>
        {footer ? <footer className="octo-modal-actions">{footer}</footer> : null}
      </div>
    </div>
  );
};
