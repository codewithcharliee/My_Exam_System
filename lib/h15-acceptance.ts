export type RequirementCategory = 'functional' | 'security' | 'compatibility' | 'performance' | 'concurrency' | 'reliability' | 'usability';

export type RequirementRecord = {
  id: string;
  description: string;
  category: RequirementCategory;
  acceptanceExpectation: string;
  testIds: string[];
  threshold?: number;
};

export type ResultStatus = 'passed' | 'failed' | 'skipped' | 'not_tested';

export type ResultRecord = {
  id: string;
  suite: string;
  status: ResultStatus;
  durationMs: number;
  date: string;
  screenshotPath?: string;
  environment: string;
  browser?: string;
  database?: string;
  serviceMode?: 'real' | 'stub';
  reason?: string;
  measurement?: number;
  testName?: string;
  filePath?: string;
};

export type MatrixStatus = 'Pass' | 'Fail' | 'Partially Pass' | 'Not Tested';

export type MatrixRow = {
  id: string;
  description: string;
  category: RequirementCategory;
  evidence: string[];
  measuredResult: string;
  status: MatrixStatus;
  note: string;
};

export type CategorySummary = {
  category: RequirementCategory;
  pass: number;
  fail: number;
  partiallyPass: number;
  notTested: number;
  failedRequirements: string[];
  partiallyPassedRequirements: string[];
  notTestedRequirements: string[];
};

export type ConclusionContext = {
  environment: string;
  browsers: string;
  participants: string;
  loadLevels: string;
};

function getStatusValues(rows: MatrixRow[]): Record<MatrixStatus, number> {
  return {
    Pass: rows.filter((entry) => entry.status === 'Pass').length,
    Fail: rows.filter((entry) => entry.status === 'Fail').length,
    'Partially Pass': rows.filter((entry) => entry.status === 'Partially Pass').length,
    'Not Tested': rows.filter((entry) => entry.status === 'Not Tested').length,
  };
}

function formatMeasurementValue(result: ResultRecord | undefined, requirement: RequirementRecord): string {
  if (!result) {
    return 'No measurement recorded';
  }

  if (typeof result.measurement === 'number') {
    if (typeof requirement.threshold === 'number') {
      return `${result.measurement} measured against threshold ${requirement.threshold}`;
    }
    return `${result.measurement}`;
  }

  if (typeof requirement.threshold === 'number') {
    return `No measured value recorded against threshold ${requirement.threshold}`;
  }

  return 'No measurement recorded';
}

export function buildMatrixRows(requirements: RequirementRecord[], results: ResultRecord[]): MatrixRow[] {
  const byId = new Map<string, ResultRecord>();
  for (const result of results) {
    byId.set(result.id, result.serviceMode === 'stub' ? { ...result, status: 'not_tested' } : result);
  }

  return requirements.map((requirement) => {
    const mappedResults = requirement.testIds.map((testId) => byId.get(testId));

    const evidence = requirement.testIds.length > 0 ? requirement.testIds : [];
    const mappedStatuses = mappedResults.map((entry) => entry?.status ?? 'not_tested');
    const failedCount = mappedStatuses.filter((entry) => entry === 'failed').length;
    const passedCount = mappedStatuses.filter((entry) => entry === 'passed').length;
    const notTestedCount = mappedStatuses.filter((entry) => entry === 'not_tested' || entry === 'skipped').length;
    const measuredValues = mappedResults
      .map((result) => result?.measurement)
      .filter((measurement): measurement is number => typeof measurement === 'number' && Number.isFinite(measurement));

    const hasMappedTests = requirement.testIds.length > 0;

    let status: MatrixStatus;
    let note = 'Evidence recorded.';

    if (!hasMappedTests) {
      status = 'Not Tested';
      note = 'No mapped test exists for this requirement.';
    } else if (mappedStatuses.every((entry) => entry === 'not_tested' || entry === 'skipped')) {
      status = 'Not Tested';
      note = 'All mapped evidence is skipped, missing, stubbed, or marked as not tested.';
    } else if (failedCount > 0 && passedCount === 0 && notTestedCount === 0) {
      status = 'Fail';
      note = 'One or more essential mapped tests failed.';
    } else if (failedCount > 0 || notTestedCount > 0) {
      status = passedCount > 0 ? 'Partially Pass' : 'Fail';
      const passText = passedCount > 0 ? `${passedCount} passed` : 'no tests passed';
      const failText = failedCount > 0 ? `${failedCount} failed` : 'no tests failed';
      const notTestedText = notTestedCount > 0 ? `${notTestedCount} skipped, missing, or not tested` : 'no tests were skipped or missing';
      note = `${passText}, ${failText}, and ${notTestedText}.`;
    } else {
      status = 'Pass';
      note = 'All mapped tests passed.';
    }

    const threshold = requirement.threshold;
    if (typeof threshold === 'number') {
      if (measuredValues.length === 0) {
        if (status === 'Pass') {
          status = 'Not Tested';
          note = `No measured value is available to compare with the recorded threshold ${threshold}.`;
        } else {
          note = `${note} No measured value is available to compare with the recorded threshold ${threshold}.`;
        }
      } else {
        const baseNote = note;
        const outsideValues = measuredValues.filter((measurement) => measurement > threshold);
        if (outsideValues.length > 0) {
          if (status === 'Pass') {
            status = outsideValues.length === measuredValues.length ? 'Fail' : 'Partially Pass';
          }
          note = `Measured value${outsideValues.length === 1 ? '' : 's'} ${outsideValues.join(', ')} exceeded the recorded threshold ${threshold}. ${baseNote}`;
        } else if (status === 'Pass') {
          note = `All mapped tests passed and measured value${measuredValues.length === 1 ? '' : 's'} ${measuredValues.join(', ')} met threshold ${threshold}.`;
        } else {
          note = `Measured value${measuredValues.length === 1 ? '' : 's'} ${measuredValues.join(', ')} met threshold ${threshold}. ${baseNote}`;
        }
      }
    }

    const measuredResult = mappedResults.length > 0
      ? mappedResults.map((result) => formatMeasurementValue(result, requirement)).join('; ')
      : 'No measurement recorded';

    return {
      id: requirement.id,
      description: requirement.description,
      category: requirement.category,
      evidence,
      measuredResult,
      status,
      note,
    };
  });
}

export function buildCategorySummary(rows: MatrixRow[]): CategorySummary[] {
  const categories: RequirementCategory[] = ['security', 'reliability', 'compatibility', 'performance', 'concurrency', 'usability', 'functional'];

  return categories.map((category) => {
    const categoryRows = rows.filter((row) => row.category === category);
    const summary: CategorySummary = {
      category,
      pass: 0,
      fail: 0,
      partiallyPass: 0,
      notTested: 0,
      failedRequirements: [],
      partiallyPassedRequirements: [],
      notTestedRequirements: [],
    };

    for (const row of categoryRows) {
      if (row.status === 'Pass') {
        summary.pass += 1;
      } else if (row.status === 'Fail') {
        summary.fail += 1;
        summary.failedRequirements.push(row.id);
      } else if (row.status === 'Partially Pass') {
        summary.partiallyPass += 1;
        summary.partiallyPassedRequirements.push(row.id);
      } else {
        summary.notTested += 1;
        summary.notTestedRequirements.push(row.id);
      }
    }

    return summary;
  });
}

export function renderCsv(rows: MatrixRow[]): string {
  const header = 'id,description,category,evidence,measuredResult,status,note';
  const escapeCsv = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const body = rows.map((row) => [
    row.id,
    row.description,
    row.category,
    row.evidence.join(';'),
    row.measuredResult,
    row.status,
    row.note,
  ].map(escapeCsv).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function buildMatrixMarkdown(rows: MatrixRow[], categorySummaries: CategorySummary[]): string {
  const rules = [
    'Rules for the acceptance matrix: A requirement is Pass only when it has at least one mapped test, every mapped test passed, and none of the mapped evidence is Not Tested. A requirement is Fail when at least one essential mapped test failed and the acceptance expectation was not met. A requirement is Partially Pass when some mapped tests passed and others failed or were not tested, or when the evidence covers only part of the acceptance expectation. A requirement is Not Tested when it has no mapped test or when all mapped evidence is Not Tested.',
    'The measured value and the recorded threshold are shown together so that the matrix can state whether the requirement met the recorded limit.',
  ].join('\n');

  const escapeCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const rowsText = rows.map((row) => `| ${[
    row.id,
    row.description,
    row.category,
    row.evidence.join(', '),
    row.measuredResult,
    row.status,
    row.note,
  ].map(escapeCell).join(' | ')} |`).join('\n');
  const summaryText = categorySummaries.length > 0
    ? categorySummaries.map((entry) => [
      `## ${entry.category}`,
      `Pass: ${entry.pass}. Fail: ${entry.fail}. Partially Pass: ${entry.partiallyPass}. Not Tested: ${entry.notTested}.`,
      `Failed requirements: ${entry.failedRequirements.length > 0 ? `${entry.failedRequirements.join(', ')} failed.` : 'none failed.'}`,
      `Partially passed requirements: ${entry.partiallyPassedRequirements.length > 0 ? `${entry.partiallyPassedRequirements.join(', ')} partially passed.` : 'none partially passed.'}`,
      `Not tested requirements: ${entry.notTestedRequirements.length > 0 ? `${entry.notTestedRequirements.join(', ')} were not tested.` : 'none were not tested.'}`,
    ].join('\n')).join('\n\n')
    : 'No category summary rows were generated.';

  return `${rules}\n\n| id | description | category | evidence | measuredResult | status | note |\n| --- | --- | --- | --- | --- | --- | --- |\n${rowsText}\n\n${summaryText}`;
}

export function validateConclusionText(text: string): void {
  const patterns = [
    /fully secure/i,
    /production[\s-]+ready/i,
    /error[\s-]+free/i,
    /works in all conditions/i,
    /all conditions/i,
    /universal quality/i,
  ];

  const matches = patterns.filter((pattern) => pattern.test(text));
  if (matches.length > 0) {
    throw new Error('Conclusion contains a forbidden universal claim.');
  }
}

export function buildConclusion(rows: MatrixRow[], context: ConclusionContext): string {
  if (rows.length === 0) {
    throw new Error('Cannot generate an H15 conclusion without at least one requirement.');
  }

  const counts = getStatusValues(rows);
  const failed = rows.filter((entry) => entry.status === 'Fail').map((entry) => entry.id);
  const partial = rows.filter((entry) => entry.status === 'Partially Pass').map((entry) => entry.id);
  const notTested = rows.filter((entry) => entry.status === 'Not Tested').map((entry) => entry.id);
  const requirementLabel = (count: number): string => `${count} requirement${count === 1 ? '' : 's'}`;

  const acceptanceOutcome = counts.Fail > 0
    ? 'The stated acceptance expectations were not fully met under the tested conditions.'
    : counts['Partially Pass'] > 0 || counts['Not Tested'] > 0
      ? 'The evidence is incomplete, so the stated acceptance expectations cannot be concluded as fully met under the tested conditions.'
      : 'The stated acceptance expectations were met under the tested conditions.';

  const template = [
    `Under the tested conditions, the H15 acceptance result shows ${requirementLabel(counts.Pass)} in Pass, ${counts.Fail} in Fail, ${counts['Partially Pass']} in Partially Pass, and ${counts['Not Tested']} in Not Tested.`,
    `The failed requirements were ${failed.join(', ') || 'none'}.`,
    `The partially passed requirements were ${partial.join(', ') || 'none'}.`,
    `The not tested requirements were ${notTested.join(', ') || 'none'}.`,
    `The evidence was obtained in ${context.environment || 'an environment not recorded'}, using ${context.browsers || 'browsers not recorded'}, with participants ${context.participants || 'participant details not supplied'}, and under load levels ${context.loadLevels || 'load levels not recorded'}.`,
    acceptanceOutcome,
    'This conclusion is limited to the tested conditions and makes no claim about conditions not represented by the evidence.',
  ].join(' ');

  validateConclusionText(template);

  return template;
}
