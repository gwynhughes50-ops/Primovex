export function getAlertPriority(alert) {
  const sourceWeight = {
    temperature: 32,
    stock: 22,
    governance: 30,
    purchasing: 18,
  };

  let score = alert?.severity === "critical" ? 72 : 48;
  score += sourceWeight[alert?.source] || 12;

  if (alert?.type === "expired" || alert?.type === "temp_out") score += 14;
  if (alert?.type === "low_stock" || alert?.type === "temp_borderline") score += 8;

  return Math.max(1, Math.min(100, score));
}

export function getSuggestedAction(alert) {
  if (!alert) {
    return {
      label: "Review Operations Centre",
      detail: "Confirm there are no hidden risks or overdue tasks.",
      eta: "1 min",
    };
  }

  if (alert.source === "temperature") {
    return {
      label: alert.severity === "critical" ? "Investigate temperature excursion" : "Recheck temperature unit",
      detail: "Open the temperature log, confirm the reading and record any corrective action.",
      eta: "2 mins",
    };
  }

  if (alert.type === "expired") {
    return {
      label: "Remove expired stock",
      detail: "Quarantine the item, record disposal and replace if clinically required.",
      eta: "3 mins",
    };
  }

  if (alert.type === "low_stock") {
    return {
      label: "Raise purchase order",
      detail: "Check usage, supplier and minimum stock before ordering.",
      eta: "30 sec",
    };
  }

  return {
    label: "Review alert",
    detail: "Check the source record and confirm the next operational action.",
    eta: "1 min",
  };
}

export function buildOperationsIntelligence({ activeAlerts = [], resolvedAlerts = [], counts = {} } = {}) {
  const priorityAlerts = [...activeAlerts]
    .map((alert) => ({
      ...alert,
      aiScore: getAlertPriority(alert),
      suggestedAction: getSuggestedAction(alert),
    }))
    .sort((a, b) => b.aiScore - a.aiScore);

  const topPriority = priorityAlerts[0] || null;
  const status = counts.critical > 0 ? "critical" : counts.total > 0 ? "attention" : "stable";

  const statusLabel =
    status === "critical"
      ? "Critical action required"
      : status === "attention"
        ? "Operational risks need attention"
        : "Practice operating normally";

  const briefLines = [];
  if (counts.critical > 0) briefLines.push(`${counts.critical} critical item${counts.critical === 1 ? "" : "s"} require immediate review.`);
  if (counts.warn > 0) briefLines.push(`${counts.warn} warning${counts.warn === 1 ? "" : "s"} need action today.`);
  if (counts.stock > 0) briefLines.push(`${counts.stock} stock-related alert${counts.stock === 1 ? "" : "s"} are active.`);
  if (counts.temp > 0) briefLines.push(`${counts.temp} temperature alert${counts.temp === 1 ? "" : "s"} should be checked.`);
  if (counts.total === 0) briefLines.push("No active alerts are currently showing from stock or temperature monitoring.");
  briefLines.push(`${resolvedAlerts.length} alert${resolvedAlerts.length === 1 ? "" : "s"} have been resolved historically.`);

  const suggestedActions = priorityAlerts.slice(0, 4).map((alert) => ({
    id: alert.id,
    title: alert.suggestedAction.label,
    detail: alert.suggestedAction.detail,
    eta: alert.suggestedAction.eta,
    source: alert.source,
    score: alert.aiScore,
    alertTitle: alert.title,
  }));

  if (suggestedActions.length === 0) {
    suggestedActions.push({
      id: "daily-check",
      title: "Complete daily operational sweep",
      detail: "No active alerts are showing. Check tasks, purchasing and governance queues next.",
      eta: "2 mins",
      source: "operations",
      score: 12,
      alertTitle: "No active alerts",
    });
  }

  return {
    status,
    statusLabel,
    topPriority,
    priorityAlerts,
    briefLines,
    suggestedActions,
    riskScore: Math.min(100, counts.critical * 35 + counts.warn * 12 + counts.temp * 15 + counts.stock * 8),
  };
}
