# ADR-012: MedTrak Connect Provider Layer

## Status

Accepted

## Context

MedTrak Connect needs to support multiple device ecosystems. Consumer Wi-Fi thermometer manufacturers may not provide stable APIs. Tuya can provide a broad device ecosystem, but cloud access requires secure API credentials. Future MedTrak hardware may use ESP32, MQTT or Home Assistant.

## Decision

MedTrak Connect will use a provider architecture. The UI and Operations Centre consume a common device model and do not depend on any single manufacturer.

Initial providers:

- Simulator
- Tuya provider shell

Planned providers:

- MedTrak Connect Node / ESP32
- Generic MQTT
- Home Assistant

## Security principle

The React frontend must never contain API secrets. Provider secrets belong in Firebase Functions environment variables or Secret Manager. Firestore may hold non-secret metadata only.

## Consequences

- Tuya, ESP32, MQTT and Home Assistant can be added without redesigning the UI.
- MedTrak Connect becomes a platform service rather than a one-off thermometer integration.
- Device readings can feed Practice Pulse, MedAI, alerts, audit history and reports from one source of truth.
