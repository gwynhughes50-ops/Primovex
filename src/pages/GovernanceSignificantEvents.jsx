import SignificantEventsView from "@/modules/governance/components/SignificantEventsView";

// Significant events on the desktop. Anyone signed in can reach it: reporting is open to everyone,
// and what each person can see inside is decided by their permissions and the database rules.
export default function GovernanceSignificantEvents() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <SignificantEventsView variant="desktop" />
    </div>
  );
}
