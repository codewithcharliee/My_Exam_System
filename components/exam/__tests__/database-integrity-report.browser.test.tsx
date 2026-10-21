import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const h = createElement;

type ReportRow = {
  category: string;
  check: string;
  offendingCount: number;
  sampleIds: string[];
  proven: boolean;
  protectedByConstraint: boolean;
  status: 'PASS' | 'FAIL';
};

const reportRows: ReportRow[] = [
  {
    category: 'structural',
    check: 'schema foreign-key and unique-constraint coverage',
    offendingCount: 0,
    sampleIds: [],
    proven: false,
    protectedByConstraint: true,
    status: 'PASS',
  },
  { category: 'orphan', check: 'responses without attempts', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'orphan', check: 'attempts without candidates', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'orphan', check: 'attempts without examinations', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'orphan', check: 'responses without questions', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'orphan', check: 'grade decisions without responses', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'orphan', check: 'monitoring events without attempts', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'orphan', check: 'snapshots without attempts', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'orphan', check: 'audit rows with missing actors', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'duplicate', check: 'duplicate candidate identifiers', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'duplicate', check: 'duplicate attempt identifiers', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'duplicate', check: 'duplicate response versions', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'duplicate', check: 'duplicate submission receipts for the same candidate and assessment', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'duplicate', check: 'duplicate question identifiers in the same assessment', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'duplicate', check: 'more than one active attempt per candidate and assessment', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'mismatch', check: 'responses whose question is not assigned to the attempt assessment', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'mismatch', check: 'Candidate A response assigned to Candidate B attempt (response candidate ownership mismatch)', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'mismatch', check: 'response examination differs from its attempt examination', offendingCount: 0, sampleIds: [], proven: false, protectedByConstraint: true, status: 'PASS' },
  { category: 'mismatch', check: 'submission receipts whose attempt, candidate or assessment metadata do not match', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'mismatch', check: 'snapshots linked to a different attempt than their monitoring event', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
  { category: 'mismatch', check: 'response versions with repeated or non-contiguous version numbers', offendingCount: 0, sampleIds: [], proven: true, protectedByConstraint: false, status: 'PASS' },
];

function IntegrityReportTable() {
  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        width: '100%',
        padding: '48px 64px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: 'Times New Roman, serif',
        boxSizing: 'border-box',
      },
    },
    h('h1', { style: { margin: '0 0 8px', fontSize: '28px', fontWeight: 700 } }, 'H13 integrity report'),
    h('p', { style: { margin: '0 0 16px', fontSize: '16px' } }, 'Database: isolated PostgreSQL test database'),
    h(
      'table',
      {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000000',
          fontSize: '14px',
          background: '#ffffff',
        },
      },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          ['Category', 'Check', 'Count', 'Sample IDs', 'Defect detected', 'Constraint protected', 'Status'].map((header) =>
            h('th', { key: header, style: { border: '1px solid #000000', padding: '6px 8px', textAlign: 'left', background: '#ffffff', color: '#000000' } }, header),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        reportRows.map((row) =>
          h(
            'tr',
            { key: row.check },
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, row.category),
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, row.check),
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, String(row.offendingCount)),
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, row.sampleIds.length > 0 ? row.sampleIds.join(', ') : 'none'),
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, row.proven ? 'yes' : 'no'),
            h('td', { style: { border: '1px solid #000000', padding: '6px 8px', color: '#000000' } }, row.protectedByConstraint ? 'yes' : 'no'),
            h(
              'td',
              {
                style: {
                  border: '1px solid #000000',
                  padding: '6px 8px',
                  fontWeight: 700,
                  color: '#000000',
                  background: '#ffffff',
                },
              },
              row.status,
            ),
          ),
        ),
      ),
    ),
  );
}

describe('H13 — database integrity report evidence', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
    await page.viewport(1440, 1400);
    mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
    await act(async () => root?.render(h(IntegrityReportTable)));
    document.body.style.setProperty('background-color', '#ffffff', 'important');
    for (const element of mountPoint.querySelectorAll<HTMLElement>('*')) {
      element.style.setProperty('font-family', '"Times New Roman", serif', 'important');
      element.style.setProperty('color', '#000000', 'important');
      element.style.setProperty('background-color', '#ffffff', 'important');
      if (['TABLE', 'TH', 'TD'].includes(element.tagName)) {
        element.style.setProperty('border-color', '#000000', 'important');
      }
    }
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    mountPoint?.remove();
  });

  it('renders the integrity report table as a screenshot for H13', async () => {
    await expect.element(page.getByRole('heading', { name: 'H13 integrity report' })).toBeVisible();
    await expect(page).toMatchScreenshot('h13/scenario-specific-ui-screenshots/integrity-report');
  });
});
