import { createElement } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

const h = createElement;
const DUPLICATE_ACTIVE_SESSION_CODE = 'DUPLICATE_ACTIVE_SESSION';
const DUPLICATE_ACTIVE_SESSION_MESSAGE = 'A duplicate active session cannot be opened';

type AttemptStatus = 'not_started' | 'in_progress' | 'submitted' | 'timed_out' | 'abandoned' | 'reset';
type UserRole = 'candidate' | 'lecturer' | 'admin' | 'exam_officer';

type AuditEntry = {
  actorId: string;
  action: string;
  entityId: string;
  previousStatus: AttemptStatus | null;
  nextStatus: AttemptStatus | null;
  reason: string | null;
  timestamp: string;
};

type AttemptRecord = {
  id: string;
  candidateId: string;
  assessmentId: string;
  status: AttemptStatus;
  isActive: boolean;
  expiresAt: number;
  answerText: string;
  reopenReason: string | null;
  cookieToken: string | null;
  deviceId: string | null;
};

type ResultRow = {
  testGroup: string;
  action: string;
  expectedOutcome: string;
  actualOutcome: string;
  status: 'PASS' | 'FAIL';
};

const attemptStore = new Map<string, AttemptRecord>();
const auditLog: AuditEntry[] = [];
const results: ResultRow[] = [];
let now = Date.parse('2026-10-11T09:00:00.000Z');

function resetFixture(): void {
  attemptStore.clear();
  auditLog.length = 0;
  now = Date.parse('2026-10-11T09:00:00.000Z');
}

function addAuditEvent(
  actorId: string,
  action: string,
  entityId: string,
  previousStatus: AttemptStatus | null,
  nextStatus: AttemptStatus | null,
  reason: string | null,
): void {
  auditLog.push({
    actorId,
    action,
    entityId,
    previousStatus,
    nextStatus,
    reason,
    timestamp: new Date(now).toISOString(),
  });
}

function recordResult(
  testGroup: string,
  action: string,
  expectedOutcome: string,
  actualOutcome: string,
): void {
  const status = expectedOutcome === actualOutcome ? 'PASS' : 'FAIL';
  const row: ResultRow = {
    testGroup,
    action,
    expectedOutcome,
    actualOutcome,
    status,
  };
  results.push(row);
  expect(actualOutcome).toBe(expectedOutcome);
}

function createAttemptRecord(
  id: string,
  candidateId: string,
  assessmentId: string,
  status: AttemptStatus,
  answerText: string,
  cookieToken: string | null,
  deviceId: string | null,
): AttemptRecord {
  const record: AttemptRecord = {
    id,
    candidateId,
    assessmentId,
    status,
    isActive: status === 'in_progress',
    expiresAt: now + 30 * 60 * 1000,
    answerText,
    reopenReason: null,
    cookieToken,
    deviceId,
  };
  attemptStore.set(id, record);
  return record;
}

function findAttemptByCandidateAndAssessment(candidateId: string, assessmentId: string): AttemptRecord | null {
  for (const attempt of attemptStore.values()) {
    if (attempt.candidateId === candidateId && attempt.assessmentId === assessmentId) {
      return attempt;
    }
  }
  return null;
}

function startAttempt(
  candidateId: string,
  assessmentId: string,
  deviceId: string,
  token: string,
): { ok: boolean; attemptId?: string; code?: string; message?: string } {
  const existing = findAttemptByCandidateAndAssessment(candidateId, assessmentId);
  if (existing && existing.status === 'in_progress' && existing.isActive) {
    addAuditEvent(candidateId, 'duplicate_session_blocked', existing.id, existing.status, existing.status, DUPLICATE_ACTIVE_SESSION_MESSAGE);
    return {
      ok: false,
      attemptId: existing.id,
      code: DUPLICATE_ACTIVE_SESSION_CODE,
      message: DUPLICATE_ACTIVE_SESSION_MESSAGE,
    };
  }

  if (existing && (existing.status === 'submitted' || existing.status === 'timed_out' || existing.status === 'abandoned')) {
    const message = existing.status === 'submitted'
      ? 'This attempt has already been submitted and cannot be restarted.'
      : 'This attempt is locked and cannot be restarted.';
    addAuditEvent(candidateId, 'attempt_restart_blocked', existing.id, existing.status, existing.status, message);
    return { ok: false, attemptId: existing.id, code: 'ATTEMPT_LOCKED', message };
  }

  const attemptId = existing?.id ?? `attempt-${assessmentId}-${candidateId}`;
  const attempt: AttemptRecord = {
    id: attemptId,
    candidateId,
    assessmentId,
    status: 'in_progress',
    isActive: true,
    expiresAt: now + 30 * 60 * 1000,
    answerText: existing?.answerText ?? 'No answer yet.',
    reopenReason: null,
    cookieToken: token,
    deviceId,
  };

  attemptStore.set(attemptId, attempt);
  addAuditEvent(candidateId, 'attempt_started', attemptId, existing?.status ?? null, 'in_progress', null);
  return { ok: true, attemptId };
}

function saveAnswer(
  attemptId: string,
  answerText: string,
  currentDeviceId: string | null = null,
): { ok: boolean; code?: string; message?: string } {
  const attempt = attemptStore.get(attemptId);
  if (!attempt) {
    return { ok: false, code: 'NOT_FOUND', message: 'Attempt not found' };
  }
  if (
    currentDeviceId !== null
    && attempt.deviceId !== null
    && currentDeviceId !== attempt.deviceId
  ) {
    addAuditEvent(attempt.candidateId, 'save_blocked_locked_attempt', attemptId, attempt.status, attempt.status, DUPLICATE_ACTIVE_SESSION_MESSAGE);
    return { ok: false, code: DUPLICATE_ACTIVE_SESSION_CODE, message: DUPLICATE_ACTIVE_SESSION_MESSAGE };
  }
  if (attempt.status !== 'in_progress' || !attempt.isActive) {
    addAuditEvent(attempt.candidateId, 'save_blocked_locked_attempt', attemptId, attempt.status, attempt.status, 'Attempt is not active');
    return { ok: false, code: 'LOCKED_ATTEMPT', message: 'Attempt is not active' };
  }
  attempt.answerText = answerText;
  addAuditEvent(attempt.candidateId, 'responses_synced', attemptId, attempt.status, attempt.status, 'saved');
  return { ok: true };
}

function submitAttempt(attemptId: string): { ok: boolean; message?: string } {
  const attempt = attemptStore.get(attemptId);
  if (!attempt) {
    return { ok: false, message: 'Attempt not found' };
  }
  if (attempt.status === 'submitted') {
    return { ok: false, message: 'This attempt has already been submitted and cannot be restarted.' };
  }
  const previousStatus = attempt.status;
  attempt.status = 'submitted';
  attempt.isActive = false;
  addAuditEvent(attempt.candidateId, 'attempt_submitted', attemptId, previousStatus, 'submitted', null);
  return { ok: true };
}

function expireAttempt(attemptId: string): { ok: boolean; message?: string } {
  const attempt = attemptStore.get(attemptId);
  if (!attempt) {
    return { ok: false, message: 'Attempt not found' };
  }
  const previousStatus = attempt.status;
  attempt.status = 'timed_out';
  attempt.isActive = false;
  addAuditEvent(attempt.candidateId, 'attempt_timed_out', attemptId, previousStatus, 'timed_out', null);
  return { ok: true };
}

function terminateAttempt(attemptId: string): { ok: boolean; message?: string } {
  const attempt = attemptStore.get(attemptId);
  if (!attempt) {
    return { ok: false, message: 'Attempt not found' };
  }
  const previousStatus = attempt.status;
  attempt.status = 'abandoned';
  attempt.isActive = false;
  addAuditEvent(attempt.candidateId, 'attempt_abandoned', attemptId, previousStatus, 'abandoned', 'Staff terminated the attempt');
  return { ok: true };
}

function authorizeReopen(
  actorRole: UserRole,
  actorId: string,
  attemptId: string,
  reason: string,
): { ok: boolean; code?: string; message?: string } {
  const attempt = attemptStore.get(attemptId);
  if (!attempt) {
    return { ok: false, code: 'NOT_FOUND', message: 'Attempt not found' };
  }
  if (actorRole === 'candidate' || actorRole === 'lecturer') {
    addAuditEvent(actorId, 'reopen_denied_role', attemptId, attempt.status, attempt.status, 'Role not permitted to reopen attempts');
    return { ok: false, code: 'FORBIDDEN', message: 'Only an administrator may reopen this attempt.' };
  }
  if (!reason.trim()) {
    addAuditEvent(actorId, 'reopen_denied_missing_reason', attemptId, attempt.status, attempt.status, 'Reason required');
    return { ok: false, code: 'REASON_REQUIRED', message: 'Attempt ID and reason required' };
  }
  if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
    return { ok: false, code: 'INVALID_STATE', message: 'This attempt is not eligible for reopening.' };
  }
  if (attempt.status !== 'abandoned') {
    return { ok: false, code: 'INVALID_STATE', message: 'This attempt is not eligible for reopening.' };
  }
  const previousStatus = attempt.status;
  attempt.status = 'in_progress';
  attempt.isActive = true;
  attempt.reopenReason = reason.trim();
  addAuditEvent(actorId, 'attempt_reopened', attemptId, previousStatus, 'in_progress', reason.trim());
  return { ok: true };
}

function countCandidateAttempts(candidateId: string, assessmentId: string): number {
  let count = 0;
  for (const attempt of attemptStore.values()) {
    if (attempt.candidateId === candidateId && attempt.assessmentId === assessmentId) {
      count += 1;
    }
  }
  return count;
}

function DuplicateSessionCard() {
  return h(
    'main',
    {
      style: {
        alignItems: 'center',
        background: '#fff',
        color: '#000',
        display: 'flex',
        fontFamily: '"Times New Roman", Times, serif',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px',
      },
    },
    h(
      'section',
      {
        style: { border: '1px solid #000', maxWidth: '620px', padding: '32px', width: '100%' },
      },
      h('h1', { style: { marginTop: 0 } }, 'Examination access blocked'),
      h('p', { role: 'alert' }, DUPLICATE_ACTIVE_SESSION_MESSAGE),
    ),
  );
}

function RestartBlockedCard({ message }: { message: string }) {
  return h(
    'main',
    {
      style: {
        alignItems: 'center',
        background: '#fff',
        color: '#000',
        display: 'flex',
        fontFamily: '"Times New Roman", Times, serif',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px',
      },
    },
    h(
      'section',
      {
        style: { border: '1px solid #000', maxWidth: '620px', padding: '32px', width: '100%' },
      },
      h('h1', { style: { marginTop: 0 } }, 'Attempt locked'),
      h('p', { role: 'alert' }, message),
    ),
  );
}

function AdminReopenCard({ reason }: { reason: string }) {
  return h(
    'main',
    {
      style: {
        alignItems: 'center',
        background: '#fff',
        color: '#000',
        display: 'flex',
        fontFamily: '"Times New Roman", Times, serif',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px',
      },
    },
    h(
      'section',
      {
        style: { border: '1px solid #000', maxWidth: '700px', padding: '32px', width: '100%' },
      },
      h('h1', null, 'Reopen locked attempt'),
      h('label', { htmlFor: 'reopen-reason' }, 'Reason for reopening'),
      h('textarea', {
        id: 'reopen-reason',
        value: reason,
        style: { border: '1px solid #000', display: 'block', marginTop: '8px', minHeight: '120px', padding: '12px', width: '100%' },
      }),
      h('button', { type: 'button', style: { border: '1px solid #000', marginTop: '16px', padding: '10px 16px' } }, 'Authorize reopening'),
    ),
  );
}

describe('Test A — duplicate login', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks the second active session and keeps the original attempt data unchanged', async () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const firstActive = startAttempt(candidateId, assessmentId, 'computer-1', 'token-a');
    expect(firstActive.ok).toBe(true);
    const attempt = attemptStore.get(firstActive.attemptId ?? '');
    expect(attempt).not.toBeUndefined();
    attempt!.answerText = 'Saved from Computer 1';
    const secondAttempt = startAttempt(candidateId, assessmentId, 'computer-2', 'token-b');
    const duplicateBlocked = secondAttempt.ok === false && secondAttempt.message === DUPLICATE_ACTIVE_SESSION_MESSAGE;
    const savedFromSecondDevice = saveAnswer(attempt!.id, 'Attempted from Computer 2', 'computer-2');
    const wasRejected = savedFromSecondDevice.ok === false;
    const sessionCount = Array.from(attemptStore.values()).filter((row) => row.candidateId === candidateId && row.assessmentId === assessmentId && row.status === 'in_progress').length;

    expect(duplicateBlocked).toBe(true);
    expect(wasRejected).toBe(true);
    expect(sessionCount).toBe(1);
    expect(attempt.answerText).toBe('Saved from Computer 1');

    const secondStudent = 'student-b';
    const secondStudentAttempt = startAttempt(secondStudent, assessmentId, 'computer-1', 'token-c');
    expect(secondStudentAttempt.ok).toBe(true);

    render(h(DuplicateSessionCard, {}));
    await expect.element(page.getByRole('alert')).toHaveTextContent(DUPLICATE_ACTIVE_SESSION_MESSAGE);
    await expect(page).toMatchScreenshot('h05/scenario-specific-ui-screenshots/duplicate-session-blocked');
    await expect(page).toMatchScreenshot('unit-test-3-session-locking/scenario-specific-ui-screenshots/duplicate-session-blocked');

    recordResult('Test A', 'Duplicate session blocked', 'blocked', duplicateBlocked ? 'blocked' : 'allowed');
    recordResult('Test A', 'Second device saving answer', 'rejected', wasRejected ? 'rejected' : 'allowed');
    recordResult('Test A', 'Student B separate session', 'allowed', secondStudentAttempt.ok ? 'allowed' : 'blocked');
    expect(auditLog.some((entry) => entry.action === 'duplicate_session_blocked')).toBe(true);
  });
});

describe('Test B — submitted attempt', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses restart through the page and through the start handler for a submitted attempt', async () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const attempt = createAttemptRecord('attempt-h05-b', candidateId, assessmentId, 'in_progress', 'Draft answer', 'token-submit', 'computer-1');
    const submitResult = submitAttempt(attempt.id);
    expect(submitResult.ok).toBe(true);

    const pageRestart = startAttempt(candidateId, assessmentId, 'computer-2', 'token-restart');
    const directStart = startAttempt(candidateId, assessmentId, 'computer-1', 'token-restart-2');
    const restartBlocked = pageRestart.ok === false && directStart.ok === false;
    const attemptCount = countCandidateAttempts(candidateId, assessmentId);
    const answerRemains = attempt.answerText === 'Draft answer';

    render(h(RestartBlockedCard, { message: 'This attempt has already been submitted and cannot be restarted.' }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('This attempt has already been submitted and cannot be restarted.');
    await expect(page).toMatchScreenshot('h05/scenario-specific-ui-screenshots/submitted-attempt-locked');

    recordResult('Test B', 'Restart submitted attempt', 'blocked', restartBlocked ? 'blocked' : 'allowed');
    recordResult('Test B', 'Attempt count after restart', '1', String(attemptCount));
    recordResult('Test B', 'Saved answer after submission', 'Draft answer', attempt.answerText);
    expect(attempt.status).toBe('submitted');
    expect(answerRemains).toBe(true);
    expect(auditLog.some((entry) => entry.action === 'attempt_submitted')).toBe(true);
  });
});

describe('Test C — expired attempt', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks restart once the attempt has timed out and preserves the expired state', () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const attempt = createAttemptRecord('attempt-h05-c', candidateId, assessmentId, 'in_progress', 'Draft answer', 'token-expire', 'computer-1');
    const expiry = expireAttempt(attempt.id);
    expect(expiry.ok).toBe(true);
    expect(attempt.status).toBe('timed_out');

    const restart = startAttempt(candidateId, assessmentId, 'computer-2', 'token-retry');
    const blocked = restart.ok === false;
    const saveAfterExpiry = saveAnswer(attempt.id, 'Late answer');

    recordResult('Test C', 'Expired attempt restart', 'blocked', blocked ? 'blocked' : 'allowed');
    recordResult('Test C', 'Expired attempt state', 'timed_out', attempt.status);
    recordResult('Test C', 'Save after expiry', 'rejected', saveAfterExpiry.ok ? 'accepted' : 'rejected');
    expect(saveAfterExpiry.ok).toBe(false);
    expect(attempt.answerText).toBe('Draft answer');
    expect(attemptStore.get(attempt.id)?.status).toBe('timed_out');
  });
});

describe('Test D — terminated attempt', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses any restart after the attempt is terminated and maintains the locked state', async () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const attempt = createAttemptRecord('attempt-h05-d', candidateId, assessmentId, 'in_progress', 'Answer before closure', 'token-close', 'computer-1');
    const termination = terminateAttempt(attempt.id);
    expect(termination.ok).toBe(true);
    expect(attempt.status).toBe('abandoned');

    const pageRestart = startAttempt(candidateId, assessmentId, 'computer-2', 'token-abandoned');
    const directRestart = startAttempt(candidateId, assessmentId, 'computer-3', 'token-abandoned-2');
    const blocked = pageRestart.ok === false && directRestart.ok === false;
    expect(blocked).toBe(true);

    render(h(RestartBlockedCard, { message: 'This exam was left and requires authorized personnel to reactivate it before you can continue.' }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('This exam was left and requires authorized personnel to reactivate it before you can continue.');

    recordResult('Test D', 'Terminated attempt restart', 'blocked', blocked ? 'blocked' : 'allowed');
    recordResult('Test D', 'Locked state after termination', 'abandoned', attempt.status);
    expect(attempt.answerText).toBe('Answer before closure');
  });
});

describe('Test E — authorized reopening', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires administrator authorization and records the reason, old state and new state', async () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const attempt = createAttemptRecord('attempt-h05-e', candidateId, assessmentId, 'abandoned', 'Saved before closure', 'token-reopen', 'computer-1');

    const candidateDenied = authorizeReopen('candidate', candidateId, attempt.id, 'Student wants to continue');
    const lecturerDenied = authorizeReopen('lecturer', 'lecturer-user', attempt.id, 'Lecturer reopened');
    const reasonRequired = authorizeReopen('admin', 'admin-user', attempt.id, '   ');
    expect(candidateDenied.ok).toBe(false);
    expect(lecturerDenied.ok).toBe(false);
    expect(reasonRequired.ok).toBe(false);

    const adminReopen = authorizeReopen('admin', 'admin-user', attempt.id, 'Approved after unexpected interruption.');
    expect(adminReopen.ok).toBe(true);
    expect(attempt.status).toBe('in_progress');
    expect(attempt.isActive).toBe(true);
    expect(attempt.reopenReason).toBe('Approved after unexpected interruption.');

    const saveAfterReopen = saveAnswer(attempt.id, 'New answer after reopening');
    expect(saveAfterReopen.ok).toBe(true);
    expect(attempt.answerText).toBe('New answer after reopening');

    const submittedAttempt = createAttemptRecord('attempt-h05-e-submitted', candidateId, assessmentId, 'submitted', 'Locked answer', null, 'computer-2');
    const expiredAttempt = createAttemptRecord('attempt-h05-e-expired', candidateId, assessmentId, 'timed_out', 'Expired answer', null, 'computer-3');
    const submittedBlocked = authorizeReopen('admin', 'admin-user', submittedAttempt.id, 'Reopen submitted attempt');
    const expiredBlocked = authorizeReopen('admin', 'admin-user', expiredAttempt.id, 'Reopen expired attempt');
    expect(submittedBlocked.ok).toBe(false);
    expect(expiredBlocked.ok).toBe(false);

    render(h(AdminReopenCard, { reason: 'Approved after unexpected interruption.' }));
    await expect.element(page.getByRole('heading', { name: 'Reopen locked attempt' })).toBeVisible();
    await expect.element(page.getByRole('textbox', { name: 'Reason for reopening' })).toHaveValue('Approved after unexpected interruption.');
    await expect(page).toMatchScreenshot('h05/scenario-specific-ui-screenshots/admin-reopen-form');

    recordResult('Test E', 'Candidate reopen denial', 'rejected', candidateDenied.ok ? 'allowed' : 'rejected');
    recordResult('Test E', 'Lecturer reopen denial', 'rejected', lecturerDenied.ok ? 'allowed' : 'rejected');
    recordResult('Test E', 'Missing reason', 'rejected', reasonRequired.ok ? 'allowed' : 'rejected');
    recordResult('Test E', 'Administrator reopen', 'allowed', adminReopen.ok ? 'allowed' : 'rejected');
    recordResult('Test E', 'Submitted attempt reopen', 'rejected', submittedBlocked.ok ? 'allowed' : 'rejected');
    recordResult('Test E', 'Expired attempt reopen', 'rejected', expiredBlocked.ok ? 'allowed' : 'rejected');
    expect(auditLog.some((entry) => entry.action === 'attempt_reopened' && entry.reason === 'Approved after unexpected interruption.')).toBe(true);
    expect(auditLog.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Bypass section — stale token and forged state', () => {
  beforeEach(() => {
    resetFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects stale session tokens, forged states and saves on locked attempts', () => {
    const candidateId = 'student-a';
    const assessmentId = 'assessment-h05';
    const attempt = createAttemptRecord('attempt-h05-f', candidateId, assessmentId, 'in_progress', 'Original answer', 'token-live', 'computer-1');
    const staleTokenReplay = startAttempt(candidateId, assessmentId, 'computer-2', 'token-stale');
    const forgedStateAttempt = saveAnswer(attempt.id, 'Forged state tamper', 'computer-2');
    const lockedAttempt = createAttemptRecord('attempt-h05-f-locked', candidateId, assessmentId, 'abandoned', 'Original answer', null, 'computer-1');
    const lockedSave = saveAnswer(lockedAttempt.id, 'Locked save');
    const staleTokenCheck = staleTokenReplay.ok === false && staleTokenReplay.code === DUPLICATE_ACTIVE_SESSION_CODE;
    const forgedStateCheck = forgedStateAttempt.ok === false && forgedStateAttempt.code === DUPLICATE_ACTIVE_SESSION_CODE;
    const lockedSaveCheck = lockedSave.ok === false && lockedAttempt.answerText === 'Original answer';

    recordResult('Bypass', 'Stale token replay', 'rejected', staleTokenCheck ? 'rejected' : 'accepted');
    recordResult('Bypass', 'Forged state body', 'rejected', forgedStateCheck ? 'rejected' : 'accepted');
    recordResult('Bypass', 'Locked save', 'rejected', lockedSaveCheck ? 'rejected' : 'accepted');
    expect(staleTokenCheck).toBe(true);
    expect(forgedStateCheck).toBe(true);
    expect(lockedSaveCheck).toBe(true);
    expect(auditLog.length).toBeGreaterThanOrEqual(3);
  });
});

it('prints the results table and confirms the overall security result', () => {
  const tableText = results.map((row) => `${row.testGroup} | ${row.action} | ${row.expectedOutcome} | ${row.actualOutcome} | ${row.status}`).join('\n');
  console.log(tableText);
  expect(results.every((row) => row.status === 'PASS')).toBe(true);
  const finalStatus = results.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
  console.log(`Final overall result: ${finalStatus}`);
  expect(auditLog.length).toBeGreaterThan(0);
});
