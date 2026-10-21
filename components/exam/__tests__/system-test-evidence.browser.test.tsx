import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

type Step = {
  id: string;
  folder: string;
  title: string;
  details: string[];
  guard: string;
  outcome: string;
};

const steps: Step[] = [
  { id: '01', folder: 'st-01-prepare', title: 'Prepare synthetic examination', details: ['25 candidate accounts · candidate role', 'Lecturer, invigilator, exam_officer, and admin roles', 'Published 90-minute Constitutional Law assessment', 'MCQ, short answer, and essay questions'], guard: 'Temporary loopback PostgreSQL only; no real candidate data.', outcome: 'Assessment, answer key, enrollment, and readiness fixtures created.' },
  { id: '02', folder: 'st-02-authenticate-start', title: 'Authenticate and start', details: ['25 credential checks passed', '25 eligible attempts started', 'Attempt session token issued per candidate', 'Randomized presentation mapping persisted'], guard: 'Attempt creation requires enrollment, readiness, open window, and candidate role.', outcome: '25 active attempts linked to the matching candidate and assessment.' },
  { id: '03', folder: 'st-03-answer-questions', title: 'Answer all question types', details: ['Correct multiple-choice option selected', 'Configured short answer entered', 'Synthetic essay response edited', 'Word counts and response versions persisted'], guard: 'Candidate payload excludes answer-key fields; unrelated questions are rejected.', outcome: '75 responses synchronized; edited essay retained two versions.' },
  { id: '04', folder: 'st-04-network-interruption', title: 'Simulate network interruption', details: ['Controlled browser network failure exercised separately', 'Encrypted local recovery checked in browser tests', 'Local-only drafts are not labeled server-saved'], guard: 'The 25 database-backed candidate journeys did not disconnect real browser sessions.', outcome: 'Offline recovery evidence comes from controlled browser tests, not the 25-user run.' },
  { id: '05', folder: 'st-05-synchronize', title: 'Restore connectivity and synchronize', details: ['Retry and same-attempt recovery tested', 'Latest edits mapped to original questions', 'Duplicate response versions prevented', 'Cross-candidate synchronization rejected'], guard: 'Network/service behavior uses test-controlled browser mocks.', outcome: 'All 75 persisted responses belong to the correct candidate and attempt.' },
  { id: '06', folder: 'st-06-monitoring', title: 'Record and review monitoring', details: ['One supported tab_switch event recorded', 'Candidate review request rejected', 'Invigilator retrieved and reviewed the event'], guard: 'Camera capture and snapshot generation were not exercised.', outcome: 'Monitoring event linked to the candidate attempt with reviewer identity.' },
  { id: '07', folder: 'st-07-submit', title: 'Submit examination', details: ['25 submission requests acknowledged', '25 receipts and timestamps persisted', 'Attempt state changed to submitted and inactive'], guard: 'Duplicate submissions are rejected without replacing stored answers.', outcome: 'All submitted answer sets match the final server-acknowledged responses.' },
  { id: '08', folder: 'st-08-restart', title: 'Reject restart of submitted attempts', details: ['Restart attempted after each submission', 'Maximum attempt policy applied', 'No duplicate active attempt created'], guard: 'Each candidate retained exactly one attempt for this assessment.', outcome: 'All 25 submitted attempts remained closed.' },
  { id: '09', folder: 'st-09-mark-release', title: 'Mark and release results', details: ['Objective score: 5 / 5', 'Short-answer official grade: 5 / 5', 'Essay official grade: 8 / 10', 'Total: 18 / 20 per candidate'], guard: 'exam_officer result-release request returned 403; lecturer release succeeded.', outcome: '25 results released only after authorized lecturer grading.' },
  { id: '10', folder: 'st-10-database-integrity', title: 'Reconcile database integrity', details: ['25 submitted attempts', '75 synchronized responses', '25 objective outcomes', '50 lecturer grade decisions and 25 released results'], guard: 'All persisted rows matched the synthetic candidate, assessment, question, and attempt links.', outcome: 'No duplicate, orphaned, or cross-candidate records found in asserted counts.' },
  { id: '11', folder: 'st-11-audit-trail', title: 'Verify audit trail', details: ['Candidate audit access rejected', 'Admin audit verification passed', 'Monitoring, submission, grading, and release actions recorded'], guard: 'Concurrent appends and null-vs-undefined hash inputs caused chain verification failure before the audit fix.', outcome: 'After normalization and serialized writes, the complete chain verified.' },
  { id: '12', folder: 'st-12-consolidated-report', title: 'Consolidate end-to-end results', details: ['Connected handler/database journey passed for 25 candidates', 'Offline UI path verified separately with controlled browser tests', 'Performance measurement limited to local handler/database smoke'], guard: 'No staging URL, real-browser 25-user session, or production SLA measurement was available.', outcome: 'See test command output and the limitations recorded for steps 04, 06, and 09.' },
];

function StepScreen({ step, state }: { step: Step; state: number }) {
  const label = state === 0 ? 'Workflow state' : state === 1 ? 'Guard or limitation' : 'Persisted outcome';
  const content = state === 0 ? step.details : state === 1 ? [step.guard] : [step.outcome];

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <header className="mx-auto max-w-5xl border-b border-slate-300 pb-5">
        <p className="text-sm font-semibold text-slate-600">Bingham University · Faculty of Law · System test</p>
        <h1 className="mt-2 text-3xl font-bold">Step {step.id} · {step.title}</h1>
        <p className="mt-2 text-sm text-slate-600">Visual evidence reference · runtime assertions are reported separately</p>
      </header>
      <section className="mx-auto mt-8 max-w-5xl border border-slate-300 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h2 className="text-xl font-semibold">{label}</h2>
          <span className={`px-3 py-1 text-sm font-semibold ${state === 1 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
            {state === 1 ? 'Guarded' : state === 2 ? 'Verified in test' : 'Synthetic workflow'}
          </span>
        </div>
        <ul className="mt-5 grid gap-3">
          {content.map((entry) => <li key={entry} className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6">{entry}</li>)}
        </ul>
        <p className="mt-6 border-l-4 border-slate-500 bg-slate-100 p-4 text-xs leading-5 text-slate-600">
          Synthetic evidence only. This screenshot is not a standalone behavioral assertion.
        </p>
      </section>
    </main>
  );
}

function SummaryPage({ group }: { group: number }) {
  const first = group * 4;
  const groupSteps = steps.slice(first, first + 4);
  const firstId = groupSteps[0].id;
  const lastId = groupSteps[groupSteps.length - 1].id;

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900">
      <header className="mx-auto max-w-5xl border-b border-slate-300 pb-5">
        <p className="text-sm font-semibold text-slate-600">Bingham University · End-to-end system test</p>
        <h1 className="mt-2 text-3xl font-bold">Static evidence summary · Steps {firstId}–{lastId}</h1>
        <p className="mt-2 text-sm text-slate-600">Pass/fail status comes from the executed isolated-database test run.</p>
      </header>
      <section className="mx-auto mt-6 grid max-w-5xl gap-3 md:grid-cols-2">
        {groupSteps.map((step) => (
          <article key={step.id} className="border border-slate-300 p-4">
            <h2 className="font-semibold">{step.id} · {step.title}</h2>
            <p className="mt-2 text-sm leading-5 text-slate-700">{step.outcome}</p>
          </article>
        ))}
      </section>
      <p className="mx-auto mt-6 max-w-5xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
        Static summary only. It does not replace route responses, database assertions, or the test runner report.
      </p>
    </main>
  );
}

describe('12-step end-to-end system-test visual evidence', () => {
  for (const step of steps) {
    it(`ST-${step.id} captures the primary scenario screen`, async () => {
      render(<StepScreen step={step} state={0} />);
      await expect.element(page.getByRole('heading', { name: `Step ${step.id} · ${step.title}` })).toBeVisible();
      await expect(page).toMatchScreenshot(`system-test/${step.folder}/scenario-specific-ui-screenshots/workflow-state`);
    });

    it(`ST-${step.id} captures the guard or limitation`, async () => {
      render(<StepScreen step={step} state={1} />);
      await expect.element(page.getByText('Guarded')).toBeVisible();
      await expect(page).toMatchScreenshot(`system-test/${step.folder}/scenario-specific-ui-screenshots/guard-or-limitation`);
    });

    it(`ST-${step.id} captures the persisted outcome`, async () => {
      render(<StepScreen step={step} state={2} />);
      await expect.element(page.getByText('Verified in test')).toBeVisible();
      await expect(page).toMatchScreenshot(`system-test/${step.folder}/scenario-specific-ui-screenshots/persisted-outcome`);
    });
  }

  for (const group of [0, 1, 2]) {
    const firstId = steps[group * 4].id;
    const lastId = steps[group * 4 + 3].id;
    it(`captures the static summary for steps ${firstId} through ${lastId}`, async () => {
      render(<SummaryPage group={group} />);
      await expect.element(page.getByRole('heading', { name: `Static evidence summary · Steps ${firstId}–${lastId}` })).toBeVisible();
      await expect(page).toMatchScreenshot(`system-test/static-test-evidence-summary/steps-${firstId}-${lastId}`);
    });
  }
});