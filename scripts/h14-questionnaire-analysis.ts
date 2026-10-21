import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type QuestionnaireItem = {
  id: string;
  label: string;
  reversed?: boolean;
};

export type QuestionnaireConfig = {
  questionnaireName: string;
  items: QuestionnaireItem[];
  responseAnchors: {
    minimumLabel: string;
    midpointLabel: string;
    maximumLabel: string;
    minimumValue: string | number;
    midpointValue: string | number;
    maximumValue: string | number;
  };
  midpoint: string | number;
  reverseWordedItems: string[];
};

export type ItemComparison = 'above the midpoint' | 'at the midpoint' | 'below the midpoint';

export type ItemResult = {
  itemId: string;
  mean: number;
  difference: number;
  comparison: ItemComparison;
  reversed: boolean;
};

export type AnalysisResult = {
  itemResults: ItemResult[];
  overallMean: number;
  overallDifference: number;
  overallComparison: ItemComparison;
  participantCount: number;
  missingAnswers: number;
  reverseWordedItems: string[];
  csvOutputPath: string;
};

function isBlank(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value);
  }

  return value.trim() === '';
}

function normalizeNumeric(value: string | number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error('The existing questionnaire anchors and midpoint have not been recorded.');
  }
  return numericValue;
}

function parseCsvRows(filePath: string): Array<Record<string, string>> {
  const rawContent = readFileSync(filePath, 'utf8');
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(',').map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim());
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return record;
  });
}

function determineComparison(value: number, midpoint: number): ItemComparison {
  if (Math.abs(value - midpoint) < 1e-9) {
    return 'at the midpoint';
  }
  return value > midpoint ? 'above the midpoint' : 'below the midpoint';
}

function validateConfiguration(config: Partial<QuestionnaireConfig>): QuestionnaireConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('The existing questionnaire anchors and midpoint have not been recorded.');
  }

  const items = Array.isArray(config.items) ? config.items : [];
  const responseAnchors = config.responseAnchors ?? {};
  const minimumValue = responseAnchors.minimumValue ?? config.midpoint ?? '';
  const midpointValue = responseAnchors.midpointValue ?? config.midpoint ?? '';
  const maximumValue = responseAnchors.maximumValue ?? config.midpoint ?? '';

  if (
    isBlank(config.midpoint)
    || isBlank(minimumValue)
    || isBlank(midpointValue)
    || isBlank(maximumValue)
    || !Array.isArray(config.items)
    || items.length === 0
  ) {
    throw new Error('The existing questionnaire anchors and midpoint have not been recorded.');
  }

  return {
    questionnaireName: typeof config.questionnaireName === 'string' ? config.questionnaireName : '',
    items: items.map((item) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? ''),
      reversed: Boolean(item.reversed),
    })),
    responseAnchors: {
      minimumLabel: typeof responseAnchors.minimumLabel === 'string' ? responseAnchors.minimumLabel : '',
      midpointLabel: typeof responseAnchors.midpointLabel === 'string' ? responseAnchors.midpointLabel : '',
      maximumLabel: typeof responseAnchors.maximumLabel === 'string' ? responseAnchors.maximumLabel : '',
      minimumValue: minimumValue,
      midpointValue: midpointValue,
      maximumValue: maximumValue,
    },
    midpoint: config.midpoint,
    reverseWordedItems: Array.isArray(config.reverseWordedItems) ? config.reverseWordedItems.map((itemId) => String(itemId)) : [],
  };
}

export function runQuestionnaireAnalysis(configPath: string, responsesPath: string, outputPath: string): AnalysisResult {
  const config = validateConfiguration(JSON.parse(readFileSync(configPath, 'utf8')) as Partial<QuestionnaireConfig>);
  const itemMap = new Map<string, QuestionnaireItem>();
  config.items.forEach((item) => {
    itemMap.set(item.id, item);
  });

  const minimumValue = normalizeNumeric(config.responseAnchors.minimumValue);
  const midpointValue = normalizeNumeric(config.midpoint);
  const maximumValue = normalizeNumeric(config.responseAnchors.maximumValue);
  const reverseWordedIds = new Set<string>(config.reverseWordedItems);

  const rows = parseCsvRows(responsesPath);
  if (rows.length === 0) {
    throw new Error('The response file does not contain participant responses.');
  }

  const headerKeys = Object.keys(rows[0] ?? {});
  const participantKey = headerKeys.find((key) => key.toLowerCase() === 'participantcode' || key.toLowerCase() === 'participant_code' || key.toLowerCase() === 'participant code');
  if (!participantKey) {
    throw new Error('The response file must include a participant code column.');
  }

  const knownItems = config.items.map((item) => item.id);
  const unknownHeaders = headerKeys.filter((header) => header !== participantKey && !knownItems.includes(header));
  if (unknownHeaders.length > 0) {
    throw new Error('A submitted item does not exist in the questionnaire configuration.');
  }

  const itemTotals = new Map<string, number[]>();
  const reversedItemIds = new Set<string>([]);
  let missingAnswers = 0;

  config.items.forEach((item) => {
    itemTotals.set(item.id, []);
  });

  rows.forEach((row) => {
    config.items.forEach((item) => {
      const rawValue = row[item.id];
      if (rawValue === undefined || rawValue === '') {
        missingAnswers += 1;
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue) || numericValue < minimumValue || numericValue > maximumValue) {
        throw new Error('A submitted rating falls outside the recorded questionnaire anchors.');
      }

      const isReversed = item.reversed || reverseWordedIds.has(item.id);
      if (isReversed) {
        reversedItemIds.add(item.id);
      }

      const adjustedValue = isReversed ? minimumValue + maximumValue - numericValue : numericValue;
      const valuesForItem = itemTotals.get(item.id) ?? [];
      valuesForItem.push(adjustedValue);
      itemTotals.set(item.id, valuesForItem);
    });
  });

  const itemResults: ItemResult[] = config.items.map((item) => {
    const values = itemTotals.get(item.id) ?? [];
    const mean = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
    const difference = mean - midpointValue;
    return {
      itemId: item.id,
      mean,
      difference,
      comparison: determineComparison(mean, midpointValue),
      reversed: item.reversed || reverseWordedIds.has(item.id),
    };
  });

  const overallValues: number[] = [];
  itemResults.forEach((item) => {
    overallValues.push(item.mean);
  });
  const overallMean = overallValues.length === 0 ? 0 : overallValues.reduce((sum, value) => sum + value, 0) / overallValues.length;
  const overallDifference = overallMean - midpointValue;
  const overallComparison = determineComparison(overallMean, midpointValue);

  const outputRows = [
    { item: 'item', mean: 'mean', difference: 'difference', comparison: 'comparison' },
    ...itemResults.map((result) => ({
      item: result.itemId,
      mean: result.mean.toFixed(2),
      difference: result.difference.toFixed(2),
      comparison: result.comparison,
    })),
    {
      item: 'overall',
      mean: overallMean.toFixed(2),
      difference: overallDifference.toFixed(2),
      comparison: overallComparison,
    },
  ];

  const csvContent = outputRows
    .map((row) => Object.values(row).join(','))
    .join('\n');

  const resolvedOutputPath = resolve(outputPath);
  writeFileSync(resolvedOutputPath, `${csvContent}\n`);

  const consoleLines = [
    'Questionnaire analysis',
    `Participants: ${rows.length}`,
    `Missing answers: ${missingAnswers}`,
    `Reverse-worded items adjusted: ${Array.from(reversedItemIds).join(', ') || 'none'}`,
    'item,mean,difference,comparison',
    ...itemResults.map((result) => `${result.itemId},${result.mean.toFixed(2)},${result.difference.toFixed(2)},${result.comparison}`),
    `overall,${overallMean.toFixed(2)},${overallDifference.toFixed(2)},${overallComparison}`,
  ];

  console.log(consoleLines.join('\n'));

  return {
    itemResults,
    overallMean,
    overallDifference,
    overallComparison,
    participantCount: rows.length,
    missingAnswers,
    reverseWordedItems: Array.from(reversedItemIds),
    csvOutputPath: resolvedOutputPath,
  };
}

const configArgumentIndex = process.argv.indexOf('--config');
const responsesArgumentIndex = process.argv.indexOf('--responses');
const outputArgumentIndex = process.argv.indexOf('--output');

if (configArgumentIndex >= 0 && responsesArgumentIndex >= 0) {
  const configPath = process.argv[configArgumentIndex + 1];
  const responsesPath = process.argv[responsesArgumentIndex + 1];
  const outputPath = outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : resolve(dirname(configPath), 'h14-questionnaire-analysis.csv');

  if (configPath && responsesPath) {
    runQuestionnaireAnalysis(configPath, responsesPath, outputPath);
  }
}
