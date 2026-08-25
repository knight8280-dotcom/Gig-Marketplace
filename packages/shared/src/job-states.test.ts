import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_STATES,
  JOB_TRANSITIONS,
  ASSIGNMENT_STATES,
  ASSIGNMENT_TRANSITIONS,
  isValidJobTransition,
  isValidAssignmentTransition,
} from './job-states';

test('every job state has a transition entry and only targets known states', () => {
  for (const state of JOB_STATES) {
    const targets = JOB_TRANSITIONS[state];
    assert.ok(Array.isArray(targets), `missing transitions for ${state}`);
    for (const t of targets) {
      assert.ok(JOB_STATES.includes(t), `${state} → ${t} targets unknown state`);
      assert.notEqual(t, state, `${state} must not self-transition`);
    }
  }
});

test('every assignment state has a transition entry and only targets known states', () => {
  for (const state of ASSIGNMENT_STATES) {
    const targets = ASSIGNMENT_TRANSITIONS[state];
    assert.ok(Array.isArray(targets), `missing transitions for ${state}`);
    for (const t of targets) {
      assert.ok(ASSIGNMENT_STATES.includes(t), `${state} → ${t} targets unknown state`);
    }
  }
});

test('terminal states are terminal', () => {
  assert.equal(JOB_TRANSITIONS.CLOSED.length, 0);
  assert.equal(ASSIGNMENT_TRANSITIONS.COMPLETED.length, 0);
  assert.equal(ASSIGNMENT_TRANSITIONS.NO_SHOW.length, 0);
});

test('golden-path job flow is valid end to end', () => {
  const path = [
    'DRAFT',
    'POSTED',
    'MATCHING',
    'FILLED',
    'IN_PROGRESS',
    'COMPLETION_PENDING',
    'COMPLETED',
    'PAYMENT_PENDING',
    'PAID',
    'CLOSED',
  ] as const;
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(
      isValidJobTransition(path[i]!, path[i + 1]!),
      `expected ${path[i]} → ${path[i + 1]} to be valid`,
    );
  }
});

test('illegal shortcuts are rejected', () => {
  assert.equal(isValidJobTransition('DRAFT', 'PAID'), false);
  assert.equal(isValidJobTransition('POSTED', 'COMPLETED'), false);
  assert.equal(isValidAssignmentTransition('ACCEPTED', 'COMPLETED'), false);
  assert.equal(isValidAssignmentTransition('COMPLETED', 'STARTED'), false);
});
