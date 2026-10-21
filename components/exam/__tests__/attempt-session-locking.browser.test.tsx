import { createElement } from 'react';
import { page } from 'vitest/browser';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render } from 'vitest-browser-react';

type AttemptState = 'not_started' | 'in_progress' | 'submitted' | 'auto_submitted_violation' | 'timed_out' | 'abandoned' | 'reset';
type Role = 'admin' | 'exam_officer' | 'lecturer' | 'invigilator' | 'candidate';
type AttemptRecord = {
  id: string;
  candidateId: string;
  assessmentId: string;
  startAt: Date | null;
  expiresAt: Date | null;
  status: AttemptState;
  isActive: boolean;
};
type AssessmentRecord = {
  id: string;
  courseId: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  durationMins: number;
  maxAttempts: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  items: Array<{ id: string; questionId: string; question: { options: Array<{ id: string }> } }>;
};
type SessionRecord = {
  id: string;
  attemptId: string;
  sessionTokenHash: string;
  userAgent: string | null;
  lastSeenAt: Date;
  startedAt: Date;
  supersededAt: Date | null;
  endedAt: Date | null;
};
type TimeEventRecord = {
  id: string;
  attemptId: string;
  eventType: string;
  occurredAt: Date;
  reason: string | null;
};
type AnswerRecord = {
  id: string;
  attemptId: string;
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  syncStatus: string;
};
type AuditRecord = {
  actorId: string | null;
  actionType: string;
  entityId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
};
type OutcomeRow = {
  name: string;
  state: string;
  expected: string;
  actual: string;
  reason: string;
  status: 'PASS' | 'FAIL';
};

const { fixture } = vi.hoisted(() => {
  const data = {
    role: 'candidate' as Role,
    userId: 'candidate-one',
    attempts: [] as AttemptRecord[],
    assessments: [] as AssessmentRecord[],
    enrollments: [] as Array<{ userId: string; courseId: string; role: Role }>,
    readiness: [] as Array<{ candidateId: string; detailsJson: string | null }>,
    sessions: [] as SessionRecord[],
    timeEvents: [] as TimeEventRecord[],
    answers: [] as AnswerRecord[],
    auditEvents: [] as AuditRecord[],
    mappings: [] as Array<Record<string, unknown>>,
    tokenCounter: 0,
    idCounter: 0,
    transactionTail: Promise.resolve(),
    tx: {} as Record<string, unknown>,
    auth: vi.fn(async () => ({ user: { id: data.userId, role: data.role } })),
    createAuditEvent: vi.fn(async (event: AuditRecord) => {
      data.auditEvents.push(structuredClone(event));
      return { id: `audit-${data.auditEvents.length}` };
    }),
  };
  const matches = (attempt: AttemptRecord, where: Record<string, unknown>): boolean => {
    if (typeof where.id === 'string' && attempt.id !== where.id) return false;
    if (typeof where.candidateId === 'string' && attempt.candidateId !== where.candidateId) return false;
    if (typeof where.assessmentId === 'string' && attempt.assessmentId !== where.assessmentId) return false;
    if (typeof where.isActive === 'boolean' && attempt.isActive !== where.isActive) return false;
    if (typeof where.status === 'string' && attempt.status !== where.status) return false;
    const statusFilter = where.status as { in?: string[] } | undefined;
    if (statusFilter?.in && !statusFilter.in.includes(attempt.status)) return false;
    const expiry = where.expiresAt as { lte?: Date } | undefined;
    if (expiry?.lte && (!attempt.expiresAt || attempt.expiresAt > expiry.lte)) return false;
    return true;
  };
  const store = data;
  const attemptModel = {
    updateMany: vi.fn(async ({ where, data: update }: {
      where: Record<string, unknown>;
      data: Partial<AttemptRecord>;
    }) => {
      const records = store.attempts.filter((attempt) => matches(attempt, where));
      for (const attempt of records) Object.assign(attempt, update);
      return { count: records.length };
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      data.attempts.find((attempt) => matches(attempt, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      data.attempts.find((attempt) => matches(attempt, where)) ?? null),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      data.attempts.filter((attempt) => matches(attempt, where)).length),
    create: vi.fn(async ({ data: record }: { data: Omit<AttemptRecord, 'id'> }) => {
      const attempt = { ...record, id: `attempt-${++store.idCounter}` };
      store.attempts.push(attempt);
      return attempt;
    }),
    update: vi.fn(async ({ where, data: update }: {
      where: Record<string, unknown>;
      data: Partial<AttemptRecord>;
    }) => {
      const attempt = store.attempts.find((record) => matches(record, where));
      if (!attempt) throw new Error('Attempt fixture was not found');
      Object.assign(attempt, update);
      return attempt;
    }),
  };
  const sessionModel = {
    create: vi.fn(async ({ data: record }: {
      data: { attemptId: string; sessionTokenHash: string; userAgent: string | null };
    }) => {
      const now = new Date();
      const session: SessionRecord = {
        ...record,
        id: `session-${store.sessions.length + 1}`,
        lastSeenAt: now,
        startedAt: now,
        supersededAt: null,
        endedAt: null,
      };
      store.sessions.push(session);
      return session;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => {
      const sessions = data.sessions.filter((session) =>
        (typeof where.attemptId !== 'string' || session.attemptId === where.attemptId)
        && (where.supersededAt !== null || session.supersededAt === null)
        && (where.endedAt !== null || session.endedAt === null));
      if (orderBy) sessions.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
      return sessions[0] ?? null;
    }),
    update: vi.fn(async ({ where, data: update }: {
      where: Record<string, unknown>;
      data: Partial<SessionRecord>;
    }) => {
      const session = store.sessions.find((record) => record.id === where.id);
      if (!session) throw new Error('Session fixture was not found');
      Object.assign(session, update);
      return session;
    }),
    updateMany: vi.fn(async ({ where, data: update }: {
      where: Record<string, unknown>;
      data: Partial<SessionRecord>;
    }) => {
      const sessions = store.sessions.filter((session) =>
        session.attemptId === where.attemptId
        && (where.supersededAt !== null || session.supersededAt === null)
        && (where.endedAt !== null || session.endedAt === null));
      for (const session of sessions) Object.assign(session, update);
      return { count: sessions.length };
    }),
  };
  const timeEventModel = {
    create: vi.fn(async ({ data: event }: {
      data: Omit<TimeEventRecord, 'id'>;
    }) => {
      const record = { ...event, id: `time-event-${store.timeEvents.length + 1}` };
      store.timeEvents.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where }: {
      where: Record<string, unknown>;
    }) => data.timeEvents
      .filter((event) => event.attemptId === where.attemptId && event.eventType === where.eventType)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null),
  };
  const responseModel = {
    create: vi.fn(async ({ data: answer }: { data: Omit<AnswerRecord, 'id'> }) => {
      const record = { ...answer, id: `answer-${store.answers.length + 1}` };
      store.answers.push(record);
      return record;
    }),
  };
  const prisma = {
    assessment: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        data.assessments.find((assessment) => assessment.id === where.id) ?? null),
    },
    userCourse: {
      findFirst: vi.fn(async ({ where }: {
        where: { userId: string; courseId: string; role: Role };
      }) => data.enrollments.find((entry) =>
        entry.userId === where.userId && entry.courseId === where.courseId && entry.role === where.role) ?? null),
    },
    readinessCheck: {
      findFirst: vi.fn(async ({ where }: { where: { candidateId: string } }) =>
        data.readiness.find((entry) => entry.candidateId === where.candidateId) ?? null),
    },
    timeAdjustment: { findFirst: vi.fn(async () => null) },
    attempt: attemptModel,
    attemptSession: sessionModel,
    attemptTimeEvent: timeEventModel,
    presentationMapping: {
      create: vi.fn(async ({ data: mapping }: { data: Record<string, unknown> }) => {
        data.mappings.push(mapping);
        return mapping;
      }),
    },
    response: responseModel,
    $queryRaw: vi.fn(async () => [{ locked: true }]),
    $transaction: vi.fn(async <T,>(callback: (tx: Record<string, unknown>) => Promise<T>): Promise<T> => {
      const previousTransaction = data.transactionTail;
      let releaseTransaction: () => void = () => undefined;
      data.transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      try {
        return await callback(data.tx);
      } finally {
        releaseTransaction();
      }
    }),
  };
  const transactionClient = Object.fromEntries(
    Object.entries(prisma).filter(([key]) => key !== '$transaction'),
  );
  data.tx = transactionClient;
  return { fixture: Object.assign(data, { prisma }) };
});

type NextRequestType = import('next/server').NextRequest;
type StartHandler = typeof import('@/app/api/attempts/start/route').POST;
type ReopenHandler = typeof import('@/app/api/admin/reopen-attempt/route').POST;
type RecoverHandler = typeof import('@/app/api/attempts/[id]/recover-session/route').POST;

let startAttempt: StartHandler;
let reopenAttempt: ReopenHandler;
let recoverSession: RecoverHandler;
const outcomeRows: OutcomeRow[] = [];

const BASE_TIME = new Date('2026-10-17T09:00:00.000Z');
const CANDIDATE_ID = 'candidate-one';
const SECOND_CANDIDATE_ID = 'candidate-two';
const ADMIN_ID = 'administrator-one';
const EXAM_ID = 'exam-open';
const OTHER_EXAM_ID = 'exam-other';
const ANSWER_TEXT = 'Saved candidate response stays intact.';
const REOPEN_REASON = 'Approved after a documented interruption.';
const ATTEMPT_STATES: Record<AttemptState, boolean> = {
  not_started: true,
  in_progress: false,
  submitted: false,
  auto_submitted_violation: false,
  timed_out: false,
  abandoned: false,
  reset: true,
};
const SCHEMA_FILES = import.meta.glob(
  '../../../prisma/schema.prisma',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const h = createElement;

function installRouteMocks(): void {
  vi.doMock('@/auth', () => ({ auth: fixture.auth }));
  vi.doMock('@/lib/audit', () => ({ createAuditEvent: fixture.createAuditEvent }));
  vi.doMock('@/lib/prisma', () => ({ prisma: fixture.prisma }));
  vi.doMock('@/lib/session-integrity', () => ({
    DUPLICATE_ACTIVE_SESSION_CODE: 'DUPLICATE_ACTIVE_SESSION',
    DUPLICATE_ACTIVE_SESSION_MESSAGE: 'A duplicate active session cannot be opened',
    INTERRUPTED_SESSION_REQUIRES_STAFF_CODE: 'INTERRUPTED_SESSION_REQUIRES_STAFF',
    createSessionToken: () => `test-session-${++fixture.tokenCounter}`,
    hashSessionToken: (token: string) => `hash:${token}`,
    validateAttemptSession: async (attemptId: string, token: string | null) => {
      const session = fixture.sessions
        .filter((entry) => entry.attemptId === attemptId && entry.supersededAt === null && entry.endedAt === null)
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0];
      if (!token || !session || session.sessionTokenHash !== `hash:${token}`) {
        return {
          ok: false as const,
          code: 'DUPLICATE_ACTIVE_SESSION',
          error: 'A duplicate active session cannot be opened',
        };
      }
      if (Date.now() - session.lastSeenAt.getTime() > 2 * 60 * 1000) {
        return {
          ok: false as const,
          code: 'INTERRUPTED_SESSION_REQUIRES_STAFF',
          error: 'This interrupted attempt is locked. Authorized personnel must reactivate it before you can continue.',
        };
      }
      session.lastSeenAt = new Date();
      return { ok: true as const, session };
    },
  }));
}

function AttemptNotice({ heading, message }: { heading: string; message: string }) {
  return h('main', {
    className: 'unit-test-3-evidence',
    style: {
      alignItems: 'center',
      background: '#fff',
      color: '#000',
      display: 'flex',
      fontFamily: '"Times New Roman", Times, serif',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '48px',
    },
  }, h('style', null, '.unit-test-3-evidence, .unit-test-3-evidence * { background-color: #fff !important; color: #000 !important; font-family: "Times New Roman", Times, serif !important; }'),
  h('section', { style: { border: '1px solid #000', padding: '36px', width: '560px' } },
    h('h1', null, heading),
    h('p', { role: 'alert' }, message),
  ));
}

function RestoredExamEvidence({ answerText }: { answerText: string }) {
  return h('main', {
    className: 'unit-test-3-evidence',
    style: {
      background: '#fff',
      color: '#000',
      fontFamily: '"Times New Roman", Times, serif',
      minHeight: '100vh',
      padding: '48px',
    },
  }, h('style', null, '.unit-test-3-evidence, .unit-test-3-evidence * { background-color: #fff !important; color: #000 !important; font-family: "Times New Roman", Times, serif !important; }'),
  h('h1', null, 'Examination restored'),
  h('p', null, 'Your authorized session has been recovered.'),
  h('h2', null, 'Saved answer'),
  h('p', { 'data-testid': 'restored-answer' }, answerText),
  );
}

function resetFixture(): void {
  fixture.role = 'candidate';
  fixture.userId = CANDIDATE_ID;
  fixture.attempts.length = 0;
  fixture.assessments.length = 0;
  fixture.enrollments.length = 0;
  fixture.readiness.length = 0;
  fixture.sessions.length = 0;
  fixture.timeEvents.length = 0;
  fixture.answers.length = 0;
  fixture.auditEvents.length = 0;
  fixture.mappings.length = 0;
  fixture.tokenCounter = 0;
  fixture.idCounter = 0;
  fixture.transactionTail = Promise.resolve();
  vi.clearAllMocks();
  fixture.auth.mockImplementation(async () => ({ user: { id: fixture.userId, role: fixture.role } }));
  fixture.createAuditEvent.mockImplementation(async (event: AuditRecord) => {
    fixture.auditEvents.push(structuredClone(event));
    return { id: `audit-${fixture.auditEvents.length}` };
  });
  fixture.assessments.push(makeAssessment(EXAM_ID), makeAssessment(OTHER_EXAM_ID));
  fixture.enrollments.push(
    { userId: CANDIDATE_ID, courseId: 'course-one', role: 'candidate' },
    { userId: SECOND_CANDIDATE_ID, courseId: 'course-one', role: 'candidate' },
  );
  fixture.readiness.push(
    { candidateId: CANDIDATE_ID, detailsJson: '{"failedCount":0,"blocked":false}' },
    { candidateId: SECOND_CANDIDATE_ID, detailsJson: '{"failedCount":0,"blocked":false}' },
  );
}

function makeAssessment(id: string): AssessmentRecord {
  return {
    id,
    courseId: 'course-one',
    status: 'published',
    startAt: new Date(BASE_TIME.getTime() - 60 * 60 * 1000),
    endAt: new Date(BASE_TIME.getTime() + 60 * 60 * 1000),
    durationMins: 30,
    maxAttempts: 1,
    randomizeQuestions: false,
    randomizeOptions: false,
    items: [
      { id: `item-${id}-1`, questionId: `question-${id}-1`, question: { options: [] } },
      { id: `item-${id}-2`, questionId: `question-${id}-2`, question: { options: [] } },
    ],
  };
}

function addAttempt(
  status: AttemptState,
  options: { candidateId?: string; assessmentId?: string; active?: boolean; expiresAt?: Date | null } = {},
): AttemptRecord {
  const attempt: AttemptRecord = {
    id: `seeded-attempt-${fixture.attempts.length + 1}`,
    candidateId: options.candidateId ?? CANDIDATE_ID,
    assessmentId: options.assessmentId ?? EXAM_ID,
    startAt: new Date(BASE_TIME.getTime() - 60_000),
    expiresAt: options.expiresAt === undefined ? new Date(BASE_TIME.getTime() + 10 * 60_000) : options.expiresAt,
    status,
    isActive: options.active ?? status === 'in_progress',
  };
  fixture.attempts.push(attempt);
  fixture.answers.push({
    id: `seeded-answer-${fixture.answers.length + 1}`,
    attemptId: attempt.id,
    questionId: `question-${EXAM_ID}-1`,
    currentText: ANSWER_TEXT,
    selectedOptionId: null,
    syncStatus: 'synced',
  });
  if (status === 'in_progress') addSession(attempt.id, 'seeded-session-token', 'device-one');
  return attempt;
}

function addSession(attemptId: string, token: string, userAgent: string): SessionRecord {
  const now = new Date();
  const session: SessionRecord = {
    id: `session-${fixture.sessions.length + 1}`,
    attemptId,
    sessionTokenHash: `hash:${token}`,
    userAgent,
    lastSeenAt: now,
    startedAt: now,
    supersededAt: null,
    endedAt: null,
  };
  fixture.sessions.push(session);
  return session;
}

function setIdentity(role: Role, userId: string): void {
  fixture.role = role;
  fixture.userId = userId;
}

function createRequest(
  url: string,
  method: string,
  body?: unknown,
  options: { userAgent?: string; cookie?: string } = {},
): NextRequestType {
  const headers = new Headers({ 'User-Agent': options.userAgent ?? 'test-device' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.cookie) headers.set('Cookie', options.cookie);
  const request = new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const requestHeaders = {
    get: (name: string) => name.toLowerCase() === 'user-agent'
      ? options.userAgent ?? 'test-device'
      : request.headers.get(name),
  };
  Object.defineProperty(request, 'headers', { value: requestHeaders });
  const cookieValues = new Map(
    (options.cookie ?? '').split(';').map((cookie) => {
      const separator = cookie.indexOf('=');
      return separator < 0
        ? ['', '']
        : [cookie.slice(0, separator).trim(), cookie.slice(separator + 1).trim()];
    }),
  );
  return Object.assign(request, {
    cookies: {
      get: (name: string) => {
        const value = cookieValues.get(name);
        return value === undefined ? undefined : { name, value };
      },
    },
  }) as NextRequestType;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function storageSnapshot(): string {
  return JSON.stringify({
    attempts: fixture.attempts,
    sessions: fixture.sessions,
    timeEvents: fixture.timeEvents,
    answers: fixture.answers,
    mappings: fixture.mappings,
  });
}

function saveOutcome(name: string, state: string, expected: string, actual: string, reason: string): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  outcomeRows.push({ name, state, expected, actual, reason, status });
  expect(actual, `${name}: ${reason}`).toBe(expected);
}

function attemptStatusValuesFromSchema(): string[] {
  const schema = SCHEMA_FILES['../../../prisma/schema.prisma'] ?? '';
  const enumBody = schema.match(/enum AttemptStatus\s*\{([^}]*)\}/)?.[1] ?? '';
  return enumBody.split(/\s+/).filter((value) => /^[a-z][a-z_]*$/.test(value));
}

async function startFor(
  candidateId = CANDIDATE_ID,
  assessmentId = EXAM_ID,
  body: Record<string, unknown> = { assessmentId },
  options: { userAgent?: string; cookie?: string } = {},
): Promise<Response> {
  setIdentity('candidate', candidateId);
  return startAttempt(createRequest(`http://localhost/api/attempts/start`, 'POST', body, options));
}

async function reopenFor(attemptId: string, actorRole: Role, actorId: string, reason = REOPEN_REASON): Promise<Response> {
  setIdentity(actorRole, actorId);
  return reopenAttempt(createRequest('http://localhost/api/admin/reopen-attempt', 'POST', {
    attemptId,
    reason,
  }));
}

async function recoverFor(attemptId: string, candidateId = CANDIDATE_ID): Promise<Response> {
  setIdentity('candidate', candidateId);
  return recoverSession(
    createRequest(`http://localhost/api/attempts/${attemptId}/recover-session`, 'POST', {}),
    { params: Promise.resolve({ id: attemptId }) },
  );
}

describe('Unit Test 3 — attempt and session locking', () => {
  beforeAll(async () => {
    (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;
    installRouteMocks();
    const [startModule, reopenModule, recoverModule] = await Promise.all([
      import('@/app/api/attempts/start/route'),
      import('@/app/api/admin/reopen-attempt/route'),
      import('@/app/api/attempts/[id]/recover-session/route'),
    ]);
    startAttempt = startModule.POST;
    reopenAttempt = reopenModule.POST;
    recoverSession = recoverModule.POST;
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BASE_TIME);
    resetFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    expect(outcomeRows).toHaveLength(19 + Object.keys(ATTEMPT_STATES).length);
    expect(outcomeRows.every((row) => row.status === 'PASS')).toBe(true);
    console.info([
      'Case\tStarting state\tExpected\tActual\tReason\tStatus',
      ...outcomeRows.map((row) =>
        `${row.name}\t${row.state}\t${row.expected}\t${row.actual}\t${row.reason}\t${row.status}`),
      `Overall result\t\t\t\t${outcomeRows.length > 0 && outcomeRows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL'}`,
    ].join('\n'));
  });

  it('denies a second start while an active attempt exists without changing its answer', async () => {
    const attempt = addAttempt('in_progress');
    const before = storageSnapshot();
    const response = await startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID });
    const body = await readBody(response);

    expect(response.status).toBe(409);
    expect(body.code).toBe('DUPLICATE_ACTIVE_SESSION');
    expect(body.error).toBe('A duplicate active session cannot be opened');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]).toMatchObject({ id: attempt.id, status: 'in_progress', isActive: true });
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Second start with active attempt', 'in_progress', 'denied: DUPLICATE_ACTIVE_SESSION', `denied: ${String(body.code)}`, String(body.error));
  });

  it('denies a submitted attempt and preserves its submitted state and saved answer', async () => {
    addAttempt('submitted', { active: false });
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Maximum attempts reached');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]?.status).toBe('submitted');
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Submitted attempt restart', 'submitted', 'denied: Maximum attempts reached', `denied: ${String(body.error)}`, String(body.error));
  });

  it('denies an already expired timed-out attempt without changing its record', async () => {
    addAttempt('timed_out', { active: false });
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Maximum attempts reached');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]).toMatchObject({ status: 'timed_out', isActive: false });
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Restart after stored expiry', 'timed_out', 'denied: Maximum attempts reached', `denied: ${String(body.error)}`, String(body.error));
  });

  it('denies and marks an overdue active attempt timed out before refusing another start', async () => {
    const attempt = addAttempt('in_progress', {
      expiresAt: new Date(BASE_TIME.getTime() - 1),
    });
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Maximum attempts reached');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]).toMatchObject({ id: attempt.id, status: 'timed_out', isActive: false });
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);
    saveOutcome('Restart after schedule expiry', 'in_progress / expiresAt passed', 'denied; status timed_out', `denied; status ${fixture.attempts[0]?.status}`, String(body.error));
  });

  it('denies a terminated abandoned attempt and preserves its state and answer', async () => {
    addAttempt('abandoned', { active: false });
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Maximum attempts reached');
    expect(fixture.attempts[0]?.status).toBe('abandoned');
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Restart after termination', 'abandoned', 'denied: Maximum attempts reached', `denied: ${String(body.error)}`, String(body.error));
  });

  it('reopens and recovers the same attempt once while retaining its answer and audit reason', async () => {
    const attempt = addAttempt('abandoned', { active: false });
    addSession(attempt.id, 'old-session-token', 'device-one');
    vi.setSystemTime(new Date(BASE_TIME.getTime() + 1_000));
    const reopenResponse = await reopenFor(attempt.id, 'admin', ADMIN_ID);
    expect(reopenResponse.status).toBe(200);
    expect(fixture.attempts[0]).toMatchObject({ id: attempt.id, status: 'in_progress', isActive: true });

    const recovered = await recoverFor(attempt.id);
    const recoveredBody = await readBody(recovered);
    expect(recovered.status).toBe(200);
    expect(recoveredBody).toMatchObject({ recovered: true, attemptId: attempt.id });
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);
    expect(fixture.sessions).toHaveLength(2);
    expect(fixture.sessions[0]?.supersededAt).toEqual(new Date(BASE_TIME.getTime() + 1_000));
    const reopenAudit = fixture.auditEvents.find((event) => event.actionType === 'attempt_reopened');
    expect(reopenAudit).toMatchObject({ actorId: ADMIN_ID, entityId: attempt.id, reason: REOPEN_REASON });

    const restart = await startFor();
    expect(restart.status).toBe(409);
    expect((await readBody(restart)).code).toBe('DUPLICATE_ACTIVE_SESSION');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.answers[0]?.currentText).toBe(ANSWER_TEXT);

    const secondRecovery = await recoverFor(attempt.id);
    expect(secondRecovery.status).toBe(403);
    expect(fixture.sessions).toHaveLength(2);
    saveOutcome('Authorized reopen and recovery', 'abandoned -> in_progress', 'allowed once', 'allowed once', `${String(recoveredBody.attemptId)} recovered; a restart was denied and the second recovery returned ${secondRecovery.status}. ${REOPEN_REASON}`);
  });

  it('creates a new attempt for an eligible candidate with no previous attempt', async () => {
    const response = await startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'device-one' });
    const body = await readBody(response);

    expect(response.status).toBe(201);
    expect(typeof body.attemptId).toBe('string');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]).toMatchObject({ candidateId: CANDIDATE_ID, assessmentId: EXAM_ID, status: 'in_progress', isActive: true });
    expect(fixture.answers).toHaveLength(2);
    expect(fixture.sessions).toHaveLength(1);
    expect(fixture.sessions[0]?.userAgent).toBe('device-one');
    saveOutcome('Eligible candidate without attempt', 'none', 'allowed', 'allowed', `HTTP ${response.status}; created ${String(body.attemptId)}`);
  });

  it('denies a candidate before the scheduled assessment window', async () => {
    fixture.assessments[0]!.startAt = new Date(BASE_TIME.getTime() + 60_000);
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Assessment has not started yet');
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Before assessment start', 'no attempt', 'denied: Assessment has not started yet', `denied: ${String(body.error)}`, String(body.error));
  });

  it('denies a candidate after the scheduled assessment window', async () => {
    fixture.assessments[0]!.endAt = new Date(BASE_TIME.getTime() - 1);
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Assessment has ended');
    expect(storageSnapshot()).toBe(before);
    saveOutcome('After assessment end', 'no attempt', 'denied: Assessment has ended', `denied: ${String(body.error)}`, String(body.error));
  });

  it('denies an ineligible candidate without creating an attempt', async () => {
    fixture.enrollments.length = 0;
    const before = storageSnapshot();
    const response = await startFor();
    const body = await readBody(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('You are not enrolled for this course assessment.');
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Candidate without course eligibility', 'no attempt', 'denied: 403', `denied: ${response.status}`, String(body.error));
  });

  it('does not let a reopened attempt authorize another candidate or examination', async () => {
    const attempt = addAttempt('abandoned', { active: false });
    vi.setSystemTime(new Date(BASE_TIME.getTime() + 1_000));
    expect((await reopenFor(attempt.id, 'admin', ADMIN_ID)).status).toBe(200);

    const foreignRecovery = await recoverFor(attempt.id, SECOND_CANDIDATE_ID);
    expect(foreignRecovery.status).toBe(409);
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]?.candidateId).toBe(CANDIDATE_ID);

    const otherExamStart = await startFor(CANDIDATE_ID, OTHER_EXAM_ID, { assessmentId: OTHER_EXAM_ID });
    expect(otherExamStart.status).toBe(409);
    expect((await readBody(otherExamStart)).code).toBe('DUPLICATE_ACTIVE_SESSION');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]?.id).toBe(attempt.id);
    saveOutcome('Reopen scope isolation', 'reopened attempt for exam-open', 'foreign recovery and other-exam start denied', 'foreign recovery and other-exam start denied', `HTTP ${foreignRecovery.status} and ${otherExamStart.status}; the active attempt remains ${attempt.id}.`);
  });

  it('stops recovery after the reopened attempt is submitted, expired, or terminated', async () => {
    for (const status of ['submitted', 'timed_out', 'abandoned'] as const) {
      resetFixture();
      const attempt = addAttempt(status, { active: false });
      const response = await recoverFor(attempt.id);
      expect(response.status, `${status} attempt must not recover`).toBe(409);
      expect(fixture.attempts[0]?.status).toBe(status);
      expect(fixture.sessions).toHaveLength(0);
    }
    saveOutcome('Recovery after terminal state', 'submitted / timed_out / abandoned', 'denied for every state', 'denied for every state', 'Recovery requires an active in-progress attempt.');
  });

  it('allows only an authorized staff role to reopen an attempt and requires a reason', async () => {
    const attempt = addAttempt('abandoned', { active: false });
    const before = storageSnapshot();

    const lecturerDenied = await reopenFor(attempt.id, 'lecturer', 'lecturer-one');
    expect(lecturerDenied.status).toBe(403);
    expect(storageSnapshot()).toBe(before);

    setIdentity('admin', ADMIN_ID);
    const noReason = await reopenAttempt(createRequest('http://localhost/api/admin/reopen-attempt', 'POST', {
      attemptId: attempt.id,
      reason: '   ',
    }));
    expect(noReason.status).toBe(400);
    expect(storageSnapshot()).toBe(before);

    const allowed = await reopenFor(attempt.id, 'exam_officer', 'exam-officer-one');
    expect(allowed.status).toBe(200);
    expect(fixture.attempts[0]).toMatchObject({ status: 'in_progress', isActive: true });
    saveOutcome('Authorized reopening requirements', 'abandoned', 'authorized staff with reason only', 'authorized staff with reason only', `lecturer ${lecturerDenied.status}; empty reason ${noReason.status}; exam officer ${allowed.status}. ${REOPEN_REASON}`);
  });

  it('allows one reopen from timed_out and rejects terminal or previously reopened attempts', async () => {
    const timedOutAttempt = addAttempt('timed_out', { active: false });
    const concurrentReopens = await Promise.all([
      reopenFor(timedOutAttempt.id, 'admin', ADMIN_ID),
      reopenFor(timedOutAttempt.id, 'admin', ADMIN_ID),
    ]);
    expect(concurrentReopens.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(fixture.attempts[0]).toMatchObject({ status: 'in_progress', isActive: true });
    expect(fixture.timeEvents).toHaveLength(1);

    const reopenedSnapshot = storageSnapshot();
    const duplicateReopen = await reopenFor(timedOutAttempt.id, 'admin', ADMIN_ID);
    expect(duplicateReopen.status).toBe(409);
    expect(fixture.timeEvents).toHaveLength(1);
    expect(storageSnapshot()).toBe(reopenedSnapshot);

    const deniedStatuses = ['submitted', 'timed_out', 'abandoned'] as const;
    for (const status of deniedStatuses) {
      resetFixture();
      const attempt = addAttempt('abandoned', { active: false });
      expect((await reopenFor(attempt.id, 'admin', ADMIN_ID)).status).toBe(200);
      fixture.attempts[0]!.status = status;
      fixture.attempts[0]!.isActive = false;
      const before = storageSnapshot();
      const denied = await reopenFor(attempt.id, 'admin', ADMIN_ID);
      expect(denied.status, `${status} attempt must not be reopened`).toBe(409);
      expect(fixture.attempts[0]?.status).toBe(status);
      expect(fixture.timeEvents).toHaveLength(1);
      expect(storageSnapshot()).toBe(before);
    }
    saveOutcome('One-time reopening and terminal-state lock', 'timed_out / submitted / timed_out / abandoned', 'one allowed; repeats and terminal states denied', 'one allowed; repeats and terminal states denied', 'The route accepts timed_out once, then denies a second reopen or a reopen after a terminal state.');
  });

  it('blocks a second device and stale token without altering the active attempt', async () => {
    const firstStart = await startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'device-one' });
    expect(firstStart.status).toBe(201);
    const attemptId = String((await readBody(firstStart)).attemptId);
    const before = storageSnapshot();

    const secondDevice = await startFor(
      CANDIDATE_ID,
      EXAM_ID,
      { assessmentId: EXAM_ID },
      { userAgent: 'device-two' },
    );
    const secondBody = await readBody(secondDevice);
    expect(secondDevice.status).toBe(409);
    expect(secondBody.code).toBe('DUPLICATE_ACTIVE_SESSION');

    const staleCookie = `exam_session_${attemptId}=stale-session-token`;
    const staleSession = await startFor(
      CANDIDATE_ID,
      EXAM_ID,
      { assessmentId: EXAM_ID },
      { userAgent: 'device-one', cookie: staleCookie },
    );
    const staleBody = await readBody(staleSession);
    expect(staleSession.status).toBe(409);
    expect(staleBody.code).toBe('DUPLICATE_ACTIVE_SESSION');
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.answers).toHaveLength(2);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Duplicate device and stale token', 'in_progress', 'both denied', 'both denied', `device two ${String(secondBody.code)}; stale token ${String(staleBody.code)}. ${String(secondBody.error)}`);
  });

  it('serializes simultaneous starts so exactly one attempt is created', async () => {
    const [first, second] = await Promise.all([
      startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'device-one' }),
      startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'device-two' }),
    ]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 409]);
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.sessions).toHaveLength(1);
    expect(fixture.answers).toHaveLength(2);
    const decision = statuses[0] === 201 && statuses[1] === 409
      ? 'one allowed and one denied'
      : `unexpected HTTP ${statuses.join(' and ')}`;
    saveOutcome('Concurrent same-candidate start', 'none', 'one allowed and one denied', decision, 'Candidate-level transaction lock prevents duplicate active attempts.');
  });

  it('allows a second candidate to start independently while the first starts', async () => {
    const [first, second] = await Promise.all([
      startFor(CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'candidate-one-device' }),
      startFor(SECOND_CANDIDATE_ID, EXAM_ID, { assessmentId: EXAM_ID }, { userAgent: 'candidate-two-device' }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(fixture.attempts).toHaveLength(2);
    expect(new Set(fixture.attempts.map((attempt) => attempt.candidateId))).toEqual(
      new Set([CANDIDATE_ID, SECOND_CANDIDATE_ID]),
    );
    const decision = first.status === 201 && second.status === 201
      ? 'both allowed independently'
      : `unexpected HTTP ${first.status} and ${second.status}`;
    saveOutcome('Concurrent different-candidate start', 'none', 'both allowed independently', decision, 'Candidate transaction locks are scoped to candidate identity.');
  });

  it('safely rejects forged state, missing identity, missing exam, unknown attempt, and foreign attempt', async () => {
    const activeAttempt = addAttempt('in_progress');
    const before = storageSnapshot();
    const forged = await startFor(CANDIDATE_ID, EXAM_ID, {
      assessmentId: EXAM_ID,
      candidateId: SECOND_CANDIDATE_ID,
      role: 'admin',
      status: 'submitted',
      isActive: false,
    });
    expect(forged.status).toBe(409);
    expect(fixture.attempts[0]).toMatchObject({ id: activeAttempt.id, status: 'in_progress', isActive: true });
    expect(storageSnapshot()).toBe(before);

    setIdentity('candidate', '');
    const missingCandidate = await startAttempt(createRequest('http://localhost/api/attempts/start', 'POST', { assessmentId: EXAM_ID }));
    expect(missingCandidate.status).toBe(401);

    setIdentity('candidate', CANDIDATE_ID);
    const missingExam = await startAttempt(createRequest('http://localhost/api/attempts/start', 'POST', {}));
    expect(missingExam.status).toBe(400);

    const unknownAttempt = await recoverFor('unknown-attempt');
    expect(unknownAttempt.status).toBe(409);
    const foreignAttempt = await recoverFor(activeAttempt.id, SECOND_CANDIDATE_ID);
    expect(foreignAttempt.status).toBe(409);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Forged and invalid request data', 'in_progress', 'all denied without mutation', 'all denied without mutation', `HTTP ${forged.status}, ${missingCandidate.status}, ${missingExam.status}, ${unknownAttempt.status}, and ${foreignAttempt.status}. State and identity come from the stored attempt and authenticated session.`);
  });

  it('returns a stable denial for repeated identical starts without changing stored data', async () => {
    addAttempt('in_progress');
    const before = storageSnapshot();
    const first = await startFor();
    const firstBody = await readBody(first);
    const afterFirst = storageSnapshot();
    const second = await startFor();
    const secondBody = await readBody(second);

    expect(first.status).toBe(409);
    expect(second.status).toBe(first.status);
    expect(secondBody).toEqual(firstBody);
    expect(afterFirst).toBe(before);
    expect(storageSnapshot()).toBe(before);
    saveOutcome('Repeated identical start', 'in_progress', 'same 409 denial; no mutation', 'same 409 denial; no mutation', String(secondBody.error));
  });

  it('matches literal decisions for every persisted attempt state', async () => {
    const stateValues = attemptStatusValuesFromSchema();
    const missingStates = stateValues.filter((state) => !(state in ATTEMPT_STATES));
    const unexpectedStates = Object.keys(ATTEMPT_STATES).filter((state) => !stateValues.includes(state));
    expect(missingStates, `Attempt states missing expected decisions: ${missingStates.join(', ')}`).toEqual([]);
    expect(unexpectedStates, `Unexpected attempt state decisions: ${unexpectedStates.join(', ')}`).toEqual([]);

    for (const state of stateValues as AttemptState[]) {
      resetFixture();
      const prior = addAttempt(state, { active: state === 'in_progress' });
      const response = await startFor();
      const actual = response.status === 201;
      const expected = ATTEMPT_STATES[state];
      const body = await readBody(response);
      saveOutcome(
        `State matrix ${state}`,
        state,
        String(expected),
        String(actual),
        typeof body.error === 'string' ? body.error : 'new attempt created',
      );
      if (!expected) {
        expect(fixture.attempts).toHaveLength(1);
        expect(fixture.attempts[0]?.id).toBe(prior.id);
      } else {
        expect(fixture.attempts).toHaveLength(2);
      }
    }
  });

  it('shows real route outcomes for duplicate start, terminal attempt, and recovered exam', async () => {
    await page.viewport(1440, 1000);
    addAttempt('in_progress');
    const activeResponse = await startFor();
    const activeBody = await readBody(activeResponse);
    const duplicateNotice = await render(h(AttemptNotice, {
      heading: 'Examination access blocked',
      message: String(activeBody.error),
    }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('A duplicate active session cannot be opened');
    await expect(page).toMatchScreenshot('unit-test-3-session-locking/scenario-specific-ui-screenshots/second-attempt-denied');
    await duplicateNotice.unmount();

    resetFixture();
    addAttempt('submitted', { active: false });
    const submittedResponse = await startFor();
    const submittedBody = await readBody(submittedResponse);
    const terminalNotice = await render(h(AttemptNotice, {
      heading: 'Attempt locked',
      message: String(submittedBody.error),
    }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('Maximum attempts reached');
    await expect(page).toMatchScreenshot('unit-test-3-session-locking/scenario-specific-ui-screenshots/submitted-attempt-denied');
    await terminalNotice.unmount();

    resetFixture();
    const interruptedAttempt = addAttempt('abandoned', { active: false });
    vi.setSystemTime(new Date(BASE_TIME.getTime() + 1_000));
    expect((await reopenFor(interruptedAttempt.id, 'admin', ADMIN_ID)).status).toBe(200);
    expect((await recoverFor(interruptedAttempt.id)).status).toBe(200);
    const restored = await render(h(RestoredExamEvidence, { answerText: String(fixture.answers[0]?.currentText) }));
    await expect.element(page.getByText(ANSWER_TEXT)).toBeVisible();
    await expect(page).toMatchScreenshot('unit-test-3-session-locking/scenario-specific-ui-screenshots/exam-restored-after-reopening');
    await restored.unmount();
  });
});
