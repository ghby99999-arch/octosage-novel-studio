import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ScoreLike = {
  key?: string;
  label?: string;
  value?: number;
};

const normalizeScore = (value: unknown) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
};

export const QualityScoreChartImpl = ({
  scores = [],
  aiTaste,
}: {
  scores?: ScoreLike[];
  aiTaste?: number | null;
}) => {
  const rows = [
    ...scores.map((score) => ({
      name: String(score.label || score.key || "评分").slice(0, 8),
      value: normalizeScore(score.value),
    })),
    aiTaste !== null && aiTaste !== undefined ? { name: "AI味自然度", value: normalizeScore(aiTaste) } : null,
  ].filter(Boolean) as Array<{ name: string; value: number }>;

  if (!rows.length) return null;

  return (
    <div className="octo-quality-chart" aria-label="质量分数图表">
      <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 28)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 14, bottom: 4, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={76} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [`${value}`, "分数"]} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--octo-accent)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
