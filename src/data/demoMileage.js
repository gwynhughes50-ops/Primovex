// Made-up mileage data for Demo and Training mode (no real people, places or journeys).

const pad = (n) => String(n).padStart(2, "0");
const ago = (days) => { const d = new Date(Date.now() - days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const sites = [{ id: "main", name: "Main Surgery" }, { id: "branch", name: "Branch Surgery" }];
const places = [{ id: "hospital", name: "District Hospital", active: true }];
const claim = (id, uid, name, daysAgo, from, to, miles, status, extra = {}) => ({
  id, uid, staffId: `demo-${uid}`, staffName: name, managerUid: "demo-manager", date: ago(daysAgo), fromId: from.id, fromName: from.name, toId: to.id, toName: to.name,
  miles, returnTrip: true, vehicle: "car", purpose: "Meeting or training", note: "", status, ...extra,
});
const main = { id: "site:main", name: "Main Surgery" };
const branch = { id: "site:branch", name: "Branch Surgery" };
const hospital = { id: "place:hospital", name: "District Hospital" };

export function demoMileage() {
  return {
    me: { id: "demo-me", name: "Demo User", uid: "demo-me", managerUid: "demo-manager", managerId: "demo-m", active: true },
    sites, places,
    routes: [{ id: "r1", fromId: "site:branch", toId: "site:main", miles: 6.8 }, { id: "r2", fromId: "place:hospital", toId: "site:main", miles: 11.2 }],
    mine: [
      claim("dm-1", "demo-me", "Demo User", 3, main, hospital, 11.2, "submitted", { purpose: "Collecting or delivering supplies" }),
      claim("dm-2", "demo-me", "Demo User", 12, main, branch, 6.8, "approved"),
      claim("dm-3", "demo-me", "Demo User", 30, main, branch, 6.8, "approved", { returnTrip: false }),
    ],
    toApprove: [
      claim("da-1", "demo-n", "Nina Nurse", 2, main, branch, 6.8, "submitted"),
      claim("da-2", "demo-n", "Nina Nurse", 9, main, hospital, 11.2, "submitted", { purpose: "Collecting or delivering supplies" }),
    ],
  };
}
