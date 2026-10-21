import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const prisma = testDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
  : null;
const databaseDescribe = prisma ? describe : describe.skip;

databaseDescribe('Unit Test 12 — PostgreSQL relationship validation', () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('rejects a response whose attempt_id does not reference an existing attempt', async () => {
    const database = prisma;
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required for the database relationship integration test.');
    }

    const invalidAttemptId = `missing-attempt-${randomUUID()}`;
    const existingAttempt = await database.attempt.findUnique({
      where: { id: invalidAttemptId },
      select: { id: true },
    });
    expect(existingAttempt).toBeNull();

    let rejection: unknown;
    try {
      await database.response.create({
        data: {
          attemptId: invalidAttemptId,
          questionId: 'synthetic-question-for-foreign-key-test',
        },
      });
    } catch (error) {
      rejection = error;
    }

    if (!(rejection instanceof Prisma.PrismaClientKnownRequestError)) {
      throw new Error(`Expected Prisma to reject the response with a foreign-key error. Received: ${String(rejection)}`);
    }

    expect(rejection.code).toBe('P2003');
    expect(rejection.message).toContain('responses_attempt_id_fkey');

    console.info(
      `[Unit Test 12] PASS: PostgreSQL rejected responses.attempt_id=${invalidAttemptId} ` +
        `with Prisma ${rejection.code} on constraint responses_attempt_id_fkey.`,
    );
  });
});

if (!testDatabaseUrl) {
  console.info('[Unit Test 12] SKIP: set TEST_DATABASE_URL to an isolated PostgreSQL test database.');
}
