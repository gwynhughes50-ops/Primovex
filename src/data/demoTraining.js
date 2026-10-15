import { addMonths, dateKey } from "@/modules/training/training";

// Made-up staff and courses for Demo mode, with dates relative to today so the traffic lights always show a mix.
export function demoTraining(now = new Date()) {
  const ago = (months) => dateKey(new Date(now.getFullYear(), now.getMonth() - months, now.getDate()));
  const courses = [
    { id: "c-ig", name: "Information governance", category: "All staff", intervalMonths: 24, order: 0, active: true },
    { id: "c-fire", name: "Fire safety", category: "All staff", intervalMonths: 24, order: 1, active: true },
    { id: "c-mh", name: "Manual handling", category: "All staff", intervalMonths: 24, order: 2, active: true },
    { id: "c-bls", name: "Basic life support", category: "Clinical", intervalMonths: 12, order: 3, active: true },
    { id: "c-sg3", name: "Safeguarding level 3", category: "Clinical", intervalMonths: 36, order: 4, active: true },
    { id: "c-imm", name: "Immunisation", category: "Clinical", intervalMonths: 12, order: 5, active: true },
    { id: "c-care", name: "Care navigation", category: "Admin", intervalMonths: 0, order: 6, active: true },
  ];
  const people = [
    { id: "p-demo-nurse", name: "Nina Nurse", jobRole: "Nurse", group: "clinical", uid: "", active: true },
    { id: "p-demo-hca", name: "Hayley HCA", jobRole: "HCA", group: "clinical", uid: "", active: true },
    { id: "p-demo-gp", name: "Dr Gareth Practice", jobRole: "General Practitioner", group: "clinical", uid: "", active: true },
    { id: "p-demo-admin", name: "Alex Admin", jobRole: "Admin", group: "admin", uid: "", active: true },
    { id: "p-demo-pca", name: "Pat Care-Advisor", jobRole: "PCA", group: "admin", uid: "", active: true },
    { id: "p-demo-care", name: "Chris Caretaker", jobRole: "Caretaker", group: "support", uid: "", active: true },
  ];
  const rec = (personId, courseId, monthsAgo, extra = {}) => ({ personId, courseId, completedOn: ago(monthsAgo), dueOn: "", status: "", ...extra });
  const records = [
    rec("p-demo-nurse", "c-ig", 6), rec("p-demo-nurse", "c-fire", 20), rec("p-demo-nurse", "c-mh", 4), rec("p-demo-nurse", "c-bls", 11), rec("p-demo-nurse", "c-sg3", 10), rec("p-demo-nurse", "c-imm", 14),
    rec("p-demo-hca", "c-ig", 3), rec("p-demo-hca", "c-fire", 3), rec("p-demo-hca", "c-bls", 5), rec("p-demo-hca", "c-imm", 7),
    rec("p-demo-gp", "c-ig", 10), rec("p-demo-gp", "c-bls", 9), rec("p-demo-gp", "c-sg3", 30), rec("p-demo-gp", "c-imm", 0, { status: "not-required", completedOn: "" }),
    rec("p-demo-admin", "c-ig", 22), rec("p-demo-admin", "c-fire", 8), rec("p-demo-admin", "c-mh", 8), rec("p-demo-admin", "c-care", 40),
    rec("p-demo-pca", "c-ig", 2), rec("p-demo-pca", "c-fire", 25), rec("p-demo-pca", "c-care", 1),
    rec("p-demo-care", "c-fire", 5), rec("p-demo-care", "c-mh", 1, { status: "on-leave", completedOn: "" }),
  ].map((r) => ({ ...r, id: `${r.personId}_${r.courseId}`, group: people.find((p) => p.id === r.personId).group, ownerUid: "" }));
  return { courses, people, records };
}
