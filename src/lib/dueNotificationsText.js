// Plain-English result of running the due-date notification job, from its
// counts: { considered, created, alreadySent, skippedInactive }.
export function describeDueRun(result = {}) {
  const { considered = 0, created = 0, alreadySent = 0, skippedInactive = 0 } = result;
  if (!considered) return "Nothing is due within two days or overdue, so no notifications were needed.";
  const parts = [];
  parts.push(created ? `Sent ${created} new notification${created === 1 ? "" : "s"}.` : "No new notifications were needed.");
  if (alreadySent) parts.push(`${alreadySent} ${alreadySent === 1 ? "was" : "were"} already sent earlier.`);
  if (skippedInactive) parts.push(`${skippedInactive} ${skippedInactive === 1 ? "was" : "were"} skipped because the account is deactivated or missing.`);
  return parts.join(" ");
}
