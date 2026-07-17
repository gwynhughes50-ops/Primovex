# Sprint 45: Primovex Smart Intelligence Foundation

Version: 0.13.0

## Purpose

Sprint 45 introduces the first shared reasoning layer for Primovex. It is designed for real clinical environments where data may be incomplete, delayed, contradictory, or entered imperfectly.

## New platform concepts

- **Operational Fact**: what Primovex currently believes to be true.
- **Evidence**: sensor, system, user, physical-check, inference, or historical evidence supporting or contradicting a fact.
- **Confidence Engine**: calculates confidence using reliability, age, and agreement.
- **Anomaly Engine**: identifies conflicting, stale, and safety-critical unknown facts.
- **Ambient Verification**: proposes the smallest contextual question to improve confidence.
- **Information Health**: measures the quality of Primovex's operational picture separately from practice readiness.

## Safety principles

1. Missing information is never treated as good news.
2. A single evidence source is never assumed to be infallible.
3. Safety-critical unknowns remain explicit and are not silently resolved by inference.
4. Verification should be subtle only when risk permits it.
5. Every conclusion retains its supporting evidence and explanation.

## Architecture

The existing Operations Engine now produces operational facts from connected contributors and returns a new `intelligence` object alongside readiness and priorities. Existing screens continue to use the same response shape, so this is a backwards-compatible foundation.

A local operational-memory repository is included for development and UI prototyping. Firestore persistence and cross-device synchronisation will follow after the fact schema is exercised against real workflows.
