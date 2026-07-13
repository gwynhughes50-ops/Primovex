export function buildMedAIInsights(context = {}) {
  const insights = [];
  const governance = context.governanceMetrics || {};
  const connect = context.connectIntelligence || {};
  const stockItems = Array.isArray(context.stockItems) ? context.stockItems : [];
  const lowStock = stockItems.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0));

  if (Number(governance.avgHealth || 100) < 85) {
    insights.push({
      id: "governance-health-drift",
      domain: "Governance",
      title: "Governance case health is drifting",
      body: `Average case health is ${governance.avgHealth}%. Review missing Listening Discussions, deadlines and learning actions.`,
      tone: "warning",
    });
  }

  if (connect.healthScore !== undefined && Number(connect.healthScore) < 90) {
    insights.push({
      id: "connect-health-drift",
      domain: "Connect",
      title: "Connected device health needs review",
      body: `Connect health is ${connect.healthScore}%. Check offline devices, out-of-range readings and batteries.`,
      tone: "warning",
    });
  }

  if (lowStock.length >= 3) {
    insights.push({
      id: "inventory-low-stock-cluster",
      domain: "Inventory",
      title: "Low stock cluster detected",
      body: `${lowStock.length} items are at or below minimum level. This may indicate ordering pressure rather than a single isolated shortage.`,
      tone: "warning",
    });
  }

  if (!insights.length) {
    insights.push({
      id: "platform-stable",
      domain: "Operations",
      title: "Operational picture is stable",
      body: "No cross-module deterioration detected. Continue routine monitoring.",
      tone: "success",
    });
  }

  return insights.slice(0, 4);
}
