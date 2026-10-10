import { createProposal } from "../../orb/actionProposals";
import { looksIdentifying, looksLikeTeamMessage } from "../stock/stockAsk";

// "Tell Ben the vaccine fridge needs checking" -> the Orb finds which colleague Ben is (the server looks up
// first names; the client can never read other people's accounts), shows who it is going to, and sends
// only after the person confirms. Pure apart from that lookup, which the tool does and hands in.

const VERBS = /^(?:(?:please|orb)[,\s]+)*(?:(?:can|could|would|will) you\s+)?(?:send\s+(?:a\s+)?(?:message|note)\s+to|message|tell|let|notify|inform|alert|ask|remind)\s+/i;
const NOT_A_PERSON = new Set(["me", "us", "you", "them", "him", "her", "it", "the", "a", "an", "all", "everyone", "everybody", "someone", "anyone", "somebody", "nobody", "that", "this", "my", "our", "how", "what", "when", "where", "why", "who", "which", "if", "whether", "about", "to", "team", "staff", "practice", "yes", "no", "now", "again", "know"]);

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// { mode: 'tell' | 'ask' | 'remind', words: [first, second?], afterOne, afterTwo } or null
export function parsePersonMessage(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  const verb = t.match(VERBS);
  if (!verb || looksLikeTeamMessage(t)) return null;
  const mode = /\bask\s+$/i.test(verb[0]) ? "ask" : /\bremind\s+$/i.test(verb[0]) ? "remind" : "tell";
  const rest = t.slice(verb[0].length).trim();
  const tokens = rest.split(" ");
  const first = (tokens[0] || "").replace(/[,:]+$/, "");
  if (!/^[A-Za-z][A-Za-z'’-]{1,24}$/.test(first) || NOT_A_PERSON.has(first.toLowerCase())) return null;
  const second = (tokens[1] || "").replace(/[,:]+$/, "");
  const words = /^[A-Za-z][A-Za-z'’-]{1,24}$/.test(second) && !NOT_A_PERSON.has(second.toLowerCase()) ? [first, second] : [first];
  return { mode, words, afterOne: tokens.slice(1).join(" "), afterTwo: tokens.slice(2).join(" ") };
}

export const looksLikePersonMessage = (text) => Boolean(parsePersonMessage(text));

// "that the fridge needs checking" / "to check the fridge" / "know the fridge..." / ": hello" -> the words to send
function messageFrom(mode, text) {
  let body = String(text || "").trim();
  let before;
  do { before = body; body = body.replace(/^(?:(?:that|know|about|saying|says|:|,|-)(?:\s+|$)|[:,-]\s*)+/i, "").trim(); } while (body !== before);
  if (!body) return "";
  if (mode === "ask") return cap(`please ${body.replace(/^to\s+/i, "")}`);
  if (mode === "remind") return `Reminder: ${body.replace(/^to\s+/i, "")}`;
  return cap(body.replace(/^to\s+/i, "please "));
}

// matches: [{ uid, name, role, consumed }] from the lookup, or null if the lookup couldn't be done.
export function buildPersonMessageDraft(input = {}, matches = null) {
  const parsed = parsePersonMessage(input.question);
  if (!parsed) return { text: "To message a colleague, say who and what, for example “tell Ben the vaccine fridge needs checking”.", followUps: [] };
  if (matches === null) return { text: "I couldn't look up your colleagues just now, so I haven't sent anything. Try again in a moment.", followUps: [] };
  const name = parsed.words.join(" ");
  if (!matches.length) return { text: `I couldn't find anyone called “${parsed.words[0]}” in your team. Check the spelling, or tell a whole team instead, like “tell the nurses …”.`, followUps: [] };

  const consumed = matches[0].consumed === 2 ? 2 : 1;
  const message = messageFrom(parsed.mode, consumed === 2 ? parsed.afterTwo : parsed.afterOne);
  if (matches.length > 1) {
    return {
      text: `More than one person fits “${consumed === 2 ? name : parsed.words[0]}”. Who did you mean?`,
      followUps: message ? matches.slice(0, 4).map((m) => ({ label: `${m.name} (${m.role || "no role"})`, ask: `tell ${m.name} ${message}`, color: "#0ea5e9" })) : [],
      ambiguous: true,
    };
  }
  const person = matches[0];
  if (!message) return { text: `What should I tell ${person.name}? For example “tell ${person.name.split(" ")[0]} the fridge needs checking”.`, followUps: [] };
  if (message.length > 300) return { text: "That message is too long. Keep it to a sentence or two (300 characters).", followUps: [] };
  if (looksIdentifying(message)) return { text: "That message has a number, date, email address or phone number in it. Please say it without those, and don't put patient details in a message.", followUps: [] };
  const proposal = createProposal({
    kind: "person-message",
    title: `Message ${person.name}`,
    lines: [`To: ${person.name}${person.role ? ` (${person.role})` : ""}`, `Message: “${message}”`],
    requiredCapability: "inventory.write",
    confirmLabel: "Send message",
    params: { toUid: person.uid, toName: person.name, text: message, actionUrl: "/notifications" },
  });
  return { text: `I'll send this to ${person.name} once you confirm. Nothing has been sent yet.`, proposal, followUps: [] };
}
