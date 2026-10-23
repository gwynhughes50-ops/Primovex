// A member of staff has sent a problem or an idea through the Orb (issue_reports). The System Admin is told straight away: a
// notification in the app, which also reaches their phone through pushOnNotification. Only ever written here, on the server.

const KIND_TITLE = { problem: "Problem reported", look: "Something confusing reported", idea: "Idea suggested" };

// The notification for one administrator. One per report and person (the id is fixed), so a repeat run changes nothing.
function buildIssueNotification({ reportId, report, adminUid }) {
  const who = String(report.reporterName || "A member of staff").slice(0, 60);
  const where = report.route ? ` (${report.route})` : "";
  const text = String(report.message || "").replace(/\s+/g, " ").trim();
  return {
    id: `issue-${reportId}-${adminUid}`,
    data: {
      recipientUid: adminUid,
      title: `${KIND_TITLE[report.kind] || "Report"}: ${who}`,
      message: `${text.length > 160 ? `${text.slice(0, 157)}...` : text}${where}`,
      module: "system",
      kind: "issue-report",
      priority: report.kind === "problem" ? "high" : "routine",
      actionUrl: "/developer-centre",
      read: false,
      status: "open",
      automated: true,
      createdByName: "Primovex",
    },
  };
}

async function notifyIssueReport({ db, FieldValue, reportId, report }) {
  if (!reportId || !report) return { notified: 0 };
  const admins = await db.collection("users").where("role", "==", "System Admin").limit(10).get();
  let notified = 0;
  for (const admin of admins.docs) {
    const profile = admin.data() || {};
    if (profile.active === false || admin.id === report.reporterUid) continue; // an administrator is not told about their own report
    const { id, data } = buildIssueNotification({ reportId, report, adminUid: admin.id });
    try {
      await admin.ref.collection("notifications").doc(id).create({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      notified += 1;
    } catch (error) {
      if (!(error?.code === 6 || /already exists/i.test(String(error?.message)))) throw error;
    }
  }
  return { notified };
}

module.exports = { buildIssueNotification, notifyIssueReport, KIND_TITLE };
