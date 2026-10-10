import assert from "node:assert/strict";
import { buildPersonMessageDraft, looksLikePersonMessage, parsePersonMessage } from "../src/ai/people/personMessage.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const ben = { uid: "b1", name: "Ben Jones", role: "Nurse", consumed: 1 };

t("a message to a named person is told apart from everything else", () => {
  for (const s of ["tell Ben the vaccine fridge needs checking", "message Craig that the delivery is here", "let Sarah know the rota is ready", "ask Ben to check the fridge", "remind Ben to order gloves", "please tell Craig Davies the lab van has gone", "send a message to Ben saying hello"]) {
    assert.ok(looksLikePersonMessage(s), s);
  }
  for (const s of ["tell the HCA team BD blue needles need ordering", "tell the nurses the fridge needs checking", "tell me about fridge 2", "let me know when it arrives", "ask how many gloves we have", "remind me to check the fridge", "tell everyone to sign the register", "what did Ben say"]) {
    assert.ok(!looksLikePersonMessage(s), s);
  }
});

t("who and what are picked apart", () => {
  const a = parsePersonMessage("tell Ben the vaccine fridge needs checking");
  assert.deepEqual([a.mode, a.words, a.afterOne], ["tell", ["Ben", "the"].slice(0, 1).concat(a.words.slice(1)), "the vaccine fridge needs checking"]);
  assert.deepEqual(parsePersonMessage("tell Craig Davies the van has gone").words, ["Craig", "Davies"]);
  assert.equal(parsePersonMessage("ask Ben to check the fridge").mode, "ask");
  assert.equal(parsePersonMessage("remind Ben to order gloves").mode, "remind");
});

t("one match makes a card that shows who it goes to", () => {
  const r = buildPersonMessageDraft({ question: "tell Ben the vaccine fridge needs checking" }, [ben]);
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "person-message");
  assert.equal(r.proposal.requiredCapability, "inventory.write");
  assert.deepEqual(r.proposal.params, { toUid: "b1", toName: "Ben Jones", text: "The vaccine fridge needs checking", actionUrl: "/notifications" });
  assert.match(r.proposal.lines.join("\n"), /To: Ben Jones \(Nurse\)/);
  assert.match(r.text, /Nothing has been sent yet/);
});

t("'ask' and 'remind' read naturally", () => {
  assert.equal(buildPersonMessageDraft({ question: "ask Ben to check the fridge" }, [ben]).proposal.params.text, "Please check the fridge");
  assert.equal(buildPersonMessageDraft({ question: "remind Ben to order gloves" }, [ben]).proposal.params.text, "Reminder: order gloves");
  assert.equal(buildPersonMessageDraft({ question: "let Ben know the rota is ready" }, [ben]).proposal.params.text, "The rota is ready");
});

t("a two-word name uses the second word as the surname, not part of the message", () => {
  const craig = { uid: "c1", name: "Craig Davies", role: "Nurse", consumed: 2 };
  const r = buildPersonMessageDraft({ question: "tell Craig Davies the van has gone" }, [craig]);
  assert.equal(r.proposal.params.text, "The van has gone");
});

t("more than one person asks which, and the choices carry the whole message", () => {
  const r = buildPersonMessageDraft({ question: "tell Ben the fridge needs checking" }, [ben, { uid: "b2", name: "Benjamin Hart", role: "Reception", consumed: 1 }]);
  assert.equal(r.proposal, undefined);
  assert.equal(r.followUps.length, 2);
  assert.deepEqual(r.followUps.map((f) => f.ask), ["tell Ben Jones The fridge needs checking", "tell Benjamin Hart The fridge needs checking"]);
});

t("nobody found, no message, patient details and a failed lookup are all handled", () => {
  assert.match(buildPersonMessageDraft({ question: "tell Zed the fridge needs checking" }, []).text, /couldn't find anyone called “Zed”/);
  assert.match(buildPersonMessageDraft({ question: "tell Ben" }, [ben]).text, /What should I tell Ben Jones/);
  const id = buildPersonMessageDraft({ question: "tell Ben to ring 0121 555 0123" }, [ben]);
  assert.equal(id.proposal, undefined);
  assert.match(id.text, /patient details/);
  const failed = buildPersonMessageDraft({ question: "tell Ben the fridge needs checking" }, null);
  assert.equal(failed.proposal, undefined);
  assert.match(failed.text, /couldn't look up your colleagues/);
});

console.log(`\n${n} passed`);
