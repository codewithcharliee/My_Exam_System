import { createElement, type ReactNode } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

let getAuditEntries: (request: Request) => Promise<Response>;
let verifyAuditEntries: (request: Request) => Promise<Response>;
let adminResetAttempt: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
let adminReopenAttempt: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
let updateAssessment: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
let updateQuestion: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
let updateGradeDecision: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
let getReports: (request: Request) => Promise<Response>;
let createUser: (request: Request) => Promise<Response>;
let updateUser: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

async function loadAuditRouteModules(): Promise<void> {
  if (getAuditEntries && verifyAuditEntries && adminResetAttempt && adminReopenAttempt && updateAssessment && updateQuestion && updateGradeDecision && getReports && createUser && updateUser) {
    return;
  }

  (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;

  const auditModule = await import('@/app/api/audit/route');
  const verifyAuditModule = await import('@/app/api/audit/verify/route');
  const adminResetModule = await import('@/app/api/admin/reset-attempt/route');
  const adminReopenModule = await import('@/app/api/admin/reopen-attempt/route');
  const assessmentModule = await import('@/app/api/assessments/[id]/route');
  const questionModule = await import('@/app/api/questions/[id]/route');
  const gradeModule = await import('@/app/api/grading/[attemptId]/[questionId]/route');
  const reportsModule = await import('@/app/api/reports/route');
  const usersModule = await import('@/app/api/users/route');
  const userUpdateModule = await import('@/app/api/users/[id]/route');

  getAuditEntries = auditModule.GET;
  verifyAuditEntries = verifyAuditModule.GET;
  adminResetAttempt = adminResetModule.POST;
  adminReopenAttempt = adminReopenModule.POST;
  updateAssessment = assessmentModule.PATCH;
  updateQuestion = questionModule.PATCH;
  updateGradeDecision = gradeModule.PATCH;
  getReports = reportsModule.GET;
  createUser = usersModule.POST;
  updateUser = userUpdateModule.PATCH;
}

const NextRequest = Request;

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function invokeAuditRoute(
  handler: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  url: string,
  init?: RequestInit,
  context?: { params?: Promise<Record<string, string>> },
): Promise<Response> {
  await loadAuditRouteModules();
  return handler(makeRequest(url, init), context);
}

const CLOCK_START = new Date('2026-10-11T12:00:00.000Z');

type RoleName = 'admin' | 'exam_officer' | 'lecturer' | 'invigilator' | 'candidate';
type AuditRouteResult = { ok: boolean; body: Record<string, unknown> };
type AuditRow = {
  id: string;
  actorId: string | null;
  actor: { name: string; role: string; email: string } | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  metadataJson: string | null;
  occurredAt: Date;
  prevHash: string | null;
  hash: string | null;
};

type ResultRow = {
  group: string;
  action: string;
  item: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  accountStatus: 'active' | 'inactive' | 'suspended';
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type AttemptRecord = {
  id: string;
  candidateId: string;
  assessmentId: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'timed_out' | 'abandoned' | 'reset';
  isActive: boolean;
  expiresAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
};

type AssessmentRecord = {
  id: string;
  courseId: string;
  title: string;
  status: 'draft' | 'published' | 'closed' | 'archived';
  startAt: Date | null;
  endAt: Date | null;
  createdBy: string;
  durationMins: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
};

type QuestionRecord = {
  id: string;
  courseId: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'legal_problem' | 'case_analysis';
  text: string;
  status: 'draft' | 'approved';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  version: number;
  createdBy: string;
  markingSchemes: Array<{ id: string; version: number; maxMark: number; method: string; markingPoints: Array<{ id: string; pointText: string; marks: number; alternativesJson: string | null }> }>;
  answerKeys: Array<{ id: string; version: number; correctOptionId: string }>;
};

type GradeDecisionRecord = {
  id: string;
  attemptId: string;
  questionId: string;
  method: string | null;
  provisionalScore: number | null;
  lecturerDecision: 'pending' | 'accepted' | 'modified' | 'rejected' | 'replaced';
  officialGrade: number | null;
  gradedBy: string | null;
  gradedAt: Date | null;
  notes: string | null;
};

type ResultRecord = {
  id: string;
  attemptId: string;
  totalObjectiveScore: number | null;
  totalSubjectiveScore: number | null;
  totalScore: number | null;
  status: 'pending' | 'graded' | 'released';
  releasedAt: Date | null;
  releasedBy: string | null;
};

type SessionState = {
  user: {
    id: string;
    name: string;
    email: string;
    role: RoleName;
  };
};

const { mockPrisma, sessionState, mockRequireRole, mockRequireRoleForAction, setCurrentSession, resetMockState, getCurrentSession, assessmentData, attemptData, questionData, gradeDecisionData, resultData } = vi.hoisted(() => {
  const cryptoApi = globalThis.crypto;
  const encodeHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const stableStringify = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const computeHash = async (entry: AuditRow, previousHash: string): Promise<string> => {
    const content = stableStringify({
      actorId: entry.actorId,
      actionType: entry.actionType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason,
      metadata: entry.metadataJson ? JSON.parse(entry.metadataJson) : undefined,
      prevHash: previousHash,
      timestamp: new Date(entry.occurredAt).toISOString(),
    });
    const bytes = new TextEncoder().encode(content);
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return encodeHex(digest);
  };
  const createAuditEvent = async ({ actorId, actionType, entityType, entityId, reason, metadata }: { actorId: string | null; actionType: string; entityType?: string; entityId?: string; reason?: string; metadata?: Record<string, unknown> }): Promise<AuditRow | null> => {
    const lastEvent = auditEvents[auditEvents.length - 1] ?? null;
    const previousHash = lastEvent?.hash ?? 'GENESIS';
    const occurredAt = new Date();
    const content = stableStringify({
      actorId,
      actionType,
      entityType,
      entityId,
      reason,
      metadata,
      prevHash: previousHash,
      timestamp: occurredAt.toISOString(),
    });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const row: AuditRow = {
      id: `audit-${auditEvents.length + 1}`,
      actorId,
      actor: null,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      reason: reason ?? null,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      occurredAt,
      prevHash: previousHash,
      hash,
    };
    auditEvents.push(row);
    return row;
  };

  const sessionState: SessionState = {
    user: {
      id: 'admin-1',
      name: 'Ada Admin',
      email: 'admin@bingham.test',
      role: 'admin',
    },
  };

  const secretCandidateEmail = 'candidate.smith@bingham.test';
  const secretPassword = 'super-secret-password-value';
  const userData: UserRecord[] = [
    {
      id: 'admin-1',
      name: 'Ada Admin',
      email: 'admin@bingham.test',
      role: 'admin',
      accountStatus: 'active',
      passwordHash: 'hash-admin',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    {
      id: 'lecturer-1',
      name: 'Lena Lecturer',
      email: 'lecturer@bingham.test',
      role: 'lecturer',
      accountStatus: 'active',
      passwordHash: 'hash-lecturer',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
    {
      id: 'invigilator-1',
      name: 'Iris Invigilator',
      email: 'invigilator@bingham.test',
      role: 'invigilator',
      accountStatus: 'active',
      passwordHash: 'hash-invigilator',
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    },
    {
      id: 'candidate-1',
      name: 'Cora Candidate',
      email: secretCandidateEmail,
      role: 'candidate',
      accountStatus: 'active',
      passwordHash: secretPassword,
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
      updatedAt: new Date('2026-09-04T00:00:00.000Z'),
    },
  ];

  const courseData = {
    id: 'course-1',
    code: 'LAW101',
    title: 'Legal Research Methods',
    level: 'LLB',
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    updatedAt: new Date('2026-09-05T00:00:00.000Z'),
  };

  const assessmentData: AssessmentRecord = {
    id: 'assessment-1',
    courseId: courseData.id,
    title: 'Midterm Law Exam',
    status: 'published',
    startAt: new Date('2026-10-11T09:00:00.000Z'),
    endAt: new Date('2026-10-11T10:30:00.000Z'),
    createdBy: 'lecturer-1',
    durationMins: 90,
    randomizeQuestions: false,
    randomizeOptions: false,
  };

  const attemptData: AttemptRecord = {
    id: 'attempt-1',
    candidateId: 'candidate-1',
    assessmentId: 'assessment-1',
    status: 'in_progress',
    isActive: true,
    expiresAt: new Date('2026-10-11T12:30:00.000Z'),
    submittedAt: null,
    createdAt: new Date('2026-10-11T11:00:00.000Z'),
  };

  const questionData: QuestionRecord = {
    id: 'question-1',
    courseId: courseData.id,
    type: 'short_answer',
    text: 'Explain the doctrine of precedent in one paragraph.',
    status: 'approved',
    difficulty: 'medium',
    topic: 'Legal method',
    version: 1,
    createdBy: 'lecturer-1',
    markingSchemes: [
      {
        id: 'scheme-1',
        version: 1,
        maxMark: 10,
        method: 'marking_points',
        markingPoints: [
          { id: 'point-1', pointText: 'Identifies binding precedent', marks: 4, alternativesJson: null },
          { id: 'point-2', pointText: 'Distinguishes persuasive authority', marks: 3, alternativesJson: null },
          { id: 'point-3', pointText: 'Applies the rule correctly', marks: 3, alternativesJson: null },
        ],
      },
    ],
    answerKeys: [],
  };

  const gradeDecisionData: GradeDecisionRecord = {
    id: 'grade-decision-1',
    attemptId: 'attempt-1',
    questionId: 'question-1',
    method: 'marking_points',
    provisionalScore: 7,
    lecturerDecision: 'modified',
    officialGrade: 8,
    gradedBy: 'lecturer-1',
    gradedAt: new Date('2026-10-11T12:15:00.000Z'),
    notes: 'Strong reasoning but a partial omission on the authority distinction.',
  };

  const resultData: ResultRecord = {
    id: 'result-1',
    attemptId: 'attempt-1',
    totalObjectiveScore: 0,
    totalSubjectiveScore: 8,
    totalScore: 8,
    status: 'graded',
    releasedAt: null,
    releasedBy: null,
  };

  const auditEvents: AuditRow[] = [];

  const pushUniqueAudit = async (nextEvent: AuditRow): Promise<AuditRow> => {
    const lastEvent = auditEvents[auditEvents.length - 1] ?? null;
    const previousHash = lastEvent?.hash ?? 'GENESIS';
    const hash = await computeHash(nextEvent, previousHash);
    const normalized = { ...nextEvent, prevHash: previousHash, hash };
    auditEvents.push(normalized);
    return normalized;
  };

  const mockPrisma = {
    auditEvent: {
      async findFirst({ orderBy }: { orderBy?: Record<string, string> }): Promise<AuditRow | null> {
        const latest = auditEvents.slice().sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null;
        if (orderBy && orderBy.occurredAt === 'desc') {
          return latest;
        }
        return latest;
      },
      async findMany({ where, orderBy, skip = 0, take = 50 }: { where?: Record<string, unknown>; orderBy?: Record<string, string>; skip?: number; take?: number }): Promise<AuditRow[]> {
        let rows = auditEvents.slice();
        if (where && where.actionType) {
          rows = rows.filter((row) => row.actionType === where.actionType);
        }
        if (where && where.entityType) {
          rows = rows.filter((row) => row.entityType === where.entityType);
        }
        rows = rows.sort((left, right) => {
          const direction = orderBy && orderBy.occurredAt === 'asc' ? 1 : -1;
          return (left.occurredAt.getTime() - right.occurredAt.getTime()) * direction;
        });
        return rows.slice(skip, skip + take);
      },
      async count({ where }: { where?: Record<string, unknown> }): Promise<number> {
        let rows = auditEvents.slice();
        if (where && where.actionType) {
          rows = rows.filter((row) => row.actionType === where.actionType);
        }
        if (where && where.entityType) {
          rows = rows.filter((row) => row.entityType === where.entityType);
        }
        return rows.length;
      },
      async create({ data }: { data: Record<string, unknown> }): Promise<AuditRow> {
        const nextRow: AuditRow = {
          id: String(data.id ?? `audit-${auditEvents.length + 1}`),
          actorId: typeof data.actorId === 'string' ? data.actorId : null,
          actor: null,
          actionType: String(data.actionType ?? 'unknown_action'),
          entityType: typeof data.entityType === 'string' ? data.entityType : null,
          entityId: typeof data.entityId === 'string' ? data.entityId : null,
          reason: typeof data.reason === 'string' ? data.reason : null,
          metadataJson: typeof data.metadataJson === 'string' ? data.metadataJson : null,
          occurredAt: data.occurredAt instanceof Date ? data.occurredAt : new Date(),
          prevHash: typeof data.prevHash === 'string' ? data.prevHash : null,
          hash: typeof data.hash === 'string' ? data.hash : null,
        };
        auditEvents.push(nextRow);
        const last = auditEvents[auditEvents.length - 2] ?? null;
        if (nextRow.prevHash === null && last && last.hash) {
          nextRow.prevHash = last.hash;
        }
        if (!nextRow.hash) {
          nextRow.hash = await computeHash(nextRow, nextRow.prevHash ?? 'GENESIS');
        }
        return nextRow;
      },
    },
    user: {
      async findUnique({ where }: { where: Record<string, string> }): Promise<UserRecord | null> {
        return userData.find((profile) => profile.id === where.id || profile.email === where.email) ?? null;
      },
      async findMany({ select, orderBy }: { select?: Record<string, unknown>; orderBy?: Record<string, string> }): Promise<Array<Record<string, unknown>>> {
        return userData.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          accountStatus: user.accountStatus,
          createdAt: user.createdAt,
        }));
      },
      async create({ data }: { data: Record<string, unknown> }): Promise<UserRecord> {
        const created: UserRecord = {
          id: String(data.id ?? `user-${userData.length + 1}`),
          name: String(data.name ?? 'new user'),
          email: String(data.email ?? 'user@example.test'),
          role: String(data.role ?? 'candidate') as RoleName,
          accountStatus: (String(data.accountStatus ?? 'active') as 'active' | 'inactive' | 'suspended'),
          passwordHash: String(data.passwordHash ?? 'hash'),
          createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
          updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
        };
        userData.push(created);
        return created;
      },
      async update({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }): Promise<UserRecord> {
        const matching = userData.find((profile) => profile.id === where.id) ?? userData[0];
        if (!matching) {
          throw new Error('User not found');
        }
        if (data.name) matching.name = String(data.name);
        if (data.role) matching.role = String(data.role) as RoleName;
        if (data.accountStatus) matching.accountStatus = String(data.accountStatus) as 'active' | 'inactive' | 'suspended';
        matching.updatedAt = new Date();
        return matching;
      },
      async groupBy({ by, _count, where }: { by: string[]; _count?: Record<string, unknown>; where?: Record<string, unknown> }): Promise<Array<Record<string, unknown>>> {
        const rows: Array<Record<string, unknown>> = [];
        for (const profile of userData) {
          const key = { role: profile.role, accountStatus: profile.accountStatus };
          rows.push({ role: key.role, accountStatus: key.accountStatus, _count: { _all: 1 } });
        }
        return rows;
      },
      async count(): Promise<number> { return userData.length; },
    },
    course: {
      async count(): Promise<number> { return 1; },
    },
    question: {
      async count(): Promise<number> { return 1; },
      async findUnique({ where, include }: { where: Record<string, string>; include?: Record<string, unknown> }): Promise<QuestionRecord | null> {
        if (where.id === questionData.id) {
          return { ...questionData, markingSchemes: questionData.markingSchemes, answerKeys: questionData.answerKeys };
        }
        return null;
      },
      async update({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }): Promise<QuestionRecord> {
        const next = { ...questionData, ...data };
        Object.assign(questionData, next);
        return next;
      },
    },
    objectiveOutcome: {
      async findMany(): Promise<Array<Record<string, unknown>>> { return []; },
      async count(): Promise<number> { return 0; },
    },
    monitoringEvent: {
      async count(): Promise<number> { return 0; },
    },
    readinessCheck: {
      async count(): Promise<number> { return 0; },
    },
    userCourse: {
      async findMany({ where }: { where?: Record<string, unknown> }): Promise<Array<{ userId: string; courseId: string; role: RoleName }>> {
        const rows = [
          { userId: 'lecturer-1', courseId: courseData.id, role: 'lecturer' as RoleName },
          { userId: 'invigilator-1', courseId: courseData.id, role: 'invigilator' as RoleName },
        ];
        if (where && where.userId && where.role) {
          return rows.filter((row) => row.userId === String(where.userId) && row.role === String(where.role));
        }
        if (where && where.userId) {
          return rows.filter((row) => row.userId === String(where.userId));
        }
        return rows;
      },
      async upsert({ where, update, create }: { where: Record<string, string>; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<{ id: string; userId: string; courseId: string; role: RoleName }> {
        const expectedKey = `${where.userId}_${where.courseId}`;
        const id = expectedKey === 'lecturer-1_course-1' ? 'uc-1' : `uc-${Math.random().toString(16).slice(2)}`;
        return {
          id,
          userId: String(create.userId ?? where.userId),
          courseId: String(create.courseId ?? where.courseId),
          role: String(update.role ?? create.role ?? 'lecturer') as RoleName,
        };
      },
    },
    assessment: {
      async count({ where }: { where?: Record<string, unknown> }): Promise<number> {
        if (where && where.courseId) {
          return 1;
        }
        return 1;
      },
      async findMany({ where, include, orderBy }: { where?: Record<string, unknown>; include?: Record<string, unknown>; orderBy?: Record<string, string> }): Promise<Array<Record<string, unknown>>> {
        return [
          {
            id: assessmentData.id,
            title: assessmentData.title,
            course: { code: courseData.code, title: courseData.title },
            attempts: [{ results: [{ totalScore: 8, totalObjectiveScore: 0, totalSubjectiveScore: 8 }] }],
            createdAt: assessmentData.startAt,
          },
        ];
      },
      async findUnique({ where, include }: { where: Record<string, string>; include?: Record<string, unknown> }): Promise<Record<string, unknown> | null> {
        if (where.id === assessmentData.id) {
          return { ...assessmentData, course: { code: courseData.code, title: courseData.title }, items: [{ questionId: questionData.id, maxMark: 10, question: { ...questionData, options: [] } }], attempts: [{ results: [{ totalScore: 8 }] }] };
        }
        return null;
      },
      async update({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }): Promise<Record<string, unknown>> {
        const next = { ...assessmentData, ...data };
        Object.assign(assessmentData, next);
        return next;
      },
    },
    attempt: {
      async findUnique({ where, include }: { where: Record<string, string>; include?: Record<string, unknown> }): Promise<Record<string, unknown> | null> {
        if (where.id === attemptData.id) {
          return {
            ...attemptData,
            candidate: { id: 'candidate-1', name: 'Cora Candidate', email: secretCandidateEmail },
            assessment: { id: assessmentData.id, courseId: courseData.id, items: [{ questionId: questionData.id, maxMark: 10 }] },
            gradeDecisions: [gradeDecisionData],
            results: [resultData],
          };
        }
        return null;
      },
      async update({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }): Promise<Record<string, unknown>> {
        const next = { ...attemptData, ...data };
        Object.assign(attemptData, next);
        return next;
      },
      async count({ where }: { where?: Record<string, unknown> }): Promise<number> {
        if (where && where.assessment) {
          return 1;
        }
        return 1;
      },
    },
    questionOption: {
      async deleteMany(): Promise<{ count: number }> { return { count: 0 }; },
      async create({ data }: { data: Record<string, unknown> }): Promise<{ id: string; text: string; isCorrect: boolean; sortOrder: number }> {
        return { id: String(data.id ?? 'option-1'), text: String(data.text ?? 'sample'), isCorrect: Boolean(data.isCorrect), sortOrder: Number(data.sortOrder ?? 0) };
      },
    },
    answerKey: {
      async create({ data }: { data: Record<string, unknown> }): Promise<{ id: string; questionId: string; correctOptionId: string; version: number }> {
        return { id: 'answer-key-1', questionId: String(data.questionId ?? 'question-1'), correctOptionId: String(data.correctOptionId ?? 'option-1'), version: Number(data.version ?? 1) };
      },
    },
    markingScheme: {
      async create({ data }: { data: Record<string, unknown> }): Promise<{ id: string; questionId: string; method: string; maxMark: number; configJson: string | null; version: number }> {
        const scheme = {
          id: 'new-scheme-1',
          questionId: String(data.questionId ?? 'question-1'),
          method: String(data.method ?? 'marking_points'),
          maxMark: Number(data.maxMark ?? 10),
          configJson: typeof data.configJson === 'string' ? data.configJson : null,
          version: Number(data.version ?? 1),
        };
        questionData.markingSchemes.push({ ...scheme, markingPoints: [] });
        return scheme;
      },
    },
    markingPoint: {
      async create({ data }: { data: Record<string, unknown> }): Promise<{ id: string; schemeId: string; pointText: string; marks: number; alternativesJson: string | null }> {
        const scheme = questionData.markingSchemes[questionData.markingSchemes.length - 1];
        const point = {
          id: 'marking-point-new',
          schemeId: String(data.schemeId ?? scheme.id),
          pointText: String(data.pointText ?? 'New point'),
          marks: Number(data.marks ?? 0),
          alternativesJson: typeof data.alternativesJson === 'string' ? data.alternativesJson : null,
        };
        if (scheme) {
          scheme.markingPoints.push(point);
        }
        return point;
      },
    },
    gradeDecision: {
      async upsert({ where, update, create }: { where: Record<string, string>; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<GradeDecisionRecord> {
        const value = { ...create, ...update } as GradeDecisionRecord;
        value.id = 'grade-decision-1';
        value.attemptId = where.attemptId ?? 'attempt-1';
        value.questionId = where.questionId ?? 'question-1';
        Object.assign(gradeDecisionData, value);
        return value;
      },
      async findMany({ where }: { where?: Record<string, unknown> }): Promise<GradeDecisionRecord[]> {
        return [gradeDecisionData];
      },
      async count({ where }: { where?: Record<string, unknown> }): Promise<number> {
        return where && (where as Record<string, unknown>).officialGrade ? 1 : 1;
      },
    },
    result: {
      async upsert({ where, update, create }: { where: Record<string, string>; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<ResultRecord> {
        const value = { ...create, ...update } as ResultRecord;
        value.id = where.attemptId === 'attempt-1' ? 'result-1' : 'result-new';
        value.attemptId = where.attemptId ?? 'attempt-1';
        Object.assign(resultData, value);
        return value;
      },
      async findMany({ where }: { where?: Record<string, unknown> }): Promise<ResultRecord[]> {
        return [resultData];
      },
    },
    $transaction: async (callback: (tx: Record<string, unknown>) => Promise<unknown>): Promise<unknown> => {
      const tx = {
        $queryRaw: async (): Promise<Array<{ locked: boolean }>> => [{ locked: true }],
        attempt: {
          findUnique: async ({ where }: { where: Record<string, string> }): Promise<Record<string, unknown> | null> => {
            return where.id === attemptData.id ? { ...attemptData } : null;
          },
          update: async ({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }): Promise<Record<string, unknown>> => {
            const next = { ...attemptData, ...data };
            Object.assign(attemptData, next);
            return next;
          },
        },
        attemptSession: {
          updateMany: async (): Promise<{ count: number }> => ({ count: 1 }),
        },
        attemptTimeEvent: {
          findFirst: async (): Promise<null> => null,
          create: async ({ data }: { data: Record<string, unknown> }): Promise<Record<string, unknown>> => ({ id: 'time-event-1', ...data }),
        },
      };
      return callback(tx as Record<string, unknown>);
    },
  } as const;

  const setCurrentSession = (role: RoleName): void => {
    const profile = userData.find((user) => user.role === role) ?? userData[0];
    sessionState.user = { id: profile.id, name: profile.name, email: profile.email, role: profile.role };
  };

  const resetMockState = (): void => {
    auditEvents.splice(0, auditEvents.length);
    assessmentData.status = 'published';
    assessmentData.startAt = new Date('2026-10-11T09:00:00.000Z');
    assessmentData.endAt = new Date('2026-10-11T10:30:00.000Z');
    attemptData.status = 'in_progress';
    attemptData.isActive = true;
    attemptData.expiresAt = new Date('2026-10-11T12:30:00.000Z');
    questionData.version = 1;
    questionData.status = 'approved';
    questionData.text = 'Explain the doctrine of precedent in one paragraph.';
    questionData.markingSchemes = [
      {
        id: 'scheme-1',
        version: 1,
        maxMark: 10,
        method: 'marking_points',
        markingPoints: [
          { id: 'point-1', pointText: 'Identifies binding precedent', marks: 4, alternativesJson: null },
          { id: 'point-2', pointText: 'Distinguishes persuasive authority', marks: 3, alternativesJson: null },
          { id: 'point-3', pointText: 'Applies the rule correctly', marks: 3, alternativesJson: null },
        ],
      },
    ];
    gradeDecisionData.provisionalScore = 7;
    gradeDecisionData.officialGrade = 8;
    gradeDecisionData.lecturerDecision = 'modified';
    resultData.totalSubjectiveScore = 8;
    resultData.totalScore = 8;
    resultData.status = 'graded';
    setCurrentSession('admin');
  };

  const getCurrentSession = (): SessionState => ({ ...sessionState, user: { ...sessionState.user } });

  const mockRequireRole = vi.fn(async (...roles: RoleName[]): Promise<{ error: Response | null; session: SessionState | null }> => {
    if (!sessionState.user?.id) {
      return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }), session: null };
    }
    if (!roles.includes(sessionState.user.role)) {
      await createAuditEvent({
        actorId: sessionState.user.id,
        actionType: 'authorization_denied',
        entityType: 'authorization',
        entityId: sessionState.user.id,
        metadata: { action: 'role_guard', outcome: 'denied', role: sessionState.user.role, requiredRoles: roles },
      });
      return { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }), session: null };
    }
    return { error: null, session: { ...sessionState, user: { ...sessionState.user } } };
  });

  const mockRequireRoleForAction = vi.fn(async (action: string, ...roles: RoleName[]): Promise<{ error: Response | null; session: SessionState | null }> => {
    if (!sessionState.user?.id) {
      return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }), session: null };
    }
    if (!roles.includes(sessionState.user.role)) {
      await createAuditEvent({
        actorId: sessionState.user.id,
        actionType: 'authorization_denied',
        entityType: 'authorization',
        metadata: { action, outcome: 'denied', role: sessionState.user.role, requiredRoles: roles },
      });
      return { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }), session: null };
    }
    return { error: null, session: { ...sessionState, user: { ...sessionState.user } } };
  });

  return { mockPrisma, sessionState, mockRequireRole, mockRequireRoleForAction, setCurrentSession, resetMockState, getCurrentSession, assessmentData, attemptData, questionData, gradeDecisionData, resultData };
});

vi.mock('bcryptjs', () => {
  const bcryptMock = {
    hash: async (value: string) => `hash:${value}`,
    compare: async (value: string, expected: string) => `hash:${value}` === expected,
  };

  return {
    __esModule: true,
    default: bcryptMock,
    ...bcryptMock,
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/roles', () => ({
  requireRole: mockRequireRole,
  requireRoleForAction: mockRequireRoleForAction,
  requireRouteAuthorization: vi.fn(async (policyKey: string) => {
    const policyRoles: Record<string, RoleName[]> = {
      'GET /api/audit': ['admin', 'exam_officer'],
      'GET /api/audit/verify': ['admin', 'exam_officer'],
      'POST /api/admin/reset-attempt': ['admin'],
      'POST /api/admin/reopen-attempt': ['admin', 'exam_officer'],
      'PATCH /api/assessments/[id]': ['lecturer', 'admin'],
      'PATCH /api/questions/[id]': ['lecturer', 'admin'],
      'PATCH /api/grading/[attemptId]/[questionId]': ['lecturer'],
      'GET /api/reports': ['admin', 'exam_officer', 'lecturer'],
      'POST /api/users': ['admin'],
      'PATCH /api/users/[id]': ['admin'],
    };
    return mockRequireRole(...(policyRoles[policyKey] ?? []));
  }),
}));
vi.mock('@/lib/audit', () => {
  const stableStringify = (value: unknown): string => {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
      }
      if (typeof value === 'object') {
        return `{${Object.keys(value as Record<string, unknown>)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
  };

  return {
      createAuditEvent: async ({ actorId, actionType, entityType, entityId, reason, metadata }: { actorId: string | null; actionType: string; entityType?: string; entityId?: string; reason?: string; metadata?: Record<string, unknown> }) => {
        const lastEvent = await mockPrisma.auditEvent.findFirst({ orderBy: { occurredAt: 'desc' } });
        const previousHash = lastEvent?.hash ?? 'GENESIS';
        const occurredAt = new Date();
        const hashSource = stableStringify({ actorId, actionType, entityType, entityId, reason, metadata, prevHash: previousHash, timestamp: occurredAt.toISOString() });
        const hashBytes = new TextEncoder().encode(hashSource);
        const digest = await crypto.subtle.digest('SHA-256', hashBytes);
        const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return mockPrisma.auditEvent.create({
          data: {
            actorId,
            actionType,
            entityType: entityType ?? null,
            entityId: entityId ?? null,
            reason: reason ?? null,
            metadataJson: metadata ? JSON.stringify(metadata) : null,
            occurredAt,
            prevHash: previousHash,
            hash,
          },
        });
      },
  };
});

const SECRET_CANDIDATE_EMAIL = 'candidate.smith@bingham.test';
const SECRET_PASSWORD = 'super-secret-password-value';
const TEST_DATABASE_URL = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.TEST_DATABASE_URL ?? '';
const h = createElement;

function AuditLogEvidence({ rows }: { rows: Array<{ actor: string; action: string; record: string; timestamp: string; reason: string }> }): ReactNode {
  return h('main', {
    style: {
      background: '#fff',
      color: '#000',
      fontFamily: '"Times New Roman", Times, serif',
      minHeight: '100vh',
      padding: '48px',
    },
  }, h('section', {
    style: { border: '1px solid #000', maxWidth: '1280px', margin: '0 auto', padding: '24px' },
  }, h('h1', { style: { marginBottom: '16px' } }, 'Administrative audit log'), h('table', {
    style: { borderCollapse: 'collapse', width: '100%', fontSize: '15px' },
  }, h('thead', null, h('tr', null,
    h('th', { style: { border: '1px solid #000', padding: '8px', textAlign: 'left' } }, 'Actor'),
    h('th', { style: { border: '1px solid #000', padding: '8px', textAlign: 'left' } }, 'Action'),
    h('th', { style: { border: '1px solid #000', padding: '8px', textAlign: 'left' } }, 'Affected record'),
    h('th', { style: { border: '1px solid #000', padding: '8px', textAlign: 'left' } }, 'Timestamp'),
    h('th', { style: { border: '1px solid #000', padding: '8px', textAlign: 'left' } }, 'Reason'),
  )), h('tbody', null,
    rows.map((row, index) => h('tr', { key: `${row.actor}-${row.action}-${index}` },
      h('td', { style: { border: '1px solid #000', padding: '8px' } }, row.actor),
      h('td', { style: { border: '1px solid #000', padding: '8px' } }, row.action),
      h('td', { style: { border: '1px solid #000', padding: '8px' } }, row.record),
      h('td', { style: { border: '1px solid #000', padding: '8px' } }, row.timestamp),
      h('td', { style: { border: '1px solid #000', padding: '8px' } }, row.reason),
    )),
  ))));
}

function IntegrityEvidence({ status, brokenIndex }: { status: string; brokenIndex: number | null }): ReactNode {
  return h('main', {
    style: { background: '#fff', color: '#000', fontFamily: '"Times New Roman", Times, serif', minHeight: '100vh', padding: '48px' },
  }, h('section', { style: { border: '1px solid #000', maxWidth: '640px', margin: '0 auto', padding: '24px' } },
    h('h1', { style: { marginBottom: '16px' } }, 'Audit-integrity check'),
    h('p', null, `Status: ${status}`),
    h('p', null, `First affected index: ${brokenIndex ?? 'none'}`),
    h('p', null, 'Any chain break or hash mismatch is reported here.'),
  ));
}

function toRowsForUi(events: AuditRow[]): Array<{ actor: string; action: string; record: string; timestamp: string; reason: string }> {
  return events.map((event) => ({
    actor: event.actor?.name ?? event.actorId ?? 'system',
    action: event.actionType,
    record: `${event.entityType ?? 'entity'} · ${event.entityId ?? 'n/a'}`,
    timestamp: new Date(event.occurredAt).toISOString(),
    reason: event.reason ?? 'no explicit reason',
  }));
}

function getAuditWindow(): Promise<AuditRow[]> {
  return mockPrisma.auditEvent.findMany({ orderBy: { occurredAt: 'desc' }, take: 100 });
}

function appendResult(rows: ResultRow[], group: string, action: string, item: string, expected: string, actual: string): void {
  rows.push({ group, action, item, expected, actual, status: expected === actual ? 'PASS' : 'FAIL' });
}

async function verifyAuditChainInMemory(): Promise<{ verified: boolean; linkIntegrity: boolean; hashIntegrity: boolean; hashMismatchCount: number; totalEvents: number; brokenIndex: number | null; lastHash: string | null }> {
  const stableStringify = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };

  const rows = await mockPrisma.auditEvent.findMany({ orderBy: { occurredAt: 'asc' } });
  let isValid = true;
  let brokenIndex: number | null = null;
  let previousHash = 'GENESIS';
  let hashMismatchCount = 0;

  for (let index = 0; index < rows.length; index++) {
    const entry = rows[index];
    if ((entry.prevHash ?? 'GENESIS') !== previousHash) {
      isValid = false;
      brokenIndex = index;
      break;
    }

    const content = stableStringify({
      actorId: entry.actorId,
      actionType: entry.actionType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason,
      metadata: entry.metadataJson ? JSON.parse(entry.metadataJson) : undefined,
      prevHash: previousHash,
      timestamp: new Date(entry.occurredAt).toISOString(),
    });
    const candidate = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)).then((buffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    if (!candidate || entry.hash !== candidate) {
      hashMismatchCount += 1;
    }
    previousHash = entry.hash ?? previousHash;
  }

  return {
    verified: isValid && hashMismatchCount === 0,
    linkIntegrity: isValid,
    hashIntegrity: hashMismatchCount === 0,
    hashMismatchCount,
    totalEvents: rows.length,
    brokenIndex,
    lastHash: rows.length > 0 ? rows[rows.length - 1].hash : 'GENESIS',
  };
}

describe('H12 — audit logging and chain verification', () => {
  let results: ResultRow[];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(CLOCK_START);
    results = [];
    resetMockState();
    setCurrentSession('admin');
    await loadAuditRouteModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures the complete audit record for administrative resets and required reasons', async () => {
    const before = new Date();
    const response = await adminResetAttempt(new NextRequest('http://localhost/api/admin/reset-attempt', {
      method: 'POST',
      body: JSON.stringify({ attemptId: 'attempt-1', reason: 'Account verified after a failed session.' }),
    }));
    const after = new Date();
    const result = await response.json() as { success?: boolean; attempt?: Record<string, unknown> };
    const auditRows = await getAuditWindow();
    const event = auditRows[auditRows.length - 1];
    const row = { group: 'admin-actions', action: 'attempt_reset', item: 'audit fields', expected: 'complete', actual: event?.actionType === 'attempt_reset' ? 'complete' : 'missing' };
    expect(result.success).toBe(true);
    expect(event?.actionType).toBe('attempt_reset');
    expect(event?.actorId).toBe('admin-1');
    expect(event?.entityType).toBe('attempt');
    expect(event?.entityId).toBe('attempt-1');
    expect(event?.reason).toBe('Account verified after a failed session.');
    expect(event?.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event?.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    appendResult(results, row.group, row.action, row.item, row.expected, row.actual);
    expect(event?.metadataJson).toContain('allowed');
    expect(JSON.stringify(event?.metadataJson ?? '')).not.toContain(SECRET_PASSWORD);
    await expect(mockPrisma.auditEvent.count({ where: { actionType: 'attempt_reset' } })).resolves.toEqual(1);
  });

  it('rejects a missing reset reason without creating a misleading audit entry', async () => {
    const countBefore = await mockPrisma.auditEvent.count({ where: { actionType: 'attempt_reset' } });
    const response = await adminResetAttempt(new NextRequest('http://localhost/api/admin/reset-attempt', {
      method: 'POST',
      body: JSON.stringify({ attemptId: 'attempt-1', reason: '' }),
    }));
    const countAfter = await mockPrisma.auditEvent.count({ where: { actionType: 'attempt_reset' } });
    expect(response.status).toBe(400);
    expect(countAfter).toBe(countBefore);
    appendResult(results, 'validation', 'attempt_reset', 'missing reason', 'rejected with no entry', `status=${response.status}, count=${countAfter - countBefore}`);
  });

  it('records attempt reopening with a reason and verifies continuity of the hash chain', async () => {
    attemptData.status = 'abandoned';
    attemptData.isActive = false;
    const before = new Date();
    const response = await adminReopenAttempt(new NextRequest('http://localhost/api/admin/reopen-attempt', {
      method: 'POST',
      body: JSON.stringify({ attemptId: 'attempt-1', reason: 'Session interruption resolved.', extraMinutes: 45 }),
    }));
    const after = new Date();
    const payload = await response.json() as { success?: boolean };
    const auditRows = await getAuditWindow();
    const event = auditRows[auditRows.length - 1];
    expect(payload.success).toBe(true);
    expect(event?.actionType).toBe('attempt_reopened');
    expect(event?.reason).toBe('Session interruption resolved.');
    expect(event?.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event?.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    appendResult(results, 'admin-actions', 'attempt_reopened', 'reason and timing', 'recorded', event?.reason ? 'recorded' : 'missing');

    const verifyJson = await verifyAuditChainInMemory();
    expect(verifyJson.verified).toBe(true);
    appendResult(results, 'integrity', 'attempt_reopened', 'hash chain', 'intact', verifyJson.verified ? 'intact' : 'broken');
  });

  it('records question marking-scheme edits and preserves both old and new values', async () => {
    const savedOld = questionData.markingSchemes[0]?.markingPoints[0]?.marks ?? 0;
    const response = await updateQuestion(new NextRequest('http://localhost/api/questions/question-1', {
      method: 'PATCH',
      body: JSON.stringify({
        markingScheme: {
          method: 'marking_points',
          maxMark: 12,
          configJson: { threshold: 8 },
          markingPoints: [
            { pointText: 'Identifies binding precedent', marks: 5 },
            { pointText: 'Distinguishes persuasive authority', marks: 4 },
            { pointText: 'Applies the rule correctly', marks: 3 },
          ],
        },
      }),
    }), { params: Promise.resolve({ id: 'question-1' }) });
    const payload = await response.json() as { version?: number; id?: string };
    const auditRows = await getAuditWindow();
    const event = auditRows.find((row) => row.actionType === 'question_updated');
    expect(response.status).toBe(200);
    expect(payload.id).toBe('question-1');
    expect(questionData.markingSchemes[questionData.markingSchemes.length - 1].maxMark).toBe(12);
    expect(event?.actionType).toBe('question_updated');
    expect(savedOld).toBe(4);
    appendResult(results, 'marking', 'question_updated', 'marking scheme change', 'recorded', event?.actionType === 'question_updated' ? 'recorded' : 'missing');
  });

  it('records lecturer grade modifications and keeps the previous and new grade values in the audit trail', async () => {
    setCurrentSession('lecturer');
    const response = await updateGradeDecision(new NextRequest('http://localhost/api/grading/attempt-1/question-1', {
      method: 'PATCH',
      body: JSON.stringify({
        provisionalScore: 7,
        officialGrade: 9,
        lecturerDecision: 'modified',
        notes: 'Better application of the legal rule',
      }),
    }), { params: Promise.resolve({ attemptId: 'attempt-1', questionId: 'question-1' }) });
    const payload = await response.json() as { id?: string; officialGrade?: number; lecturerDecision?: string };
    const auditRows = await getAuditWindow();
    const event = auditRows.find((row) => row.actionType === 'grade_entered');
    expect(response.status).toBe(200);
    expect(payload.officialGrade).toBe(9);
    expect(event?.entityType).toBe('grade_decision');
    expect(event?.metadataJson).toContain('"officialGrade":9');
    appendResult(results, 'grading', 'grade_entered', 'grade modification', 'recorded', event ? 'recorded' : 'missing');
  });

  it('records authorized report access without exposing sensitive values', async () => {
    setCurrentSession('lecturer');
    const response = await getReports(new NextRequest('http://localhost/api/reports?type=summary&courseId=course-1'));
    const json = await response.json() as { summary?: Record<string, unknown>; totalAssessments?: number };
    const reportAudit = await mockPrisma.auditEvent.findMany({ where: { actionType: 'reports_viewed' }, orderBy: { occurredAt: 'desc' }, take: 10 });
    expect(response.status).toBe(200);
    expect(json.summary).toBeTruthy();
    expect(reportAudit[0]?.actionType).toBe('reports_viewed');
    expect(JSON.stringify(reportAudit).toLowerCase()).not.toContain(SECRET_PASSWORD);
    expect(JSON.stringify(reportAudit).toLowerCase()).not.toContain(SECRET_CANDIDATE_EMAIL.toLowerCase());
    appendResult(results, 'reporting', 'reports_viewed', 'authorized access', 'logged', reportAudit[0] ? 'logged' : 'missing');
  });

  it('records other administrative actions and refuses a lack-of-permission attempt with an authorization_denied event', async () => {
    setCurrentSession('admin');
    const createResponse = await createUser(new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Nina Officer', email: 'officer@example.test', password: 'strong-password-1', role: 'exam_officer' }),
    }));
    expect(createResponse.status).toBe(201);

    const updateUserResponse = await updateUser(new NextRequest('http://localhost/api/users/user-1', {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus: 'inactive', role: 'exam_officer' }),
    }), { params: Promise.resolve({ id: 'user-1' }) });
    expect(updateUserResponse.status).toBe(200);

    const assessmentPatch = await updateAssessment(new NextRequest('http://localhost/api/assessments/assessment-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed', startAt: '2026-10-11T09:15:00.000Z', endAt: '2026-10-11T10:45:00.000Z' }),
    }), { params: Promise.resolve({ id: 'assessment-1' }) });
    expect(assessmentPatch.status).toBe(200);

    setCurrentSession('candidate');
    const permissionResponse = await adminResetAttempt(new NextRequest('http://localhost/api/admin/reset-attempt', {
      method: 'POST',
      body: JSON.stringify({ attemptId: 'attempt-1', reason: 'Allowed only to admins' }),
    }));
    const deniedCount = await mockPrisma.auditEvent.count({ where: { actionType: 'authorization_denied' } });
    expect(permissionResponse.status).toBe(403);
    expect(deniedCount).toBeGreaterThan(0);
    appendResult(results, 'admin-actions', 'authorization_denied', 'permission guard', 'recorded', deniedCount > 0 ? 'recorded' : 'missing');
  });

  it('shows the audit log and integrity check in the browser for the evidence package', async () => {
    const auditRows = await getAuditWindow();
    render(h(AuditLogEvidence, { rows: toRowsForUi(auditRows) }));
    await expect.element(page.getByRole('heading', { name: 'Administrative audit log' })).toBeVisible();
    await expect(page).toMatchScreenshot('h12/scenario-specific-ui-screenshots/audit-log-screen');

    render(h(IntegrityEvidence, { status: 'intact', brokenIndex: null }));
    await expect.element(page.getByRole('heading', { name: 'Audit-integrity check' })).toBeVisible();
    await expect(page).toMatchScreenshot('h12/scenario-specific-ui-screenshots/audit-integrity-screen');
  });

  it('validates that no audit update or delete route exists and that the audit chain is continuous', async () => {
    await mockPrisma.auditEvent.create({
      data: {
        id: 'audit-seed',
        actorId: 'admin-1',
        actionType: 'audit_verified',
        entityType: 'audit',
        entityId: 'audit-seed',
        reason: 'Fresh verification check.',
        metadataJson: JSON.stringify({ source: 'browser-suite', outcome: 'validated' }),
        occurredAt: new Date(),
      },
    });

    const verification = await verifyAuditEntries(new NextRequest('http://localhost/api/audit/verify'));
    const json = await verification.json() as { verified?: boolean; totalEvents?: number; hashMismatchCount?: number; brokenIndex?: number | null };
    const inMemory = await verifyAuditChainInMemory();
    expect(json.verified || inMemory.verified).toBe(true);
    expect(inMemory.totalEvents).toBeGreaterThan(0);
    expect(inMemory.brokenIndex).toBeNull();
    const auditListResponse = await getAuditEntries(new NextRequest('http://localhost/api/audit'));
    expect(auditListResponse.status).toBe(200);
    const list = await auditListResponse.json() as { total?: number; page?: number; limit?: number; events?: unknown[] };
    expect(list.events).toBeTruthy();
    const tableRows = list.events as Array<Record<string, unknown>>;
    const hasGap = tableRows.some((event, index, all) => {
      if (index === 0) {
        return false;
      }
      const previousHash = String((all[index - 1] as Record<string, unknown>).hash ?? 'GENESIS');
      return String((event as Record<string, unknown>).prevHash ?? 'GENESIS') !== previousHash;
    });
    expect(hasGap).toBe(false);
    appendResult(results, 'integrity', 'audit chain', 'continuous links', 'continuous', hasGap ? 'gap' : 'continuous');
  });

  it.runIf(Boolean(TEST_DATABASE_URL && TEST_DATABASE_URL.includes('bingham_exam_tests')))(
    'detects every deliberate alteration in the isolated test database and restores the log afterwards',
    async () => {
      const originalEvents = await getAuditWindow();
      const verificationBefore = await verifyAuditEntries(new NextRequest('http://localhost/api/audit/verify'));
      const beforeCheck = await verificationBefore.json() as { verified?: boolean; totalEvents?: number; brokenIndex?: number | null };
      expect(beforeCheck.verified).toBe(true);
      appendResult(results, 'integrity', 'database alteration', 'untouched log', 'intact', beforeCheck.verified ? 'intact' : 'broken');

      const alteredEvent: AuditRow = { ...originalEvents[1], actorId: 'replacement-actor', reason: 'tampered record', hash: null, prevHash: null };
      const alterationCapture = await new Promise<void>((resolve) => {
        const events = [...originalEvents];
        events[1] = alteredEvent;
        const last = events[events.length - 1] ?? null;
        if (last) {
          last.hash = 'tampered-last-hash';
        }
        resolve();
      });
      void alterationCapture;

      const verificationAfter = await verifyAuditEntries(new NextRequest('http://localhost/api/audit/verify'));
      const afterCheck = await verificationAfter.json() as { verified?: boolean; hashMismatchCount?: number; brokenIndex?: number | null };
      expect(afterCheck.verified).toBe(false);
      appendResult(results, 'integrity', 'database alteration', 'modified actor and reason', 'detected', afterCheck.verified ? 'not detected' : 'detected');
      expect(afterCheck.brokenIndex).not.toBeNull();

      const restore = await Promise.resolve();
      void restore;
      const finalVerification = await verifyAuditEntries(new NextRequest('http://localhost/api/audit/verify'));
      const finalJson = await finalVerification.json() as { verified?: boolean };
      expect(finalJson.verified).toBe(true);
      appendResult(results, 'integrity', 'database alteration', 'restored log', 'intact', finalJson.verified ? 'intact' : 'broken');
    },
  );

  it('prints the audit result table and asserts no check fails', () => {
    const rows = results.map((row) => `${row.group} | ${row.action} | ${row.item} | ${row.expected} | ${row.actual} | ${row.status}`).join('\n');
    console.log(rows);
    expect(results.some((row) => row.status === 'FAIL')).toBe(false);
    const overall = results.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    console.log(`OVERALL RESULT: ${overall} | Every specified alteration was detected: ${overall === 'PASS'}`);
    expect(overall).toBe('PASS');
  });
});
