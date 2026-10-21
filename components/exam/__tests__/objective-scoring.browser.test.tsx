import { createElement, useState } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { scoreObjectiveAnswer } from '@/lib/scoring';

const h = createElement;
type QuestionRecord = {
  id: string;
  prompt: string;
  marks: number;
  correctOption: string;
  options: string[];
};

type ManualSelection = Record<string, string | null>;

type ObjectiveCase = {
  name: string;
  screenshot: string;
  questions: QuestionRecord[];
  selections: ManualSelection;
  expectedManualScore: number;
  expectedMaximum: number;
  expectedPattern: string;
};

type ResultRow = {
  caseName: string;
  manualScore: number | string;
  systemScore: number;
  difference: number | string;
  status: 'PASS' | 'FAIL' | 'PENDING';
};

const examOneQuestions: QuestionRecord[] = [
  { id: 'Q01', prompt: 'Q01', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q02', prompt: 'Q02', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q03', prompt: 'Q03', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q04', prompt: 'Q04', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q05', prompt: 'Q05', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q06', prompt: 'Q06', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q07', prompt: 'Q07', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q08', prompt: 'Q08', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q09', prompt: 'Q09', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q10', prompt: 'Q10', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q11', prompt: 'Q11', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q12', prompt: 'Q12', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q13', prompt: 'Q13', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q14', prompt: 'Q14', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q15', prompt: 'Q15', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q16', prompt: 'Q16', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q17', prompt: 'Q17', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q18', prompt: 'Q18', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q19', prompt: 'Q19', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q20', prompt: 'Q20', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
];

const examTwoQuestions: QuestionRecord[] = [
  { id: 'Q01', prompt: 'Q01', marks: 1, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q02', prompt: 'Q02', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q03', prompt: 'Q03', marks: 2, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q04', prompt: 'Q04', marks: 1, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q05', prompt: 'Q05', marks: 2, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q06', prompt: 'Q06', marks: 5, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q07', prompt: 'Q07', marks: 1, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q08', prompt: 'Q08', marks: 2, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q09', prompt: 'Q09', marks: 3, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q10', prompt: 'Q10', marks: 5, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q11', prompt: 'Q11', marks: 3, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q12', prompt: 'Q12', marks: 2, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q13', prompt: 'Q13', marks: 3, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q14', prompt: 'Q14', marks: 1, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q15', prompt: 'Q15', marks: 2, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q16', prompt: 'Q16', marks: 3, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q17', prompt: 'Q17', marks: 5, correctOption: 'A', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q18', prompt: 'Q18', marks: 3, correctOption: 'B', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q19', prompt: 'Q19', marks: 2, correctOption: 'C', options: ['A', 'B', 'C', 'D'] },
  { id: 'Q20', prompt: 'Q20', marks: 3, correctOption: 'D', options: ['A', 'B', 'C', 'D'] },
];

const caseResults: ResultRow[] = [];

function scoreQuestionSet(questions: QuestionRecord[], selections: ManualSelection): { score: number; maximum: number; rows: Array<{ questionId: string; selected: string | null; correctOption: string; marks: number; score: number; isCorrect: boolean; isUnanswered: boolean }> } {
  const rows = questions.map((question) => {
    const selected = selections[question.id] ?? null;
    const result = scoreObjectiveAnswer(selected, question.correctOption, question.marks);
    return {
      questionId: question.id,
      selected,
      correctOption: question.correctOption,
      marks: question.marks,
      score: result.score,
      isCorrect: result.isCorrect,
      isUnanswered: result.isUnanswered,
    };
  });

  const score = rows.reduce((total, row) => total + row.score, 0);
  const maximum = questions.reduce((total, question) => total + question.marks, 0);

  return { score, maximum, rows };
}

function getCaseManualScore(caseSpec: ObjectiveCase): number {
  return caseSpec.expectedManualScore;
}

function recordCaseResult(caseSpec: ObjectiveCase, actualScore: number): void {
  const manualScore = caseSpec.expectedManualScore;
  const difference = actualScore - caseSpec.expectedManualScore;
  const status = actualScore === caseSpec.expectedManualScore ? 'PASS' : 'FAIL';
  caseResults.push({ caseName: caseSpec.name, manualScore, systemScore: actualScore, difference, status });
}

function ObjectiveScoringPanel({ questions, initialSelections }: { questions: QuestionRecord[]; initialSelections: ManualSelection }) {
  const [selections, setSelections] = useState<ManualSelection>(initialSelections);
  const { score, maximum, rows } = scoreQuestionSet(questions, selections);

  return h(
    'main',
    { className: 'space-y-6' },
    h(Card, { className: 'mx-auto max-w-[980px] p-7' },
      h(CardHeader, { className: 'p-0' },
        h(CardTitle, { className: 'text-2xl' }, 'Objective scoring verification'),
        h(CardDescription, null, 'Bingham University examination score audit'),
      ),
      h(CardContent, { className: 'space-y-5 p-0' },
      h(
        Card,
        { className: 'flex items-center justify-between p-4' },
        h('div', { className: 'text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground' }, 'OBJECTIVE SCORE'),
        h('output', { 'aria-label': 'Objective score', className: 'text-3xl font-bold text-primary' }, `${score} / ${maximum}`),
      ),
      h(
        'div',
        { className: 'grid gap-4' },
        ...questions.map((question) => {
          const selected = selections[question.id] ?? null;
          return h(
            Card,
            {
              key: question.id,
              className: 'p-4',
            },
            h('div', { className: 'mb-2 font-semibold text-primary' }, `${question.id} — ${question.prompt}`),
            h(
              'div',
              { className: 'flex flex-wrap gap-3' },
              ...question.options.map((option) =>
                h(
                  'label',
                  {
                    key: `${question.id}-${option}`,
                    className: 'inline-flex items-center gap-1.5 text-sm',
                  },
                  h('input', {
                    type: 'radio',
                    name: question.id,
                    checked: selected === option,
                    'aria-label': `${question.id} option ${option}`,
                    value: option,
                    onChange: () => setSelections((previous) => ({ ...previous, [question.id]: option })),
                  }),
                  option,
                ),
              ),
            ),
          );
        }),
      ),
      h(
        Table,
        { className: 'text-sm' },
        h(
          TableHeader,
          null,
          h(TableRow, null,
            ...['Question', 'Selection', 'Marks', 'Outcome', 'Awarded'].map((heading) =>
              h(TableHead, { key: heading }, heading),
            ),
          ),
        ),
        h(
          TableBody,
          null,
          ...rows.map((row) => {
            const result = row.isUnanswered ? 'Unanswered' : row.isCorrect ? 'Correct' : 'Incorrect';
            return h(
              TableRow,
              { key: row.questionId },
              h(TableCell, null, row.questionId),
              h(TableCell, null, row.selected ?? 'Blank'),
              h(TableCell, null, String(row.marks)),
              h(TableCell, null, result),
              h(TableCell, null, String(row.score)),
            );
          }),
        ),
      ),
      ),
    ),
  );
}

const objectiveCases: ObjectiveCase[] = [
  {
    name: 'all correct answers',
    screenshot: 'h08/scenario-specific-ui-screenshots/all-correct-case',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question) => [question.id, question.correctOption])),
    expectedManualScore: 20,
    expectedMaximum: 20,
    expectedPattern: 'all correct',
  },
  {
    name: 'all wrong answers',
    screenshot: 'h08/scenario-specific-ui-screenshots/all-wrong',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question) => [question.id, question.options.find((option) => option !== question.correctOption) ?? 'A'])),
    expectedManualScore: 0,
    expectedMaximum: 20,
    expectedPattern: 'all wrong',
  },
  {
    name: 'only the first question is correct',
    screenshot: 'h08/scenario-specific-ui-screenshots/first-question-only',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index === 0 ? question.correctOption : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 1,
    expectedMaximum: 20,
    expectedPattern: 'first question only',
  },
  {
    name: 'only the last question is correct',
    screenshot: 'h08/scenario-specific-ui-screenshots/last-question-only',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index === examOneQuestions.length - 1 ? question.correctOption : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 1,
    expectedMaximum: 20,
    expectedPattern: 'last question only',
  },
  {
    name: 'alternating correct and wrong answers',
    screenshot: 'h08/scenario-specific-ui-screenshots/mixed-case',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index % 2 === 0 ? question.correctOption : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 10,
    expectedMaximum: 20,
    expectedPattern: 'alternating',
  },
  {
    name: 'exactly half of the questions are correct',
    screenshot: 'h08/scenario-specific-ui-screenshots/half-correct',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index < 10 ? question.correctOption : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 10,
    expectedMaximum: 20,
    expectedPattern: 'half correct',
  },
  {
    name: 'five unanswered questions',
    screenshot: 'h08/scenario-specific-ui-screenshots/five-unanswered',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index >= 15 ? null : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 0,
    expectedMaximum: 20,
    expectedPattern: 'five blanks',
  },
  {
    name: 'all questions left blank',
    screenshot: 'h08/scenario-specific-ui-screenshots/all-blank',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question) => [question.id, null])),
    expectedManualScore: 0,
    expectedMaximum: 20,
    expectedPattern: 'all blank',
  },
  {
    name: 'invalid option is treated as incorrect',
    screenshot: 'h08/scenario-specific-ui-screenshots/invalid-option',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index === 2 ? 'Z' : question.correctOption])),
    expectedManualScore: 19,
    expectedMaximum: 20,
    expectedPattern: 'invalid option',
  },
  {
    name: 'last answer wins when the same question is answered twice',
    screenshot: 'h08/scenario-specific-ui-screenshots/last-answer-wins',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index === 5 ? 'D' : question.correctOption])),
    expectedManualScore: 19,
    expectedMaximum: 20,
    expectedPattern: 'last answer wins',
  },
  {
    name: 'answer changed after saving',
    screenshot: 'h08/scenario-specific-ui-screenshots/changed-after-save',
    questions: examOneQuestions,
    selections: Object.fromEntries(examOneQuestions.map((question, index) => [question.id, index === 7 ? question.options[(question.options.indexOf(question.correctOption) + 2) % question.options.length] : question.correctOption])),
    expectedManualScore: 19,
    expectedMaximum: 20,
    expectedPattern: 'saved answer changed',
  },
  {
    name: 'weighted exam all correct',
    screenshot: 'h08/scenario-specific-ui-screenshots/weighted-all-correct',
    questions: examTwoQuestions,
    selections: Object.fromEntries(examTwoQuestions.map((question) => [question.id, question.correctOption])),
    expectedManualScore: 50,
    expectedMaximum: 50,
    expectedPattern: 'weighted all correct',
  },
  {
    name: 'weighted exam mixed pattern',
    screenshot: 'h08/scenario-specific-ui-screenshots/weighted-mixed',
    questions: examTwoQuestions,
    selections: Object.fromEntries(examTwoQuestions.map((question, index) => [question.id, index % 3 === 0 ? question.correctOption : question.options[(question.options.indexOf(question.correctOption) + 1) % question.options.length]])),
    expectedManualScore: 16,
    expectedMaximum: 50,
    expectedPattern: 'weighted mixed',
  },
  {
    name: 'weighted exam all blank',
    screenshot: 'h08/scenario-specific-ui-screenshots/weighted-all-blank',
    questions: examTwoQuestions,
    selections: Object.fromEntries(examTwoQuestions.map((question) => [question.id, null])),
    expectedManualScore: 0,
    expectedMaximum: 50,
    expectedPattern: 'weighted blank',
  },
];

describe('H08 — automatic objective scoring', () => {
  beforeEach(async () => {
    await page.viewport(1400, 1000);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(objectiveCases)('scores $name through the interface and captures its scenario evidence', async (caseSpec) => {
    const invalidOptionCase = caseSpec.name === 'invalid option is treated as incorrect';
    const changingAnswerCase = caseSpec.name === 'last answer wins when the same question is answered twice'
      || caseSpec.name === 'answer changed after saving';
    const initialSelections = invalidOptionCase
      ? caseSpec.selections
      : changingAnswerCase
        ? Object.fromEntries(caseSpec.questions.map((question) => [question.id, question.correctOption]))
        : {};
    render(h(ObjectiveScoringPanel, { questions: caseSpec.questions, initialSelections }));

    for (const question of caseSpec.questions) {
      const selected = caseSpec.selections[question.id] ?? null;
      if (selected !== null && question.options.includes(selected) && selected !== initialSelections[question.id]) {
        await page.getByRole('radio', { name: `${question.id} option ${selected}` }).click();
      }
    }

    const systemScore = scoreQuestionSet(caseSpec.questions, caseSpec.selections).score;
    await expect.element(page.getByLabelText('Objective score')).toHaveTextContent(`${systemScore} / ${caseSpec.expectedMaximum}`);
    recordCaseResult(caseSpec, systemScore);
    expect(systemScore).toBe(getCaseManualScore(caseSpec));
    window.scrollTo(0, 0);
    await expect(page).toMatchScreenshot(caseSpec.screenshot);
  });

  it('scores the weighted examination cases directly through the real scoring handler and confirms they match the manual score sheet', () => {
    const weightedCases = objectiveCases.slice(11);

    for (const caseSpec of weightedCases) {
      const actualScore = scoreQuestionSet(caseSpec.questions, caseSpec.selections).score;
      const expectation = getCaseManualScore(caseSpec);
      expect(actualScore).toBe(expectation);
      expect(actualScore).toBeLessThanOrEqual(caseSpec.expectedMaximum);
    }
  });

  it('confirms every objective case is zero when blank, incorrect, or unavailable, and that blank answers do not reduce the score below zero', () => {
    const blankCases = objectiveCases.filter((caseSpec) => caseSpec.name === 'all wrong answers' || caseSpec.name === 'all questions left blank' || caseSpec.name === 'five unanswered questions');

    for (const caseSpec of blankCases) {
      const actualScore = scoreQuestionSet(caseSpec.questions, caseSpec.selections).score;
      const expectation = getCaseManualScore(caseSpec);
      expect(actualScore).toBe(expectation);
      expect(actualScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('confirms the answer key and score sheet remain aligned for single-question and edge-case patterns', () => {
    const edgeCases = [
      objectiveCases[2],
      objectiveCases[3],
      objectiveCases[5],
      objectiveCases[8],
      objectiveCases[9],
      objectiveCases[10],
    ];

    for (const caseSpec of edgeCases) {
      const actualScore = scoreQuestionSet(caseSpec.questions, caseSpec.selections).score;
      const expectation = getCaseManualScore(caseSpec);
      expect(actualScore).toBe(expectation);
    }
  });

  it('prints the results table and confirms every score matches the independent manual sheet', () => {
    const tableText = caseResults
      .map((row) => `${row.caseName} | ${String(row.manualScore)} | ${String(row.systemScore)} | ${String(row.difference)} | ${row.status}`)
      .join('\n');

    console.log(tableText);
    console.log(`Final overall result: ${caseResults.some((row) => row.status === 'FAIL' || row.status === 'PENDING') ? 'FAIL' : 'PASS'}`);

    expect(caseResults.some((row) => row.status === 'FAIL' || row.status === 'PENDING')).toBe(false);
  });
});
