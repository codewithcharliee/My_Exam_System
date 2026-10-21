import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const projectFile = (name) => fileURLToPath(new URL(name, import.meta.url));
dotenv.config({ path: projectFile('../.env.local'), quiet: true });
dotenv.config({ path: projectFile('../.env'), quiet: true });

const apiKey = (process.env.ABACUSAI_API_KEY ?? '').trim();
if (!apiKey) throw new Error('ABACUSAI_API_KEY is not configured.');
const materialCharacters = Number(process.env.AI_DIAG_MATERIAL_CHARACTERS ?? 12_000);
if (!Number.isSafeInteger(materialCharacters) || materialCharacters < 100 || materialCharacters > 50_000) {
  throw new Error('AI_DIAG_MATERIAL_CHARACTERS must be between 100 and 50000.');
}
const materialSeed = 'Synthetic source: Nigerian constitutional law allocates governmental authority among branches and defines legal limits on public power. ';
const courseMaterial = materialSeed.repeat(Math.ceil(materialCharacters / materialSeed.length)).slice(0, materialCharacters);
const markingRules = 'Generate exactly five medium multiple-choice questions. Each question must have exactly four options and exactly one correct answer. Use only the supplied synthetic material.';

const response = await fetch(
  process.env.ABACUSAI_BASE_URL ?? 'https://apps.abacus.ai/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: process.env.ABACUSAI_MODEL ?? 'gpt-5.4-mini',
      stream: true,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          'You are a law professor creating examination questions for Synthetic Constitutional Law (LAW-SYNTH).',
          'Use the lecturer-provided source as authoritative. Do not invent facts outside it. Follow the marking rules exactly.',
          'Course material:',
          courseMaterial,
          'Lecturer marking rules:',
          markingRules,
          'Generate exactly five multiple-choice questions on Separation of powers at medium difficulty.',
          'Each question needs text, topic, difficulty, type, and an options array of four {text,isCorrect} objects with exactly one isCorrect true.',
          'Respond with raw JSON only. No markdown or additional text.',
        ].join('\n'),
      }],
    }),
  },
);

if (!response.ok) {
  console.log(JSON.stringify({ httpStatus: response.status, providerError: (await response.text()).slice(0, 500) }));
  process.exitCode = 1;
} else {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Provider returned no response body.');

  const decoder = new TextDecoder();
  let partialRead = '';
  let content = '';
  let eventCount = 0;
  let contentChunks = 0;
  let doneMarkerSeen = false;
  let providerErrorSeen = false;
  const finishReasons = new Set();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    partialRead += decoder.decode(value, { stream: true });
    const lines = partialRead.split('\n');
    partialRead = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') {
        doneMarkerSeen = true;
        continue;
      }
      try {
        const event = JSON.parse(data);
        eventCount += 1;
        if (event.error) providerErrorSeen = true;
        const finishReason = event.choices?.[0]?.finish_reason;
        if (typeof finishReason === 'string') finishReasons.add(finishReason);
        const chunk = event.choices?.[0]?.delta?.content;
        if (typeof chunk === 'string') {
          content += chunk;
          contentChunks += 1;
        }
      } catch {
        providerErrorSeen = true;
      }
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  const rootKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.keys(parsed)
    : [];
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  console.log(JSON.stringify({
    httpStatus: response.status,
    inputMaterialCharacters: materialCharacters,
    markingRulesCharacters: markingRules.length,
    eventCount,
    contentChunks,
    doneMarkerSeen,
    providerErrorSeen,
    jsonParsed: parsed !== null,
    rootType: parsed === null ? 'invalid-json' : Array.isArray(parsed) ? 'array' : typeof parsed,
    rootKeys,
    questionsFieldType: parsed?.questions === undefined ? 'missing' : Array.isArray(parsed.questions) ? 'array' : typeof parsed.questions,
    questionCount: questions.length,
    finishReasons: [...finishReasons],
    questions: questions.map((question) => ({
      type: question?.type ?? null,
      difficulty: question?.difficulty ?? null,
      optionCount: Array.isArray(question?.options) ? question.options.length : null,
      correctOptionCount: Array.isArray(question?.options)
        ? question.options.filter((option) => option?.isCorrect === true).length
        : null,
    })),
  }));
  if (!doneMarkerSeen || !parsed) process.exitCode = 1;
}
