import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoScoreSubjective, type ScoringConfig } from '@/lib/scoring';

const h = createElement;

const criteria: NonNullable<ScoringConfig['markingPoints']> = [
  { pointText: 'Point A', marks: 2, alternativesJson: null },
  { pointText: 'Point B', marks: 2, alternativesJson: null },
  { pointText: 'Point C', marks: 1, alternativesJson: null },
];

const markingScheme: ScoringConfig = {
  method: 'marking_points',
  maxMark: 5,
  configJson: null,
  markingPoints: criteria,
};

const responseWithPointsAAndC = 'The response satisfies Point A and Point C.';
const responseWithAllPoints = 'The response satisfies Point A, Point B and Point C.';

function MarkingBreakdown({ cap }: { cap: number }) {
  const result = autoScoreSubjective(responseWithPointsAAndC, markingScheme);
  const cappedResult = autoScoreSubjective(responseWithAllPoints, {
    ...markingScheme,
    maxMark: cap,
  });

  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        padding: '56px',
        background: '#f1f5f9',
        color: '#0f172a',
        fontFamily: 'Arial, sans-serif',
      },
    },
    h(
      'header',
      { style: { maxWidth: '1080px', margin: '0 auto 32px' } },
      h('div', { style: { color: '#526273', fontSize: '12px', letterSpacing: '0.12em' } }, 'BINGHAM UNIVERSITY'),
      h('h1', { style: { margin: '8px 0', fontSize: '28px' } }, 'Marking-point calculation'),
      h('p', { style: { margin: 0, color: '#526273' } }, 'Unit Test 13 · Automated grading breakdown'),
    ),
    h(
      'article',
      {
        style: {
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '32px',
          border: '1px solid #dbe3ec',
          borderRadius: '12px',
          background: '#ffffff',
          boxShadow: '0 1px 4px rgba(15, 23, 42, .12)',
        },
      },
      h(
        'section',
        { 'aria-labelledby': 'candidate-response-heading', style: { marginBottom: '28px' } },
        h('h2', { id: 'candidate-response-heading', style: { margin: '0 0 8px', fontSize: '18px' } }, 'Candidate response'),
        h('p', { style: { margin: 0, color: '#526273', fontSize: '14px', lineHeight: 1.6 } }, responseWithPointsAAndC),
      ),
      h(
        'section',
        { 'aria-labelledby': 'awarded-score-heading' },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 20px',
              borderRadius: '8px',
              background: '#eff6ff',
            },
          },
          h('div', null,
            h('h2', { id: 'awarded-score-heading', style: { margin: '0 0 4px', fontSize: '17px' } }, 'Provisional score'),
            h('p', { style: { margin: 0, color: '#526273', fontSize: '13px' } }, 'Matched marking criteria'),
          ),
          h('strong', { 'data-testid': 'awarded-score', style: { color: '#123b5d', fontSize: '26px' } }, `${result.provisionalScore}/5`),
        ),
        h(
          'table',
          { style: { width: '100%', marginTop: '20px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' } },
          h('thead', null, h('tr', { style: { color: '#526273', borderBottom: '1px solid #dbe3ec' } },
            h('th', { style: { padding: '12px 10px' } }, 'Criterion'),
            h('th', { style: { padding: '12px 10px' } }, 'Marks'),
            h('th', { style: { padding: '12px 10px' } }, 'Result'),
          )),
          h('tbody', null, ...criteria.map((criterion) => {
            const matched = result.matchedPoints.includes(criterion.pointText);
            return h('tr', {
              key: criterion.pointText,
              'data-testid': `criterion-${criterion.pointText.slice(-1).toLowerCase()}`,
              style: { borderBottom: '1px solid #e2e8f0' },
            },
            h('td', { style: { padding: '14px 10px' } }, criterion.pointText),
            h('td', { style: { padding: '14px 10px' } }, String(criterion.marks)),
            h(
              'td',
              { style: { padding: '14px 10px', color: matched ? '#166534' : '#64748b', fontWeight: 600 } },
              h('span', { 'data-testid': `criterion-result-${criterion.pointText.slice(-1).toLowerCase()}` }, matched ? 'Matched' : 'Not matched'),
            ),
            );
          })),
        ),
      ),
      h(
        'section',
        {
          'aria-label': 'Maximum mark enforcement',
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
            alignItems: 'center',
            marginTop: '28px',
            padding: '18px 20px',
            border: '1px solid #dbe3ec',
            borderRadius: '8px',
            background: '#f8fafc',
          },
        },
        h('div', null,
          h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, 'Maximum-mark enforcement'),
          h('p', { style: { margin: 0, color: '#526273', fontSize: '13px' } }, 'All three criteria match, but the configured total cap is 4 marks.'),
        ),
        h('strong', { 'data-testid': 'capped-score', style: { whiteSpace: 'nowrap', fontSize: '20px' } }, `${cappedResult.provisionalScore}/4`),
      ),
    ),
  );
}

describe('Unit Test 13 — Marking-point calculation browser evidence', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
    await page.viewport(1440, 1000);
    mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
    await act(async () => root?.render(h(MarkingBreakdown, { cap: 4 })));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    mountPoint?.remove();
  });

  it('awards 3/5 for criteria A and C and enforces the configured maximum', async () => {
    const result = autoScoreSubjective(responseWithPointsAAndC, markingScheme);
    expect(result).toMatchObject({
      provisionalScore: 3,
      matchedPoints: ['Point A', 'Point C'],
      unmatchedPoints: ['Point B'],
      stage: 'auto',
    });

    const cappedResult = autoScoreSubjective(responseWithAllPoints, {
      ...markingScheme,
      maxMark: 4,
    });
    expect(cappedResult.provisionalScore).toBe(4);

    await expect.element(page.getByRole('heading', { name: 'Marking-point calculation' })).toBeVisible();
    await expect.element(page.getByTestId('awarded-score')).toHaveTextContent('3/5');
    await expect.element(page.getByTestId('criterion-result-a')).toHaveTextContent('Matched');
    await expect.element(page.getByTestId('criterion-result-b')).toHaveTextContent('Not matched');
    await expect.element(page.getByTestId('criterion-result-c')).toHaveTextContent('Matched');
    await expect.element(page.getByTestId('capped-score')).toHaveTextContent('4/4');

    await expect(page).toMatchScreenshot('unit-test-13-marking-points/scenario-specific-ui-screenshots/marking-point-breakdown');
  });
});
