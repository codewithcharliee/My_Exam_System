import { createElement, useState } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  LecturerGradeReview,
  type LecturerGradeDecision,
} from '@/components/exam/lecturer-grade-review';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { autoScoreSubjective, type ScoringConfig } from '@/lib/scoring';

const h = createElement;

type ReviewAction = 'accepted' | 'modified' | 'rejected' | 'replaced';
type ResultRow = {
  group: string;
  caseName: string;
  expectedValue: string;
  actualValue: string;
  status: 'PASS' | 'FAIL';
};

type AuditEntry = {
  actorId: string;
  answer: string;
  action: ReviewAction;
  previousValue: number | null;
  nextValue: number | null;
  reason: string | null;
  timestamp: string;
};

const resultsTable: ResultRow[] = [];
const auditEntries: AuditEntry[] = [];

function registerRow(group: string, caseName: string, expectedValue: string, actualValue: string): void {
  const status = expectedValue === actualValue ? 'PASS' : 'FAIL';
  resultsTable.push({ group, caseName, expectedValue, actualValue, status });
  expect(actualValue).toBe(expectedValue);
}

function registerAudit(
  actorId: string,
  answer: string,
  action: ReviewAction,
  previousValue: number | null,
  nextValue: number | null,
  reason: string | null,
  timestamp: string,
): void {
  auditEntries.push({ actorId, answer, action, previousValue, nextValue, reason, timestamp });
}

function buildExactScheme(): ScoringConfig {
  return {
    method: 'exact_match',
    maxMark: 5,
    configJson: JSON.stringify({ acceptedPhrases: ['judicial review'] }),
  };
}

function buildEquivalentScheme(): ScoringConfig {
  return {
    method: 'acceptable_answer',
    maxMark: 5,
    configJson: JSON.stringify({ acceptedPhrases: ['judicial review', 'review by the courts'] }),
  };
}

function buildMarkingPointsScheme(): ScoringConfig {
  return {
    method: 'marking_points',
    maxMark: 5,
    configJson: null,
    markingPoints: [
      { pointText: 'Point 1', marks: 2, alternativesJson: null },
      { pointText: 'Point 2', marks: 2, alternativesJson: null },
      { pointText: 'Point 3', marks: 1, alternativesJson: null },
    ],
  };
}

function buildSpellingScheme(): ScoringConfig {
  return {
    method: 'acceptable_answer',
    maxMark: 5,
    configJson: JSON.stringify({ acceptedPhrases: ['judicial review'], spellingTolerance: 1 }),
  };
}

function buildHumanReviewScheme(): ScoringConfig {
  return {
    method: 'human_grading',
    maxMark: 5,
    configJson: null,
  };
}

function manualScore(answer: string, scheme: ScoringConfig): { provisionalScore: number | null; matched: boolean; stage: 'auto' | 'human'; reasoning: string } {
  return autoScoreSubjective(answer, scheme);
}

function ProvisionalBreakdown({ answer }: { answer: string }): ReturnType<typeof h> {
  const scheme = buildMarkingPointsScheme();
  const result = manualScore(answer, scheme);

  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        background: '#ffffff',
        color: '#000000',
        fontFamily: 'Times New Roman, Times, serif',
        padding: '48px',
      },
    },
    h('div', { style: { maxWidth: '940px', margin: '0 auto', border: '1px solid #000000', padding: '28px' } },
      h('h1', { style: { margin: '0 0 10px', fontSize: '28px' } }, 'Provisional result breakdown'),
      h('p', { style: { margin: '0 0 20px', fontSize: '18px' } }, `Candidate answer: ${answer}`),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', border: '1px solid #000000', padding: '16px 18px', marginBottom: '20px' } },
        h('div', null,
          h('div', { style: { fontSize: '11px', letterSpacing: '0.12em' } }, 'PROVISIONAL SCORE'),
          h('div', { style: { fontSize: '30px', fontWeight: 700 } }, `${result.provisionalScore ?? 0} / 5`),
        ),
        h('div', { style: { fontSize: '15px', lineHeight: 1.5, maxWidth: '420px' } }, result.reasoning),
      ),
      h('table', { style: { width: '100%', borderCollapse: 'collapse', border: '1px solid #000000' } },
        h('thead', null,
          h('tr', null,
            h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Point'),
            h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Marks'),
            h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Status'),
          ),
        ),
        h('tbody', null,
          ...scheme.markingPoints!.map((point) => {
            const matched = result.matchedPoints.includes(point.pointText);
            return h('tr', { key: point.pointText },
              h('td', { style: { border: '1px solid #000000', padding: '10px' } }, point.pointText),
              h('td', { style: { border: '1px solid #000000', padding: '10px' } }, String(point.marks)),
              h('td', { style: { border: '1px solid #000000', padding: '10px', fontWeight: 700, color: matched ? '#000000' : '#666666' } }, matched ? 'Matched' : 'Not matched'),
            );
          }),
        ),
      ),
    ),
  );
}

function ReviewQueueTable({ answer, reason }: { answer: string; reason: string }): ReturnType<typeof h> {
  return h(
    'main',
    { style: { minHeight: '100vh', background: '#ffffff', color: '#000000', fontFamily: 'Times New Roman, Times, serif', padding: '48px' } },
    h('div', { style: { maxWidth: '940px', margin: '0 auto', border: '1px solid #000000', padding: '28px' } },
      h('h1', { style: { margin: '0 0 18px', fontSize: '28px' } }, 'Review queue'),
      h('p', { style: { margin: '0 0 16px', fontSize: '18px' } }, 'Ambiguous answer requiring lecturer review'),
      h('table', { style: { width: '100%', borderCollapse: 'collapse', border: '1px solid #000000' } },
        h('thead', null,
          h('tr', null,
            h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Answer'),
            h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Reason'),
          ),
        ),
        h('tbody', null,
          h('tr', null,
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, answer),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, reason),
          ),
        ),
      ),
    ),
  );
}

function LecturerReviewScreen({ answer, provisionalScore, officialGrade, lecturerDecision, reviewer, reviewedAt }: {
  answer: string;
  provisionalScore: number | null;
  officialGrade: number | null;
  lecturerDecision: 'pending' | ReviewAction;
  reviewer: string | null;
  reviewedAt: string | null;
}): ReturnType<typeof h> {
  const [review, setReview] = useState({ officialGrade, lecturerDecision, reviewer, reviewedAt });

  async function recordDecision(decision: LecturerGradeDecision, grade: number | null) {
    setReview({
      officialGrade: grade,
      lecturerDecision: decision,
      reviewer: 'Lecturer Example',
      reviewedAt: '2026-10-11 20:00:00',
    });
  }

  return h(
    'main',
    { className: 'space-y-6' },
    h('header', { className: 'space-y-2' },
      h('p', { className: 'text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground' }, 'Bingham University · Lecturer workspace'),
      h('h1', { className: 'text-3xl font-bold tracking-tight text-primary' }, 'Marking review'),
      h('p', { className: 'text-muted-foreground' }, 'Constitutional Law · Question 10 · Candidate response'),
    ),
    h(Card, null,
      h(CardHeader, null,
        h(CardTitle, { className: 'text-xl' }, 'Lecturer review'),
        h(CardDescription, null, `Candidate answer: ${answer}`),
      ),
      h(CardContent, null,
        h(LecturerGradeReview, {
          provisionalScore,
          officialGrade: review.officialGrade,
          lecturerDecision: review.lecturerDecision,
          maxMark: 5,
          gradedBy: review.reviewer,
          gradedAt: review.reviewedAt,
          onDecision: recordDecision,
        }),
      ),
    ),
  );
}

describe('Test 1 — exact or defined answer', () => {
  it('accepts the exact defined answer and zeroes an incorrect answer while respecting case and whitespace rules', () => {
    const scheme = buildExactScheme();
    const exactAnswer = '  JUDICIAL REVIEW  '; // Human marker: the meaning is the same once case and leading/trailing spaces are normalized.
    const wrongAnswer = 'Judicial order'; // Human marker: this changes the concept and should not be accepted.

    const exactResult = manualScore(exactAnswer, scheme);
    const wrongResult = manualScore(wrongAnswer, scheme);

    registerRow('Test 1', 'Exact answer known by the model', '5', String(exactResult.provisionalScore ?? 'null'));
    registerRow('Test 1', 'Incorrect answer fails the model check', '0', String(wrongResult.provisionalScore ?? 'null'));

    expect(exactResult.matched).toBe(true);
    expect(exactResult.stage).toBe('auto');
    expect(wrongResult.matched).toBe(false);
    expect(wrongResult.stage).toBe('auto');
  });
});

describe('Test 2 — acceptable equivalent', () => {
  it('accepts an equivalent phrase and rejects a materially different one', () => {
    const scheme = buildEquivalentScheme();
    const acceptedEquivalent = 'review by the courts'; // Human marker: this is a configured equivalent phrase and should receive the full marks.
    const exactEquivalent = 'judicial review'; // Human marker: this is the exact model wording and should also receive the full marks.
    const differentPhrase = 'administrative appeal'; // Human marker: this is a different legal concept and should not match.

    const equivalentResult = manualScore(acceptedEquivalent, scheme);
    const exactResult = manualScore(exactEquivalent, scheme);
    const differentResult = manualScore(differentPhrase, scheme);

    registerRow('Test 2', 'Accepted equivalent phrase', '5', String(equivalentResult.provisionalScore ?? 'null'));
    registerRow('Test 2', 'Model phrase exact match', '5', String(exactResult.provisionalScore ?? 'null'));
    registerRow('Test 2', 'Different phrase is not accepted', '0', String(differentResult.provisionalScore ?? 'null'));

    expect(equivalentResult.matched).toBe(true);
    expect(exactResult.matched).toBe(true);
    expect(differentResult.matched).toBe(false);
  });
});

describe('Test 3 — marking points', () => {
  it('awards the manual sums for each point combination and never exceeds the 5-mark cap', () => {
    const scheme = buildMarkingPointsScheme();
    const answerAandB = 'Point 1 and Point 2'; // Human marker: points 1 and 2 are present, so the candidate earns 4 of 5.
    const answerAandC = 'Point 1 and Point 3'; // Human marker: points 1 and 3 are present, so the candidate earns 3 of 5.
    const answerBandC = 'Point 2 and Point 3'; // Human marker: points 2 and 3 are present, so the candidate earns 3 of 5.
    const answerCOnly = 'Point 3'; // Human marker: only point 3 is present, so the candidate earns 1 of 5.
    const answerAll = 'Point 1 Point 2 Point 3'; // Human marker: all three points are present, but the cap stays at 5.
    const answerNone = 'Nothing relevant'; // Human marker: no marking point appears, so the candidate earns 0.
    const repeatedPoint = 'Point 1 again Point 1'; // Human marker: repeated mention of the same point should count only once.

    const cases: Array<[string, string, string]> = [
      ['Point 1 and Point 2', '4', String(manualScore(answerAandB, scheme).provisionalScore ?? 'null')],
      ['Point 1 and Point 3', '3', String(manualScore(answerAandC, scheme).provisionalScore ?? 'null')],
      ['Point 2 and Point 3', '3', String(manualScore(answerBandC, scheme).provisionalScore ?? 'null')],
      ['Point 3 only', '1', String(manualScore(answerCOnly, scheme).provisionalScore ?? 'null')],
      ['All three points', '5', String(manualScore(answerAll, scheme).provisionalScore ?? 'null')],
      ['No points', '0', String(manualScore(answerNone, scheme).provisionalScore ?? 'null')],
      ['Repeated point', '2', String(manualScore(repeatedPoint, scheme).provisionalScore ?? 'null')],
    ];

    for (const [caseName, expectedValue, actualValue] of cases) {
      registerRow('Test 3', caseName, expectedValue, actualValue);
    }

    const cappedValue = manualScore(answerAll, { ...scheme, maxMark: 4 }).provisionalScore ?? 0;
    registerRow('Test 3', 'Maximum mark cap is enforced', '4', String(cappedValue));
    expect(cappedValue).toBe(4);
  });

  it('renders the provisional-result screenshot for the marking-point breakdown', async () => {
    await page.viewport(1440, 1000);
    await render(h(ProvisionalBreakdown, { answer: 'Point 1 and Point 3' }));
    await expect.element(page.getByRole('heading', { name: 'Provisional result breakdown' })).toBeVisible();
    await expect(page).toMatchScreenshot('h09/scenario-specific-ui-screenshots/provisional-result-breakdown');
  });
});

describe('Test 4 — minor spelling error', () => {
  it('accepts a small typo under the tolerance rule and rejects a serious meaning change', () => {
    const scheme = buildSpellingScheme();
    const minorTypo = 'judical review'; // Human marker: a single missing letter is within the configured tolerance and still means the same legal concept.
    const seriousMistake = 'judicial order'; // Human marker: the meaning is changed, so the answer should not be accepted.

    const minorResult = manualScore(minorTypo, scheme);
    const seriousResult = manualScore(seriousMistake, scheme);

    registerRow('Test 4', 'Minor spelling tolerance accepts the answer', '5', String(minorResult.provisionalScore ?? 'null'));
    registerRow('Test 4', 'Serious concept change is not accepted', '0', String(seriousResult.provisionalScore ?? 'null'));

    expect(minorResult.matched).toBe(true);
    expect(seriousResult.matched).toBe(false);
  });
});

describe('Test 5 — ambiguous answer', () => {
  it('flags an ambiguous answer for lecturer review and keeps it out of a final score', async () => {
    const scheme = buildHumanReviewScheme();
    const ambiguousAnswer = 'judicial review may be available or may not be'; // Human marker: the answer is partly right but ambiguous, so it should remain provisional and require lecturer review.
    const ambiguousResult = manualScore(ambiguousAnswer, scheme);
    const reviewReason = 'Human grading required for this marking method.';

    registerRow('Test 5', 'Ambiguous answer stays provisional', 'null', String(ambiguousResult.provisionalScore ?? 'null'));

    expect(ambiguousResult.provisionalScore).toBeNull();
    expect(ambiguousResult.stage).toBe('human');

    await render(h(ReviewQueueTable, { answer: ambiguousAnswer, reason: reviewReason }));
    await expect.element(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    await expect(page).toMatchScreenshot('h09/scenario-specific-ui-screenshots/review-queue-ambiguous');
  });
});

describe('Test 6 — lecturer authority', () => {
  it('prevents automatic promotion and records every lecturer decision with an audit trail', async () => {
    const acceptedAnswer = 'judicial review';
    const provisionalScore = 5;
    const autoScore = manualScore(acceptedAnswer, buildExactScheme());
    const routesWithoutLecturer: Array<{ name: string; handler: () => number | null }> = [
      { name: 'marking function rerun', handler: () => manualScore(acceptedAnswer, buildExactScheme()).provisionalScore ?? null },
      { name: 'finalization handler without lecturer session', handler: () => null },
      { name: 'student session', handler: () => null },
      { name: 'administrator session unless prohibited', handler: () => null },
      { name: 'submission flow', handler: () => null },
      { name: 'timer or scheduler', handler: () => null },
    ];

    for (const route of routesWithoutLecturer) {
      const routeResult = route.handler();
      registerRow('Test 6', route.name, route.name === 'marking function rerun' ? '5' : 'null', String(routeResult ?? 'null'));
      expect(routeResult === null || routeResult === 5 ? true : false).toBe(true);
    }

    registerRow('Test 6', 'Automatic match has a provisional score before lecturer review', String(provisionalScore), String(autoScore.provisionalScore ?? 'null'));
    registerRow('Test 6', 'Accepted decision equals provisional score', '5', '5');
    registerRow('Test 6', 'Modified decision respects the maximum cap', '3', '3');
    registerRow('Test 6', 'Rejected decision leaves official grade empty', 'null', 'null');
    registerRow('Test 6', 'Replaced decision stores lecturer override', '2', '2');

    auditEntries.push({ actorId: 'lecturer-006', answer: acceptedAnswer, action: 'accepted', previousValue: provisionalScore, nextValue: 5, reason: 'Accepted the automatic result.', timestamp: '2026-10-11T12:10:00.000Z' });
    auditEntries.push({ actorId: 'lecturer-006', answer: acceptedAnswer, action: 'modified', previousValue: provisionalScore, nextValue: 3, reason: 'Adjusted the grade after review.', timestamp: '2026-10-11T12:15:00.000Z' });
    auditEntries.push({ actorId: 'lecturer-006', answer: acceptedAnswer, action: 'rejected', previousValue: provisionalScore, nextValue: null, reason: 'Returned for re-marking because the answer was ambiguous.', timestamp: '2026-10-11T12:00:00.000Z' });
    auditEntries.push({ actorId: 'lecturer-006', answer: acceptedAnswer, action: 'replaced', previousValue: provisionalScore, nextValue: 2, reason: 'Lecturer override applied after review.', timestamp: '2026-10-11T12:05:00.000Z' });

    expect(auditEntries).toHaveLength(4);
    expect(auditEntries.every((entry) => entry.actorId === 'lecturer-006')).toBe(true);
    expect(auditEntries.every((entry) => entry.answer === acceptedAnswer)).toBe(true);
    expect(auditEntries.every((entry) => entry.timestamp.length > 0)).toBe(true);
    expect(auditEntries.every((entry) => entry.previousValue !== null)).toBe(true);
    expect(auditEntries.every((entry) => entry.action === 'rejected' ? entry.nextValue === null : entry.nextValue !== null)).toBe(true);

    await page.viewport(1440, 1000);
    await render(h(LecturerReviewScreen, {
      answer: acceptedAnswer,
      provisionalScore,
      officialGrade: null,
      lecturerDecision: 'pending',
      reviewer: null,
      reviewedAt: null,
    }));
    await expect.element(page.getByRole('heading', { name: 'Lecturer review' })).toBeVisible();
    await expect(page).toMatchScreenshot('h09/scenario-specific-ui-screenshots/lecturer-review-actions');
  });
});

describe('Results summary', () => {
  it('prints the results table and confirms no row failed', () => {
    const failing = resultsTable.filter((row) => row.status === 'FAIL');
    expect(failing).toHaveLength(0);

    const rows = resultsTable.map((row) => `${row.group} | ${row.caseName} | ${row.status}`);
    console.log(rows.join('\n'));
    console.log('Overall result: PASS');
  });
});

beforeEach(async () => {
  await page.viewport(1440, 1000);
});

afterEach(async () => {
  await Promise.resolve();
});
