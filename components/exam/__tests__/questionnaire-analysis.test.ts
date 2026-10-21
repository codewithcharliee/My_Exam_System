import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runQuestionnaireAnalysis } from '@/scripts/h14-questionnaire-analysis';

function writeFixtureFiles(config: Record<string, unknown>, csv: string): { configPath: string; csvPath: string; outputPath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'h14-questionnaire-'));
  const configPath = join(directory, 'h14-questionnaire-config.json');
  const csvPath = join(directory, 'responses.csv');
  const outputPath = join(directory, 'output.csv');

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  writeFileSync(csvPath, csv);

  return { configPath, csvPath, outputPath };
}

describe('Questionnaire analysis', () => {
  it('calculates the item means and midpoint comparisons for a complete data set', () => {
    const config = {
      questionnaireName: 'H14 test questionnaire',
      items: [
        { id: 'q1', label: 'Item 1', reversed: false },
        { id: 'q2', label: 'Item 2', reversed: true },
        { id: 'q3', label: 'Item 3', reversed: false },
      ],
      responseAnchors: {
        minimumLabel: 'Strongly disagree',
        midpointLabel: 'Neutral',
        maximumLabel: 'Strongly agree',
        minimumValue: 1,
        midpointValue: 3,
        maximumValue: 5,
      },
      midpoint: 3,
      reverseWordedItems: ['q2'],
    };

    const csv = 'participantCode,q1,q2,q3\np01,4,2,5\np02,3,5,\n';
    const fixture = writeFixtureFiles(config, csv);

    const result = runQuestionnaireAnalysis(fixture.configPath, fixture.csvPath, fixture.outputPath);

    expect(result.participantCount).toBe(2);
    expect(result.missingAnswers).toBe(1);
    expect(result.itemResults[0]?.mean).toBe(3.5);
    expect(result.itemResults[0]?.difference).toBe(0.5);
    expect(result.itemResults[0]?.comparison).toBe('above the midpoint');
    expect(result.itemResults[1]?.mean).toBe(2.5);
    expect(result.itemResults[1]?.difference).toBe(-0.5);
    expect(result.itemResults[1]?.comparison).toBe('below the midpoint');
    expect(result.itemResults[2]?.mean).toBe(5);
    expect(result.itemResults[2]?.difference).toBe(2);
    expect(result.itemResults[2]?.comparison).toBe('above the midpoint');
    expect(result.overallMean).toBeCloseTo(3.6666666666666665, 10);
    expect(result.overallDifference).toBeCloseTo(0.6666666666666665, 10);
    expect(result.overallComparison).toBe('above the midpoint');
    expect(result.reverseWordedItems).toContain('q2');
  });

  it('stops when a rating is outside the recorded anchors', () => {
    const config = {
      questionnaireName: 'Range check',
      items: [{ id: 'q1', label: 'Item 1', reversed: false }],
      responseAnchors: {
        minimumLabel: 'Low',
        midpointLabel: 'Neutral',
        maximumLabel: 'High',
        minimumValue: 1,
        midpointValue: 3,
        maximumValue: 5,
      },
      midpoint: 3,
      reverseWordedItems: [],
    };

    const csv = 'participantCode,q1\np01,6\n';
    const fixture = writeFixtureFiles(config, csv);

    expect(() => runQuestionnaireAnalysis(fixture.configPath, fixture.csvPath, fixture.outputPath)).toThrow(
      'A submitted rating falls outside the recorded questionnaire anchors.',
    );
  });

  it('stops when a submitted item is not in the configuration', () => {
    const config = {
      questionnaireName: 'Unknown item',
      items: [{ id: 'q1', label: 'Item 1', reversed: false }],
      responseAnchors: {
        minimumLabel: 'Low',
        midpointLabel: 'Neutral',
        maximumLabel: 'High',
        minimumValue: 1,
        midpointValue: 3,
        maximumValue: 5,
      },
      midpoint: 3,
      reverseWordedItems: [],
    };

    const csv = 'participantCode,q1,q2\np01,3,4\n';
    const fixture = writeFixtureFiles(config, csv);

    expect(() => runQuestionnaireAnalysis(fixture.configPath, fixture.csvPath, fixture.outputPath)).toThrow(
      'A submitted item does not exist in the questionnaire configuration.',
    );
  });

  it('stops when the configuration is incomplete', () => {
    const config = {
      questionnaireName: 'Incomplete',
      items: [],
      responseAnchors: {
        minimumLabel: '',
        midpointLabel: '',
        maximumLabel: '',
        minimumValue: '',
        midpointValue: '',
        maximumValue: '',
      },
      midpoint: '',
      reverseWordedItems: [],
    };

    const csv = 'participantCode,q1\np01,3\n';
    const fixture = writeFixtureFiles(config, csv);

    expect(() => runQuestionnaireAnalysis(fixture.configPath, fixture.csvPath, fixture.outputPath)).toThrow(
      'The existing questionnaire anchors and midpoint have not been recorded.',
    );
  });
});
