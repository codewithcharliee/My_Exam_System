import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const assessmentId = __ENV.ASSESSMENT_ID;
const maxVUs = Number(__ENV.MAX_VUS || 300);
const stageDuration = __ENV.STAGE_DURATION || '1m';
const thinkTimeSeconds = Number(__ENV.THINK_TIME_SECONDS || 5);
const p95ThresholdMs = Number(__ENV.P95_THRESHOLD_MS || 2000);
const errorRateThreshold = Number(__ENV.ERROR_RATE_THRESHOLD || 0.01);

if (!baseUrl) throw new Error('Set BASE_URL to the staging app URL.');
if (!assessmentId) throw new Error('Set ASSESSMENT_ID to a published staging assessment.');
if (!Number.isSafeInteger(maxVUs) || maxVUs < 1) throw new Error('MAX_VUS must be a positive integer.');
if (!Number.isFinite(thinkTimeSeconds) || thinkTimeSeconds < 0) {
  throw new Error('THINK_TIME_SECONDS must be a non-negative number.');
}
if (!Number.isFinite(p95ThresholdMs) || p95ThresholdMs <= 0) {
  throw new Error('P95_THRESHOLD_MS must be a positive number.');
}
if (!Number.isFinite(errorRateThreshold) || errorRateThreshold < 0 || errorRateThreshold > 1) {
  throw new Error('ERROR_RATE_THRESHOLD must be between 0 and 1.');
}
if (!__ENV.CANDIDATES_FILE) {
  throw new Error('Set CANDIDATES_FILE to a JSON file containing disposable candidate credentials.');
}

const candidates = new SharedArray('load-test-candidates', () => {
  const parsed = JSON.parse(open(__ENV.CANDIDATES_FILE));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('CANDIDATES_FILE must contain a non-empty JSON array.');
  }
  const emails = new Set();
  for (const candidate of parsed) {
    if (
      !candidate
      || typeof candidate.email !== 'string'
      || !candidate.email.trim()
      || typeof candidate.password !== 'string'
      || !candidate.password
    ) {
      throw new Error('Every candidate must have a non-empty email and password.');
    }
    const email = candidate.email.trim().toLowerCase();
    if (emails.has(email)) throw new Error('Candidate emails must be unique.');
    emails.add(email);
  }
  return parsed;
});

if (candidates.length < maxVUs) {
  throw new Error(`MAX_VUS (${maxVUs}) exceeds the number of candidate accounts (${candidates.length}).`);
}

const rampTargets = [...new Set([10, 50, 100, 200, maxVUs].filter((target) => target <= maxVUs))];
export const options = {
  scenarios: {
    exam_journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        ...rampTargets.map((target) => ({ duration: stageDuration, target })),
        { duration: stageDuration, target: maxVUs },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '2m',
    },
  },
  thresholds: {
    http_req_failed: [`rate<${errorRateThreshold}`],
    http_req_duration: [`p(95)<${p95ThresholdMs}`],
  },
};

function expectStatus(response, expectedStatus, step) {
  const passed = check(response, {
    [`${step} returned HTTP ${expectedStatus}`]: (res) => res.status === expectedStatus,
  });
  if (!passed) {
    console.error(`${step} failed with HTTP ${response.status}: ${(response.body || '').slice(0, 300)}`);
  }
  return passed;
}

function encodeForm(values) {
  return Object.entries(values)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function runCandidateJourney() {
  if (__ITER > 0) {
    sleep(3600);
    return;
  }

  const candidate = candidates[__VU - 1];
  const csrfResponse = http.get(`${baseUrl}/api/auth/csrf`, {
    tags: { name: 'GET /api/auth/csrf' },
  });
  if (!expectStatus(csrfResponse, 200, 'Fetch login CSRF token')) return;

  let csrfToken;
  try {
    csrfToken = csrfResponse.json('csrfToken');
  } catch {
    console.error('CSRF response did not contain valid JSON.');
    return;
  }
  if (typeof csrfToken !== 'string' || !csrfToken) {
    console.error('CSRF response did not contain a token.');
    return;
  }

  const loginResponse = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    encodeForm({
      csrfToken,
      email: candidate.email,
      password: candidate.password,
      portal: 'candidate',
      callbackUrl: `${baseUrl}/exam`,
    }),
    {
      redirects: 0,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags: { name: 'POST /api/auth/callback/credentials' },
    },
  );
  if (!check(loginResponse, {
    'candidate login succeeded': (res) => res.status < 400 && !/error=/i.test(res.headers.Location || ''),
  })) {
    console.error(`Candidate login failed with HTTP ${loginResponse.status}.`);
    return;
  }

  const sessionResponse = http.get(`${baseUrl}/api/auth/session`, {
    tags: { name: 'GET /api/auth/session' },
  });
  if (!expectStatus(sessionResponse, 200, 'Verify login session')) return;
  let session;
  try {
    session = sessionResponse.json();
  } catch {
    console.error('Login session response did not contain valid JSON.');
    return;
  }
  if (!check(session, {
    'candidate session established': (value) => value?.user?.role === 'candidate',
  })) {
    console.error('Login did not establish a candidate session.');
    return;
  }

  const startResponse = http.post(
    `${baseUrl}/api/attempts/start`,
    JSON.stringify({ assessmentId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/attempts/start' },
    },
  );
  if (!expectStatus(startResponse, 201, 'Start assessment')) return;

  let start;
  try {
    start = startResponse.json();
  } catch {
    console.error('Attempt start response did not contain valid JSON.');
    return;
  }
  if (typeof start?.attemptId !== 'string' || !start.attemptId) {
    console.error('Attempt start response did not contain an attempt ID.');
    return;
  }

  const attemptId = start.attemptId;
  const attemptResponse = http.get(`${baseUrl}/api/attempts/${encodeURIComponent(attemptId)}`, {
    tags: { name: 'GET /api/attempts/:id' },
  });
  if (!expectStatus(attemptResponse, 200, 'Load assessment attempt')) return;

  let attempt;
  try {
    attempt = attemptResponse.json();
  } catch {
    console.error('Attempt response did not contain valid JSON.');
    return;
  }
  const items = attempt?.assessment?.items;
  if (!Array.isArray(items) || items.length === 0) {
    console.error('Attempt did not contain assessment questions.');
    return;
  }

  let answerChanges = 0;
  const responses = items.map((item, index) => {
    const question = item.question;
    const options = question?.options || [];
    const selectedOptionId = question?.type === 'multiple_choice' && options.length > 0
      ? options[0].id
      : null;
    const currentText = question?.type === 'multiple_choice'
      ? null
      : `Load-test response ${index + 1}.`;
    answerChanges += 1;
    return {
      questionId: question.id,
      currentText,
      selectedOptionId,
      wordCount: currentText ? currentText.split(/\s+/).length : 0,
      timeSpentSecs: 1,
      visitCount: 1,
      answerChanges,
    };
  });

  const syncUrl = `${baseUrl}/api/attempts/${encodeURIComponent(attemptId)}/sync`;
  const syncParams = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/attempts/:id/sync' },
  };
  const autosaveResponse = http.post(syncUrl, JSON.stringify({ responses }), syncParams);
  if (!expectStatus(autosaveResponse, 200, 'Autosave responses')) return;

  sleep(thinkTimeSeconds);

  const syncResponse = http.post(syncUrl, JSON.stringify({ responses }), syncParams);
  if (!expectStatus(syncResponse, 200, 'Sync responses')) return;

  const submitResponse = http.post(
    `${baseUrl}/api/attempts/${encodeURIComponent(attemptId)}/submit`,
    JSON.stringify({ responses }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/attempts/:id/submit' },
    },
  );
  expectStatus(submitResponse, 200, 'Submit assessment');
}

export default runCandidateJourney;
