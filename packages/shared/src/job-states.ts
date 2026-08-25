/**
 * Job and assignment state machines — the single source of truth for the job
 * lifecycle, shared by API, mobile, and admin. See ADR-006 in
 * docs/architecture/DECISIONS.md and docs/database/DATABASE_SCHEMA.md.
 *
 * Rules:
 * - Every transition is validated against these tables server-side, inside a
 *   database transaction, and appends an immutable job_events record.
 * - Not every job passes through every state.
 * - Per-worker execution states live on the assignment (job_workers); the job
 *   state aggregates assignments.
 */

export const JOB_STATES = [
  'DRAFT',
  'PENDING_REVIEW', // restricted-work screen routed the post to admin review
  'POSTED',
  'MATCHING',
  'PARTIALLY_FILLED',
  'FILLED',
  'IN_PROGRESS',
  'COMPLETION_PENDING',
  'COMPLETED',
  'PAYMENT_PENDING',
  'PAID',
  'CANCELLED',
  'DISPUTED',
  'CLOSED',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/** Valid job-state transitions. Anything not listed is illegal. */
export const JOB_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  DRAFT: ['POSTED', 'PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['POSTED', 'CANCELLED'],
  POSTED: ['MATCHING', 'CANCELLED'],
  MATCHING: ['PARTIALLY_FILLED', 'FILLED', 'CANCELLED'],
  PARTIALLY_FILLED: ['FILLED', 'MATCHING', 'IN_PROGRESS', 'CANCELLED'],
  FILLED: ['IN_PROGRESS', 'MATCHING', 'CANCELLED'], // → MATCHING when a worker cancels and a slot reopens
  IN_PROGRESS: ['COMPLETION_PENDING', 'CANCELLED', 'DISPUTED'],
  COMPLETION_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['PAYMENT_PENDING', 'DISPUTED'],
  PAYMENT_PENDING: ['PAID', 'DISPUTED'],
  PAID: ['CLOSED', 'DISPUTED'],
  CANCELLED: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['CLOSED', 'PAYMENT_PENDING', 'CANCELLED'], // resolution outcome decides
  CLOSED: [],
} as const;

export const ASSIGNMENT_STATES = [
  'ACCEPTED',
  'CONFIRMED',
  'EN_ROUTE',
  'ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED_BY_WORKER',
  'CANCELLED_BY_CUSTOMER',
  'NO_SHOW',
  'REMOVED', // removed by admin action
] as const;

export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

/** Valid assignment-state transitions. Anything not listed is illegal. */
export const ASSIGNMENT_TRANSITIONS: Readonly<
  Record<AssignmentState, readonly AssignmentState[]>
> = {
  ACCEPTED: ['CONFIRMED', 'EN_ROUTE', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_CUSTOMER', 'REMOVED'],
  CONFIRMED: ['EN_ROUTE', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_CUSTOMER', 'NO_SHOW', 'REMOVED'],
  EN_ROUTE: ['ARRIVED', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_CUSTOMER', 'NO_SHOW', 'REMOVED'],
  ARRIVED: ['STARTED', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_CUSTOMER', 'REMOVED'],
  STARTED: ['COMPLETED', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_CUSTOMER', 'REMOVED'],
  COMPLETED: [],
  CANCELLED_BY_WORKER: [],
  CANCELLED_BY_CUSTOMER: [],
  NO_SHOW: [],
  REMOVED: [],
} as const;

export function isValidJobTransition(from: JobState, to: JobState): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function isValidAssignmentTransition(
  from: AssignmentState,
  to: AssignmentState,
): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export const PAY_TYPES = ['FLAT', 'HOURLY'] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const JOB_URGENCIES = ['SCHEDULED', 'SAME_DAY', 'ASAP'] as const;
export type JobUrgency = (typeof JOB_URGENCIES)[number];

/** Acceptance-source discriminator; only DIRECT_ACCEPT is active in the MVP. */
export const ASSIGNMENT_SOURCES = [
  'DIRECT_ACCEPT',
  'INVITATION',
  'APPLICATION',
  'ADMIN',
] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];
