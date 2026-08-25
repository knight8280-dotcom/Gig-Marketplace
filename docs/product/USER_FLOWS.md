# User Flows — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0. Screen-level flows for the MVP. Wireframes/UX design will refine these; navigation structure is to be validated during UX design, not blindly implemented.

## 1. Customer: post a job (happy path)

```
Home ("Post a job" primary CTA)
 → Category select (searchable grid; restricted categories not shown)
 → Describe (title + free-text description + optional photos)
 → Location (saved address | new address | map pin) — geocoded server-side
 → Schedule (date + start time | ASAP) + estimated duration
 → Workers needed (default 1)
 → Pay (flat $ | hourly $/h) + deterministic suggestion band
    "Similar jobs nearby typically pay $75–$110"
 → Review (full summary, fees shown transparently)
 → Payment method (add card if none on file)
 → POST JOB
 → Confirmation: "We're finding workers near you" (state: POSTED → MATCHING)
```

Rules:
- Required fields minimized; everything else progressive.
- First-time customers are not forced through a long profile — email verification + payment method is enough to post.
- If the description trips the restricted-work screen → "This job needs a quick review before going live" (state: pending admin review). Never silently dropped.

## 2. Worker: onboard (progressive)

```
Sign up → verify email → verify phone
 → Basic profile (name, photo, bio)
 → Pick categories → pick skills
 → Service radius + home base location (private, server-side only)
 → Availability (weekly windows; "available until" reserved for later)
 → Transportation + equipment
 → Payout setup (Stripe Connect Express onboarding — hosted flow)
 → Terms + safety information acknowledgement
 → Done: "Turn on Available for Work"
```

Rules:
- Worker can browse jobs at any point after phone verification.
- ACCEPT is blocked (with a clear explainer + deep link to the missing step) until the requirements for that job's category are met (e.g., ID verification, payout account).
- Verification badges appear only after real `verification_records` exist.

## 3. Worker: discover and accept

```
Home
 ├─ Availability toggle (prominent)
 ├─ Current active job card (if any)
 ├─ Today's earnings
 └─ Nearby jobs (cards: title, pay, distance, start time, duration, workers needed, category)
     → Job detail (approximate location circle on map, description, photos,
                    equipment, physical requirements, customer rating)
     → ACCEPT JOB
         ├─ success → "You're in. 2/3 spots filled." → job appears in JOBS tab
         └─ slot taken → "This job just filled." (server-authoritative; card removed)
```

Empty state: "No jobs nearby right now." → [Expand search radius] [Adjust filters] [Get notified].

## 4. Job execution (both sides)

```
WORKER                                   CUSTOMER
Accept                                →  push: "Alex T. accepted your job"
"On my way" (EN_ROUTE)                →  push: "Alex is en route"
"I'm here" (ARRIVED, geo evidence)    →  push: "Alex has arrived"
START JOB (IN_PROGRESS)               →  timeline updates live
COMPLETE JOB (COMPLETION_PENDING)     →  push: "Alex marked this job complete"
                                          → CONFIRM  → payment releases → both prompted to rate
                                          → REPORT A PROBLEM → dispute intake flow
(no response in 72h → auto-confirm; customer notified in advance; still disputable)
```

Multi-worker jobs: each assignment progresses independently; the job's aggregate state reflects the set (see state machine in ADR-006).

## 5. Messaging

```
Job detail → Message  (conversation is created per job, per customer↔worker pair)
 - text + image messages, timestamps, read receipts
 - report message / block user actions in the overflow menu
 - messaging opens at acceptance, read-only after job CLOSED + 14 days
```

## 6. Completion, payment, rating

```
Customer confirms
 → payment captured/transferred per PAYMENT_MODEL
 → customer: receipt + "Rate Alex" (overall stars required, dimensions optional)
 → worker: "You earned $85.00" (pending → available per payout schedule) + "Rate the customer"
 → ratings hidden until both submit or 14 days pass (double-blind)
```

## 7. Cancellation flows

```
Customer cancels:
  before any acceptance      → job cancelled, full refund/no charge
  after acceptance, > T1 hrs before start → cancel, policy fee per config, workers notified
  < T1 hrs / after en-route  → cancellation fee, partial worker compensation per policy
  after arrival              → treated as callout; worker compensated per policy
Worker cancels:
  shortly after acceptance   → slot reopens, matching resumes, reliability metric hit
  close to start / no-show   → stronger reliability impact, customer notified + rematch offered
Safety cancellation (either side):
  "Cancel for safety" → no standard penalty, safety report intake, admin review
```

All thresholds/fees are platform-config values, evaluated by the central cancellation policy engine. Consequences shown to the user **before** they confirm cancellation.

## 8. Dispute flow

```
Customer "Report a problem" | Worker "Report an issue"
 → category select (not completed / incomplete / scope changed / payment / damage / behavior / no-show / safety / fraud)
 → description + evidence (photos; messages & timeline auto-attached)
 → payment hold: release paused pending resolution
 → admin dashboard: dispute queue → evidence view (job, changes, messages, events, payments)
 → resolution: release | partial refund | full refund | other + reason
 → both parties notified; resolution recorded immutably
```

## 9. Scope-change flow

```
Customer (job detail, after fill): "Change job"
 → edit proposal (description/pay/duration/workers) — original preserved
 → each assigned worker: push + approve/decline screen showing diff
 → all approve → change applied + job_event; any decline → change rejected,
   customer may cancel per policy or keep original scope
```

## 10. Admin core flows

```
Login (admin-only web app, strong auth)
 → Overview dashboard (KPIs)
 → Users: search → detail (profiles, jobs, payments, reports) → suspend/restore (reason required, audited)
 → Jobs: search → detail (timeline, events, messages, payments) → investigate/cancel
 → Restricted-job review queue → approve / reject with reason
 → Disputes: queue → evidence → resolve (audited)
 → Categories: create/edit/enable/disable, verification requirements
 → Settings: fees, limits, cancellation thresholds, verification requirements (audited)
```

## 11. Mobile navigation (initial proposal — validate in UX design)

| Worker | Customer |
|---|---|
| HOME | HOME |
| JOBS | MY JOBS |
| MESSAGES | MESSAGES |
| ACTIVITY | ACTIVITY |
| PROFILE | PROFILE |

Users with both roles get a profile-level mode switch (worker mode / customer mode).

## 12. Empty states (required, never blank screens)

| Screen | Empty state | Action |
|---|---|---|
| Worker nearby jobs | "No jobs nearby right now." | Expand search radius / adjust filters |
| Customer home | "You don't have any active jobs." | Post your first job |
| Messages | "Messages appear when you're on a job together." | — |
| Worker earnings | "Complete your first job to see earnings here." | Find jobs |
| Activity | "Your job history will show up here." | — |

## 13. Offline / failure handling

- Read screens render cached data with a "you're offline" banner.
- Mutations (accept, start, complete) require connectivity; they are idempotent server-side so retries are safe and can never double-accept or double-pay.
- Duplicate-submission protection: client sends an idempotency key per user action.
- "Job became unavailable while viewing" → inline replacement message, never a crash.
