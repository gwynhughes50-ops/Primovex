# Orb language assistant: data flow (input to the DPIA)

Status: built, **off by default**. It does nothing until a System Admin turns it on under
Admin > Orb Learning > "Orb language assistant". This is an engineering description, not
approval: the DPO / Caldicott Guardian must decide whether the use is acceptable.

## What it does

Staff can ask the Orb in ordinary words ("have we run out of the green needles?"). The
Orb's own rules answer anything they recognise. Only a question the rules did **not**
understand goes to a language model, which does one job: choose which of the Orb's
approved read-only lookups fits, and fill in its one or two parameters. The lookup then
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
  lookup, and the server rejects anything else. Lookups are read-only.

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

## Not yet built (later phases)

- Letting the model phrase the answer from the lookup's data (would send practice data: needs its
  own assessment).
- Answers from the practice's taught knowledge and from Primovex's own help text.
- Any write action. The Orb's tools are read-only and stay so.
