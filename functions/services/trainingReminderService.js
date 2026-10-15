// Training reminders (the logic of src/modules/training/training.js, kept in step with it by tests/training.test.js).
//   Every day: each person whose training is newly within 60 days of running out, or has newly run out, is told once, in one
//   notification that lists up to three courses (their own notification: it can show on their phone's lock screen).
//   Every Monday: the people who look after staff training are sent a count (never names): how many courses are overdue and due soon.
// Only people still working here, and only dated records; a blank is a gap to fill, not something that has expired.

const DUE_SOON_DAYS = 60;
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
}
function addMonths(key, months) {
  const date = parseKey(key);
  if (!date) return "";
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + Number(months || 0), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return dateKey(target);
}
function dueOf(record, course) {
  if (!record) return "";
  if (parseKey(record.dueOn)) return record.dueOn;
  const months = Number(course?.intervalMonths) || 0;
  return record.completedOn && months > 0 ? addMonths(record.completedOn, months) : "";
}
function daysUntil(key, now) {
  const date = parseKey(key);
  if (!date) return null;
  return Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
}
// "overdue" | "due-soon" | "" for a record
function lightOf(record, course, now) {
  if (!record || record.status === "not-required" || record.status === "on-leave") return "";
  const due = dueOf(record, course);
  if (!due) return "";
  const days = daysUntil(due, now);
  if (days === null) return "";
  if (days < 0) return "overdue";
  return days <= DUE_SOON_DAYS ? "due-soon" : "";
}

// every dated item that is overdue or due soon, for people still working here
function reminderItems({ people = [], courses = [], records = [], now = new Date() }) {
  const courseById = new Map(courses.filter((c) => c.active !== false).map((c) => [c.id, c]));
  const personById = new Map(people.filter((p) => p.active !== false).map((p) => [p.id, p]));
  const items = [];
  for (const record of records) {
    const person = personById.get(record.personId);
    const course = courseById.get(record.courseId);
    if (!person || !course) continue;
    const kind = lightOf(record, course, now);
    if (!kind) continue;
    const due = dueOf(record, course);
    items.push({ recordId: record.id, personId: person.id, uid: person.uid || "", group: person.group, courseName: course.name, due, days: daysUntil(due, now), kind, notified: record.notified || {} });
  }
  return items.sort((a, b) => a.days - b.days);
}

const ukDate = (key) => key.split("-").reverse().join("/");
const list = (items) => {
  const shown = items.slice(0, 3).map((i) => `${i.courseName} (${i.kind === "overdue" ? `ran out ${ukDate(i.due)}` : `runs out ${ukDate(i.due)}`})`);
  return `${shown.join("; ")}${items.length > 3 ? ` and ${items.length - 3} more` : ""}`;
};

// What to tell one person today: only items not yet told for this due date. Returns null when there is nothing new.
function personNotice(items) {
  const fresh = items.filter((i) => (i.kind === "overdue" ? i.notified.overdue !== i.due : i.notified.soon !== i.due));
  if (!fresh.length) return null;
  const overdue = fresh.filter((i) => i.kind === "overdue");
  const soon = fresh.filter((i) => i.kind === "due-soon");
  return {
    fresh,
    title: overdue.length ? "Training overdue" : "Training due soon",
    message: [overdue.length ? `Overdue: ${list(overdue)}.` : "", soon.length ? `Coming up: ${list(soon)}.` : ""].filter(Boolean).join(" "),
    priority: overdue.length ? "high" : "routine",
  };
}

const noteBase = { module: "operations", kind: "training-due", read: false, status: "open", automated: true, createdByName: "Primovex" };

// Run the daily reminders. `now` and the Firestore handles are given so it can be tested.
async function runTrainingReminders({ db, FieldValue, now = new Date(), managers = [] }) {
  const [peopleSnap, coursesSnap, recordsSnap] = await Promise.all([db.collection("training_people").get(), db.collection("training_courses").get(), db.collection("training_records").get()]);
  const people = peopleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const courses = coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const records = recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const items = reminderItems({ people, courses, records, now });

  const told = { people: 0, managers: 0 };
  const byUid = new Map();
  for (const item of items) if (item.uid) byUid.set(item.uid, [...(byUid.get(item.uid) || []), item]);
  for (const [uid, mine] of byUid) {
    const notice = personNotice(mine);
    if (!notice) continue;
    await db.collection("users").doc(uid).collection("notifications").add({ ...noteBase, recipientUid: uid, title: notice.title, message: notice.message, priority: notice.priority, actionUrl: "/", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    for (const item of notice.fresh) {
      await db.collection("training_records").doc(item.recordId).update({ notified: { ...item.notified, [item.kind === "overdue" ? "overdue" : "soon"]: item.due } });
    }
    told.people += 1;
  }

  // the weekly count for whoever looks after staff training (Mondays)
  if (now.getDay() === 1) {
    for (const manager of managers) {
      const scope = items.filter((i) => manager.scope === "all" || i.group === "clinical");
      const overdue = scope.filter((i) => i.kind === "overdue").length;
      const soon = scope.filter((i) => i.kind === "due-soon").length;
      if (!overdue && !soon) continue;
      const people = new Set(scope.map((i) => i.personId)).size;
      await db.collection("users").doc(manager.uid).collection("notifications").add({
        ...noteBase, kind: "training-weekly", recipientUid: manager.uid, title: "Staff training this week",
        message: `${overdue} ${overdue === 1 ? "course is" : "courses are"} overdue and ${soon} ${soon === 1 ? "is" : "are"} due in the next 60 days, across ${people} ${people === 1 ? "person" : "people"}.`,
        priority: overdue ? "high" : "routine", actionUrl: "/training", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      told.managers += 1;
    }
  }
  return told;
}

module.exports = { addMonths, daysUntil, dueOf, lightOf, personNotice, reminderItems, runTrainingReminders, DUE_SOON_DAYS };
