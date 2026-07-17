export const MOBILE_INTENTS = Object.freeze({
  USE_STOCK: "USE_STOCK",
  ACTIVATE_SPACE: "ACTIVATE_SPACE",
  COMPLETE_CLEAN: "COMPLETE_CLEAN",
  REPORT_ISSUE: "REPORT_ISSUE",
  RECORD_CHECK: "RECORD_CHECK",
  ASK_ORB: "ASK_ORB",
});

export function createMobileIntent(type, payload = {}, context = {}) {
  return {
    id: `MI-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    type,
    payload,
    context: {
      userId: context.userId || null,
      role: context.role || null,
      spaceId: context.spaceId || null,
      source: context.source || "mobile-touch",
    },
    createdAt: new Date().toISOString(),
    status: "ready",
  };
}
