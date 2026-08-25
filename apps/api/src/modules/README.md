# API modules

Product modules of the modular monolith live here, one directory per module,
added phase by phase (docs/development/ROADMAP.md). Responsibilities are
defined in docs/architecture/SYSTEM_ARCHITECTURE.md §3.

| Module | Phase | Module | Phase |
|---|---|---|---|
| auth | 1 | messaging | 9 |
| users | 1 | payments | 10 |
| customers | 2 | payouts | 10 |
| workers | 3 | ratings | 11 |
| verification | 3 | disputes | 13 |
| skills | 4 | notifications | 14 |
| categories | 4 | admin | 15 |
| availability | 4 | reports | 16 |
| jobs | 5 | analytics | 17 |
| files | 5 | | |
| matching | 7 | | |

Rules:
- Modules communicate through exported services or domain events (outbox) —
  never by touching another module's tables.
- Controllers are thin (validation → authz → service); business rules live in
  services; no permission logic outside the central permission service.

This directory intentionally contains no code yet — no fake scaffolding.
