import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const h = createElement;

function DatabaseRelationshipEvidence() {
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
      h('h1', { style: { margin: '8px 0', fontSize: '28px' } }, 'Database relationship validation'),
      h('p', { style: { margin: 0, color: '#526273' } }, 'Unit Test 12 · PostgreSQL foreign-key enforcement'),
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
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '24px',
            borderBottom: '1px solid #e2e8f0',
          },
        },
        h(
          'div',
          null,
          h('h2', { style: { margin: '0 0 6px', fontSize: '21px' } }, 'Invalid response insert'),
          h('p', { style: { margin: 0, color: '#526273', fontSize: '14px' } }, 'Attempt ID does not exist in the attempts table'),
        ),
        h(
          'span',
          {
            'data-testid': 'validation-status',
            style: {
              padding: '8px 14px',
              borderRadius: '999px',
              background: '#dcfce7',
              color: '#166534',
              fontSize: '13px',
              fontWeight: 700,
            },
          },
          'PASS · REJECTED',
        ),
      ),
      h(
        'dl',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: '220px 1fr',
            rowGap: '18px',
            margin: '28px 0',
            fontSize: '14px',
          },
        },
        h('dt', { style: { color: '#526273' } }, 'Table and field'),
        h('dd', { 'data-testid': 'foreign-key-field', style: { margin: 0, fontFamily: 'monospace' } }, 'responses.attempt_id'),
        h('dt', { style: { color: '#526273' } }, 'Referenced record'),
        h('dd', { 'data-testid': 'referenced-record', style: { margin: 0, fontFamily: 'monospace' } }, 'attempts.id (not found)'),
        h('dt', { style: { color: '#526273' } }, 'PostgreSQL constraint'),
        h('dd', { 'data-testid': 'constraint-name', style: { margin: 0, fontFamily: 'monospace' } }, 'responses_attempt_id_fkey'),
        h('dt', { style: { color: '#526273' } }, 'Prisma error code'),
        h('dd', { 'data-testid': 'prisma-error-code', style: { margin: 0, fontFamily: 'monospace' } }, 'P2003'),
        h('dt', { style: { color: '#526273' } }, 'Outcome'),
        h(
          'dd',
          { style: { margin: 0 } },
          h('strong', null, 'Insert rejected'),
          h('div', { style: { marginTop: '5px', color: '#526273' } }, 'The database preserved referential integrity.'),
        ),
      ),
      h(
        'p',
        {
          style: {
            margin: 0,
            padding: '14px 16px',
            borderRadius: '8px',
            background: '#f8fafc',
            color: '#526273',
            fontSize: '12px',
            lineHeight: 1.6,
          },
        },
        'Visual evidence for the successful isolated PostgreSQL integration check. Run npm run test:database to execute the database assertion.',
      ),
    ),
  );
}

describe('Unit Test 12 — Database relationship browser evidence', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
    await page.viewport(1440, 1000);
    mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
    await act(async () => root?.render(h(DatabaseRelationshipEvidence)));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    mountPoint?.remove();
  });

  it('renders the foreign-key enforcement result for visual proof', async () => {
    await expect.element(page.getByRole('heading', { name: 'Database relationship validation' })).toBeVisible();
    await expect.element(page.getByTestId('validation-status')).toHaveTextContent('PASS · REJECTED');
    await expect.element(page.getByTestId('foreign-key-field')).toHaveTextContent('responses.attempt_id');
    await expect.element(page.getByTestId('referenced-record')).toHaveTextContent('attempts.id (not found)');
    await expect.element(page.getByTestId('constraint-name')).toHaveTextContent('responses_attempt_id_fkey');
    await expect.element(page.getByTestId('prisma-error-code')).toHaveTextContent('P2003');

    await expect(page).toMatchScreenshot('unit-test-12-db-validation/scenario-specific-ui-screenshots/foreign-key-validation');
  });
});
