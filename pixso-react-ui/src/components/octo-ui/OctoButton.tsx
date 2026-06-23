import { Button } from "@/components/ui/Button";
import type { ButtonProps } from "@/components/ui/Button";

export type OctoButtonProps = ButtonProps & {
  glow?: boolean;
};

export const OctoButton = ({ className = "", glow = false, ...props }: OctoButtonProps) => (
  <Button
    className={["octo-ui-button", glow ? "glow" : "", className].filter(Boolean).join(" ")}
    {...props}
  />
);
