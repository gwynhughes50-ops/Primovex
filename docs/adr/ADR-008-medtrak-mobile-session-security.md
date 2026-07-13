# ADR-008: MedTrak Mobile session security and biometric-ready unlock

## Status
Accepted

## Context
MedTrak Mobile will often be used on phones, iPads and potentially shared treatment-room devices. Staff need fast access, but practice data must remain protected and devices should not waste battery by leaving camera/scanning workflows active.

## Decision
MedTrak Mobile will include a visible session timer, idle timeout warning, automatic lock, and biometric-ready quick unlock using platform authenticators where supported.

## Consequences
- Users can see how long they have been logged in.
- Inactive sessions lock automatically.
- Scanner/camera workflows are closed when the session locks.
- The mobile experience is faster for staff while preserving a clear security posture.
- Full enterprise WebAuthn server verification remains a future hardening step.
