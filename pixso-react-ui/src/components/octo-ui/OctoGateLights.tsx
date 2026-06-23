export type OctoGateLight = {
  id: string;
  label: string;
  title?: string;
  state?: "pass" | "fail" | "running" | "pending";
};

export const OctoGateLights = ({
  lights,
  title,
  className = "",
}: {
  lights: OctoGateLight[];
  title?: string;
  className?: string;
}) => (
  <div className={["octo-ui-gate-lights", className].filter(Boolean).join(" ")} role="list" title={title}>
    {lights.map((light) => (
      <span
        key={light.id}
        className={["octo-ui-gate-light", light.state || "pending"].join(" ")}
        role="listitem"
        title={light.title || light.label}
        aria-label={`${light.label}：${light.state || "pending"}`}
      >
        <i />
        <b>{light.label}</b>
      </span>
    ))}
  </div>
);
