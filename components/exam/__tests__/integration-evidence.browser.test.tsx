import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

type Scenario = {
  folder: string;
  id: string;
  title: string;
  pageTitle: string;
  summary: string[];
  screenshots: [string, string, string];
};

const scenarios: Scenario[] = [
  { folder: 'it-01-authentication', id: '01', title: 'Authentication and role-based access', pageTitle: 'Lecturer portal sign in', summary: ['All five persisted roles authenticate only through their matching portal.', 'Incorrect credentials and portal mismatches are rejected.', 'Candidate identities cannot create assessments.'], screenshots: ['role-authenticated', 'invalid-credentials-rejected', 'candidate-authoring-denied'] },
  { folder: 'it-02-course-access', id: '02', title: 'Course enrolment and assessment access', pageTitle: 'Assessment access · Constitutional Law', summary: ['An enrolled candidate can access an available course assessment.', 'An unenrolled candidate is denied without an attempt.', 'Draft assessments remain hidden from candidates.'], screenshots: ['enrolled-candidate-access', 'unenrolled-candidate-denied', 'draft-assessment-hidden'] },
  { folder: 'it-03-assessment-question-bank', id: '03', title: 'Assessment and question-bank integration', pageTitle: 'Build examination · Constitutional Law', summary: ['Supported law question types link to assessment items and marks.', 'Draft questions and duplicate links are rejected.', 'Published candidate views omit answer-key and marking metadata.'], screenshots: ['assessment-question-links', 'draft-question-rejected', 'candidate-assessment-sanitized'] },
  { folder: 'it-04-timing-start', id: '04', title: 'Assessment timing and attempt start', pageTitle: 'Assessment timing · Constitutional Law', summary: ['Attempts are denied before the start window and after the end window.', 'An eligible start records server start and duration-based expiry.', 'The displayed deadline is tied to the persisted attempt.'], screenshots: ['before-window-denied', 'active-attempt-deadline', 'after-window-denied'] },
  { folder: 'it-05-randomization', id: '05', title: 'Randomized question and option presentation', pageTitle: 'Constitutional Law Examination', summary: ['Question and option presentation orders are stored per attempt.', 'Saved answers retain underlying question and option identifiers.', 'Candidate payloads do not expose answer keys.'], screenshots: ['randomized-exam-view', 'answer-key-hidden', 'response-linked-to-question'] },
  { folder: 'it-06-autosave-versions', id: '06', title: 'Response autosave, word count, and version history', pageTitle: 'Examination · Autosaved response', summary: ['Answer edits are associated with the correct attempt and question.', 'Word counts and ordered response versions persist.', 'Save failures are not presented as server-confirmed.'], screenshots: ['answer-autosaved', 'word-count-version-history', 'save-failure-visible'] },
  { folder: 'it-07-offline-recovery', id: '07', title: 'Offline response recovery and synchronization', pageTitle: 'Examination · Offline recovery', summary: ['Encrypted local drafts recover after refresh or interruption.', 'Local-only answers are not mislabeled as server-confirmed.', 'Reconnection syncs answers to their original attempt and questions.'], screenshots: ['encrypted-local-draft', 'recovered-after-interruption', 'synchronized-after-reconnection'] },
  { folder: 'it-08-session-integrity', id: '08', title: 'Attempt-session integrity and duplicate session prevention', pageTitle: 'Resume examination', summary: ['The owner resumes the active attempt with its valid token.', 'Missing or stale tokens cannot modify the attempt.', 'A second start and a different candidate are denied.'], screenshots: ['valid-owner-session', 'stale-token-denied', 'foreign-candidate-denied'] },
  { folder: 'it-09-submission-receipt', id: '09', title: 'Submission, receipt, and closure', pageTitle: 'Examination submission', summary: ['Server acknowledgement produces a receipt and timestamp.', 'Submission closes the attempt and preserves final responses.', 'Duplicate or unacknowledged submissions do not claim success.'], screenshots: ['submission-pending', 'receipt-issued', 'duplicate-submit-rejected'] },
  { folder: 'it-10-objective-scoring', id: '10', title: 'Objective scoring and result persistence', pageTitle: 'Submission results · Objective section', summary: ['Correct, incorrect, and unanswered responses score by the configured key.', 'Question outcomes and totals persist against the candidate attempt.', 'Authorized reporting retrieves the persisted result.'], screenshots: ['objective-score-breakdown', 'unanswered-score-zero', 'result-persisted'] },
  { folder: 'it-11-short-answer-marking', id: '11', title: 'Short-answer marking and lecturer decision', pageTitle: 'Lecturer review · Short answer', summary: ['Configured exact, equivalent, and typo-tolerant answers yield provisional scores.', 'Ambiguous or human-marked answers remain for lecturer review.', 'Lecturer decisions remain separate from provisional marks.'], screenshots: ['provisional-short-answer', 'ambiguous-answer-review', 'lecturer-decision-recorded'] },
  { folder: 'it-12-essay-grading', id: '12', title: 'Essay grading and official-grade control', pageTitle: 'Lecturer grade review · Essay', summary: ['Submitted scripts are available to assigned lecturers.', 'Valid official grades persist with grader identity.', 'Grades below zero or above maximum marks are rejected.'], screenshots: ['submitted-essay-script', 'valid-grade-saved', 'grade-bound-rejected'] },
  { folder: 'it-13-ai-question-generation', id: '13', title: 'Optional AI question generation and review', pageTitle: 'AI question generator', summary: ['Generated questions are saved as drafts, not published assessment items.', 'Malformed provider output is rejected without saving.', 'Provider failure leaves manual question authoring available.'], screenshots: ['ai-question-draft-created', 'invalid-ai-output-rejected', 'provider-unavailable-manual-authoring'] },
  { folder: 'it-14-ai-assessment-recommendation', id: '14', title: 'Optional AI assessment recommendation and failure fallback', pageTitle: 'AI recommendation · Lecturer review', summary: ['Recommendations are schema-checked and remain advisory.', 'Provider failure does not create an official grade.', 'Lecturers retain ordinary grading authority.'], screenshots: ['recommendation-advisory', 'provider-unavailable', 'lecturer-grade-final'] },
  { folder: 'it-15-monitoring-audit-release', id: '15', title: 'Monitoring, audit trail, and protected result release', pageTitle: 'Monitoring and audit review', summary: ['Monitoring events are tied to the correct attempt and reviewed by staff.', 'Audit records identify actor, action, timestamp, and integrity status.', 'Candidates see results only after authorized release.'], screenshots: ['monitoring-event-recorded', 'candidate-audit-denied', 'released-result-audit'] },
];

function AppShell({ scenario, state }: { scenario: Scenario; state: number }) {
  const title = scenario.title;
  const onGuardedState = state === 1;
  const isLecturer = ['01', '03', '11', '12', '13', '14'].includes(scenario.id);
  const portal = isLecturer ? 'Lecturer portal' : scenario.id === '15' ? 'Exam staff portal' : 'Candidate portal';
  const initials = isLecturer ? 'LE' : scenario.id === '15' ? 'ES' : 'CT';
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: 'Arial, sans-serif' }}>
      <header className="flex h-16 items-center justify-between border-b bg-white px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-900">Bingham University</p>
          <p className="text-xs text-slate-500">Faculty of Law · Examination Management System</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{portal}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 font-semibold">
            {initials}
          </span>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-8 py-8 lg:grid-cols-[230px_1fr]">
        <aside className="rounded-lg border bg-white p-4">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Navigation</p>
          <nav className="grid gap-1 text-sm">
            {['Dashboard', 'Courses', 'Question bank', 'Assessments', 'Results', 'Monitoring', 'Audit log'].map((item) => (
              <div key={item} className={`rounded-md px-3 py-2 ${item === (scenario.id === '03' ? 'Assessments' : scenario.id === '15' ? 'Audit log' : scenario.id === '09' || scenario.id === '10' ? 'Results' : scenario.id === '06' || scenario.id === '07' || scenario.id === '08' ? 'Courses' : 'Dashboard') ? 'bg-blue-900 font-medium text-white' : 'text-slate-600'}`}>
                {item}
              </div>
            ))}
          </nav>
          <div className="mt-8 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p className="font-semibold text-slate-800">Integration scenario {scenario.id}</p>
            <p>{title}</p>
          </div>
        </aside>
        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Dashboard / {scenario.pageTitle}</p>
              <h1 className="mt-2 text-2xl font-semibold">{scenario.pageTitle}</h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${onGuardedState ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              {onGuardedState ? 'Action blocked' : state === 2 ? 'Acknowledged state' : 'Workflow active'}
            </span>
          </div>
          <ScenarioContent scenario={scenario} state={state} />
          {state === 2 && (
            <section aria-label="Persisted workflow reference" className="mt-5 border-l-4 border-green-700 bg-white p-4">
              <h2 className="font-semibold">Persisted workflow reference</h2>
              <p className="mt-2 text-sm text-slate-700">{scenario.summary[0]}</p>
              <p className="mt-2 text-xs text-slate-500">Static fixture only; behavioral outcome is determined by the executed test.</p>
            </section>
          )}
          <p className="mt-5 text-xs text-slate-500">
            Scenario UI fixture; corresponding route and PostgreSQL assertions are in the integration test suite.
          </p>
        </section>
      </div>
    </main>
  );
}

function ScenarioContent({ scenario, state }: { scenario: Scenario; state: number }) {
  const invalid = state === 1;
  const recorded = state === 2;
  const panel = 'rounded-lg border bg-white p-6 shadow-sm';
  const button = 'rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white';
  const subduedButton = 'rounded-md border bg-white px-4 py-2 text-sm font-medium text-slate-700';
  const alert = 'rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900';
  const table = 'w-full border-collapse text-left text-sm';
  const cell = 'border-b px-4 py-3';

  switch (scenario.id) {
    case '01':
      return <div className="grid gap-5 md:grid-cols-[1fr_0.8fr]">
        <div className={`${panel} mx-auto w-full max-w-lg`}>
          <h2 className="text-lg font-semibold">Lecturer sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your assigned university account.</p>
          <label className="mt-5 block text-sm font-medium">Email<input className="mt-1 w-full rounded-md border p-3" value="lecturer@example.test" readOnly /></label>
          <label className="mt-4 block text-sm font-medium">Password<input className="mt-1 w-full rounded-md border p-3" type="password" value="synthetic-password" readOnly /></label>
        {!invalid && <p className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">{recorded ? 'Authenticated identity is associated with the active test workflow.' : 'Synthetic test account entered the lecturer portal.'}</p>}
        {invalid && <p className={`${alert} mt-4`}>Sign-in denied. Check your account and lecturer portal.</p>}
        <button className={`${button} mt-5`}>{invalid ? 'Try again' : 'Continue to dashboard'}</button>
        </div>
        <div className={panel}><h2 className="font-semibold">Account access</h2><div className="mt-4 grid gap-3 text-sm"><p className="rounded bg-green-50 p-3 text-green-800">Lecturer portal: authorized</p><p className={`rounded p-3 ${invalid ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>Candidate assessment authoring: denied</p></div></div>
      </div>;
    case '02':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Create question</h2><p className="mt-1 text-sm text-slate-500">Multiple choice · Constitutional Law</p></div><span className="h-fit rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">Lecturer authoring</span></div>
          <label className="mt-5 block text-sm font-medium">Question text<textarea className="mt-1 h-20 w-full rounded border p-3" readOnly value="Which constitutional principle applies to this case?" /></label>
          <div className="mt-4 grid gap-2">{['Separation of powers', 'Judicial review', 'Parliamentary privilege'].map((choice, i) => <div className="flex items-center gap-3 rounded border p-3 text-sm" key={choice}><input type="radio" checked={i === 0} readOnly /><span>{choice}</span>{i === 0 && <span className="ml-auto text-xs font-medium text-green-700">Answer key</span>}</div>)}</div>
          {invalid && <p className={`${alert} mt-4`}>Choose exactly one correct answer before saving this question.</p>}
          <div className="mt-5 flex gap-3"><button className={button}>{invalid ? 'Question not saved' : 'Save question'}</button><button className={subduedButton}>Save as draft</button></div>
        </div>
        <div className={panel}><h2 className="font-semibold">Question bank</h2><div className="mt-4 overflow-hidden rounded border"><table className={table}><thead className="bg-slate-50"><tr><th className={cell}>Question</th><th className={cell}>Status</th></tr></thead><tbody><tr><td className={cell}>Principles of constitutional law</td><td className={cell}><span className="rounded bg-green-50 px-2 py-1 text-xs text-green-800">Approved</span></td></tr></tbody></table></div></div>
      </div>;
    case '03':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
        <div className={panel}><h2 className="font-semibold">Assessment details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Title<input className="mt-1 w-full rounded border p-3" readOnly value="Constitutional Law Mid-Semester Exam" /></label><label className="text-sm">Duration<input className="mt-1 w-full rounded border p-3" readOnly value="90 minutes" /></label><label className="text-sm">Course<input className="mt-1 w-full rounded border p-3" readOnly value="LAW 302" /></label><label className="text-sm">Maximum attempts<input className="mt-1 w-full rounded border p-3" readOnly value="1" /></label></div>
          <h3 className="mt-6 font-medium">Approved questions · 2</h3><div className="mt-3 grid gap-2">{['Question 1 · Multiple choice · 5 marks', 'Question 2 · Essay · 10 marks'].map((q) => <div className="flex justify-between rounded border p-3 text-sm" key={q}><span>{q}</span><span className="text-green-700">Linked</span></div>)}</div>
          {invalid && <p className={`${alert} mt-4`}>Draft question cannot be added. No assessment was created.</p>}
          <button className={`${button} mt-5`}>{invalid ? 'Fix question selection' : 'Save assessment'}</button>
        </div>
        <div className={panel}><h2 className="font-semibold">Selected question details</h2><div className="mt-4 rounded bg-slate-50 p-4 text-sm"><p className="font-medium">Question 1 · LAW 302</p><p className="mt-2 text-slate-600">Status: Approved</p><p className="mt-1 text-slate-600">Display order: 1</p><p className="mt-1 text-slate-600">Maximum mark: 5</p></div><p className="mt-4 text-xs text-slate-500">Question links are validated before assessment persistence.</p></div>
      </div>;
    case '04':
      return <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Before you begin</h2><p className="mt-1 text-sm text-slate-500">Constitutional Law · 90 minutes</p></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">Published</span></div><div className="mt-5 divide-y rounded border">{['Course enrollment', 'Device and browser checks', 'Network connection', 'Assessment schedule'].map((label, i) => <div className="flex items-center justify-between p-3 text-sm" key={label}><span>{label}</span><span className={`font-medium ${invalid && i === 2 ? 'text-amber-700' : 'text-green-700'}`}>{invalid && i === 2 ? 'Incomplete' : 'Passed'}</span></div>)}</div>{invalid && <p className={`${alert} mt-4`}>Complete the required readiness checks or confirm that the exam window is open.</p>}<button disabled={invalid} className={`${button} mt-5 disabled:bg-slate-400`}>Start examination</button></div>
        <div className={panel}><h2 className="font-semibold">Assessment window</h2><p className="mt-4 rounded bg-slate-50 p-4 text-sm">17 October 2026 · 09:00–10:30</p><p className="mt-3 text-sm text-slate-600">Maximum attempts: 1</p><p className="mt-1 text-sm text-slate-600">Eligibility is checked before an attempt is created.</p></div>
      </div>;
    case '05':
      return <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <div className={panel}><div className="flex justify-between border-b pb-4"><div><h2 className="font-semibold">Question 1 of 3</h2><p className="mt-1 text-sm text-slate-500">Constitutional Law · 5 marks</p></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">01:24:18 remaining</span></div><p className="my-6 text-lg">Which principle establishes that governmental powers are separated?</p><div className="grid gap-3">{['Judicial review', 'Separation of powers', 'Rule of law', 'Federal supremacy'].map((answer, i) => <label className="flex items-center gap-3 rounded border p-4 text-sm" key={answer}><input type="radio" checked={invalid ? i === 2 : i === 1} readOnly />{answer}</label>)}</div><div className="mt-6 flex justify-between"><button className={subduedButton}>Previous</button><button className={button}>Save answer &amp; next</button></div></div>
        <div className={panel}><h2 className="font-semibold">Question navigator</h2><div className="mt-4 grid grid-cols-3 gap-2">{[1, 2, 3].map((n) => <span className={`rounded border p-3 text-center text-sm ${n === 1 ? 'border-blue-900 bg-blue-900 text-white' : 'bg-white'}`} key={n}>{n}</span>)}</div><p className="mt-5 text-sm text-slate-600">Answers saved to your attempt.</p>{invalid && <p className={`${alert} mt-4`}>Answer key and marking scheme are not available in the candidate view.</p>}</div>
      </div>;
    case '06':
      return <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <div className={panel}><div className="flex justify-between"><h2 className="font-semibold">Your response</h2><span className={`text-sm font-medium ${invalid ? 'text-amber-700' : 'text-green-700'}`}>{invalid ? 'Sync rejected' : 'Saved to server'}</span></div><p className="mt-4 text-sm text-slate-500">Question 2 · Essay</p><textarea className="mt-3 h-48 w-full rounded border p-4 leading-6" readOnly value={invalid ? 'The update for a question outside this assessment is not accepted.' : 'The doctrine of separation of powers distributes legislative, executive, and judicial authority between separate branches.'} /><div className="mt-4 flex justify-between text-xs text-slate-500"><span>42 words · Last saved 09:42:16</span><span>Version 2</span></div></div>
        <div className={panel}><h2 className="font-semibold">Synchronization status</h2><div className={`mt-4 rounded p-4 text-sm ${invalid ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}>{invalid ? 'This question is not part of your assigned examination.' : 'All changes synchronized successfully.'}</div><p className="mt-4 text-sm text-slate-600">Attempt: active · Session verified</p><button className={`${subduedButton} mt-5`}>Retry synchronization</button></div>
      </div>;
    case '07':
      return <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]"><div className={panel}><h2 className="font-semibold">Active attempt · Constitutional Law</h2><p className="mt-1 text-sm text-slate-500">Candidate: Test Candidate · Started 09:00</p><div className={`mt-5 rounded-lg border p-5 ${invalid ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}><p className={`font-semibold ${invalid ? 'text-red-800' : 'text-green-800'}`}>{invalid ? 'Access denied — this attempt belongs to another candidate.' : 'Session verified — you can resume this examination.'}</p><p className="mt-2 text-sm text-slate-700">{invalid ? 'Your account cannot view, synchronize, or submit another candidate’s attempt.' : 'Your active session token is valid.'}</p></div><button className={`${invalid ? subduedButton : button} mt-5`}>{invalid ? 'Return to dashboard' : 'Resume exam'}</button></div><div className={panel}><h2 className="font-semibold">Session details</h2><p className="mt-4 text-sm">Attempt status <span className="float-right font-medium">In progress</span></p><p className="mt-3 text-sm">Session integrity <span className={`float-right font-medium ${invalid ? 'text-red-700' : 'text-green-700'}`}>{invalid ? 'Owner mismatch' : 'Verified'}</span></p><p className="mt-3 text-sm">Saved response <span className="float-right">Protected</span></p></div></div>;
    case '08':
      return <div className="grid gap-5 lg:grid-cols-[1fr_0.65fr]"><div className={panel}><h2 className="font-semibold">Objective score breakdown</h2><div className="mt-4 overflow-hidden rounded border"><table className={table}><thead className="bg-slate-50"><tr><th className={cell}>Question</th><th className={cell}>Answer</th><th className={cell}>Score</th></tr></thead><tbody><tr><td className={cell}>Q1 · Constitutional principle</td><td className={cell}><span className="text-green-700">Correct</span></td><td className={cell}>2 / 2</td></tr><tr><td className={cell}>Q2 · Judicial review</td><td className={cell}><span className="text-red-700">Incorrect</span></td><td className={cell}>0 / 2</td></tr></tbody></table></div></div><div className={panel}><p className="text-sm text-slate-500">Objective total</p><p className="mt-2 text-4xl font-semibold">2 <span className="text-xl text-slate-500">/ 4</span></p><p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800">Submission received · Attempt closed</p>{invalid && <p className={`${alert} mt-4`}>A duplicate result was not created.</p>}</div></div>;
    case '09':
      return <div className="mx-auto max-w-3xl"><div className={`${panel} text-center`}><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-800">✓</div><h2 className="mt-4 text-xl font-semibold">Examination submitted</h2><p className="mt-2 text-sm text-slate-600">Your final answers have been received and your attempt is now closed.</p><div className="mt-6 grid gap-3 rounded-md bg-slate-50 p-5 text-left text-sm sm:grid-cols-2"><span>Receipt number</span><strong>EX-2026-000184</strong><span>Assessment</span><strong>Constitutional Law</strong><span>Submitted</span><strong>17 Oct 2026 · 09:47</strong><span>Attempt status</span><strong className="text-green-700">Closed</strong></div>{invalid && <p className={`${alert} mt-5 text-left`}>This attempt has already been submitted. Your recorded answers remain unchanged.</p>}<button className={`${subduedButton} mt-5`}>Return to dashboard</button></div></div>;
    case '10':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.65fr]"><div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Question 4 · Essay</h2><p className="mt-1 text-sm text-slate-500">Candidate: Test Candidate · Maximum: 10 marks</p></div><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Awaiting review</span></div><div className="mt-5 rounded bg-slate-50 p-4 text-sm leading-6">The separation of powers doctrine limits the concentration of governmental authority and supports independent judicial review.</div><div className="mt-5 grid grid-cols-2 gap-4"><label className="text-sm">Provisional score<input className="mt-1 w-full rounded border p-3" readOnly value="8 / 10" /></label><label className="text-sm">Official grade<input className="mt-1 w-full rounded border p-3" readOnly value={invalid ? '11 / 10 — invalid' : '7 / 10'} /></label></div><div className="mt-5 flex gap-3"><button className={button}>Save lecturer decision</button><button className={subduedButton}>Return for re-marking</button></div>{invalid && <p className={`${alert} mt-4`}>Official grade must be within 0–10. No grade was saved.</p>}</div><div className={panel}><h2 className="font-semibold">Lecturer decision</h2><p className="mt-4 text-sm text-slate-600">Decision: {invalid ? 'Not saved' : 'Modified and accepted'}</p><p className="mt-2 text-sm text-slate-600">Graded by: Lecturer Example</p><p className="mt-2 text-sm text-slate-600">Official mark is separate from the provisional recommendation.</p></div></div>;
    case '11':
      return <div className="grid gap-5"><div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Candidate results</h2><p className="mt-1 text-sm text-slate-500">Constitutional Law · 17 October 2026</p></div><span className={`rounded px-3 py-1 text-xs ${invalid ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{invalid ? 'Pending lecturer grades' : 'Released'}</span></div><div className="mt-5 overflow-hidden rounded border"><table className={table}><thead className="bg-slate-50"><tr><th className={cell}>Assessment</th><th className={cell}>Objective</th><th className={cell}>Subjective</th><th className={cell}>Total</th><th className={cell}>Status</th></tr></thead><tbody>{!invalid && <tr><td className={cell}>Constitutional Law Examination</td><td className={cell}>32 / 40</td><td className={cell}>44 / 60</td><td className={cell}>76 / 100</td><td className={cell}><span className="text-green-700">Released</span></td></tr>}</tbody></table></div>{invalid && <p className={`${alert} mt-4`}>No results are available yet. Release is blocked while subjective grades are pending.</p>}</div>{!invalid && <div className={panel}><h2 className="font-semibold">Result details</h2><p className="mt-3 text-sm">Grade <strong className="ml-4">A</strong></p><p className="mt-2 text-sm">Released by <strong className="ml-2">Exam Officer</strong></p></div>}</div>;
    case '12':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]"><div className={panel}><h2 className="font-semibold">Generate questions from course material</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Course<input className="mt-1 w-full rounded border p-3" readOnly value="LAW 302 · Constitutional Law" /></label><label className="text-sm">Question type<input className="mt-1 w-full rounded border p-3" readOnly value="Essay" /></label><label className="text-sm">Topic<input className="mt-1 w-full rounded border p-3" readOnly value="Judicial review" /></label><label className="text-sm">Difficulty<input className="mt-1 w-full rounded border p-3" readOnly value="Medium" /></label></div><label className="mt-4 block text-sm">Course material<textarea className="mt-1 h-20 w-full rounded border p-3" readOnly value="Synthetic lecturer-provided course material for the tested topic." /></label><button className={`${button} mt-4`}>Generate draft question</button>{invalid && <p className={`${alert} mt-4`}>Generated output did not match the requested settings. No question was saved.</p>}</div><div className={panel}><div className="flex justify-between"><h2 className="font-semibold">Generated question drafts</h2><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Draft</span></div><p className="mt-4 rounded border p-4 text-sm">Explain the role of judicial review in constitutional governance.</p><p className="mt-3 text-xs text-slate-500">Not available to candidates until lecturer approval.</p></div></div>;
    case '13':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.65fr]"><div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Recommendation for lecturer review</h2><p className="mt-1 text-sm text-slate-500">Question 4 · Essay · Maximum 10 marks</p></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">Provisional</span></div><div className="mt-5 rounded bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Candidate response</p><p className="mt-2 text-sm leading-6">A synthetic response describing separation of powers and judicial review.</p></div><h3 className="mt-5 font-medium">Rubric assessment</h3><div className="mt-3 overflow-hidden rounded border"><table className={table}><thead className="bg-slate-50"><tr><th className={cell}>Criterion</th><th className={cell}>Score</th><th className={cell}>Comment</th></tr></thead><tbody><tr><td className={cell}>Knowledge</td><td className={cell}>4 / 5</td><td className={cell}>Accurate rule statement</td></tr><tr><td className={cell}>Analysis</td><td className={cell}>3 / 5</td><td className={cell}>Application needs detail</td></tr></tbody></table></div><div className="mt-4 flex gap-3"><button className={button}>Confirm official grade</button><button className={subduedButton}>Edit recommendation</button></div></div><div className={panel}><p className="text-sm text-slate-500">Suggested score</p><p className="mt-2 text-4xl font-semibold">7 <span className="text-xl text-slate-500">/ 10</span></p><p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">{invalid ? 'AI provider unavailable. No recommendation generated.' : 'Lecturer approval required. This is not an official grade.'}</p></div></div>;
    case '14':
      return <div className="grid gap-5"><div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Monitoring event feed</h2><p className="mt-1 text-sm text-slate-500">Attempt EX-2026-000184 · Candidate Test Candidate</p></div><button className={subduedButton}>Filter events</button></div><div className="mt-5 overflow-hidden rounded border"><table className={table}><thead className="bg-slate-50"><tr><th className={cell}>Event</th><th className={cell}>Recorded</th><th className={cell}>Review state</th><th className={cell}>Action</th></tr></thead><tbody><tr><td className={cell}>Tab focus changed</td><td className={cell}>09:34:12</td><td className={cell}><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Unreviewed</span></td><td className={cell}><button className="text-blue-800 underline">{invalid ? 'Review denied' : 'Review event'}</button></td></tr></tbody></table></div>{invalid && <p className={`${alert} mt-4`}>Candidate accounts cannot review or flag monitoring events.</p>}</div><p className="text-xs text-slate-500">Event records support staff review and do not by themselves establish misconduct.</p></div>;
    case '15':
      return <div className="grid gap-5 xl:grid-cols-[1fr_0.7fr]"><div className={panel}><div className="flex justify-between"><div><h2 className="font-semibold">Administrative attempt reset</h2><p className="mt-1 text-sm text-slate-500">Candidate Test Candidate · EX-2026-000184</p></div><span className={`rounded px-2 py-1 text-xs ${invalid ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{invalid ? 'Admin access required' : 'Reset complete'}</span></div><label className="mt-5 block text-sm">Reason for reset<textarea className="mt-1 h-20 w-full rounded border p-3" readOnly value="Approved recovery following verified candidate support request." /></label><button className={`${button} mt-4`}>{invalid ? 'Reset denied' : 'Attempt reset recorded'}</button></div><div className={panel}><div className="flex justify-between"><h2 className="font-semibold">Audit chain verification</h2><span className={`rounded px-2 py-1 text-xs ${invalid ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{invalid ? 'Integrity mismatch' : 'Verified'}</span></div><div className="mt-4 grid gap-3 text-sm"><p className="rounded bg-slate-50 p-3">Events checked <strong className="float-right">1</strong></p><p className="rounded bg-slate-50 p-3">Hash mismatches <strong className={`float-right ${invalid ? 'text-red-700' : 'text-green-700'}`}>{invalid ? '1' : '0'}</strong></p><p className="text-xs text-slate-500">Tampered test rows are restored after the verification assertion.</p></div></div></div>;
    default:
      return null;
  }
}

function SummaryPage({ scenario }: { scenario: Scenario }) {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bingham University · Integration test evidence</p>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Integration Test {scenario.id} — {scenario.title}</h1>
        <p className="text-muted-foreground">Static evidence summary · execution status is reported by the test runner</p>
      </header>
      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-secondary px-3 py-1 text-sm">Static UI reference</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">No status asserted here</span>
          </div>
          <div><h2 className="text-xl font-semibold">Scenario assertions</h2><p className="mt-2 text-sm text-muted-foreground">These checks are exercised by the aligned integration workflow tests; this image is not behavioral evidence by itself.</p></div>
          <ul className="grid gap-3">
            {scenario.summary.map((assertion) => <li key={assertion} className="rounded-md border bg-muted/40 px-4 py-3 text-sm leading-relaxed">{assertion}</li>)}
          </ul>
        </div>
        <footer className="border-t px-6 py-4 text-sm text-muted-foreground">Use the recorded test command output for Pass/Fail/Blocked status.</footer>
      </section>
    </main>
  );
}

describe('Integration scenario-specific UI evidence', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} — captures the ${scenario.title} primary workflow screen`, async () => {
      render(<AppShell scenario={scenario} state={0} />);
      await expect.element(page.getByRole('heading', { name: scenario.pageTitle })).toBeVisible();
      await expect(page).toMatchScreenshot(`${scenario.folder}/scenario-specific-ui-screenshots/${scenario.screenshots[0]}`);
    });

    it(`${scenario.id} — captures the ${scenario.title} validation or protected state`, async () => {
      render(<AppShell scenario={scenario} state={1} />);
      await expect.element(page.getByText('Action blocked')).toBeVisible();
      await expect(page).toMatchScreenshot(`${scenario.folder}/scenario-specific-ui-screenshots/${scenario.screenshots[1]}`);
    });

    it(`${scenario.id} — captures the ${scenario.title} acknowledged or persisted state`, async () => {
      render(<AppShell scenario={scenario} state={2} />);
      await expect.element(page.getByText('Acknowledged state')).toBeVisible();
      await expect.element(page.getByRole('region', { name: 'Persisted workflow reference' })).toBeVisible();
      await expect(page).toMatchScreenshot(`${scenario.folder}/scenario-specific-ui-screenshots/${scenario.screenshots[2]}`);
    });

    it(`${scenario.id} — captures the ${scenario.title} static evidence summary`, async () => {
      render(<SummaryPage scenario={scenario} />);
      await expect.element(page.getByRole('heading', { name: `Integration Test ${scenario.id} — ${scenario.title}` })).toBeVisible();
      await expect.element(page.getByRole('heading', { name: 'Scenario assertions' })).toBeVisible();
      await expect(page).toMatchScreenshot(`${scenario.folder}/static-test-evidence-summary/summary`);
    });
  }
});
