import { lazy, Suspense } from "react";
import type { ScoreLike } from "@/components/QualityScoreChartImpl";

const QualityScoreChartImpl = lazy(() =>
  import("@/components/QualityScoreChartImpl").then((module) => ({ default: module.QualityScoreChartImpl })),
);

export const QualityScoreChart = ({
  scores = [],
  aiTaste,
}: {
  scores?: ScoreLike[];
  aiTaste?: number | null;
}) => {
  if (!scores.length && aiTaste === null) return null;

  return (
    <Suspense fallback={<div className="octo-quality-chart loading">正在加载质量图表...</div>}>
      <QualityScoreChartImpl scores={scores} aiTaste={aiTaste} />
    </Suspense>
  );
};
