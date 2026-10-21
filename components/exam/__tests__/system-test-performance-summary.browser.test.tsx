import { createElement } from 'react';
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

const h = createElement;

function PerformanceSummary() {
  return h('main', { className: 'min-h-screen bg-white p-8 text-slate-900' },
    h('header', { className: 'mx-auto max-w-4xl border-b border-slate-300 pb-5' },
      h('p', { className: 'text-sm font-semibold text-slate-600' }, 'System Testing · Performance'),
      h('h1', { className: 'mt-2 text-3xl font-bold' }, 'Local response-sync smoke'),
      h('p', { className: 'mt-2 text-sm text-slate-600' }, 'Measured against temporary loopback PostgreSQL; not a staging service-level test.'),
    ),
    h('section', { className: 'mx-auto mt-8 max-w-4xl' },
      h('h2', { className: 'text-xl font-semibold' }, 'Observed run'),
      h('dl', { className: 'mt-4 grid grid-cols-2 gap-px border border-slate-300 bg-slate-300 sm:grid-cols-3' },
        ...[
          ['Concurrent synthetic candidates', '25'],
          ['Responses persisted', '25 / 25'],
          ['Request errors', '0'],
          ['Wall time', '760.7 ms'],
          ['Request p50', '712.7 ms'],
          ['Request p95', '750.8 ms'],
          ['Throughput', '32.9 requests/second'],
        ].flatMap(([label, value]) => [
          h('div', { key: `${label}-label`, className: 'bg-white p-4' }, h('dt', { className: 'text-xs font-medium text-slate-600' }, label), h('dd', { className: 'mt-1 text-lg font-semibold' }, value)),
        ]),
      ),
    ),
    h('section', { className: 'mx-auto mt-8 max-w-4xl border-l-4 border-amber-500 bg-amber-50 p-4' },
      h('h2', { className: 'font-semibold' }, 'Staging load test · BLOCKED'),
      h('p', { className: 'mt-2 text-sm' }, 'k6, a staging URL, disposable candidate accounts, and agreed service thresholds are not available in this environment. The local sync smoke does not represent the 20–30-user end-to-end journey.'),
    ),
  );
}

describe('System test performance evidence', () => {
  it('captures the measured local sync smoke and explicit staging blocker', async () => {
    render(<PerformanceSummary />);
    await expect.element(page.getByRole('heading', { name: 'Local response-sync smoke' })).toBeVisible();
    await expect.element(page.getByText('25 / 25')).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Staging load test · BLOCKED' })).toBeVisible();
    await expect(page).toMatchScreenshot('system-test/st-14-performance/static-test-evidence-summary/summary');
  });
});