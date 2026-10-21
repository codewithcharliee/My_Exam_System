import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export type CollectedResultBundle = {
  requirements: RequirementRecord[];
  results: ResultRecord[];
};

const REQUIREMENT_CATEGORIES: RequirementCategory[] = ['functional', 'security', 'compatibility', 'performance', 'concurrency', 'reliability', 'usability'];

function readJsonFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function findFilesUnder(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFilesUnder(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

export function readRequirements(requirementsPath: string): RequirementRecord[] {
  if (!existsSync(requirementsPath)) {
    throw new Error(`Requirements file does not exist at ${requirementsPath}.`);
  }

  const raw = readJsonFile(requirementsPath) as { requirements?: unknown };
  const values = Array.isArray(raw.requirements) ? raw.requirements : [];

  if (values.length === 0) {
    throw new Error('The requirements file is empty. Add requirement entries before running the acceptance matrix.');
  }

  return values.map((item) => {
    const requirement = item as {
      id?: unknown;
      description?: unknown;
      category?: unknown;
      acceptanceExpectation?: unknown;
      testIds?: unknown;
      threshold?: unknown;
    };
    const categoryValue = requirement.category ?? '';
    const acceptanceExpectation = typeof requirement.acceptanceExpectation === 'string' ? requirement.acceptanceExpectation.trim() : '';
    const thresholdValue = requirement.threshold;
    const threshold = thresholdValue !== undefined && thresholdValue !== null && thresholdValue !== ''
      ? Number(thresholdValue)
      : undefined;

    if (typeof requirement.id !== 'string' || requirement.id.trim() === '') {
      throw new Error('Every requirement needs a non-empty identifier.');
    }

    if (typeof requirement.description !== 'string' || requirement.description.trim() === '') {
      throw new Error(`Requirement ${requirement.id} is missing a description.`);
    }

    if (!REQUIREMENT_CATEGORIES.includes(categoryValue as RequirementCategory)) {
      throw new Error(`Requirement ${requirement.id} has an invalid category.`);
    }

    if (acceptanceExpectation.length === 0) {
      throw new Error(`Requirement ${requirement.id} has an empty acceptance expectation.`);
    }

    const category = categoryValue as RequirementCategory;
    if ((category === 'performance' || category === 'concurrency' || category === 'reliability') && (threshold === undefined || !Number.isFinite(threshold))) {
      throw new Error(`Requirement ${requirement.id} is missing a threshold for ${category}.`);
    }

    return {
      id: requirement.id,
      description: requirement.description,
      category,
      acceptanceExpectation,
      testIds: Array.isArray(requirement.testIds) ? requirement.testIds.filter((entry): entry is string => typeof entry === 'string') : [],
      threshold,
    };
  });
}

function normalizeStatus(rawStatus: string, reason?: string): ResultStatus {
  const status = rawStatus.trim().toLowerCase();

  if (status === 'pass' || status === 'passed') {
    return 'passed';
  }

  if (status === 'fail' || status === 'failed') {
    return 'failed';
  }

  if (status === 'skip' || status === 'skipped' || status === 'pending') {
    if (reason && /optional ai is not enabled|not been done|human study|not tested/i.test(reason)) {
      return 'not_tested';
    }
    return 'skipped';
  }

  return 'not_tested';
}

function parseVitestJson(filePath: string): ResultRecord[] {
  const payload = readJsonFile(filePath) as {
    results?: ResultRecord[];
    testResults?: Array<{
      assertionResults?: Array<{
        ancestorTitles?: string[];
        fullName?: string;
        title?: string;
        status?: string;
        duration?: number;
        file?: string;
        failureMessages?: string[];
      }>;
      startTime?: number;
      file?: string;
    }>;
  };

  const records: ResultRecord[] = [];

  const fileDate = new Date(statSync(filePath).mtimeMs).toISOString();
  const isBrowserReport = path.basename(filePath).toLowerCase() === 'vitest-browser.json';

  if (Array.isArray(payload.results)) {
    for (const item of payload.results) {
      if (item && typeof item === 'object' && 'id' in item) {
        records.push({
          ...item,
          suite: typeof item.suite === 'string' ? item.suite : 'synthetic-json',
          status: normalizeStatus(typeof item.status === 'string' ? item.status : 'unknown', typeof item.reason === 'string' ? item.reason : undefined),
          durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
          date: typeof item.date === 'string' ? item.date : fileDate,
          environment: typeof item.environment === 'string' ? item.environment : 'unknown',
          browser: typeof item.browser === 'string' ? item.browser : undefined,
          database: typeof item.database === 'string' ? item.database : undefined,
          serviceMode: item.serviceMode === 'stub' || item.serviceMode === 'real' ? item.serviceMode : undefined,
          reason: typeof item.reason === 'string' ? item.reason : undefined,
          measurement: typeof item.measurement === 'number' ? item.measurement : undefined,
          testName: typeof item.testName === 'string' ? item.testName : undefined,
          filePath: typeof item.filePath === 'string' ? item.filePath : filePath,
          id: String(item.id),
        });
      }
    }
    return records;
  }

  const testResults = Array.isArray(payload.testResults) ? payload.testResults : [];

  for (const testResult of testResults) {
    const assertions = Array.isArray(testResult.assertionResults) ? testResult.assertionResults : [];

    for (const assertion of assertions) {
      const names = [
        ...(Array.isArray(assertion.ancestorTitles) ? assertion.ancestorTitles : []),
        assertion.title ?? '',
      ].filter(Boolean);
      const detail = assertion.failureMessages?.join('\n') ?? '';
      const reason = assertion.status === 'skipped' ? detail || 'Skipped by test runner; the reason was not recorded.' : undefined;
      const testSourceFile = assertion.file ?? testResult.file;
      const testFile = testSourceFile ?? filePath;
      const testId = `${path.relative(process.cwd(), testFile).split(path.sep).join('/')} :: ${names.join(' :: ') || assertion.fullName || 'unnamed test'}`;
      const environment = testSourceFile
        ? /\.browser\.test\.(?:t|j)sx?$/.test(testSourceFile) ? 'browser test runner' : 'Node test runner'
        : isBrowserReport ? 'browser test runner' : 'Node test runner';

      records.push({
        id: testId,
        suite: 'vitest-json',
        status: normalizeStatus(assertion.status ?? 'unknown', reason),
        durationMs: typeof assertion.duration === 'number' ? Math.max(0, assertion.duration) : 0,
        date: typeof testResult.startTime === 'number' ? new Date(testResult.startTime).toISOString() : fileDate,
        environment,
        browser: environment === 'browser test runner' ? 'Chromium (Vitest browser provider)' : undefined,
        database: 'not recorded by Vitest result',
        reason,
        filePath: testSourceFile ?? undefined,
      });
    }
  }

  return records;
}

function extractJUnitRecords(filePath: string): ResultRecord[] {
  const content = readFileSync(filePath, 'utf8');
  const cases = content.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi);
  const records: ResultRecord[] = [];

  for (const match of cases) {
    const [, attributes, innerXml] = match;
    const testName = attributes.match(/\bname="([^"]*)"/i)?.[1] ?? 'unnamed test';
    const className = attributes.match(/\bclassname="([^"]*)"/i)?.[1];
    const durationValue = attributes.match(/\btime="([^"]*)"/i)?.[1] ?? '0';
    const durationMs = Number.parseFloat(durationValue || '0') * 1000;
    const escaped = innerXml ?? '';
    const hasFailure = /<failure/i.test(escaped);
    const skippedElement = escaped.match(/<skipped\b([^>]*)\/?>/i);
    const hasSkipped = skippedElement !== null;
    let reason: string | undefined;
    let status: ResultStatus = 'passed';

    if (hasFailure) {
      status = 'failed';
    } else if (hasSkipped) {
      status = 'skipped';
      reason = skippedElement?.[1].match(/\bmessage="([^"]*)"/i)?.[1] ?? 'Skipped by the test runner; the reason was not recorded.';
    }

    records.push({
      id: `${className ?? path.basename(filePath)} :: ${testName}`,
      suite: 'junit',
      status: normalizeStatus(status, reason),
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      date: new Date(statSync(filePath).mtimeMs).toISOString(),
      environment: 'JUnit test runner',
      database: 'not recorded by JUnit result',
      reason,
      testName,
      filePath: className,
    });
  }

  return records;
}

function parsePlainTextResult(filePath: string): ResultRecord[] {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const records: ResultRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^\|?\s*([A-Za-z0-9 _:/.-]+?)\s*(?:\||:|-)\s*(passed|failed|skipped|not[\s_-]*tested)\b/i);
    if (!match) {
      continue;
    }

    const id = match[1].trim();
    const rawStatus = match[2].toLowerCase().replace(/[\s-]+/g, '_');
    records.push({
      id,
      suite: 'plain-text',
      status: normalizeStatus(rawStatus, trimmed),
      durationMs: 0,
      date: new Date(statSync(filePath).mtimeMs).toISOString(),
      environment: 'plain-text result file',
      database: 'not recorded by plain-text result',
      reason: trimmed,
      filePath,
    });
  }

  return records;
}

function parseCsvResult(filePath: string): ResultRecord[] {
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const idIndex = headers.indexOf('id');
  const statusIndex = headers.indexOf('status');
  if (idIndex < 0 || statusIndex < 0) {
    return [];
  }

  const valueAt = (values: string[], name: string): string | undefined => {
    const index = headers.indexOf(name.toLowerCase());
    return index >= 0 ? values[index]?.trim() : undefined;
  };
  const fileDate = new Date(statSync(filePath).mtimeMs).toISOString();

  return lines.slice(1).flatMap((line): ResultRecord[] => {
    const values = line.split(',');
    const id = values[idIndex]?.trim();
    const status = values[statusIndex]?.trim();
    if (!id || !status) {
      return [];
    }

    const duration = Number(valueAt(values, 'durationMs'));
    const measurement = Number(valueAt(values, 'measurement'));
    const serviceMode = valueAt(values, 'serviceMode')?.toLowerCase();
    const record: ResultRecord = {
      id,
      suite: valueAt(values, 'suite') || path.basename(filePath, path.extname(filePath)),
      status: normalizeStatus(status, valueAt(values, 'reason')),
      durationMs: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      date: valueAt(values, 'date') || fileDate,
      environment: valueAt(values, 'environment') || 'not recorded in result file',
      browser: valueAt(values, 'browser'),
      database: valueAt(values, 'database'),
      serviceMode: serviceMode === 'stub' || serviceMode === 'real' ? serviceMode : undefined,
      reason: valueAt(values, 'reason'),
      measurement: Number.isFinite(measurement) ? measurement : undefined,
      screenshotPath: valueAt(values, 'screenshotPath'),
      filePath,
    };
    return [record];
  });
}

function addH14HumanStudyRecords(projectRoot: string): ResultRecord[] {
  const records: ResultRecord[] = [];
  const configPath = path.join(projectRoot, 'h14-questionnaire-config.json');
  const observationPath = path.join(projectRoot, 'h14-observation-sheet.md');
  const responsesPath = path.join(projectRoot, 'h14-questionnaire-responses.csv');
  const questionnaireOutputs: string[] = [
    path.join(projectRoot, 'h14-questionnaire-analysis.csv'),
    path.join(projectRoot, 'questionnaire-summary.csv'),
    path.join(projectRoot, 'questionnaire-analysis-output.csv'),
    path.join(projectRoot, 'analysis-output.csv'),
  ];
  const observationText = existsSync(observationPath) ? readFileSync(observationPath, 'utf8') : '';
  const taskNames = [
    'Login',
    'Start examination',
    'Answer multiple-choice question',
    'Answer short-answer question',
    'Answer essay question',
    'Navigate between questions',
    'Check save status',
    'Recover after interruption',
    'Submit and retrieve receipt',
  ];

  for (const taskName of taskNames) {
    const taskRow = observationText.split(/\r?\n/).find((line) => line.trim().startsWith(`| ${taskName} |`));
    const taskData = taskRow?.split('|').slice(2, -1).map((cell) => cell.trim()) ?? [];
    const hasTaskData = taskData.some((value) => value.length > 0);
    records.push({
      id: `h14-observation:${taskName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      suite: 'h14-human-observation',
      status: 'not_tested',
      durationMs: 0,
      date: '',
      environment: 'manual study; details not recorded',
      browser: 'manual',
      database: 'not recorded',
      reason: hasTaskData
        ? 'Observation data exists, but no proposal acceptance criteria are available to judge this task.'
        : 'H14 human study observation data has not been recorded for this task.',
      filePath: observationPath,
    });
  }

  const questionnaireConfig = existsSync(configPath)
    ? readJsonFile(configPath) as { items?: unknown[]; midpoint?: string | number; responseAnchors?: { minimumValue?: string | number; maximumValue?: string | number } }
    : null;
  const hasRecordedQuestionnaire = Boolean(
    questionnaireConfig
    && Array.isArray(questionnaireConfig.items)
    && questionnaireConfig.items.length > 0
    && (typeof questionnaireConfig.midpoint === 'number'
      || (typeof questionnaireConfig.midpoint === 'string' && questionnaireConfig.midpoint.trim().length > 0))
    && (typeof questionnaireConfig.responseAnchors?.minimumValue === 'number'
      || Boolean(questionnaireConfig.responseAnchors?.minimumValue?.trim()))
    && (typeof questionnaireConfig.responseAnchors?.maximumValue === 'number'
      || Boolean(questionnaireConfig.responseAnchors?.maximumValue?.trim())),
  );
  const analysisPath = questionnaireOutputs.find(existsSync);
  const analysisRows = analysisPath ? readFileSync(analysisPath, 'utf8').split(/\r?\n/) : [];
  const overallLine = analysisRows.find((line) => /^overall,/i.test(line.trim()));
  const rawOverallMeasurement = overallLine?.split(',')[1]?.trim();
  const overallMeasurement = rawOverallMeasurement ? Number(rawOverallMeasurement) : undefined;
  const hasQuestionnaireResponses = existsSync(responsesPath);
  const questionnaireEvidenceExists = hasQuestionnaireResponses || Boolean(analysisPath);
  const questionnaireDate = '';

  records.push({
    id: 'h14-questionnaire-overall',
    suite: 'h14-human-questionnaire',
    status: 'not_tested',
    durationMs: 0,
    date: questionnaireDate,
    environment: 'manual study; details not recorded',
    browser: 'manual',
    database: 'not recorded',
    measurement: typeof overallMeasurement === 'number' && Number.isFinite(overallMeasurement) ? overallMeasurement : undefined,
    reason: !questionnaireEvidenceExists
      ? 'H14 questionnaire response or analysis data is missing.'
      : !hasRecordedQuestionnaire
        ? 'Questionnaire data exists without the recorded proposal anchors and midpoint.'
        : 'Questionnaire measurements are available, but no proposal acceptance threshold is recorded.',
    filePath: analysisPath ?? (hasQuestionnaireResponses ? responsesPath : configPath),
  });

  return records;
}

function enforceRealServiceOnly(record: ResultRecord): ResultRecord {
  if (record.serviceMode === 'stub') {
    return {
      ...record,
      status: 'not_tested',
      reason: 'This result came from a stub and cannot be counted as real-service evidence.',
      serviceMode: 'stub',
    };
  }

  return record;
}

export function collectResults(requirementsPath: string, resultsDirectory: string, outputPath?: string): CollectedResultBundle {
  const requirements = readRequirements(requirementsPath);
  const requirementsDirectory = path.dirname(requirementsPath);
  const projectRoot = path.basename(requirementsDirectory).toLowerCase() === 'h15'
    && path.basename(path.dirname(requirementsDirectory)).toLowerCase() === 'scripts'
    ? path.resolve(requirementsDirectory, '..', '..')
    : requirementsDirectory;
  const resultMap = new Map<string, ResultRecord>();
  const files = findFilesUnder(resultsDirectory).filter((filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    return (extension === '.json' && /^vitest-(?:unit|browser)\.json$/.test(basename))
      || extension === '.xml'
      || (['.txt', '.csv'].includes(extension) && /(?:result|summary)/i.test(basename));
  });

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    const records = extension === '.json'
      ? parseVitestJson(filePath)
      : extension === '.xml'
        ? extractJUnitRecords(filePath)
        : extension === '.csv'
          ? parseCsvResult(filePath)
          : parsePlainTextResult(filePath);

    for (const record of records) {
      const cleaned = enforceRealServiceOnly(record);
      const previous = resultMap.get(cleaned.id);
      if (!previous || previous.date < cleaned.date) {
        resultMap.set(cleaned.id, cleaned);
      }
    }
  }

  const screenshotRoot = path.join(projectRoot, 'components', 'exam', '__tests__', '__screenshots__', 'hypothesis-test');
  const screenshotFiles = findFilesUnder(screenshotRoot).filter((filePath) => /\.(png|jpe?g|webp)$/i.test(filePath));
  for (const record of resultMap.values()) {
    if (record.screenshotPath) {
      const suppliedScreenshotPath = path.isAbsolute(record.screenshotPath)
        ? record.screenshotPath
        : path.resolve(projectRoot, record.screenshotPath);
      if (existsSync(suppliedScreenshotPath)) {
        record.screenshotPath = path.relative(projectRoot, suppliedScreenshotPath).split(path.sep).join('/');
        continue;
      }
      delete record.screenshotPath;
    }

    if (record.environment !== 'browser test runner') {
      continue;
    }

    const testFileName = record.filePath
      ? path.basename(record.filePath).replace(/\.browser\.test\.[^.]+$|\.test\.[^.]+$/i, '').toLowerCase()
      : '';
    const sourceText = `${record.id} ${record.testName ?? ''}`.toLowerCase();
    const evidence = screenshotFiles.find((filePath) => {
      if (!/[\\/]scenario-specific-ui-screenshots[\\/]/i.test(filePath)) {
        return false;
      }

      const screenshotName = path.basename(filePath, path.extname(filePath)).toLowerCase();
      if (screenshotName === testFileName) {
        return true;
      }
      const screenshotTerms = screenshotName.split(/[^a-z0-9]+/).filter(Boolean);
      return screenshotTerms.length > 1 && screenshotTerms.every((term) => sourceText.includes(term));
    });
    if (evidence) {
      record.screenshotPath = path.relative(projectRoot, evidence).split(path.sep).join('/');
    }
  }

  const h14Records = addH14HumanStudyRecords(projectRoot);
  for (const record of h14Records) {
    resultMap.set(record.id, record);
  }

  const results = Array.from(resultMap.values()).sort((left, right) => left.id.localeCompare(right.id));

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify({ requirements, results }, null, 2));
  }

  return {
    requirements,
    results,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , requirementsPath, resultsDirectory, outputPath] = process.argv;
  if (!requirementsPath || !resultsDirectory) {
    throw new Error('Usage: collect-results <requirements.json> <results-directory> [output.json]');
  }

  const bundle = collectResults(requirementsPath, resultsDirectory, outputPath);
  console.log(`Collected ${bundle.results.length} result records for ${bundle.requirements.length} requirements.`);
}
