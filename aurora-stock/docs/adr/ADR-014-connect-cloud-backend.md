# ADR-014: MedTrak Connect Cloud Backend

## Status
Accepted

## Context
MedTrak Connect needs to support multiple device providers such as Tuya, ESP32, MQTT, Home Assistant and future commercial systems. Provider APIs may require secrets, signing and rate limiting. The React frontend must not contain vendor API secrets.

## Decision
Create a backend Connect Cloud layer using Firebase Cloud Functions. React will call Connect Cloud. Connect Cloud will communicate with providers, write readings and alerts to Firestore, and publish Connect events for MedAI and Operations Centre.

## Consequences
- Vendor secrets stay server-side.
- React uses one stable Connect API.
- New providers can be added without redesigning the frontend.
- Provider health, device sync, alerting and event generation become central platform services.
- Functions deployment becomes part of the MedTrak release process.

## Future work
- Add real Tuya API signing and polling.
- Add ESP32 HTTPS/MQTT ingestion.
- Add Home Assistant provider.
- Add provider webhooks where supported.
- Add escalation and push notifications for critical cold-chain events.
