import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCategorySummary, buildConclusion, buildMatrixMarkdown, buildMatrixRows, renderCsv, validateConclusionText } from '@/lib/h15-acceptance';
import { writeMatrixOutputs } from '@/scripts/h15/build-matrix';
import { collectResults, type RequirementRecord, type ResultRecord } from '@/scripts/h15/collect-results';

function writeFixtureFiles(requirements: Array<Record<string, unknown>>, results: ResultRecord[]): { requirementsPath: string; resultsDirectory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'h15-acceptance-'));
  const requirementsPath = join(directory, 'requirements.json');
  const resultsDirectory = join(directory, 'results');
  mkdirSync(resultsDirectory);

  writeFileSync(requirementsPath, JSON.stringify({ requirements }, null, 2));
  writeFileSync(join(resultsDirectory, 'vitest-unit.json'), JSON.stringify({ results }, null, 2));

  return { requirementsPath, resultsDirectory };
}

function makeRequirement(
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

describe('H15 acceptance matrix tooling', () => {
  it('marks a fully passing requirement as Pass', () => {
    const requirements = [makeRequirement('REQ-01', 'Testing a fully passing requirement', 'functional', 'The test passes.', ['r1'])];
    const results: ResultRecord[] = [{
      id: 'r1',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 120,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
    }];

    const rows = buildMatrixRows(requirements, results);
    expect(rows[0]?.status).toBe('Pass');
    expect(rows[0]?.note).toContain('All mapped tests passed');
  });

  it('marks a requirement with one failed test as Fail', () => {
    const requirements = [makeRequirement('REQ-02', 'Testing a failing requirement', 'security', 'The requirement is secure.', ['r2'])];
    const results: ResultRecord[] = [{
      id: 'r2',
      suite: 'synthetic',
      status: 'failed',
      durationMs: 130,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
    }];

    const rows = buildMatrixRows(requirements, results);
    expect(rows[0]?.status).toBe('Fail');
  });

  it('marks a mixed pass and fail set as Partially Pass', () => {
    const requirements = [makeRequirement('REQ-03', 'Testing a mixed result', 'usability', 'The workflow partly meets the requirement.', ['r3a', 'r3b'])];
    const results: ResultRecord[] = [
      { id: 'r3a', suite: 'synthetic', status: 'passed', durationMs: 90, date: '2026-01-01T00:00:00.000Z', environment: 'local-test', browser: 'chromium', database: 'sqlite', serviceMode: 'real' },
      { id: 'r3b', suite: 'synthetic', status: 'failed', durationMs: 110, date: '2026-01-01T00:00:00.000Z', environment: 'local-test', browser: 'chromium', database: 'sqlite', serviceMode: 'real' },
    ];

    const rows = buildMatrixRows(requirements, results);
    expect(rows[0]?.status).toBe('Partially Pass');
  });

  it('marks a requirement with only not tested evidence as Not Tested', () => {
    const requirements = [makeRequirement('REQ-04', 'Testing a not tested requirement', 'functional', 'This requirement remains not tested.', ['r4'])];
    const results: ResultRecord[] = [{
      id: 'r4',
      suite: 'synthetic',
      status: 'not_tested',
      durationMs: 0,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
      reason: 'Optional AI is not enabled.',
    }];

    const rows = buildMatrixRows(requirements, results);
    expect(rows[0]?.status).toBe('Not Tested');
  });

  it('marks a requirement with no mapped tests as Not Tested', () => {
    const requirements = [makeRequirement('REQ-05', 'No mapped tests', 'reliability', 'There are no mapped tests.', [])];
    const rows = buildMatrixRows(requirements, []);
    expect(rows[0]?.status).toBe('Not Tested');
  });

  it('marks a missing mapped test identifier as Not Tested', () => {
    const requirements = [makeRequirement('REQ-06', 'Missing test identifier', 'compatibility', 'The mapped test should exist.', ['missing-test-id'])];
    const rows = buildMatrixRows(requirements, []);
    expect(rows[0]?.status).toBe('Not Tested');
  });

  it('checks threshold compliance for performance requirements', () => {
    const insideRequirement = makeRequirement('REQ-07', 'Inside threshold', 'performance', 'The response time is within the threshold.', ['perf-inside'], 100);
    const outsideRequirement = makeRequirement('REQ-08', 'Outside threshold', 'performance', 'The response time stays within the limit.', ['perf-outside'], 100);
    const results: ResultRecord[] = [
      { id: 'perf-inside', suite: 'synthetic', status: 'passed', durationMs: 100, date: '2026-01-01T00:00:00.000Z', environment: 'local-test', browser: 'chromium', database: 'sqlite', serviceMode: 'real', measurement: 99 },
      { id: 'perf-outside', suite: 'synthetic', status: 'passed', durationMs: 100, date: '2026-01-01T00:00:00.000Z', environment: 'local-test', browser: 'chromium', database: 'sqlite', serviceMode: 'real', measurement: 101 },
    ];

    const rows = buildMatrixRows([insideRequirement, outsideRequirement], results);
    expect(rows[0]?.status).toBe('Pass');
    expect(rows[1]?.status).toBe('Fail');
    expect(rows[1]?.measuredResult).toContain('101');
  });

  it('stops when an acceptance expectation or a required category threshold is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'h15-invalid-requirement-'));
    const requirementsPath = join(directory, 'requirements.json');
    writeFileSync(requirementsPath, JSON.stringify({
      requirements: [
        { id: 'REQ-15', description: 'Missing expectation', category: 'functional', acceptanceExpectation: ' ', testIds: ['x'] },
      ],
    }));
    expect(() => collectResults(requirementsPath, directory)).toThrow('Requirement REQ-15 has an empty acceptance expectation');

    writeFileSync(requirementsPath, JSON.stringify({
      requirements: [
        { id: 'REQ-16', description: 'Missing threshold', category: 'performance', acceptanceExpectation: 'Response time stays within the recorded limit.', testIds: ['x'] },
      ],
    }));
    expect(() => collectResults(requirementsPath, directory)).toThrow('Requirement REQ-16 is missing a threshold for performance');
  });

  it('does not count stubbed results as real-service evidence', () => {
    const requirements = [makeRequirement('REQ-09', 'Real service requirement', 'security', 'Evidence must come from the real service.', ['stubbed-result'])];
    const results: ResultRecord[] = [{
      id: 'stubbed-result',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 50,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'stub',
      reason: 'Stubbed response for a test harness only.',
    }];

    const rows = buildMatrixRows(requirements, results);
    expect(rows[0]?.status).toBe('Not Tested');
  });

  it('stops when the requirements file is empty', () => {
    const directory = mkdtempSync(join(tmpdir(), 'h15-empty-'));
    const requirementsPath = join(directory, 'requirements.json');
    const resultsPath = join(directory, 'results.json');
    writeFileSync(requirementsPath, JSON.stringify({ requirements: [] }, null, 2));
    writeFileSync(resultsPath, JSON.stringify({ results: [] }, null, 2));

    expect(() => collectResults(requirementsPath, directory)).toThrow('The requirements file is empty');
  });

  it('rejects a conclusion that contains a forbidden universal claim', () => {
    expect(() => validateConclusionText('The system is fully secure and production ready in all conditions.')).toThrow('forbidden universal claim');
  });

  it('returns identical results when the collector is run twice on the same files', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'h15-repeat-'));
    const requirementsPath = join(dataDirectory, 'requirements.json');
    const resultsDirectory = join(dataDirectory, 'results');
    const outputPath = join(dataDirectory, 'collected-results.json');
    mkdirSync(resultsDirectory);

    const requirements = [
      makeRequirement('REQ-11', 'Repeatable result collection', 'functional', 'The evidence is stable.', ['repeat-test']),
    ];
    const results: ResultRecord[] = [{
      id: 'repeat-test',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 80,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
    }];

    writeFileSync(requirementsPath, JSON.stringify({ requirements }, null, 2));
    writeFileSync(join(resultsDirectory, 'vitest-unit.json'), JSON.stringify({ results }, null, 2));

    const firstPass = collectResults(requirementsPath, resultsDirectory, outputPath);
    const secondPass = collectResults(requirementsPath, resultsDirectory, outputPath);

    expect(JSON.stringify(firstPass)).toBe(JSON.stringify(secondPass));
    expect(firstPass.results.some((result) => result.id === 'repeat-test')).toBe(true);
    expect(buildMatrixRows(firstPass.requirements, firstPass.results)[0]?.status).toBe('Pass');
  });

  it('builds a matrix markdown document that lists the rules and the status summary', () => {
    const requirements = [
      makeRequirement('REQ-12', 'Requirement with all evidence passed', 'functional', 'The system works.', ['r12']),
      makeRequirement('REQ-13', 'Requirement with missing data', 'security', 'The evidence is incomplete.', ['r13']),
    ];
    const results: ResultRecord[] = [{
      id: 'r12',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 40,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
    }];

    const rows = buildMatrixRows(requirements, results);
    const markdown = buildMatrixMarkdown(rows, []);
    expect(markdown).toContain('A requirement is Pass only when');
    expect(markdown).toContain('Partially Pass');
  });

  it('reads synthetic result files created in a test directory', () => {
    const fixture = writeFixtureFiles([
      makeRequirement('REQ-14', 'Synthetic requirement', 'functional', 'The requirement is met.', ['synthetic-test-id']),
    ], [{
      id: 'synthetic-test-id',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 70,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'local-test',
      browser: 'chromium',
      database: 'sqlite',
      serviceMode: 'real',
    }]);

    const bundle = collectResults(fixture.requirementsPath, fixture.resultsDirectory);
    expect(bundle.requirements.length).toBe(1);
    expect(bundle.results.find((result) => result.id === 'synthetic-test-id')?.status).toBe('passed');
  });

  it('identifies browser outcomes when Vitest omits source-file metadata', () => {
    const fixture = writeFixtureFiles([
      makeRequirement('REQ-24', 'Synthetic browser test', 'compatibility', 'The browser test passes.', []),
    ], []);
    writeFileSync(join(fixture.resultsDirectory, 'vitest-browser.json'), JSON.stringify({
      testResults: [{
        startTime: Date.parse('2026-01-01T00:00:00.000Z'),
        assertionResults: [{
          ancestorTitles: ['Synthetic browser suite'],
          title: 'renders the report',
          fullName: 'Synthetic browser suite renders the report',
          status: 'passed',
          duration: 35,
        }],
      }],
    }));

    const bundle = collectResults(fixture.requirementsPath, fixture.resultsDirectory);
    const browserResult = bundle.results.find((result) => result.environment === 'browser test runner');
    expect(browserResult?.status).toBe('passed');
    expect(browserResult?.date).toBe('2026-01-01T00:00:00.000Z');
    expect(browserResult?.browser).toContain('Chromium');
    expect(browserResult?.database).toBe('not recorded by Vitest result');
  });

  it('marks CSV stub evidence as Not Tested and discards missing screenshot paths', () => {
    const fixture = writeFixtureFiles([
      makeRequirement('REQ-25', 'Real-service compatibility check', 'compatibility', 'The real service supports the browser.', ['stub-csv']),
    ], []);
    writeFileSync(
      join(fixture.resultsDirectory, 'compatibility-results.csv'),
      'id,suite,status,durationMs,date,environment,browser,database,serviceMode,reason,screenshotPath\n'
        + 'stub-csv,compatibility,passed,23,2026-01-01T00:00:00.000Z,synthetic environment,Chromium,test database,stub,Stubbed service response,missing.png\n',
    );

    const bundle = collectResults(fixture.requirementsPath, fixture.resultsDirectory);
    const csvResult = bundle.results.find((result) => result.id === 'stub-csv');
    expect(csvResult?.status).toBe('not_tested');
    expect(csvResult?.serviceMode).toBe('stub');
    expect(csvResult?.environment).toBe('synthetic environment');
    expect(csvResult?.browser).toBe('Chromium');
    expect(csvResult?.database).toBe('test database');
    expect(csvResult?.screenshotPath).toBeUndefined();
  });

  it('maps a skipped optional AI test to Not Tested and retains the reason', () => {
    const fixture = writeFixtureFiles([
      makeRequirement('REQ-17', 'AI workflow test', 'functional', 'The optional AI workflow is available.', ['ai-skipped']),
    ], [{
      id: 'ai-skipped',
      suite: 'synthetic test data',
      status: 'skipped',
      durationMs: 0,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'synthetic environment',
      reason: 'Optional AI is not enabled.',
    }]);

    const bundle = collectResults(fixture.requirementsPath, fixture.resultsDirectory);
    expect(bundle.results.find((result) => result.id === 'ai-skipped')?.status).toBe('not_tested');
    expect(buildMatrixRows(bundle.requirements, bundle.results)[0]?.status).toBe('Not Tested');
  });

  it('records missing H14 observations and questionnaire data as Not Tested', () => {
    const fixture = writeFixtureFiles([
      makeRequirement('REQ-18', 'Human study observation', 'usability', 'Participants complete the tasks.', ['h14-observation:login']),
    ], []);

    const bundle = collectResults(fixture.requirementsPath, fixture.resultsDirectory);
    expect(bundle.results.find((result) => result.id === 'h14-observation:login')?.status).toBe('not_tested');
    expect(bundle.results.find((result) => result.id === 'h14-questionnaire-overall')?.status).toBe('not_tested');
    expect(buildMatrixRows(bundle.requirements, bundle.results)[0]?.status).toBe('Not Tested');
  });

  it('reports category counts in prose and correctly quotes CSV cells', () => {
    const rows = buildMatrixRows([
      makeRequirement('REQ-19', 'Passed, with "quoted" text', 'security', 'A mapped check passes.', ['pass']),
      makeRequirement('REQ-20', 'Not tested requirement', 'security', 'An unavailable check is not tested.', ['missing']),
    ], [{
      id: 'pass',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 12,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'synthetic',
    }]);
    const summaries = buildCategorySummary(rows);
    const securitySummary = summaries.find((summary) => summary.category === 'security');

    expect(securitySummary?.pass).toBe(1);
    expect(securitySummary?.notTested).toBe(1);
    expect(renderCsv(rows)).toContain('"Passed, with ""quoted"" text"');
    expect(buildMatrixMarkdown(rows, summaries)).toContain('## security');
    expect(buildMatrixMarkdown(rows, summaries)).toContain('REQ-20 were not tested.');
  });

  it('builds a conclusion that reports the outcome and the tested conditions', () => {
    const rows = buildMatrixRows([
      makeRequirement('REQ-21', 'Passed requirement', 'functional', 'The flow passes.', ['passed']),
      makeRequirement('REQ-22', 'Failed requirement', 'security', 'The security check passes.', ['failed']),
      makeRequirement('REQ-23', 'Unmeasured requirement', 'usability', 'The observed task succeeds.', ['missing']),
    ], [
      { id: 'passed', suite: 'synthetic', status: 'passed', durationMs: 12, date: '2026-01-01T00:00:00.000Z', environment: 'test' },
      { id: 'failed', suite: 'synthetic', status: 'failed', durationMs: 12, date: '2026-01-01T00:00:00.000Z', environment: 'test' },
    ]);
    const conclusion = buildConclusion(rows, {
      environment: 'local test environment',
      browsers: 'Chromium',
      participants: 'no participant data supplied',
      loadLevels: 'single-user baseline',
    });

    expect(conclusion).toContain('1 requirement in Pass, 1 in Fail, 0 in Partially Pass, and 1 in Not Tested');
    expect(conclusion).toContain('REQ-22');
    expect(conclusion).toContain('REQ-23');
    expect(conclusion).toContain('under the tested conditions');
  });

  it('writes the CSV, markdown matrix, and conclusion to their output files', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'h15-output-'));
    const rows = buildMatrixRows([
      makeRequirement('REQ-26', 'Synthetic output requirement', 'functional', 'The evidence passes.', ['output-test']),
    ], [{
      id: 'output-test',
      suite: 'synthetic',
      status: 'passed',
      durationMs: 12,
      date: '2026-01-01T00:00:00.000Z',
      environment: 'synthetic environment',
    }]);
    const summaries = buildCategorySummary(rows);
    const outputs = writeMatrixOutputs(join(outputDirectory, 'matrix'), rows, summaries, {
      environment: 'synthetic environment',
      browsers: 'Chromium',
      participants: 'synthetic participants',
      loadLevels: 'single-user synthetic load',
    });

    expect(existsSync(outputs.csvPath)).toBe(true);
    expect(existsSync(outputs.markdownPath)).toBe(true);
    expect(existsSync(outputs.conclusionPath)).toBe(true);
    expect(readFileSync(outputs.csvPath, 'utf8')).toContain('REQ-26');
    expect(readFileSync(outputs.markdownPath, 'utf8')).toContain('## functional');
    expect(readFileSync(outputs.conclusionPath, 'utf8')).toContain('under the tested conditions');
  });

  it('does not generate a conclusion when there are no requirements', () => {
    expect(() => buildConclusion([], {
      environment: 'local test environment',
      browsers: 'Chromium',
      participants: 'not recorded',
      loadLevels: 'not recorded',
    })).toThrow('without at least one requirement');
  });
});
