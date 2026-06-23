import { createElement, forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type OctoBookCardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "button";
  type?: "button" | "submit" | "reset";
  create?: boolean;
};

export const OctoBookCard = forwardRef<HTMLElement, OctoBookCardProps>(({
  as = "article",
  create = false,
  className = "",
  type,
  ...props
}, ref) => createElement(as, {
  ...props,
  ref,
  type: as === "button" ? (type || "button") : undefined,
  className: ["octo-ui-book-card", create ? "create" : "", className].filter(Boolean).join(" "),
}));

OctoBookCard.displayName = "OctoBookCard";
