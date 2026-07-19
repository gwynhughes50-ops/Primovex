# Primovex Orb Product Blueprint

## Purpose
Orb is Primovex's permission-aware operational intelligence layer. It is not a general chatbot. It helps healthcare teams understand, verify and complete operational work safely.

## Promise
Orb will:
- reduce work rather than create it;
- never invent operational facts;
- expose uncertainty and evidence;
- respect identity, role, site and space permissions;
- keep humans in control of important actions;
- learn from confirmations and corrections without silently changing safety rules.

## Core pipeline
Input (voice, text, barcode, QR, NFC or photo) -> Intent -> Context -> Permission -> Knowledge -> Confidence -> Response -> Audit -> Operational memory.

## Senses
- Voice: natural hands-free requests.
- Scan: barcode, QR and NFC identity.
- Vision: future product, shelf, trolley and room recognition.
- Space: current site and `spaceId`.
- Memory: operational outcomes, not personal conversation history.

## Disclosure rule
Orb may access connected Primovex domains, but it may reveal only the minimum information the current user is authorised to receive.

## Feedback model
Feedback is outcome-based rather than a simple like/dislike:
- Exactly right
- Nearly right
- I corrected something
- Wrong

Corrections may be tagged with structured reasons such as wrong product, wrong space, missed expiry, incomplete answer or excessive detail.

## Safety rule
Barcode or trusted identifier is preferred. Vision and inference may assist when identifiers are unavailable, but Orb must request confirmation when confidence is insufficient.

## Long-term direction
Orb Voice -> Orb Data Fabric -> Emergency Drug Intelligence -> Operational Memory -> Learning -> Orb Vision -> Digital Twin.
