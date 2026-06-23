import type { ReactNode } from "react";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export const Tabs = <T extends string>({
  value,
  items,
  onChange,
  className = "",
}: {
  value: T;
  items: Array<TabItem<T>>;
  onChange: (value: T) => void;
  className?: string;
}) => (
  <div className={["octo-ui-tabs", className].filter(Boolean).join(" ")} role="tablist">
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        role="tab"
        aria-selected={item.value === value}
        className={item.value === value ? "active" : ""}
        disabled={item.disabled}
        onClick={() => onChange(item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
);
