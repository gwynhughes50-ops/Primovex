function plural(count, singular, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function buildDailyBrief(context = {}) {
  const name = context.firstName || "there";
  const counts = context.notificationsSummary?.counts || {};
  const governance = context.governanceMetrics || {};
  const connect = context.connectIntelligence || {};
  const stockItems = Array.isArray(context.stockItems) ? context.stockItems : [];
  const lowStock = stockItems.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0));
  const recommendations = context.recommendations || [];
  const highest = recommendations[0];

  const lines = [];
  lines.push(`Good morning ${name}.`);

  const urgentCount = Number(counts.critical || 0) + Number(governance.overdue || 0) + Number(connect.critical?.length || 0);
  if (urgentCount > 0) {
    lines.push(`${plural(urgentCount, "urgent item")} should be reviewed first.`);
  } else {
    lines.push("No critical operational risks are currently detected.");
  }

  if (Number(governance.open || 0) > 0) {
    lines.push(`${plural(governance.open, "governance case")} open, with ${governance.dueWeek || 0} due this week.`);
  } else {
    lines.push("Governance case workload is quiet.");
  }

  if (connect.headline) {
    lines.push(connect.headline);
  }

  if (lowStock.length > 0) {
    lines.push(`${plural(lowStock.length, "stock item")} at or below minimum level.`);
  } else {
    lines.push("No low stock pressure detected from the current inventory view.");
  }

  if (highest) {
    lines.push(`Recommended focus: ${highest.title}.`);
  }

  const estimatedMinutes = recommendations.reduce((sum, item) => {
    const match = String(item.estimate || "").match(/(\d+)/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);

  return {
    title: "MedAI Daily Brief",
    headline: urgentCount > 0 ? "Action required today" : "Practice operating steadily",
    lines,
    estimatedAdminTime: estimatedMinutes > 0 ? `${estimatedMinutes} mins` : "Low",
    recommendedFocus: highest?.title || "Maintain routine monitoring",
  };
}
