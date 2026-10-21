import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import AcceptanceMatrixReport from '@/components/exam/h15-matrix-report';
import { buildCategorySummary, buildMatrixRows, type RequirementRecord, type ResultRecord } from '@/lib/h15-acceptance';

function requirement(
  id: string,
  description: string,
  category: RequirementRecord['category'],
  expectation: string,
  testIds: string[],
  threshold?: number,
): RequirementRecord {
  return {
    id,
    description,
    category,
    acceptanceExpectation: expectation,
    testIds,
    threshold,
  };
}

function result(
  id: string,
  status: ResultRecord['status'],
  measurement?: number,
): ResultRecord {
  return {
    id,
    suite: 'synthetic-browser',
    status,
    durationMs: 75,
    date: '2026-01-01T00:00:00.000Z',
    environment: 'synthetic-browser-test',
    browser: 'chromium',
    database: 'sqlite',
    serviceMode: 'real',
    measurement,
  };
}

describe('H15 browser matrix report', () => {
  it('renders the matrix report and category summary for the synthetic evidence', async () => {
    const requirements = [
      requirement('REQ-B1', 'Functional requirement', 'functional', 'The core flow passes.', ['b1']),
      requirement('REQ-B2', 'Security requirement', 'security', 'The security control passes.', ['b2']),
      requirement('REQ-B3', 'Performance threshold', 'performance', 'The load stays within the threshold.', ['b3'], 100),
    ];
    const evidence: ResultRecord[] = [
      result('b1', 'passed'),
      result('b2', 'failed'),
      result('b3', 'passed', 95),
    ];

    const rows = buildMatrixRows(requirements, evidence);
    render(
      <main
        className="min-h-screen p-6 md:p-8"
        style={{ backgroundColor: '#fff', color: '#000', fontFamily: 'Times New Roman, serif' }}
      >
        <style>{`
          main, main * {
            color: #000 !important;
            font-family: "Times New Roman", serif !important;
          }
          main, main [class*="bg-"] {
            background-color: #fff !important;
          }
        `}</style>
        <AcceptanceMatrixReport rows={rows} categorySummaries={buildCategorySummary(rows)} />
      </main>,
    );

    await expect(page).toMatchScreenshot('h15/scenario-specific-ui-screenshots/h15-matrix-report');
  });
});
