import { buildDailyBrief } from "./dailyBriefEngine";
import { buildMedAIInsights } from "./insightEngine";
import { buildMedAIRecommendations } from "./recommendationEngine";

export function buildMedAIContext(input = {}) {
  const recommendations = buildMedAIRecommendations(input);
  const brief = buildDailyBrief({ ...input, recommendations });
  const insights = buildMedAIInsights({ ...input, recommendations });

  const critical = recommendations.filter((item) => item.priority === "critical").length;
  const high = recommendations.filter((item) => item.priority === "high").length;
  const medaiScore = Math.max(0, Math.min(100, 100 - critical * 14 - high * 8 - Math.max(0, recommendations.length - 4) * 2));

  return {
    generatedAt: new Date().toISOString(),
    brief,
    insights,
    recommendations,
    score: Math.round(medaiScore),
    status: critical > 0 ? "critical" : high > 0 ? "attention" : "stable",
  };
}

export function getMedAIStatusLabel(status) {
  if (status === "critical") return "Action required";
  if (status === "attention") return "Attention";
  return "Stable";
}
