// Made-up staff for Demo and Training mode (no real people or patterns): a fixed week, a split shift, alternate weeks, four long
// days, no unpaid break and zero hours, so every kind of pattern can be seen on screen.

const blocks = (...pairs) => pairs.map(([start, end]) => ({ start, end }));
const off = { blocks: [], breakMin: 0 };
const day = (start, end, breakMin) => ({ blocks: blocks([start, end]), breakMin });
const fiveDays = (d) => ({ mon: d, tue: d, wed: d, thu: d, fri: d, sat: off, sun: off });

const leave = (entitlement, taken, upcoming, remaining) => ({ unit: "hours", yearFrom: "2026-04-01", yearTo: "2027-03-31", entitlement, taken, upcoming, awaiting: 0, remaining, carriedOver: 0, asAt: "2026-10-16" });

// made-up leave groups and start dates, so the Annual leave page has something to show
const DEMO_LEAVE = {
  "demo-t1": { leaveGroup: "management", serviceFrom: "2002-04-01" },
  "demo-t2": { leaveGroup: "admin", serviceFrom: "2017-01-03" },
  "demo-t3": { leaveGroup: "admin", serviceFrom: "2014-10-06" },
  "demo-t4": { leaveGroup: "admin", serviceFrom: "2021-11-01" },
  "demo-t5": { leaveGroup: "clinical", serviceFrom: "2021-01-22" },
};

export function demoTimesheetStaff() {
  return [
    { id: "demo-t1", name: "Pat Manager", jobTitle: "Practice Manager", teams: ["Management"], contractType: "Full-Time", payrollNo: "101", startDate: "2002-04-01", active: true, uid: null, managerId: null, leave: leave(367.5, 245, 37.5, 85),
      patterns: [{ from: "2020-01-06", mode: "fixed", weeks: [fiveDays(day("08:30", "17:00", 60))] }] },
    { id: "demo-t2", name: "Rita Reception", jobTitle: "Patient Care Administrator", teams: ["PCA"], contractType: "Full-Time", payrollNo: "102", startDate: "2017-01-03", active: true, uid: null, managerId: "demo-t1", leave: leave(300, 120, 45, 135),
      patterns: [{ from: "2020-01-06", mode: "fixed", weeks: [fiveDays(day("08:00", "16:00", 30)), fiveDays(day("10:00", "18:30", 60))] }] },
    { id: "demo-t3", name: "Sam Secretary", jobTitle: "Medical Secretary", teams: ["Secretaries"], contractType: "Part-Time", payrollNo: "103", startDate: "2014-10-06", active: true, uid: null, managerId: "demo-t1", leave: leave(220, 100, 40, 80),
      patterns: [{ from: "2020-01-06", mode: "fixed", weeks: [{ mon: day("09:00", "15:00", 30), tue: day("09:00", "15:00", 30), wed: off, thu: day("09:00", "15:00", 30), fri: day("09:00", "13:00", 0), sat: off, sun: off }] }] },
    { id: "demo-t4", name: "Dev Dispenser", jobTitle: "Prescribing Clerk", teams: ["Prescribing"], contractType: "Full-Time", payrollNo: "104", startDate: "2021-11-01", active: true, uid: null, managerId: "demo-t1", leave: leave(255, 150, 37.5, 67.5),
      patterns: [{ from: "2020-01-06", mode: "fixed", weeks: [{ mon: { blocks: blocks(["07:30", "10:30"], ["13:00", "17:30"]), breakMin: 0 }, tue: day("08:00", "18:00", 30), wed: day("08:00", "18:00", 30), thu: day("08:00", "18:00", 30), fri: off, sat: off, sun: off }] }] },
    { id: "demo-t5", name: "Zoe Zero", jobTitle: "Bank Healthcare Assistant", teams: ["Clinicians"], contractType: "Zero Hours", payrollNo: "105", startDate: "2021-01-22", active: true, uid: null, managerId: "demo-t1", leave: leave(0, 0, 0, 0),
      patterns: [{ from: "2021-01-22", mode: "zero-hours", weeks: [] }] },
  ].map((p) => ({ ...p, ...(DEMO_LEAVE[p.id] || {}) }));
}
