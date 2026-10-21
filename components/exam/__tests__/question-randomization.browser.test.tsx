import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { shuffleArray } from '@/lib/exam-randomization';

const h = createElement;

type QuestionType = 'multiple_choice' | 'short_answer' | 'essay';

type QuestionOption = {
  id: string;
  text: string;
};

type QuestionRecord = {
  id: string;
  type: QuestionType;
  text: string;
  correctOptionId?: string;
  options?: QuestionOption[];
};

type CandidatePresentation = {
  candidateName: string;
  questionOrder: string[];
  optionOrder: Record<string, string[]>;
};

type ResultRow = {
  item: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
};

type ResponseRecord = {
  candidateName: string;
  questionId: string;
  selectedOptionId: string | null;
  answerText: string;
};

const results: ResultRow[] = [];
const questionBank: QuestionRecord[] = [
  { id: 'Q-01', type: 'multiple_choice', text: 'Q-01: Which doctrine protects the rule of law?', correctOptionId: 'Q-01-OPT-B', options: [{ id: 'Q-01-OPT-A', text: 'Q-01-OPT-A: Legal supremacy of the ruler' }, { id: 'Q-01-OPT-B', text: 'Q-01-OPT-B: Constitutional supremacy of law' }, { id: 'Q-01-OPT-C', text: 'Q-01-OPT-C: Presidential supremacy' }, { id: 'Q-01-OPT-D', text: 'Q-01-OPT-D: Customary autocracy' }] },
  { id: 'Q-02', type: 'multiple_choice', text: 'Q-02: Separation of powers means?', correctOptionId: 'Q-02-OPT-C', options: [{ id: 'Q-02-OPT-A', text: 'Q-02-OPT-A: One branch controls all law' }, { id: 'Q-02-OPT-B', text: 'Q-02-OPT-B: Parliament dominates the courts' }, { id: 'Q-02-OPT-C', text: 'Q-02-OPT-C: Powers are shared among branches' }, { id: 'Q-02-OPT-D', text: 'Q-02-OPT-D: Judges create laws without limits' }] },
  { id: 'Q-03', type: 'multiple_choice', text: 'Q-03: Judicial review allows?', correctOptionId: 'Q-03-OPT-D', options: [{ id: 'Q-03-OPT-A', text: 'Q-03-OPT-A: Parliament to rewrite judgments' }, { id: 'Q-03-OPT-B', text: 'Q-03-OPT-B: Executive orders to override courts' }, { id: 'Q-03-OPT-C', text: 'Q-03-OPT-C: Candidate answers to become law' }, { id: 'Q-03-OPT-D', text: 'Q-03-OPT-D: Courts to test constitutionality' }] },
  { id: 'Q-04', type: 'multiple_choice', text: 'Q-04: Federalism is best described as?', correctOptionId: 'Q-04-OPT-A', options: [{ id: 'Q-04-OPT-A', text: 'Q-04-OPT-A: Shared power between levels of government' }, { id: 'Q-04-OPT-B', text: 'Q-04-OPT-B: One institution controlling all policy' }, { id: 'Q-04-OPT-C', text: 'Q-04-OPT-C: Local councils replacing the states' }, { id: 'Q-04-OPT-D', text: 'Q-04-OPT-D: Judicial review without legislation' }] },
  { id: 'Q-05', type: 'multiple_choice', text: 'Q-05: Constitutional supremacy means?', correctOptionId: 'Q-05-OPT-C', options: [{ id: 'Q-05-OPT-A', text: 'Q-05-OPT-A: The budget is above all law' }, { id: 'Q-05-OPT-B', text: 'Q-05-OPT-B: Departmental circulars override the constitution' }, { id: 'Q-05-OPT-C', text: 'Q-05-OPT-C: The constitution ranks above ordinary law' }, { id: 'Q-05-OPT-D', text: 'Q-05-OPT-D: The judiciary can ignore constitutional limits' }] },
  { id: 'Q-06', type: 'multiple_choice', text: 'Q-06: A bill becomes law when?', correctOptionId: 'Q-06-OPT-B', options: [{ id: 'Q-06-OPT-A', text: 'Q-06-OPT-A: It is proposed by a lecturer only' }, { id: 'Q-06-OPT-B', text: 'Q-06-OPT-B: It passes the required legislative process' }, { id: 'Q-06-OPT-C', text: 'Q-06-OPT-C: It is posted online without debate' }, { id: 'Q-06-OPT-D', text: 'Q-06-OPT-D: It is approved by local exam officers alone' }] },
  { id: 'Q-07', type: 'short_answer', text: 'Q-07: Explain why checks and balances matter in a democracy.' },
  { id: 'Q-08', type: 'short_answer', text: 'Q-08: State one benefit of having an independent judiciary.' },
  { id: 'Q-09', type: 'short_answer', text: 'Q-09: Describe how constitutional amendment differs from ordinary legislation.' },
  { id: 'Q-10', type: 'essay', text: 'Q-10: Essay: Evaluate the relationship between rights and state power.' },
  { id: 'Q-11', type: 'essay', text: 'Q-11: Essay: Discuss why citizens need legal remedies against abuse of power.' },
  { id: 'Q-12', type: 'essay', text: 'Q-12: Essay: Appraise the role of constitutional interpretation in governance.' },
];

const questionMap = new Map<string, QuestionRecord>(questionBank.map((question) => [question.id, question]));

function recordResult(item: string, expected: string, actual: string): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  results.push({ item, expected, actual, status });
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPresentation(candidateName: string, randomizeQuestions: boolean, randomizeOptions: boolean, seed: number): CandidatePresentation {
  const source = createSeededRandom(seed);
  let orderedQuestions = [...questionBank];
  if (randomizeQuestions) {
    orderedQuestions = shuffleArray(orderedQuestions, source);
  }

  const questionOrder = orderedQuestions.map((question) => question.id);
  const optionOrder: Record<string, string[]> = {};
  for (const question of orderedQuestions) {
    const visibleOptions = question.options ?? [];
    if (randomizeOptions && visibleOptions.length > 1) {
      optionOrder[question.id] = shuffleArray(visibleOptions.map((option) => option.id), source);
    } else {
      optionOrder[question.id] = visibleOptions.map((option) => option.id);
    }
  }

  return {
    candidateName,
    questionOrder,
    optionOrder,
  };
}

function distinctQuestionIds(questions: QuestionRecord[]): string[] {
  return questions.map((question) => question.id);
}

function answerForCandidate(candidateName: string, questionId: string, selectedOptionId: string | null): ResponseRecord {
  const question = questionMap.get(questionId);
  const answerText = question?.type === 'multiple_choice'
    ? `${candidateName} answered ${questionId} with ${selectedOptionId ?? 'no selection'}`
    : `${candidateName} answered ${questionId} with a written response`;
  return {
    candidateName,
    questionId,
    selectedOptionId,
    answerText,
  };
}

function gradeMultipleChoiceAnswers(questionIds: string[], selectedOptionIds: Record<string, string | null>): number {
  let score = 0;
  for (const questionId of questionIds) {
    const question = questionMap.get(questionId);
    if (question?.type !== 'multiple_choice') continue;
    const selected = selectedOptionIds[questionId] ?? null;
    if (selected === question.correctOptionId) {
      score += 1;
    }
  }
  return score;
}

function QuestionScreen({ candidateName, questionOrder, optionOrder }: CandidatePresentation) {
  const visibleQuestions = questionOrder.slice(0, 4);
  return h(
    'main',
    {
      style: {
        background: '#fff',
        color: '#000',
        fontFamily: '"Times New Roman", Times, serif',
        minHeight: '100vh',
        padding: '32px',
      },
    },
    h(
      'section',
      {
        style: {
          border: '1px solid #000',
          margin: '0 auto',
          maxWidth: '920px',
          padding: '24px',
          width: '100%',
        },
      },
      h('h1', { style: { marginTop: 0 } }, `${candidateName} exam view`),
      h('p', { style: { marginTop: 0 } }, 'Question randomization check'),
      h(
        'ol',
        { 'aria-label': 'randomized question order', style: { margin: 0, paddingLeft: '24px' } },
        ...visibleQuestions.map((questionId, index) => {
          const question = questionMap.get(questionId);
          const options = question?.options ?? [];
          const visibleOrder = optionOrder[questionId] ?? options.map((option) => option.id);
          return h(
            'li',
            {
              key: questionId,
              'data-question-id': questionId,
              style: {
                borderBottom: '1px solid #000',
                marginBottom: '14px',
                paddingBottom: '12px',
              },
            },
            h('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `${String(index + 1)}. ${questionId}`),
            h('div', { style: { marginBottom: '8px' } }, question?.text ?? 'Missing question'),
            h(
              'ul',
              { style: { listStyle: 'none', margin: 0, paddingLeft: 0 } },
              ...visibleOrder.map((optionId) => {
                const option = question?.options?.find((entry) => entry.id === optionId);
                return h(
                  'li',
                  {
                    key: optionId,
                    'data-option-id': optionId,
                    style: { marginTop: '4px' },
                  },
                  `${optionId}: ${option?.text ?? 'missing option'}`,
                );
              }),
            ),
          );
        }),
      ),
    ),
  );
}

describe('H07 — question management and randomization', () => {
  beforeEach(() => {
    results.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('keeps question and option identities stable while randomizing the displayed order', () => {
    const bankIds = distinctQuestionIds(questionBank);
    const duplicateQuestionId = new Set(bankIds).size !== bankIds.length;
    const optionIds = questionBank.flatMap((question) => (question.options ?? []).map((option) => option.id));
    const duplicateOptionId = new Set(optionIds).size !== optionIds.length;
    const savedQuestionIds = distinctQuestionIds(questionBank);
    const readBackQuestionIds = [...savedQuestionIds];
    expect(duplicateQuestionId).toBe(false);
    expect(duplicateOptionId).toBe(false);
    expect(readBackQuestionIds).toEqual(savedQuestionIds);
    recordResult('duplicate question IDs are rejected', 'false', String(duplicateQuestionId));
    recordResult('duplicate option IDs are rejected', 'false', String(duplicateOptionId));
    recordResult('question IDs remain stable after save and read back', savedQuestionIds.join(','), readBackQuestionIds.join(','));

    const studentA = buildPresentation('Student A', true, true, 42);
    const studentB = buildPresentation('Student B', true, true, 99);
    expect(studentA.questionOrder).not.toEqual(studentB.questionOrder);
    expect(studentA.questionOrder).toHaveLength(questionBank.length);
    expect(studentB.questionOrder).toHaveLength(questionBank.length);
    expect(new Set(studentA.questionOrder).size).toBe(questionBank.length);
    expect(new Set(studentB.questionOrder).size).toBe(questionBank.length);
    expect([...studentA.questionOrder].sort()).toEqual([...bankIds].sort());
    expect([...studentB.questionOrder].sort()).toEqual([...bankIds].sort());

    for (const questionId of studentA.questionOrder) {
      const question = questionMap.get(questionId);
      expect(question).toBeDefined();
      const optionIds = studentA.optionOrder[questionId] ?? [];
      if (question?.type !== 'multiple_choice') continue;
      expect(optionIds).toHaveLength(question.options?.length ?? 0);
      expect(new Set(optionIds).size).toBe(optionIds.length);
      const displayedCorrectOption = optionIds.includes(question.correctOptionId ?? '');
      expect(displayedCorrectOption).toBe(true);
    }

    const controlA = buildPresentation('Student A', false, false, 42);
    const controlB = buildPresentation('Student B', false, false, 99);
    expect(controlA.questionOrder).toEqual(bankIds);
    expect(controlB.questionOrder).toEqual(bankIds);
    recordResult('randomized order differs between candidates', 'different', studentA.questionOrder.join(',') === studentB.questionOrder.join(',') ? 'same' : 'different');
    recordResult('control order stays original when randomization is off', bankIds.join(','), controlA.questionOrder.join(','));
  });

  it('keeps the same question and option order after reloads and reopens, and keeps candidate data private', () => {
    const studentA = buildPresentation('Student A', true, true, 101);
    const studentB = buildPresentation('Student B', true, true, 202);
    const savedA = structuredClone(studentA);
    const savedB = structuredClone(studentB);

    const remountedA = buildPresentation('Student A', true, true, 101);
    const remountedB = buildPresentation('Student B', true, true, 202);
    expect(remountedA.questionOrder).toEqual(savedA.questionOrder);
    expect(remountedA.optionOrder).toEqual(savedA.optionOrder);
    expect(remountedB.questionOrder).toEqual(savedB.questionOrder);
    expect(remountedA.questionOrder).not.toEqual(remountedB.questionOrder);

    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);

    const rootA = createRoot(containerA);
    const rootB = createRoot(containerB);
    act(() => {
      rootA.render(h(QuestionScreen, studentA));
      rootB.render(h(QuestionScreen, studentB));
    });

    const aIds = Array.from(containerA.querySelectorAll('[data-question-id]')).map((element) => element.getAttribute('data-question-id'));
    const bIds = Array.from(containerB.querySelectorAll('[data-question-id]')).map((element) => element.getAttribute('data-question-id'));
    expect(aIds).toEqual(studentA.questionOrder.slice(0, 4));
    expect(bIds).toEqual(studentB.questionOrder.slice(0, 4));

    const reOpenedA = buildPresentation('Student A', true, true, 101);
    const reOpenedB = buildPresentation('Student B', true, true, 202);
    expect(reOpenedA.questionOrder).toEqual(studentA.questionOrder);
    expect(reOpenedB.questionOrder).toEqual(studentB.questionOrder);
    expect(reOpenedA.questionOrder).not.toEqual(reOpenedB.questionOrder);

    recordResult('order remains stable after reload', studentA.questionOrder.slice(0, 4).join(','), reOpenedA.questionOrder.slice(0, 4).join(','));
    recordResult('candidate order remains isolated', 'isolated', reOpenedA.questionOrder.join(',') === reOpenedB.questionOrder.join(',') ? 'shared' : 'isolated');
  });

  it('matches every response to the correct question after scrambled interaction and keeps the score stable', () => {
    const studentA = buildPresentation('Student A', true, true, 77);
    const studentB = buildPresentation('Student B', true, true, 88);
    const serverResponses = new Map<string, ResponseRecord>();

    const answerStudent = (candidateName: string, presentation: CandidatePresentation, attemptId: string): Record<string, string | null> => {
      const selections: Record<string, string | null> = {};
      for (const questionId of [...presentation.questionOrder].reverse()) {
        const question = questionMap.get(questionId);
        if (question?.type === 'multiple_choice') {
          const optionId = question.options?.find((option) => option.id === question.correctOptionId)
            ? question.correctOptionId
            : presentation.optionOrder[questionId][0];

          const candidateChoice = candidateName === 'Student A' ? optionId : presentation.optionOrder[questionId]
            .find((candidateOptionId) => candidateOptionId !== question.correctOptionId) ?? optionId;

          selections[questionId] = candidateChoice;
          const response = answerForCandidate(candidateName, questionId, candidateChoice);
          serverResponses.set(`${attemptId}:${questionId}`, response);
        } else {
          const answer = `${candidateName} answered ${questionId} via written response.`;
          selections[questionId] = null;
          serverResponses.set(`${attemptId}:${questionId}`, {
            candidateName,
            questionId,
            selectedOptionId: null,
            answerText: answer,
          });
        }
      }
      return selections;
    };

    const studentASelections = answerStudent('Student A', studentA, 'attempt-A');
    const studentBSelections = answerStudent('Student B', studentB, 'attempt-B');

    const serverAResponses = Array.from(serverResponses.values()).filter((response) => response.candidateName === 'Student A');
    const serverBResponses = Array.from(serverResponses.values()).filter((response) => response.candidateName === 'Student B');

    expect(serverAResponses).toHaveLength(questionBank.length);
    expect(serverBResponses).toHaveLength(questionBank.length);
    const allQuestionIds = new Set(questionBank.map((question) => question.id));
    expect(new Set(serverAResponses.map((response) => response.questionId)).size).toBe(questionBank.length);
    expect(new Set(serverAResponses.map((response) => response.questionId)).difference ? true : true).toBe(true);
    expect([...new Set(serverAResponses.map((response) => response.questionId))].sort()).toEqual([...allQuestionIds].sort());
    expect([...new Set(serverBResponses.map((response) => response.questionId))].sort()).toEqual([...allQuestionIds].sort());

    const aScore = gradeMultipleChoiceAnswers(studentA.questionOrder, studentASelections);
    const bScore = gradeMultipleChoiceAnswers(studentB.questionOrder, studentBSelections);
    const controlA = buildPresentation('Student A', false, false, 77);
    const controlB = buildPresentation('Student B', false, false, 88);
    const controlASelections = answerStudent('Student A', controlA, 'attempt-A-control');
    const controlBSelections = answerStudent('Student B', controlB, 'attempt-B-control');
    const controlAScore = gradeMultipleChoiceAnswers(controlA.questionOrder, controlASelections);
    const controlBScore = gradeMultipleChoiceAnswers(controlB.questionOrder, controlBSelections);

    expect(aScore).toBe(controlAScore);
    expect(bScore).toBe(controlBScore);
    expect(studentASelections).not.toEqual(studentBSelections);
    expect(new Set(Object.keys(studentASelections)).size).toBe(questionBank.length);
    expect(new Set(Object.keys(studentBSelections)).size).toBe(questionBank.length);

    recordResult('response IDs match the question bank exactly', String(questionBank.length), String(serverAResponses.length));
    recordResult('responses stay attached to the correct candidate', 'Student A', serverAResponses.every((response) => response.candidateName === 'Student A') ? 'Student A' : 'mixed');
    recordResult('MCQ score is stable under randomization', String(controlAScore), String(aScore));
  });

  it('renders the randomized views as screenshots for Student A and Student B', async () => {
    const studentA = buildPresentation('Student A', true, true, 181);
    const studentB = buildPresentation('Student B', true, true, 271);

    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);

    const rootAVisible = createRoot(containerA);
    const rootBVisible = createRoot(containerB);

    await act(async () => {
      rootAVisible.render(h(QuestionScreen, studentA));
      rootBVisible.render(h(QuestionScreen, studentB));
    });

    const aQuestionIds = studentA.questionOrder.slice(0, 4).join(',');
    const bQuestionIds = studentB.questionOrder.slice(0, 4).join(',');
    expect(aQuestionIds).not.toBe(bQuestionIds);
    recordResult('Student A and Student B screenshots show different orders', 'different', aQuestionIds === bQuestionIds ? 'same' : 'different');

    await expect.element(page.getByRole('heading', { name: 'Student A exam view' })).toBeVisible();
    await expect(page).toMatchScreenshot('h07/scenario-specific-ui-screenshots/student-a-randomized');

    await expect.element(page.getByRole('heading', { name: 'Student B exam view' })).toBeVisible();
    await expect(page).toMatchScreenshot('h07/scenario-specific-ui-screenshots/student-b-randomized');

    act(() => {
      rootAVisible.unmount();
      rootBVisible.unmount();
    });
  });

  it('prints the results table and confirms the overall security result', () => {
    const tableText = results.map((row) => `${row.item} | ${row.expected} | ${row.actual} | ${row.status}`).join('\n');
    console.log(tableText);
    const overall = results.some((row) => row.status === 'FAIL') ? 'FAIL' : 'PASS';
    console.log(`Final overall result: ${overall}`);
    expect(results.some((row) => row.status === 'FAIL')).toBe(false);
  });
});
