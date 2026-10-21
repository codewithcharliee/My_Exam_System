import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { createSubmissionReceipt, maskCandidateIdentifier } from '@/lib/exam-receipt';

const configuredConnectionString = process.env.INTEGRITY_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? null;
const databaseLabel = process.env.INTEGRITY_DATABASE_URL
  ? 'pilot database copy'
  : 'isolated test database';
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? null;
const isolatedTestDatabaseName = process.env.H13_ISOLATED_DATABASE_NAME ?? null;
const configuredTestDatabaseName = (() => {
  if (!testDatabaseUrl) return null;
  try {
    return decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, '').split('/')[0]);
  } catch {
    return null;
  }
})();
const isLoopbackTestDatabase = (() => {
  if (!testDatabaseUrl || !isolatedTestDatabaseName || process.env.INTEGRITY_DATABASE_URL) {
    return false;
  }

  try {
    const url = new URL(testDatabaseUrl);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0]);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
      && databaseName === isolatedTestDatabaseName
      && /^bingham_exam_tests_[0-9a-f]{32}$/i.test(isolatedTestDatabaseName);
  } catch {
    return false;
  }
})();
const canCorrupt = isLoopbackTestDatabase;
const prisma = configuredConnectionString ? new PrismaClient({ datasources: { db: { url: configuredConnectionString } } }) : null;
const databaseDescribe = prisma ? describe : describe.skip;

type IntegrityReportRow = {
  category: 'structural' | 'orphan' | 'duplicate' | 'mismatch';
  check: string;
  offendingCount: number;
  offendingIds: string[];
  proven: boolean;
  protectedByConstraint: boolean;
  status: 'PASS' | 'FAIL';
};

type ProofResult = {
  proven: boolean;
  protectedByConstraint: boolean;
};

type DefectCase = {
  check: string;
  category: IntegrityReportRow['category'];
  expectedOffenders?: number;
  insert: (db: PrismaClient) => Promise<void>;
  scan: (db: PrismaClient) => Promise<string[]>;
};

function formatRowValues(values: string[]): string[] {
  return values.slice(0, 10).map((value) => value ?? 'null');
}

async function ensureIntegrityFixture(database: PrismaClient): Promise<void> {
  const lecturer = await database.user.upsert({
    where: { email: 'integrity-lecturer@example.com' },
    update: {},
    create: {
      id: 'integrity-lecturer',
      name: 'Integrity Lecturer',
      email: 'integrity-lecturer@example.com',
      passwordHash: 'fixture-hash',
      role: 'lecturer',
    },
  });

  const candidate = await database.user.upsert({
    where: { email: 'integrity-candidate@example.com' },
    update: {},
    create: {
      id: 'integrity-candidate',
      name: 'Integrity Candidate',
      email: 'integrity-candidate@example.com',
      matricNumber: 'INT-1001',
      passwordHash: 'fixture-hash',
      role: 'candidate',
    },
  });

  const course = await database.course.upsert({
    where: { code: 'LAW-INT-TEST' },
    update: {},
    create: {
      id: 'integrity-course',
      code: 'LAW-INT-TEST',
      title: 'Law Faculty Integrity Test Course',
      level: 'LLB',
    },
  });

  const assessment = await database.assessment.upsert({
    where: { id: 'integrity-assessment' },
    update: {},
    create: {
      id: 'integrity-assessment',
      courseId: course.id,
      title: 'Integrity Assessment',
      type: 'exam',
      durationMins: 60,
      status: 'published',
      createdBy: lecturer.id,
    },
  });

  const question = await database.question.upsert({
    where: { id: 'integrity-question' },
    update: {},
    create: {
      id: 'integrity-question',
      courseId: course.id,
      type: 'multiple_choice',
      text: 'Which statement best reflects data integrity?',
      difficulty: 'easy',
      topic: 'Integrity',
      createdBy: lecturer.id,
    },
  });

  const option = await database.questionOption.upsert({
    where: { id: 'integrity-option' },
    update: {},
    create: {
      id: 'integrity-option',
      questionId: question.id,
      text: 'Every relation points to valid parent records.',
      isCorrect: true,
      sortOrder: 0,
    },
  });

  await database.answerKey.upsert({
    where: { id: 'integrity-answer-key' },
    update: {},
    create: {
      id: 'integrity-answer-key',
      questionId: question.id,
      correctOptionId: option.id,
    },
  });

  await database.assessmentItem.upsert({
    where: { assessmentId_questionId: { assessmentId: assessment.id, questionId: question.id } },
    update: {},
    create: {
      id: 'integrity-assessment-item',
      assessmentId: assessment.id,
      questionId: question.id,
      displayOrder: 1,
      maxMark: 10,
    },
  });

  const otherAssessment = await database.assessment.upsert({
    where: { id: 'integrity-other-assessment' },
    update: {},
    create: {
      id: 'integrity-other-assessment',
      courseId: course.id,
      title: 'Integrity Other Assessment',
      type: 'exam',
      durationMins: 60,
      status: 'published',
      createdBy: lecturer.id,
    },
  });

  const otherQuestion = await database.question.upsert({
    where: { id: 'integrity-other-question' },
    update: {},
    create: {
      id: 'integrity-other-question',
      courseId: course.id,
      type: 'multiple_choice',
      text: 'Which record links a response to its assessment?',
      difficulty: 'easy',
      topic: 'Integrity',
      createdBy: lecturer.id,
    },
  });

  await database.assessmentItem.upsert({
    where: { assessmentId_questionId: { assessmentId: otherAssessment.id, questionId: otherQuestion.id } },
    update: {},
    create: {
      id: 'integrity-other-assessment-item',
      assessmentId: otherAssessment.id,
      questionId: otherQuestion.id,
      displayOrder: 1,
      maxMark: 10,
    },
  });

  const attempt = await database.attempt.upsert({
    where: { id: 'integrity-attempt' },
    update: {},
    create: {
      id: 'integrity-attempt',
      candidateId: candidate.id,
      assessmentId: assessment.id,
      status: 'submitted',
      isActive: false,
      submissionReceipt: `EXAM-${assessment.id.slice(0, 8)}-ATT-${'integrity-attempt'.slice(0, 8)}-CAND-${maskCandidateIdentifier(candidate.id)}-${new Date('2026-10-10T12:00:00.000Z').toISOString()}-SUBMITTED`,
      submittedAt: new Date('2026-10-10T12:00:00.000Z'),
      receiptAt: new Date('2026-10-10T12:00:00.000Z'),
    },
  });

  await database.attempt.upsert({
    where: { id: 'integrity-attempt-secondary' },
    update: {},
    create: {
      id: 'integrity-attempt-secondary',
      candidateId: candidate.id,
      assessmentId: assessment.id,
      status: 'submitted',
      isActive: false,
      submissionReceipt: `EXAM-${assessment.id.slice(0, 8)}-ATT-${'integrity-attempt-secondary'.slice(0, 8)}-CAND-${maskCandidateIdentifier(candidate.id)}-${new Date('2026-10-10T12:30:00.000Z').toISOString()}-SUBMITTED`,
      submittedAt: new Date('2026-10-10T12:30:00.000Z'),
      receiptAt: new Date('2026-10-10T12:30:00.000Z'),
    },
  });

  const response = await database.response.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    update: {},
    create: {
      id: 'integrity-response',
      attemptId: attempt.id,
      questionId: question.id,
      currentText: 'Every relation points to valid parent records.',
      wordCount: 7,
      selectedOptionId: option.id,
      syncStatus: 'synced',
    },
  });

  await database.responseVersion.upsert({
    where: { id: 'integrity-response-version' },
    update: {},
    create: {
      id: 'integrity-response-version',
      responseId: response.id,
      text: 'Every relation points to valid parent records.',
      selectedOptionId: option.id,
      wordCount: 7,
      versionNum: 1,
      saveType: 'autosave',
    },
  });

  await database.gradeDecision.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    update: {},
    create: {
      id: 'integrity-grade-decision',
      attemptId: attempt.id,
      questionId: question.id,
      method: 'exact_match',
      provisionalScore: 10,
      lecturerDecision: 'accepted',
      officialGrade: 10,
      gradedBy: lecturer.id,
      gradedAt: new Date('2026-10-10T12:10:00.000Z'),
    },
  });

  const monitoringEvent = await database.monitoringEvent.upsert({
    where: { id: 'integrity-monitoring-event' },
    update: {},
    create: {
      id: 'integrity-monitoring-event',
      attemptId: attempt.id,
      eventType: 'TAB_SWITCH',
      occurredAt: new Date('2026-10-10T12:05:00.000Z'),
    },
  });

  await database.snapshot.upsert({
    where: { id: 'integrity-snapshot' },
    update: {},
    create: {
      id: 'integrity-snapshot',
      monitoringEventId: monitoringEvent.id,
      attemptId: attempt.id,
      imageData: 'data:image/png;base64,fixture',
    },
  });

  await database.auditEvent.upsert({
    where: { id: 'integrity-audit-event' },
    update: {},
    create: {
      id: 'integrity-audit-event',
      actorId: lecturer.id,
      actionType: 'H13_CHECK',
      entityType: 'assessment',
      entityId: assessment.id,
      reason: 'Integrity validation fixture',
    },
  });
}

async function inspectSchema(database: PrismaClient): Promise<{
  missingForeignKeys: string[];
  missingUniqueConstraints: string[];
  tableColumns: string[];
}> {
  const requiredForeignKeys = [
    'responses.attempt_id -> attempts.id',
    'responses.question_id -> questions.id',
    'attempts.candidate_id -> users.id',
    'attempts.assessment_id -> assessments.id',
    'response_versions.response_id -> responses.id',
    'grade_decisions.attempt_id -> attempts.id',
    'grade_decisions.(attempt_id, question_id) -> responses.(attempt_id, question_id)',
    'monitoring_events.attempt_id -> attempts.id',
    'snapshots.attempt_id -> attempts.id',
    'snapshots.monitoring_event_id -> monitoring_events.id',
    'audit_events.actor_id -> users.id',
  ];

  const requiredUniqueConstraints: Array<{ table: string; columns: string[]; label: string }> = [
    { table: 'users', columns: ['email'], label: 'users.email' },
    { table: 'users', columns: ['matric_number'], label: 'users.matric_number' },
    { table: 'attempts', columns: ['id'], label: 'attempts.id' },
    { table: 'responses', columns: ['attempt_id', 'question_id'], label: 'responses.(attempt_id, question_id)' },
    { table: 'response_versions', columns: ['response_id', 'version_num'], label: 'response_versions.(response_id, version_num)' },
    { table: 'assessment_items', columns: ['assessment_id', 'question_id'], label: 'assessment_items.(assessment_id, question_id)' },
  ];

  const constraints = await database.$queryRaw<Array<{
    constraintType: string;
    tableName: string;
    columns: string[];
    referencedTable: string | null;
    referencedColumns: string[] | null;
  }>>`
    SELECT
      'FOREIGN KEY'::text AS "constraintType",
      source.relname::text AS "tableName",
      ARRAY(
        SELECT source_attribute.attname::text
        FROM unnest(c.conkey) WITH ORDINALITY AS source_key(attnum, position)
        JOIN pg_attribute source_attribute
          ON source_attribute.attrelid = source.oid
         AND source_attribute.attnum = source_key.attnum
        ORDER BY source_key.position
      ) AS columns,
      target.relname::text AS "referencedTable",
      CASE
        WHEN c.confkey IS NULL THEN NULL
        ELSE ARRAY(
          SELECT target_attribute.attname::text
          FROM unnest(c.confkey) WITH ORDINALITY AS target_key(attnum, position)
          JOIN pg_attribute target_attribute
            ON target_attribute.attrelid = target.oid
           AND target_attribute.attnum = target_key.attnum
          ORDER BY target_key.position
        )
      END AS "referencedColumns"
    FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
    LEFT JOIN pg_class target ON target.oid = c.confrelid
    WHERE source_namespace.nspname = current_schema()
      AND c.contype = 'f'
    UNION ALL
    SELECT
      CASE WHEN idx.indisprimary THEN 'PRIMARY KEY' ELSE 'UNIQUE' END::text AS "constraintType",
      source.relname::text AS "tableName",
      ARRAY(
        SELECT attribute.attname::text
        FROM unnest(idx.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_attribute attribute
          ON attribute.attrelid = source.oid
         AND attribute.attnum = key.attnum
        WHERE key.position <= idx.indnkeyatts
        ORDER BY key.position
      ) AS columns,
      NULL::text AS "referencedTable",
      NULL::text[] AS "referencedColumns"
    FROM pg_index idx
    JOIN pg_class source ON source.oid = idx.indrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
    WHERE source_namespace.nspname = current_schema()
      AND idx.indisunique
  `;
  const columns = await database.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (
        'users',
        'attempts',
        'assessments',
        'questions',
        'responses',
        'response_versions',
        'grade_decisions',
        'monitoring_events',
        'snapshots',
        'audit_events',
        'assessment_items'
      )
    ORDER BY table_name, ordinal_position
  `;

  const describeColumns = (columns: string[]): string => columns.length === 1 ? columns[0] : `(${columns.join(', ')})`;
  const foreignKeyDescriptions = constraints
    .filter((constraint) => constraint.constraintType === 'FOREIGN KEY' && constraint.referencedTable && constraint.referencedColumns)
    .map((constraint) => `${constraint.tableName}.${describeColumns(constraint.columns)} -> ${constraint.referencedTable}.${describeColumns(constraint.referencedColumns ?? [])}`);
  const uniqueDescriptions = constraints
    .filter((constraint) => constraint.constraintType === 'UNIQUE' || constraint.constraintType === 'PRIMARY KEY')
    .map((constraint) => `${constraint.tableName}.${constraint.columns.join(', ')}`);
  const tableColumns = new Map<string, string[]>();
  for (const column of columns) {
    const tableColumnsForName = tableColumns.get(column.tableName) ?? [];
    tableColumnsForName.push(column.columnName);
    tableColumns.set(column.tableName, tableColumnsForName);
  }

  return {
    missingForeignKeys: requiredForeignKeys.filter((required) => !foreignKeyDescriptions.includes(required)),
    missingUniqueConstraints: requiredUniqueConstraints
      .filter((required) => !uniqueDescriptions.includes(`${required.table}.${required.columns.join(', ')}`))
      .map((required) => required.label),
    tableColumns: [...tableColumns.entries()].map(([tableName, columnNames]) => `${tableName}(${columnNames.join(', ')})`),
  };
}

async function findResponsesWithoutAttempts(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT r.id AS id
    FROM responses r
    LEFT JOIN attempts a ON a.id = r.attempt_id
    WHERE a.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findAttemptsWithoutCandidates(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT a.id AS id
    FROM attempts a
    LEFT JOIN users u ON u.id = a.candidate_id
    WHERE u.id IS NULL OR u.role::text <> 'candidate'
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findAttemptsWithoutAssessments(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT a.id AS id
    FROM attempts a
    LEFT JOIN assessments assessment ON assessment.id = a.assessment_id
    WHERE assessment.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findResponsesWithoutQuestions(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT r.id AS id
    FROM responses r
    LEFT JOIN questions q ON q.id = r.question_id
    WHERE q.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findGradeDecisionsWithoutResponses(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT gd.id AS id
    FROM grade_decisions gd
    LEFT JOIN responses r
      ON r.attempt_id = gd.attempt_id
     AND r.question_id = gd.question_id
    WHERE r.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findMonitoringEventsWithoutAttempts(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT me.id AS id
    FROM monitoring_events me
    LEFT JOIN attempts a ON a.id = me.attempt_id
    WHERE a.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findAuditRowsWithMissingActor(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT ae.id AS id
    FROM audit_events ae
    LEFT JOIN users u ON u.id = ae.actor_id
    WHERE (ae.actor_id IS NOT NULL AND u.id IS NULL)
       OR (ae.actor_id IS NULL AND ae.action_type NOT IN ('login_failed', 'authorization_denied'))
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findSnapshotsWithoutAttempts(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT s.id AS id
    FROM snapshots s
    LEFT JOIN attempts a ON a.id = s.attempt_id
    WHERE a.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findDuplicateCandidateIdentifiers(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT u.id AS id
    FROM users u
    JOIN (
      SELECT matric_number
      FROM users
      WHERE matric_number IS NOT NULL
      GROUP BY matric_number
      HAVING COUNT(*) > 1
    ) duplicate_identifiers ON duplicate_identifiers.matric_number = u.matric_number
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findDuplicateAttemptIdentifiers(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT a.id AS id
    FROM attempts a
    GROUP BY a.id
    HAVING COUNT(*) > 1
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findDuplicateResponseVersions(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT CONCAT(r.attempt_id, ':', r.question_id, ':', rv.version_num) AS id
    FROM response_versions rv
    JOIN responses r ON r.id = rv.response_id
    GROUP BY r.attempt_id, r.question_id, rv.version_num
    HAVING COUNT(*) > 1
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findDuplicateAttemptSubmissions(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT a.id AS id
    FROM attempts a
    JOIN (
      SELECT candidate_id, assessment_id, submission_receipt
      FROM attempts
      WHERE submission_receipt IS NOT NULL
      GROUP BY candidate_id, assessment_id, submission_receipt
      HAVING COUNT(*) > 1
    ) duplicate_receipts
      ON duplicate_receipts.candidate_id = a.candidate_id
     AND duplicate_receipts.assessment_id = a.assessment_id
     AND duplicate_receipts.submission_receipt = a.submission_receipt
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findDuplicateQuestionIdentifiers(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT ai.id AS id
    FROM assessment_items ai
    JOIN (
      SELECT assessment_id, question_id
      FROM assessment_items
      GROUP BY assessment_id, question_id
      HAVING COUNT(*) > 1
    ) duplicates
      ON duplicates.assessment_id = ai.assessment_id
     AND duplicates.question_id = ai.question_id
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findMultipleActiveAttempts(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT a.id AS id
    FROM attempts a
    JOIN (
      SELECT candidate_id, assessment_id
      FROM attempts
      WHERE is_active = TRUE
      GROUP BY candidate_id, assessment_id
      HAVING COUNT(*) > 1
    ) duplicates
      ON duplicates.candidate_id = a.candidate_id
     AND duplicates.assessment_id = a.assessment_id
    WHERE a.is_active = TRUE
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findResponsesWithQuestionOutsideAssessment(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT CONCAT(r.id, ':', r.question_id, ':', a.assessment_id) AS id
    FROM responses r
    JOIN attempts a ON a.id = r.attempt_id
    LEFT JOIN assessment_items ai
      ON ai.assessment_id = a.assessment_id
     AND ai.question_id = r.question_id
    WHERE ai.id IS NULL
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findSubmissionReceiptMismatches(database: PrismaClient): Promise<string[]> {
  const attempts = await database.attempt.findMany({
    select: {
      id: true,
      candidateId: true,
      assessmentId: true,
      submissionReceipt: true,
      submittedAt: true,
      receiptAt: true,
    },
    where: {
      submissionReceipt: { not: null },
    },
  });

  const mismatches = attempts.filter((attempt) => {
    const receipt = attempt.submissionReceipt;
    if (!receipt) {
      return false;
    }

    const timestamp = attempt.submittedAt ?? attempt.receiptAt ?? null;
    return timestamp === null
      || receipt !== createSubmissionReceipt(attempt.assessmentId, attempt.id, attempt.candidateId, timestamp);
  });

  return mismatches.map((attempt) => attempt.id);
}

async function findSnapshotMonitoringAttemptMismatches(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT s.id AS id
    FROM snapshots s
    JOIN monitoring_events me ON me.id = s.monitoring_event_id
    WHERE s.attempt_id <> me.attempt_id
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findResponseVersionContinuityViolations(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    WITH numbered AS (
      SELECT
        r.attempt_id,
        r.question_id,
        rv.version_num,
        ROW_NUMBER() OVER (
          PARTITION BY r.attempt_id, r.question_id
          ORDER BY rv.version_num
        ) AS expected_version
      FROM response_versions rv
      JOIN responses r ON r.id = rv.response_id
    )
    SELECT CONCAT(attempt_id, ':', question_id, ':', version_num) AS id
    FROM numbered
    WHERE version_num <> expected_version OR version_num < 1
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findResponsesNamingAnotherCandidateThanTheirAttempt(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT r.id AS id
    FROM responses r
    JOIN attempts a ON a.id = r.attempt_id
    WHERE to_jsonb(r) ? 'candidate_id'
      AND to_jsonb(r)->>'candidate_id' IS DISTINCT FROM a.candidate_id
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function findResponsesNamingAnotherAssessmentThanTheirAttempt(database: PrismaClient): Promise<string[]> {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT r.id AS id
    FROM responses r
    JOIN attempts a ON a.id = r.attempt_id
    WHERE to_jsonb(r) ? 'assessment_id'
      AND to_jsonb(r)->>'assessment_id' IS DISTINCT FROM a.assessment_id
    LIMIT 10;
  `;
  return rows.map((row) => row.id);
}

async function responseHasNoOwnershipColumn(database: PrismaClient, column: 'candidate_id' | 'assessment_id'): Promise<boolean> {
  const rows = await database.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'responses'
        AND column_name = ${column}
    ) AS exists
  `;
  return rows[0]?.exists === false;
}

async function proveCheck(database: PrismaClient, defectCase: DefectCase): Promise<ProofResult> {
  if (!canCorrupt) {
    return { proven: false, protectedByConstraint: false };
  }

  let protectedByConstraint = false;
  let proven = false;

  try {
    await database.$transaction(async (tx) => {
      try {
        await defectCase.insert(tx);
        const offendingRecords = await defectCase.scan(tx);
        if (offendingRecords.length === (defectCase.expectedOffenders ?? 1)) {
          proven = true;
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003'].includes(error.code)) {
          protectedByConstraint = true;
        } else {
          throw error;
        }
      }

      throw new Error('ROLLBACK');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ROLLBACK') {
      throw error;
    }
  }

  const cleanAfterRollback = await defectCase.scan(database);
  if (cleanAfterRollback.length !== 0) {
    throw new Error(`Rollback did not restore the database for ${defectCase.check}.`);
  }

  return { proven, protectedByConstraint }
}

async function buildIntegrityReport(database: PrismaClient): Promise<IntegrityReportRow[]> {
  const schema = await inspectSchema(database);
  console.info(`[H13] Schema tables and columns: ${schema.tableColumns.join('; ')}.`);
  console.info('[H13] Schema mapping: candidates are users with role=candidate; examinations are assessments; submissions and receipts are stored on attempts; no separate candidate, examination, submission, or receipt table exists.');
  const structuralFindings = [...schema.missingForeignKeys, ...schema.missingUniqueConstraints];
  const schemaRow: IntegrityReportRow = {
    category: 'structural',
    check: 'schema foreign-key and unique-constraint coverage',
    offendingCount: structuralFindings.length,
    offendingIds: formatRowValues(structuralFindings),
    proven: false,
    protectedByConstraint: structuralFindings.length === 0,
    status: structuralFindings.length === 0 ? 'PASS' : 'FAIL',
  };

  const checks: Array<{ category: IntegrityReportRow['category']; check: string; query: (db: PrismaClient) => Promise<string[]>; prove?: (db: PrismaClient) => Promise<ProofResult> }> = [
    { category: 'orphan', check: 'responses without attempts', query: findResponsesWithoutAttempts },
    { category: 'orphan', check: 'attempts without candidates', query: findAttemptsWithoutCandidates },
    { category: 'orphan', check: 'attempts without examinations', query: findAttemptsWithoutAssessments },
    { category: 'orphan', check: 'responses without questions', query: findResponsesWithoutQuestions },
    { category: 'orphan', check: 'grade decisions without responses', query: findGradeDecisionsWithoutResponses },
    { category: 'orphan', check: 'monitoring events without attempts', query: findMonitoringEventsWithoutAttempts },
    { category: 'orphan', check: 'snapshots without attempts', query: findSnapshotsWithoutAttempts },
    { category: 'orphan', check: 'audit rows with missing actors', query: findAuditRowsWithMissingActor },
    { category: 'duplicate', check: 'duplicate candidate identifiers', query: findDuplicateCandidateIdentifiers },
    { category: 'duplicate', check: 'duplicate attempt identifiers', query: findDuplicateAttemptIdentifiers },
    { category: 'duplicate', check: 'duplicate response versions', query: findDuplicateResponseVersions },
    { category: 'duplicate', check: 'duplicate submission receipts for the same candidate and assessment', query: findDuplicateAttemptSubmissions },
    { category: 'duplicate', check: 'duplicate question identifiers in the same assessment', query: findDuplicateQuestionIdentifiers },
    { category: 'duplicate', check: 'more than one active attempt per candidate and assessment', query: findMultipleActiveAttempts },
    { category: 'mismatch', check: 'responses whose question is not assigned to the attempt assessment', query: findResponsesWithQuestionOutsideAssessment },
    {
      category: 'mismatch',
      check: 'Candidate A response assigned to Candidate B attempt (response candidate ownership mismatch)',
      query: findResponsesNamingAnotherCandidateThanTheirAttempt,
      prove: async (db) => ({
        proven: false,
        protectedByConstraint: await responseHasNoOwnershipColumn(db, 'candidate_id'),
      }),
    },
    {
      category: 'mismatch',
      check: 'response examination differs from its attempt examination',
      query: findResponsesNamingAnotherAssessmentThanTheirAttempt,
      prove: async (db) => ({
        proven: false,
        protectedByConstraint: await responseHasNoOwnershipColumn(db, 'assessment_id'),
      }),
    },
    { category: 'mismatch', check: 'submission receipts whose attempt, candidate or assessment metadata do not match', query: findSubmissionReceiptMismatches },
    { category: 'mismatch', check: 'snapshots linked to a different attempt than their monitoring event', query: findSnapshotMonitoringAttemptMismatches },
    { category: 'mismatch', check: 'response versions with repeated or non-contiguous version numbers', query: findResponseVersionContinuityViolations },
  ];

  const reportRows: IntegrityReportRow[] = [schemaRow];

  const proofCases: DefectCase[] = [
    {
      check: 'responses without attempts',
      category: 'orphan',
      insert: async (db) => {
        const assessmentId = (await db.assessment.findFirst({ select: { id: true } }))?.id;
        const questionId = (await db.question.findFirst({ select: { id: true } }))?.id;
        if (!assessmentId || !questionId) {
          throw new Error('No seeded assessment or question is available for the orphan defect case.');
        }
        await db.response.create({
          data: {
            id: `orphan-response-${randomUUID()}`,
            attemptId: `missing-attempt-${randomUUID()}`,
            questionId,
          },
        });
      },
      scan: findResponsesWithoutAttempts,
    },
    {
      check: 'attempts without candidates',
      category: 'orphan',
      insert: async (db) => {
        const assessmentId = (await db.assessment.findFirst({ select: { id: true } }))?.id;
        if (!assessmentId) {
          throw new Error('No seeded assessment is available for the candidate defect case.');
        }
        await db.attempt.create({
          data: {
            id: `orphan-attempt-${randomUUID()}`,
            candidateId: `missing-candidate-${randomUUID()}`,
            assessmentId,
            status: 'not_started',
            isActive: false,
          },
        });
      },
      scan: findAttemptsWithoutCandidates,
    },
    {
      check: 'attempts without examinations',
      category: 'orphan',
      insert: async (db) => {
        await db.attempt.create({
          data: {
            id: `orphan-assessment-attempt-${randomUUID()}`,
            candidateId: 'integrity-candidate',
            assessmentId: `missing-assessment-${randomUUID()}`,
            status: 'not_started',
            isActive: false,
          },
        });
      },
      scan: findAttemptsWithoutAssessments,
    },
    {
      check: 'responses without questions',
      category: 'orphan',
      insert: async (db) => {
        const attemptId = (await db.attempt.findFirst({ select: { id: true } }))?.id;
        if (!attemptId) {
          throw new Error('No seeded attempt is available for the missing-question defect case.');
        }
        await db.response.create({
          data: {
            id: `missing-question-response-${randomUUID()}`,
            attemptId,
            questionId: `missing-question-${randomUUID()}`,
          },
        });
      },
      scan: findResponsesWithoutQuestions,
    },
    {
      check: 'grade decisions without responses',
      category: 'orphan',
      insert: async (db) => {
        const attemptId = (await db.attempt.findFirst({ select: { id: true } }))?.id;
        if (!attemptId) {
          throw new Error('No seeded attempt is available for the grade defect case.');
        }
        const questionId = (await db.question.findUnique({ where: { id: 'integrity-other-question' }, select: { id: true } }))?.id;
        if (!questionId) {
          throw new Error('The dedicated H13 grade-without-response fixture is missing.');
        }
        await db.gradeDecision.create({
          data: {
            id: `grade-gap-${randomUUID()}`,
            attemptId,
            questionId,
            provisionalScore: 1,
            lecturerDecision: 'pending',
          },
        });
      },
      scan: findGradeDecisionsWithoutResponses,
    },
    {
      check: 'monitoring events without attempts',
      category: 'orphan',
      insert: async (db) => {
        await db.monitoringEvent.create({
          data: {
            id: `monitoring-gap-${randomUUID()}`,
            attemptId: `missing-attempt-${randomUUID()}`,
            eventType: 'TAB_SWITCH',
            occurredAt: new Date(),
          },
        });
      },
      scan: findMonitoringEventsWithoutAttempts,
    },
    {
      check: 'snapshots without attempts',
      category: 'orphan',
      insert: async (db) => {
        await db.snapshot.create({
          data: {
            id: `orphan-snapshot-${randomUUID()}`,
            attemptId: `missing-attempt-${randomUUID()}`,
            imageData: 'data:image/png;base64,fixture',
          },
        });
      },
      scan: findSnapshotsWithoutAttempts,
    },
    {
      check: 'audit rows with missing actors',
      category: 'orphan',
      insert: async (db) => {
        await db.auditEvent.create({
          data: {
            id: `audit-missing-actor-${randomUUID()}`,
            actorId: `missing-user-${randomUUID()}`,
            actionType: 'H13_TEST',
            entityType: 'attempt',
            entityId: 'missing',
            reason: 'test defect',
          },
        });
      },
      scan: findAuditRowsWithMissingActor,
    },
    {
      check: 'duplicate candidate identifiers',
      category: 'duplicate',
      insert: async (db) => {
        const existingUser = await db.user.findFirst({
          select: { id: true, matricNumber: true },
          where: { role: 'candidate', matricNumber: { not: null } },
        });
        if (!existingUser || !existingUser.matricNumber) {
          throw new Error('No seeded candidate is available for the duplicate identifier defect case.');
        }
        await db.user.create({
          data: {
            id: `duplicate-user-${randomUUID()}`,
            name: 'Duplicate candidate',
            email: `duplicate-${randomUUID()}@example.com`,
            matricNumber: existingUser.matricNumber,
            passwordHash: 'hash',
            role: 'candidate',
          },
        });
      },
      scan: findDuplicateCandidateIdentifiers,
    },
    {
      check: 'duplicate attempt identifiers',
      category: 'duplicate',
      insert: async (db) => {
        const attempt = await db.attempt.findFirst({ select: { id: true, candidateId: true, assessmentId: true } });
        if (!attempt) {
          throw new Error('No seeded attempt is available for the duplicate attempt defect case.');
        }
        await db.attempt.create({
          data: {
            id: attempt.id,
            candidateId: attempt.candidateId,
            assessmentId: attempt.assessmentId,
            status: 'not_started',
            isActive: false,
          },
        });
      },
      scan: findDuplicateAttemptIdentifiers,
    },
    {
      check: 'duplicate response versions',
      category: 'duplicate',
      insert: async (db) => {
        const existingVersion = await db.responseVersion.findFirst({
          select: { responseId: true, versionNum: true },
        });
        if (!existingVersion) {
          throw new Error('No seeded response version exists for the duplicate response-version defect case.');
        }
        await db.responseVersion.create({
          data: {
            id: `duplicate-version-${randomUUID()}`,
            responseId: existingVersion.responseId,
            text: 'duplicate version',
            versionNum: existingVersion.versionNum,
            saveType: 'autosave',
          },
        });
      },
      scan: findDuplicateResponseVersions,
    },
    {
      check: 'duplicate submission receipts for the same candidate and assessment',
      category: 'duplicate',
      expectedOffenders: 2,
      insert: async (db) => {
        const sourceAttempt = await db.attempt.findUnique({
          where: { id: 'integrity-attempt' },
          select: { id: true, candidateId: true, assessmentId: true, submissionReceipt: true },
        });
        if (!sourceAttempt) {
          throw new Error('The dedicated H13 duplicate-receipt source fixture is missing.');
        }
        const targetAttempt = await db.attempt.findUnique({
          where: {
            id: 'integrity-attempt-secondary',
            candidateId: sourceAttempt.candidateId,
            assessmentId: sourceAttempt.assessmentId,
          },
          select: { id: true },
        });
        if (!targetAttempt) {
          throw new Error('The dedicated H13 duplicate-receipt target fixture is missing.');
        }
        const duplicateReceipt = sourceAttempt.submissionReceipt ?? `EXAM-${sourceAttempt.assessmentId.slice(0, 8)}-ATT-${sourceAttempt.id.slice(0, 8)}-CAND-${maskCandidateIdentifier(sourceAttempt.candidateId)}-${new Date('2026-10-10T12:00:00.000Z').toISOString()}-SUBMITTED`;
        await db.attempt.update({
          where: { id: targetAttempt.id },
          data: {
            submissionReceipt: duplicateReceipt,
            submittedAt: new Date('2026-10-10T12:00:00.000Z'),
            receiptAt: new Date('2026-10-10T12:00:00.000Z'),
          },
        });
      },
      scan: findDuplicateAttemptSubmissions,
    },
    {
      check: 'duplicate question identifiers in the same assessment',
      category: 'duplicate',
      insert: async (db) => {
        const item = await db.assessmentItem.findFirst({ select: { assessmentId: true, questionId: true } });
        if (!item) {
          throw new Error('No seeded assessment item is available for the duplicate question defect case.');
        }
        await db.assessmentItem.create({
          data: {
            id: `duplicate-item-${randomUUID()}`,
            assessmentId: item.assessmentId,
            questionId: item.questionId,
            displayOrder: 99,
            maxMark: 1,
          },
        });
      },
      scan: findDuplicateQuestionIdentifiers,
    },
    {
      check: 'more than one active attempt per candidate and assessment',
      category: 'duplicate',
      expectedOffenders: 2,
      insert: async (db) => {
        const attempt = await db.attempt.findFirst({ select: { candidateId: true, assessmentId: true } });
        if (!attempt) {
          throw new Error('No seeded attempt is available for the active-attempt defect case.');
        }
        await db.attempt.create({
          data: {
            id: `duplicate-active-1-${randomUUID()}`,
            candidateId: attempt.candidateId,
            assessmentId: attempt.assessmentId,
            status: 'in_progress',
            isActive: true,
          },
        });
        await db.attempt.create({
          data: {
            id: `duplicate-active-2-${randomUUID()}`,
            candidateId: attempt.candidateId,
            assessmentId: attempt.assessmentId,
            status: 'in_progress',
            isActive: true,
          },
        });
      },
      scan: findMultipleActiveAttempts,
    },
    {
      check: 'responses whose question is not assigned to the attempt assessment',
      category: 'mismatch',
      insert: async (db) => {
        const attempt = await db.attempt.findUnique({ where: { id: 'integrity-attempt' }, select: { id: true } });
        const questionOutsideAssessment = await db.question.findUnique({ where: { id: 'integrity-other-question' }, select: { id: true } });
        if (!attempt || !questionOutsideAssessment) throw new Error('The dedicated H13 mismatch fixture is missing.');
        await db.response.create({
          data: {
            id: `wrong-assessment-response-${randomUUID()}`,
            attemptId: attempt.id,
            questionId: questionOutsideAssessment.id,
          },
        });
      },
      scan: findResponsesWithQuestionOutsideAssessment,
    },
    {
      check: 'snapshots linked to a different attempt than their monitoring event',
      category: 'mismatch',
      insert: async (db) => {
        const snapshot = await db.snapshot.findUnique({ where: { id: 'integrity-snapshot' }, select: { id: true } });
        const otherAttempt = await db.attempt.findUnique({ where: { id: 'integrity-attempt-secondary' }, select: { id: true } });
        if (!snapshot || !otherAttempt) throw new Error('The dedicated H13 snapshot mismatch fixture is missing.');
        await db.snapshot.update({
          where: { id: snapshot.id },
          data: { attemptId: otherAttempt.id },
        });
      },
      scan: findSnapshotMonitoringAttemptMismatches,
    },
    {
      check: 'submission receipts whose attempt, candidate or assessment metadata do not match',
      category: 'mismatch',
      insert: async (db) => {
        const attempt = await db.attempt.findFirst({ select: { id: true, candidateId: true, assessmentId: true } });
        if (!attempt) {
          throw new Error('No seeded attempt is available for the receipt mismatch defect case.');
        }
        await db.attempt.update({
          where: { id: attempt.id },
          data: {
            submissionReceipt: `EXAM-${attempt.assessmentId.slice(0, 8)}-ATT-${randomUUID().slice(0, 8)}-CAND-${maskCandidateIdentifier(attempt.candidateId)}-${new Date().toISOString()}-SUBMITTED`,
            submittedAt: new Date(),
            receiptAt: new Date(),
          },
        });
      },
      scan: findSubmissionReceiptMismatches,
    },
    {
      check: 'response versions with repeated or non-contiguous version numbers',
      category: 'mismatch',
      insert: async (db) => {
        const response = await db.response.findFirst({ select: { id: true } });
        if (!response) {
          throw new Error('No seeded response exists for the response-version continuity defect case.');
        }
        await db.responseVersion.create({
          data: {
            id: `bad-sequence-${randomUUID()}`,
            responseId: response.id,
            text: 'bad sequence data',
            versionNum: 999,
            saveType: 'autosave',
          },
        });
      },
      scan: findResponseVersionContinuityViolations,
    },
  ];

  for (const scan of checks) {
    const offendingRecords = await scan.query(database);
    const proof = scan.prove ? await scan.prove(database) : { proven: false, protectedByConstraint: false };
    const status = offendingRecords.length === 0 && (proof.proven || proof.protectedByConstraint) ? 'PASS' : 'FAIL';
    reportRows.push({
      category: scan.category,
      check: scan.check,
      offendingCount: offendingRecords.length,
      offendingIds: formatRowValues(offendingRecords),
      proven: proof.proven,
      protectedByConstraint: proof.protectedByConstraint,
      status,
    });
  }

  for (const defectCase of proofCases) {
    const proof = await proveCheck(database, defectCase);
    const relatedRow = reportRows.find((row) => row.check === defectCase.check);
    if (relatedRow) {
      relatedRow.proven = proof.proven;
      relatedRow.protectedByConstraint = proof.protectedByConstraint;
      relatedRow.status = relatedRow.offendingCount === 0 && (proof.proven || proof.protectedByConstraint) ? 'PASS' : 'FAIL';
    }
  }

  return reportRows;
}

function formatIntegrityTable(rows: IntegrityReportRow[]): string {
  const headers = ['category', 'check', 'offending count', 'sample ids', 'defect detected', 'constraint protected', 'status'];
  const lines = [headers.join(' | ')];
  for (const row of rows) {
    const sampleIds = row.offendingIds.length > 0 ? row.offendingIds.join(', ') : 'none';
    lines.push([
      row.category,
      row.check,
      String(row.offendingCount),
      sampleIds,
      row.proven ? 'yes' : 'no',
      row.protectedByConstraint ? 'yes' : 'no',
      row.status,
    ].join(' | '));
  }
  return lines.join('\n');
}

databaseDescribe('H13 — database integrity validation', () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('runs the real PostgreSQL schema and data integrity checks against the isolated test database', async () => {
    if (!prisma) {
      throw new Error('No database connection is configured for the integrity scan.');
    }

    console.info(`[H13] Database scanned: ${databaseLabel}${configuredTestDatabaseName ? ` (${configuredTestDatabaseName})` : ''}.`);
    console.info(`[H13] Deliberate defect checks: ${canCorrupt ? 'enabled for verified isolated database' : 'disabled'}.`);
    if (canCorrupt) {
      await ensureIntegrityFixture(prisma);
    }
    const report = await buildIntegrityReport(prisma);
    console.info(formatIntegrityTable(report));

    const totalProven = report.filter((row) => row.category !== 'structural' && row.proven).length;
    const totalProtected = report.filter((row) => row.category !== 'structural' && row.protectedByConstraint).length;
    const finalResult = report.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    console.info(`[H13] Overall result: ${finalResult}. Proven detection count: ${totalProven}. Constraint-protected count: ${totalProtected}.`);

    expect(report.every((row) => row.status === 'PASS')).toBe(true);
  });
});

if (!configuredConnectionString) {
  console.info('[H13] SKIP: set TEST_DATABASE_URL or INTEGRITY_DATABASE_URL to an isolated PostgreSQL test database.');
}

if (configuredConnectionString && !canCorrupt) {
  console.info(`[H13] Read-only scan mode active for ${databaseLabel}. Deliberate corruption checks and fixture writes are disabled.`);
}
