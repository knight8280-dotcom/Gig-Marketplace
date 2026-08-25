# @gig/mobile — Expo React Native app (placeholder)

**Status: not yet scaffolded.** This directory is reserved for the customer +
worker mobile app (React Native + Expo + TypeScript, ADR-001).

The app will be generated at Phase 2 kickoff with the official generator
(`npx create-expo-app`) against the **then-current Expo SDK**, per the project
rule to never guess external dependency versions from memory
(docs/development/ROADMAP.md §standing rules).

Planned structure (docs/architecture/SYSTEM_ARCHITECTURE.md §8):
- Expo Router; role-aware tabs — Worker: HOME / JOBS / MESSAGES / ACTIVITY /
  PROFILE; Customer: HOME / MY JOBS / MESSAGES / ACTIVITY / PROFILE
- TanStack Query for server state; shared domain types from `@gig/shared`
- No authoritative business decisions on the client — the API decides job
  state, payments, matching, and permissions
