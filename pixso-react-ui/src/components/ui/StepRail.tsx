import type { ReactNode } from "react";

export type StepRailItem = {
  key: string;
  label: ReactNode;
  state?: "done" | "running" | "wait" | "fail";
};

export const StepRail = ({ items, className = "" }: { items: StepRailItem[]; className?: string }) => (
  <div className={["octo-step-rail", className].filter(Boolean).join(" ")}>
    {items.map((item, index) => (
      <span className={item.state || "wait"} key={item.key}>
        <b>{item.state === "done" ? "OK" : item.state === "running" ? "..." : item.state === "fail" ? "!" : index + 1}</b>
        {item.label}
      </span>
    ))}
  </div>
);
