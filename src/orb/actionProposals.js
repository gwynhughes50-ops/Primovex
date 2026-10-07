import { hasCapability } from "../core/identity/capabilities";

// When the Orb is asked to DO something (message a team, raise a reorder), it never does it
// straight away. It prepares a proposal: exactly what would change, shown to the person on a
// card with Confirm and Cancel. Nothing happens until they confirm, a proposal expires after a
// few minutes, and it can only be run once. Pure (no React, no Firestore).

export const PROPOSAL_TTL_MS = 15 * 60 * 1000;

let counter = 0;
const newId = () => globalThis.crypto?.randomUUID?.() || `orb-proposal-${Date.now()}-${(counter += 1)}`;

export function createProposal({ kind, title, lines = [], requiredCapability = null, params = {}, confirmLabel = "Confirm", now = Date.now() }) {
  return {
    id: newId(),
    kind,
    title,
    lines,
    requiredCapability,
    params,
    confirmLabel,
    status: "proposed", // proposed -> working -> done | failed | cancelled | expired
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
    result: "",
  };
}

// Why a proposal cannot be run right now, or "" if it can.
export function proposalProblem(proposal, { capabilities = [], now = Date.now() } = {}) {
  if (!proposal) return "There is nothing to confirm.";
  if (proposal.status === "working") return "That is already being done.";
  if (proposal.status === "done") return "That has already been done.";
  if (proposal.status === "cancelled") return "That was cancelled.";
  if (proposal.status === "failed") return "That didn't work. Ask the Orb again to prepare a new one.";
  if (Date.parse(proposal.expiresAt) <= now) return "That was prepared a while ago. Ask the Orb again to prepare a fresh one.";
  if (proposal.requiredCapability && !hasCapability(capabilities, proposal.requiredCapability)) return "You don't have permission to do that.";
  return "";
}
