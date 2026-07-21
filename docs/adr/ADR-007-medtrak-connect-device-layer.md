# ADR-007: MedTrak Connect Device Layer

## Status
Accepted

## Context

MedTrak+ is expanding beyond manually entered operational data. GP practices may benefit from Wi-Fi enabled thermometers and other sensors that automatically record cold-chain and environmental readings.

Manual fridge checks create avoidable work and can miss overnight incidents. Connected sensors can provide continuous monitoring and a stronger audit trail.

## Decision

Create a generic MedTrak Connect device layer rather than hard-coding a fridge-only feature.

Each device is represented through a common model including type, location, status, current value, battery, signal and last seen time.

Initial Sprint 20 implementation uses simulated devices while keeping the data model ready for real hardware integration.

## Consequences

- Fridges, room sensors and future smart devices can share one architecture.
- Operations Centre can consume Connect intelligence without knowing the hardware provider.
- Practice Pulse can include cold-chain and device health.
- Future mobile commissioning workflows can be added, such as scanning a sensor QR code and assigning it to a room.

## Principle

MedAI thinks. Practice Pulse measures. MedTrak Connect senses.
