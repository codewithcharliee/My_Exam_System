import { createElement, useState } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  LecturerGradeReview,
  type LecturerGradeDecision,
} from '@/components/exam/lecturer-grade-review';

const h = createElement;
const REVIEWER = 'Lecturer Example';
const REVIEWED_AT = '2026-10-11 20:00:00';
const MAX_MARK = 5;

type ReviewState = {
  provisionalScore: number;
  officialGrade: number | null;
  lecturerDecision: string;
  gradedBy: string | null;
  gradedAt: string | null;
};

function LecturerReviewEvidence() {
  const [grade, setGrade] = useState<ReviewState>({
    provisionalScore: 3,
    officialGrade: null,
    lecturerDecision: 'pending',
    gradedBy: null,
    gradedAt: null,
  });

  async function recordDecision(decision: LecturerGradeDecision, officialGrade: number | null) {
    setGrade((current) => ({
      ...current,
      officialGrade,
      lecturerDecision: decision,
      gradedBy: REVIEWER,
      gradedAt: REVIEWED_AT,
    }));
  }

  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        padding: '56px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: '"Times New Roman", Times, serif',
      },
    },
    h(
      'header',
      { style: { maxWidth: '980px', margin: '0 auto 32px' } },
      h('div', { style: { fontSize: '12px', letterSpacing: '0.12em' } }, 'BINGHAM UNIVERSITY'),
      h('h1', { style: { margin: '8px 0', fontSize: '30px' } }, 'Lecturer grade review'),
      h('p', { style: { margin: 0 } }, 'Unit Test 14 · Lecturer confirmation'),
    ),
    h(
      'article',
      {
        style: {
          maxWidth: '980px',
          margin: '0 auto',
          padding: '32px',
          border: '1px solid #000000',
          background: '#ffffff',
        },
      },
      h('h2', { style: { margin: '0 0 8px', fontSize: '21px' } }, 'Constitutional Law · Question 10'),
      h('p', { style: { margin: '0 0 24px' } }, 'Candidate: Test Candidate · Maximum mark: 5'),
      h(LecturerGradeReview, {
        provisionalScore: grade.provisionalScore,
        officialGrade: grade.officialGrade,
        lecturerDecision: grade.lecturerDecision,
        maxMark: MAX_MARK,
        gradedBy: grade.gradedBy,
        gradedAt: grade.gradedAt,
        onDecision: recordDecision,
      }),
    ),
  );
}

describe('Unit Test 14 — H09: provisional scores require lecturer confirmation', () => {
  let rendered: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(async () => {
    await page.viewport(1440, 1000);
    rendered = await render(h(LecturerReviewEvidence));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
  });

  it('shows no official grade before review and assigns one only after confirmation', async () => {
    await expect.element(page.getByTestId('provisional-score')).toHaveTextContent('3/5');
    await expect.element(page.getByTestId('official-grade')).toHaveTextContent('Official grade: Awaiting lecturer review');
    await expect.element(page.getByRole('button', { name: 'Confirm provisional score' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Change grade' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Reject for re-marking' })).toBeVisible();

    await expect(page).toMatchScreenshot('unit-test-14-lecturer-confirmation/scenario-specific-ui-screenshots/lecturer-review-pending');

    await page.getByRole('button', { name: 'Confirm provisional score' }).click();

    await expect.element(page.getByTestId('official-grade')).toHaveTextContent('Official grade: 3/5');
    await expect.element(page.getByTestId('reviewer')).toHaveTextContent(`Reviewed by: ${REVIEWER}`);
    await expect.element(page.getByTestId('reviewed-at')).toHaveTextContent(`Reviewed at: ${REVIEWED_AT}`);
    await expect(page).toMatchScreenshot('unit-test-14-lecturer-confirmation/scenario-specific-ui-screenshots/lecturer-review-confirmed');
  });
});

describe('Unit Test 14 — H10: lecturer changes, rejects, and caps reviewed grades', () => {
  let rendered: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(async () => {
    await page.viewport(1440, 1000);
    rendered = await render(h(LecturerReviewEvidence));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
  });

  it('keeps the provisional score when a lecturer changes the official grade and enforces the maximum', async () => {
    const changedGrade = page.getByRole('spinbutton', { name: 'Changed grade' });

    await changedGrade.fill('6');
    await page.getByRole('button', { name: 'Change grade' }).click();
    await expect.element(page.getByRole('alert')).toHaveTextContent('Enter a grade between 0 and 5.');
    await expect.element(page.getByTestId('official-grade')).toHaveTextContent('Official grade: Awaiting lecturer review');

    await changedGrade.fill('2');
    await page.getByRole('button', { name: 'Change grade' }).click();

    await expect.element(page.getByTestId('provisional-score')).toHaveTextContent('3/5');
    await expect.element(page.getByTestId('official-grade')).toHaveTextContent('Official grade: 2/5');
    await expect.element(page.getByTestId('reviewer')).toHaveTextContent(`Reviewed by: ${REVIEWER}`);
  });

  it('leaves the official grade empty and returns a rejected result for re-marking', async () => {
    await page.getByRole('button', { name: 'Reject for re-marking' }).click();

    await expect.element(page.getByTestId('provisional-score')).toHaveTextContent('3/5');
    await expect.element(page.getByTestId('official-grade')).toHaveTextContent('Official grade: Not assigned — returned for re-marking');
    await expect.element(page.getByTestId('reviewer')).toHaveTextContent(`Reviewed by: ${REVIEWER}`);
  });
});
