# Orb language assistant: data flow (input to the DPIA)

Status: built, **off by default**. It does nothing until a System Admin turns it on under
Admin > Orb Learning > "Orb language assistant". This is an engineering description, not
approval: the DPO / Caldicott Guardian must decide whether the use is acceptable.

## What it does

Staff can ask the Orb in ordinary words ("have we run out of the green needles?"). The
Orb's own rules answer anything they recognise. Only a question the rules did **not**
understand goes to a language model, which does one job: choose which of the Orb's
approved lookups fits, and fill in its one or two parameters. The lookup then
runs in the app with the person's own permissions, exactly as it does today.

## What is sent to the model (Azure OpenAI, same resource family as ClinFlow)

| Sent | Not sent |
|---|---|
| The question text, after removal of numbers of 6+ digits, NHS-number shapes, dates, email addresses and phone numbers, cut to 300 characters | Any stock, temperature, room, equipment, task, alert, staff or governance data |
| The list of lookups that person is allowed to use (names and descriptions) | The person's name, email, role or user id |
| A fixed instruction | Any patient data by design (see risks) |

Concern and SAR lookups (which take a patient reference or EMIS number) are **never** offered
to the model, and a test (`npm run test:orb-catalog`) fails if one is added by mistake.

## What comes back and is kept

The model returns a lookup name, its parameters and a confidence. The server checks it against
the person's permitted lookups and each parameter's rules, and discards anything else. Kept in
Primovex:

- the audit ledger entry `orb.ai.route`: who, when, which lookup (or none), number of items
  scrubbed, timing. **Never the question's words.**
- usage counters (`orb_ai_usage`): counts per person per hour and per day.

## Controls

- Off unless an administrator turns it on (with a tick-box confirming the region and DPIA check).
- Limits: 30 per person per hour, 1,500 per day for the practice (adjustable in `settings/orb`).
- Server-side only: the Azure key never reaches the browser or app.
- If the model is off, slow, unsure or erroring, the Orb behaves exactly as before.
- Prompt-injection: the question is treated as untrusted; the model can only name a permitted
  lookup, and the server rejects anything else. A lookup can only prepare an action; the
  person has to confirm it (see below).

## Risks and open points for the DPO

1. **Free-text questions can contain things people type.** Staff could type a patient's name.
   Numbers and dates are scrubbed; names cannot be reliably detected. Mitigation: a notice in
   the Orb ("don't type patient details") and the fact that nothing is stored.
2. **Region and retention at Azure.** Confirm the resource's region (UK South or an EU region),
   whether abuse-monitoring retention applies (Azure may keep prompts for up to 30 days unless
   modified abuse monitoring is approved), and that data is not used for training. Not verifiable
   from the code; check the Azure portal (resource > Overview > Location; Microsoft's data
   privacy documentation for Azure OpenAI).
3. **Data processing agreement** with Microsoft for Azure OpenAI covers this use.
4. **Accuracy.** The model can choose the wrong lookup. The answer always shows its sources and
   says when it came via the language assistant; the lookups themselves are unchanged.

## Second switch: wording the answers (built, off by default)

A separate switch lets the model put an answer into friendlier words. This sends more: the question
and the answer's facts (item, room, fridge and space names, counts, dates) after the same scrubbing.

- Only for lookups cleared for it (stock, expiry, cleaning status, fridges, alerts, spaces, compliance,
  box readiness). Never tasks, notes, maintenance, the timeline, who cleaned or saw something, the team
  list, or concerns and SARs. A test fails if a lookup with staff-typed text or names is added to the list.
- A reply is discarded, and the original answer used, if it contains a number that was not in the facts,
  drops a warning (out of range, expired, out of stock), contains a link, or is much longer than the facts.
- Own limits (30 per person per hour, 1,000 per day), audited by lookup and outcome only.

## Retention

Sign-in and activity records (staff monitoring) are deleted after 12 months, and the Orb's request
counters after 60 days, by a weekly clean-up. The audit ledger is not touched.

## Not yet built (later phases)

- Answers from the practice's taught knowledge and from Primovex's own help text.
- Recording stock used from a kit or box ("I've used one adrenaline from box 3"), and who is told.

## Actions the Orb can prepare (confirmed by the person)

Two things go beyond reading: a short message to a team, and a reorder request. The language
model never does either. It (or the Orb's own rules) only understands the sentence; the lookup
resolves the item, place and team against real data and asks if it is ambiguous, then shows a
card with exactly what will happen. Nothing changes until the person presses Confirm. A card
expires after 15 minutes, runs once, and is checked against the person's permissions again.

- Team message: Cloud Function `orbTeamMessage`; needs stock write; refused if it contains
  numbers, dates, emails or phone numbers; 10 an hour and 100 a day per person; goes to people
  with that role in Primovex only; audited as `orb.team.message` (team and count, not the text).
- Reorder: writes a pending request to the Reorder Centre (as the Inventory page does); nothing
  is ordered until someone approves it; audited as `orb.reorder.request`.
