import { buildPriorityItem, sortByPriority } from "./priorityEngine";

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildNotificationRecommendations(summary = {}) {
  const counts = summary?.counts || {};
  const active = summary?.active || [];
  const recs = [];

  if (number(counts.critical) > 0) {
    recs.push(buildPriorityItem({
      id: "notifications-critical",
      domain: "Operations",
      title: "Review critical inbox items",
      summary: `${counts.critical} critical item${counts.critical === 1 ? "" : "s"} require immediate attention.`,
      action: "Open Inbox",
      score: 96,
      estimate: "2 mins",
      sourceUrl: "/notifications",
      reasons: ["Critical notifications are active", "Overdue items may escalate to managers"],
    }));
  }

  if (number(counts.high) > 0) {
    recs.push(buildPriorityItem({
      id: "notifications-high",
      domain: "Operations",
      title: "Clear high priority tasks",
      summary: `${counts.high} high priority item${counts.high === 1 ? " is" : "s are"} waiting.`,
      action: "Open Inbox",
      score: 78,
      estimate: "5 mins",
      sourceUrl: "/notifications",
      reasons: ["High priority queue is not empty"],
    }));
  }

  active.slice(0, 2).forEach((item, index) => {
    recs.push(buildPriorityItem({
      id: `notification-${item.id || index}`,
      domain: item.domain || "Operations",
      title: item.title || "Review assigned item",
      summary: item.body || item.summary || "Assigned item needs attention.",
      action: item.actionLabel || "Open",
      score: item.severity === "critical" ? 92 : item.severity === "high" ? 76 : 42,
      estimate: "1 min",
      sourceUrl: item.actionUrl || "/notifications",
      reasons: ["Assigned to the signed-in user"],
    }));
  });

  return recs;
}

export function buildGovernanceRecommendations(metrics = {}, prompts = []) {
  const recs = [];

  if (number(metrics.overdue) > 0) {
    recs.push(buildPriorityItem({
      id: "governance-overdue",
      domain: "Governance",
      title: "Review overdue governance cases",
      summary: `${metrics.overdue} case${metrics.overdue === 1 ? " is" : "s are"} overdue or due today.`,
      action: "Open Concerns",
      score: 95,
      estimate: "8 mins",
      sourceUrl: "/governance/concerns",
      reasons: ["Listening to People deadline risk", "Case health likely to deteriorate"],
    }));
  }

  if (number(metrics.listeningMissing) > 0) {
    recs.push(buildPriorityItem({
      id: "governance-listening",
      domain: "Governance",
      title: "Offer Listening Discussions",
      summary: `${metrics.listeningMissing} open case${metrics.listeningMissing === 1 ? " has" : "s have"} no Listening Discussion offer recorded.`,
      action: "Open Concerns",
      score: 82,
      estimate: "5 mins",
      sourceUrl: "/governance/concerns",
      reasons: ["Listening discussion is a core workflow step", "Patient-centred communication standard"],
    }));
  }

  if (number(metrics.high) > 0) {
    recs.push(buildPriorityItem({
      id: "governance-high",
      domain: "Governance",
      title: "Keep high priority cases visible",
      summary: `${metrics.high} high priority case${metrics.high === 1 ? "" : "s"} should remain under manager review.`,
      action: "Review Case Health",
      score: 77,
      estimate: "4 mins",
      sourceUrl: "/governance/concerns",
      reasons: ["High traffic-light priority", "Potential clinical, external or patient safety complexity"],
    }));
  }

  if (!recs.length && prompts.length) {
    recs.push(buildPriorityItem({
      id: "governance-routine",
      domain: "Governance",
      title: "Governance currently stable",
      summary: prompts[0],
      action: "Maintain routine updates",
      score: 18,
      estimate: "0 mins",
      sourceUrl: "/governance/concerns",
      reasons: ["No urgent governance trigger detected"],
    }));
  }

  return recs;
}

export function buildConnectRecommendations(connectIntelligence = {}) {
  return (connectIntelligence?.recommendations || []).map((item) => buildPriorityItem({
    id: `connect-${item.id}`,
    domain: "Connect",
    title: item.title,
    summary: item.reason,
    action: item.action,
    score: item.score,
    estimate: item.estimate,
    sourceUrl: "/connect",
    reasons: [item.reason, item.action],
  }));
}

export function buildInventoryRecommendations(stockItems = []) {
  const items = Array.isArray(stockItems) ? stockItems : [];
  const low = items.filter((item) => number(item.current_stock) <= number(item.min_stock));
  const criticalLow = low.filter((item) => number(item.current_stock) <= Math.max(0, number(item.min_stock) / 2));
  const recs = [];

  if (criticalLow.length) {
    const item = criticalLow[0];
    recs.push(buildPriorityItem({
      id: "inventory-critical-low",
      domain: "Inventory",
      title: `Reorder ${item.name || "critical stock"}`,
      summary: `${item.name || "An item"} is significantly below minimum stock level.`,
      action: "Open Inventory",
      score: 86,
      estimate: "2 mins",
      sourceUrl: "/inventory",
      reasons: [`Current stock ${item.current_stock ?? 0}`, `Minimum stock ${item.min_stock ?? 0}`],
    }));
  } else if (low.length) {
    recs.push(buildPriorityItem({
      id: "inventory-low-stock",
      domain: "Inventory",
      title: "Review low stock items",
      summary: `${low.length} stock item${low.length === 1 ? " is" : "s are"} at or below minimum level.`,
      action: "Open Inventory",
      score: 58,
      estimate: "3 mins",
      sourceUrl: "/inventory",
      reasons: ["Stock level is at or below configured threshold"],
    }));
  }

  return recs;
}

export function buildMedAIRecommendations(context = {}) {
  return sortByPriority([
    ...buildNotificationRecommendations(context.notificationsSummary),
    ...buildGovernanceRecommendations(context.governanceMetrics, context.governancePrompts),
    ...buildConnectRecommendations(context.connectIntelligence),
    ...buildInventoryRecommendations(context.stockItems),
  ]).slice(0, 8);
}
