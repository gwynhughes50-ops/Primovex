import { createProposal } from "../../orb/actionProposals";
import {
  itemLabel, itemPlacements, kitGaps, looksIdentifying, parseLocateQuestion, parseStockRequest, parseTeamMessage,
  placeContents, resolvePlace, resolveStockItem, resolveTeam, buildPlaces, suggestStockItems,
} from "./stockAsk";
import { joinList, plural } from "../tools/answerWording";
import { unassignedQty, mainStoreName } from "../../lib/stockLocations";

// What the Orb says and proposes for the three stock requests: where something is, a message to a
// team, and a reorder or missing item. Pure: the data is passed in, so it can be tested.

const ask = (...questions) => questions.filter(Boolean);
const lines = (...parts) => parts.filter(Boolean).join("\n");
const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// ---- where is it / how many ------------------------------------------------------------------------------

export function buildLocateResult(input = {}, { items = [], kits = [] } = {}) {
  const parsed = parseLocateQuestion(input.question) || {};
  const itemQuery = String(input.item ?? parsed.item ?? "").trim();
  const placeQuery = String(input.place ?? parsed.place ?? "").trim();
  const places = buildPlaces({ items, kits });
  const placeNames = joinList(places.map((p) => p.name).slice(0, 6), 6);

  if (!itemQuery && !placeQuery) return { text: "Tell me what you're looking for, for example \"where are the blue needles?\" or \"what's in anaphylaxis box 3?\".", followUps: [] };

  let item = null;
  if (itemQuery) {
    const found = resolveStockItem(itemQuery, items);
    if (found.status === "none") {
      const near = suggestStockItems(itemQuery, items);
      if (near.length) return { text: lines(`I couldn't find “${itemQuery}”. Did you mean:`, ...near.map((i) => `• ${itemLabel(i)}`)), followUps: near.map((i) => (placeQuery ? `how many ${itemLabel(i)} are in ${placeQuery}` : `where is ${itemLabel(i)}`)), ambiguous: true };
      return { text: `I couldn't find any stock matching “${itemQuery}”. Try a different name, or part of it.`, followUps: [] };
    }
    if (found.status === "many") {
      const where = placeQuery ? ` in ${placeQuery}` : "";
      return {
        text: lines(`More than one product fits “${itemQuery}”. Which did you mean?`, ...found.items.map((i) => `• ${itemLabel(i)}`)),
        followUps: found.items.slice(0, 3).map((i) => (placeQuery ? `how many ${itemLabel(i)} are in ${placeQuery}` : `where is ${itemLabel(i)}`)),
        ambiguous: true,
        placeHint: where,
      };
    }
    item = found.item;
  }

  let place = null;
  let main = false;
  if (placeQuery) {
    const found = resolvePlace(placeQuery, places);
    if (found.status === "none") return { text: lines(`I couldn't find a place called “${placeQuery}”.`, placeNames ? `Places I know about include ${placeNames}.` : ""), followUps: [] };
    if (found.status === "many") {
      return { text: lines(`More than one place fits “${placeQuery}”. Which did you mean?`, ...found.places.map((p) => `• ${p.name}`)), followUps: found.places.slice(0, 3).map((p) => (item ? `how many ${itemLabel(item)} are in ${p.name}` : `what's in ${p.name}`)), ambiguous: true };
    }
    main = found.status === "main";
    place = found.place || null;
  }

  // one product at one place
  if (item && (place || main)) {
    const rows = itemPlacements(item);
    const here = main ? rows.find((r) => r.id === null)?.qty || 0 : rows.find((r) => r.id === place.id)?.qty || 0;
    const name = main ? mainStoreName(item) : place.name;
    const total = Number(item.current_stock || 0);
    const text = here > 0
      ? `${plural(here, "unit")} of ${itemLabel(item)} ${here === 1 ? "is" : "are"} recorded in ${name}. ${plural(total, "unit")} in total across the practice.`
      : `There is no ${itemLabel(item)} recorded in ${name}. ${total > 0 ? `${plural(total, "unit")} ${total === 1 ? "is" : "are"} recorded elsewhere: ${joinList(rows.map((r) => `${r.qty} in ${r.name}`), 4)}.` : "None is recorded anywhere."}`;
    return { text, followUps: ask(`where is ${itemLabel(item)}`) };
  }

  // one product, wherever it is
  if (item) {
    const rows = itemPlacements(item);
    const total = Number(item.current_stock || 0);
    if (!rows.length) return { text: `${itemLabel(item)}: none recorded in stock right now.`, followUps: ask(`reorder ${itemLabel(item)}`) };
    return {
      text: lines(`${itemLabel(item)}: ${plural(total, "unit")} in total.`, `Kept ${joinList(rows.map((r) => `${r.qty} in ${r.name}`), 6)}.`),
      followUps: ask(...rows.filter((r) => r.type === "kit").slice(0, 1).map((r) => `what's in ${r.name}`)),
    };
  }

  // everything at one place
  if (main) {
    const here = items.filter((i) => !i.archived_at && unassignedQty(i) > 0).sort((a, b) => itemLabel(a).localeCompare(itemLabel(b), "en", { sensitivity: "base" }));
    if (!here.length) return { text: "Nothing is recorded in the main store.", followUps: [] };
    return { text: lines(`The main store holds ${plural(here.length, "product")}. The first ${Math.min(10, here.length)}:`, ...here.slice(0, 10).map((i) => `• ${itemLabel(i)}: ${unassignedQty(i)}`), here.length > 10 ? `…and ${here.length - 10} more. Ask about one by name.` : ""), followUps: [] };
  }
  const contents = placeContents(place, items);
  const gaps = kitGaps(place, items);
  if (!contents.length && !gaps.length) return { text: `Nothing is recorded in ${place.name} yet.`, followUps: [] };
  return {
    text: lines(
      contents.length ? `${place.name} holds ${plural(contents.length, "product")}:` : `Nothing is recorded in ${place.name} yet.`,
      ...contents.slice(0, 15).map((r) => `• ${r.label}: ${r.qty}`),
      contents.length > 15 ? `…and ${contents.length - 15} more.` : "",
      gaps.length ? `Expected there but with no stock recorded: ${joinList(gaps, 6)}.` : ""
    ),
    followUps: ask(gaps.length ? `message the HCA team that ${place.name} is missing ${gaps[0]}` : ""),
  };
}

// ---- a message to a team ----------------------------------------------------------------------------------------

export function buildTeamDraft(input = {}, { roleNames = [], items = [] } = {}) {
  let parsed;
  if (input.team || input.message) {
    parsed = { team: resolveTeam(input.team, roleNames), teamPhrase: input.team, message: cap(String(input.message || "").trim().replace(/[.!\s]+$/, "")) };
  } else {
    parsed = parseTeamMessage(input.question, roleNames);
  }
  if (!parsed) return { text: "To message a team, say who and what, for example \"tell the HCA team BD blue needles need ordering\".", followUps: [] };

  if (!parsed.team) {
    const options = roleNames.filter((r) => r !== "System Admin").slice(0, 4);
    return {
      text: lines(`I couldn't tell which team you meant${parsed.teamPhrase ? ` by “${parsed.teamPhrase}”` : ""}. Teams are the roles people have in Primovex: ${joinList(roleNames.filter((r) => r !== "System Admin"), 6)}.`),
      followUps: parsed.message ? options.map((r) => `tell the ${r} team ${parsed.message}`) : [],
    };
  }
  if (!parsed.message) return { text: `What should I tell the ${parsed.team} team? For example "tell the ${parsed.team} team the fridge needs checking".`, followUps: [] };
  if (parsed.message.length > 300) return { text: "That message is too long. Keep it to a sentence or two (300 characters).", followUps: [] };
  if (looksIdentifying(parsed.message)) return { text: "That message has a number, date, email address or phone number in it. Please say it without those, and don't put patient details in a message.", followUps: [] };

  // If the message is about running out of something, offer the reorder alongside it.
  const orderish = /\b(order|ordering|low|out of|run out|ran out|missing|need more)\b/i.test(parsed.message);
  const found = orderish ? resolveStockItem(parsed.message, items) : { status: "none" };
  const proposal = createProposal({
    kind: "team-message",
    title: `Message the ${parsed.team} team`,
    lines: [`To: everyone with the role ${parsed.team}`, `Message: “${parsed.message}”`],
    requiredCapability: "inventory.write",
    confirmLabel: "Send message",
    params: { role: parsed.team, text: parsed.message, actionUrl: "/inventory" },
  });
  return {
    text: `I'll send this to the ${parsed.team} team once you confirm. Nothing has been sent yet.`,
    proposal,
    followUps: ask(found.status === "one" ? `reorder ${itemLabel(found.item)}` : ""),
  };
}

// ---- a reorder, or something missing --------------------------------------------------------------------------------

export function buildReorderDraft(input = {}, { items = [], pending = [], roleNames = [], kits = [] } = {}) {
  const parsed = input.item
    ? { mode: input.mode || (input.place ? "gap" : "reorder"), item: String(input.item).trim(), quantity: Number(input.quantity) || null, place: input.place || null }
    : parseStockRequest(input.question);
  if (!parsed || !parsed.item) return { text: "Tell me what's needed, for example \"BD blue needles need ordering\" or \"box 3 is missing a chlorphenamine\".", followUps: [] };

  const found = resolveStockItem(parsed.item, items);
  if (found.status === "none") {
    const near = suggestStockItems(parsed.item, items);
    if (near.length) return { text: lines(`I couldn't find “${parsed.item}”. Did you mean:`, ...near.map((i) => `• ${itemLabel(i)}`)), followUps: near.map((i) => `reorder ${itemLabel(i)}`), ambiguous: true };
    return { text: `I couldn't find any stock matching “${parsed.item}”, so I haven't raised anything. Try a different name, or part of it.`, followUps: [] };
  }
  if (found.status === "many") {
    return {
      text: lines(`More than one product fits “${parsed.item}”. Which did you mean?`, ...found.items.map((i) => `• ${itemLabel(i)}`)),
      followUps: found.items.slice(0, 3).map((i) => (parsed.mode === "gap" && parsed.place ? `${parsed.place} is missing ${itemLabel(i)}` : `reorder ${itemLabel(i)}`)),
      ambiguous: true,
    };
  }
  const item = found.item;
  const label = itemLabel(item);

  if (parsed.mode === "gap") {
    const where = parsed.place ? (resolvePlace(parsed.place, buildPlaces({ items, kits })).place?.name || cap(parsed.place)) : null;
    const said = where ? `${where} is missing ${label}` : `We're out of ${label}`;
    const teams = ["HCA", "Nurse", "Practice Manager"].filter((r) => roleNames.includes(r)).slice(0, 2);
    return {
      text: lines(`${said}. I can raise a reorder for it, or tell a team. Nothing has been sent or created yet. Which would you like?`),
      followUps: [`reorder ${label}`, ...teams.map((r) => `tell the ${r} team ${said}`)].slice(0, 3),
    };
  }

  const existing = pending.find((r) => r.item_id === item.id && (r.status || "pending") === "pending");
  if (existing) {
    return { text: `There is already a pending reorder request for ${label} (${plural(Number(existing.requested_qty || existing.order_quantity || 1), "unit")}), so I haven't made another. It's in the Reorder Centre.`, followUps: [], actions: [{ label: "Open Reorder Centre", route: "/reorder-centre" }] };
  }

  const quantity = Math.max(1, Math.min(999, Math.round(Number(parsed.quantity || item.order_quantity || item.requested_qty || 1))));
  const cardLines = [
    `Product: ${label}`,
    `Quantity to order: ${quantity}`,
    `In stock now: ${Number(item.current_stock || 0)}${Number(item.min_stock || 0) ? ` (minimum ${Number(item.min_stock)})` : ""}`,
    item.preferred_supplier_name || item.supplier_name ? `Supplier: ${item.preferred_supplier_name || item.supplier_name}` : "",
  ].filter(Boolean);
  const proposal = createProposal({
    kind: "reorder",
    title: `Request a reorder of ${label}`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Request reorder",
    params: { itemId: item.id, itemLabel: label, quantity },
  });
  return {
    text: lines(`I can raise a reorder request for ${label}. It goes to the Reorder Centre; nothing is ordered from a supplier until someone approves it. Nothing has been created yet.`, parsed.quantity ? "" : "Say \"reorder 5 …\" if you want a different quantity."),
    proposal,
    followUps: ask(roleNames.includes("HCA") ? `tell the HCA team ${label} needs ordering` : ""),
  };
}
