export type OctoProgressStep = {
  id: string;
  label: string;
  detail?: string;
  state?: "done" | "running" | "pending" | "fail";
};

export const OctoProgressFlow = ({ steps }: { steps: OctoProgressStep[] }) => (
  <div className="octo-ui-progress-flow">
    {steps.map((step, index) => (
      <span key={step.id} className={["octo-ui-progress-step", step.state || "pending"].join(" ")}>
        <i>{index + 1}</i>
        <b>{step.label}</b>
        {step.detail ? <em>{step.detail}</em> : null}
      </span>
    ))}
  </div>
);
