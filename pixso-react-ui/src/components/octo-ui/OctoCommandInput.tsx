import type { FormHTMLAttributes, ReactNode } from "react";

export type OctoCommandInputProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onChange"> & {
  value: string;
  placeholder?: string;
  actionLabel?: ReactNode;
  inputLabel: string;
  onInputBlur?: () => void;
  onValueChange: (value: string) => void;
};

export const OctoCommandInput = ({
  value,
  placeholder,
  actionLabel = "执行",
  inputLabel,
  onInputBlur,
  onValueChange,
  className = "",
  ...props
}: OctoCommandInputProps) => (
  <form className={["octo-ui-command-input", className].filter(Boolean).join(" ")} {...props}>
    <input
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onBlur={onInputBlur}
      placeholder={placeholder}
      aria-label={inputLabel}
    />
    <button type="submit">{actionLabel}</button>
  </form>
);
