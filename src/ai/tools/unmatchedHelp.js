import { hasCapability } from "../../core/identity/capabilities";

// When the Orb doesn't understand, it says what it CAN do, with a few things to tap that suit what
// this person is allowed to do, instead of a dead end. Pure, so it can be tested.

const EXAMPLES = [
  { capability: "inventory.read", ask: "Which stock is low?" },
  { capability: "inventory.write", ask: "I've just used one adrenaline from the store cupboard" },
  { capability: "temperature.read", ask: "Are all fridges OK today?" },
  { capability: "operations.read", ask: "What needs attention today?" },
  { capability: null, ask: "Report a significant event" },
  { capability: "inventory.read", ask: "Where are the blue needles?" },
  { capability: "dashboard.read", ask: "How do I add a new product to stock?" },
];

export function buildUnmatchedHelp(capabilities = []) {
  const allowed = EXAMPLES.filter((e) => !e.capability || hasCapability(capabilities, e.capability));
  // one from each different area first (the list is ordered that way), then fill up
  const followUps = allowed.slice(0, 4).map((e) => e.ask);
  const can = [];
  if (hasCapability(capabilities, "inventory.read")) can.push("stock levels, where things are and expiry dates");
  if (hasCapability(capabilities, "inventory.write")) can.push("record stock you've used or ask for a reorder");
  if (hasCapability(capabilities, "temperature.read")) can.push("fridge temperatures");
  if (hasCapability(capabilities, "operations.read")) can.push("rooms, cleaning, equipment and maintenance");
  can.push("report a significant event", "give step-by-step help");
  const list = can.length > 1 ? `${can.slice(0, -1).join(", ")} and ${can[can.length - 1]}` : can[0];
  return {
    answer: `I didn't understand that one, and I haven't changed anything. I can ${list}. Try one of these, or ask it a different way.`,
    followUps,
  };
}
