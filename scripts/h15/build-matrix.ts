import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategorySummary, buildConclusion, buildMatrixMarkdown, buildMatrixRows, renderCsv, type CategorySummary, type ConclusionContext, type MatrixRow } from '@/lib/h15-acceptance';
import { readRequirements, type CollectedResultBundle } from './collect-results';

export type { CategorySummary, ConclusionContext, MatrixRow, MatrixStatus, RequirementCategory, RequirementRecord, ResultRecord, ResultStatus } from '@/lib/h15-acceptance';
export { buildCategorySummary, buildConclusion, buildMatrixMarkdown, buildMatrixRows, renderCsv };

export function buildMatrix(requirementsPath: string, resultsPath: string): { rows: MatrixRow[]; categorySummaries: CategorySummary[] } {
  const requirements = readRequirements(requirementsPath);
  const raw = JSON.parse(readFileSync(resultsPath, 'utf8')) as CollectedResultBundle;
  const results = Array.isArray(raw.results) ? raw.results : [];
  const rows = buildMatrixRows(requirements, results);
  const categorySummaries = buildCategorySummary(rows);
  return { rows, categorySummaries };
}

const UNRECORDED_CONDITIONS: ConclusionContext = {
  environment: 'not recorded',
  browsers: 'not recorded',
  participants: 'not recorded',
  loadLevels: 'not recorded',
};

function readConclusionContext(contextPath?: string): ConclusionContext {
  if (!contextPath) {
    return UNRECORDED_CONDITIONS;
  }

  const context = JSON.parse(readFileSync(contextPath, 'utf8')) as Partial<ConclusionContext>;
  const { environment, browsers, participants, loadLevels } = context;
  if (typeof environment !== 'string' || environment.trim().length === 0) {
    throw new Error('Conclusion conditions file is missing environment.');
  }
  if (typeof browsers !== 'string' || browsers.trim().length === 0) {
    throw new Error('Conclusion conditions file is missing browsers.');
  }
  if (typeof participants !== 'string' || participants.trim().length === 0) {
    throw new Error('Conclusion conditions file is missing participants.');
  }
  if (typeof loadLevels !== 'string' || loadLevels.trim().length === 0) {
    throw new Error('Conclusion conditions file is missing loadLevels.');
  }

  return { environment, browsers, participants, loadLevels };
}

export function writeMatrixOutputs(
  matrixPath: string,
  rows: MatrixRow[],
  categorySummaries: CategorySummary[],
  context: ConclusionContext = UNRECORDED_CONDITIONS,
): { csvPath: string; markdownPath: string; conclusionPath: string } {
  const csvPath = `${matrixPath}.csv`;
  const markdownPath = `${matrixPath}.md`;
  const conclusionPath = `${matrixPath}.conclusion.md`;

  writeFileSync(csvPath, renderCsv(rows));
  writeFileSync(markdownPath, buildMatrixMarkdown(rows, categorySummaries));
  writeFileSync(conclusionPath, `## Conclusion\n\n${buildConclusion(rows, context)}\n`);

  return { csvPath, markdownPath, conclusionPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , requirementsPath, resultsPath, matrixPath, conditionsPath] = process.argv;
  if (!requirementsPath || !resultsPath || !matrixPath) {
    throw new Error('Usage: build-matrix <requirements.json> <results.json> <matrix-output-base> [conditions.json]');
  }

  const { rows, categorySummaries } = buildMatrix(requirementsPath, resultsPath);
  const outputs = writeMatrixOutputs(matrixPath, rows, categorySummaries, readConclusionContext(conditionsPath));
  console.log(`Matrix written to ${outputs.csvPath}, ${outputs.markdownPath}, and ${outputs.conclusionPath}.`);
}
