export interface MarkingPointCriteria {
  pointText: string;
  marks: number;
  alternativesJson: string | null;
}

export interface ScoringConfig {
  method: string;
  maxMark: number;
  configJson: string | null;
  markingPoints?: MarkingPointCriteria[];
}

export interface AutoScoreResult {
  provisionalScore: number | null;
  matchedPoints: string[];
  unmatchedPoints: string[];
  matched: boolean;
  stage: 'auto' | 'human';
  reasoning: string;
}

export function scoreObjectiveAnswer(
  selectedOptionId: string | null | undefined,
  correctOptionId: string | null | undefined,
  maxMark: number,
) {
  const isUnanswered = selectedOptionId == null;
  const isCorrect = !isUnanswered && correctOptionId != null && selectedOptionId === correctOptionId;

  return {
    isUnanswered,
    isCorrect,
    score: isCorrect ? maxMark : 0,
  };
}

function cleanText(text: string): string { return (text || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    for (let j = 0; j <= right.length; j++) previous[j] = current[j];
  }
  return previous[right.length];
}

function spellingTolerance(configJson: string | null): number {
  if (!configJson) return 0;
  try { const parsed = JSON.parse(configJson); return Math.max(0, Math.floor(Number(parsed?.spellingTolerance ?? parsed?.editDistanceTolerance ?? 0))); } catch { return 0; }
}

function matchesPhrase(text: string, phrase: string, tolerance: number): boolean {
  if (!phrase) return false;
  if (text.includes(phrase)) return true;
  if (!tolerance) return false;
  const words = text.split(' ');
  const phraseWords = phrase.split(' ');
  for (let i = 0; i <= words.length - phraseWords.length; i++) {
    const candidate = words.slice(i, i + phraseWords.length).join(' ');
    if (editDistance(candidate, phrase) <= tolerance) return true;
  }
  return false;
}

function parseAlternatives(alternativesJson: string | null, base: string): string[] {
  const list: string[] = [cleanText(base)];
  if (alternativesJson) try {
    const parsed = JSON.parse(alternativesJson);
    const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
    list.push(...values.map((value: unknown) => cleanText(String(value ?? ''))).filter(Boolean));
  } catch {}
  return list.filter(Boolean);
}

function acceptedPhrases(configJson: string | null): string[] {
  if (!configJson) return [];
  try {
    const parsed = JSON.parse(configJson);
    const source = Array.isArray(parsed) ? parsed : (parsed?.acceptedPhrases ?? parsed?.acceptableAnswers ?? []);
    return Array.isArray(source) ? source.map((value: unknown) => cleanText(String(value ?? ''))).filter(Boolean) : [];
  } catch { return []; }
}

export function autoScoreSubjective(response: string, markingScheme: ScoringConfig): AutoScoreResult {
  const text = cleanText(response);
  if (!text) return { provisionalScore: 0, matchedPoints: [], unmatchedPoints: [], matched: false, stage: 'auto', reasoning: 'No response text was provided.' };
  const maxMark = markingScheme.maxMark ?? 0;
  const tolerance = spellingTolerance(markingScheme.configJson);
  const matchReason = tolerance ? ` using an edit-distance tolerance of ${tolerance}` : '';
  if (markingScheme.method === 'exact_match' || markingScheme.method === 'acceptable_answer') {
    const phrases = acceptedPhrases(markingScheme.configJson);
    const matchedPhrase = phrases.find((phrase) => matchesPhrase(text, phrase, tolerance));
    return { provisionalScore: matchedPhrase ? maxMark : 0, matchedPoints: matchedPhrase ? [matchedPhrase] : [], unmatchedPoints: matchedPhrase ? [] : phrases, matched: !!matchedPhrase, stage: 'auto', reasoning: matchedPhrase ? `Response matched configured phrase "${matchedPhrase}"${matchReason}. Awarded full marks (${maxMark}).` : `Response matched none of the configured accepted phrases${matchReason}.` };
  }
  if (markingScheme.method === 'marking_points' && markingScheme.markingPoints) {
    let earned = 0;
    const matchedPoints: string[] = [];
    const unmatchedPoints: string[] = [];
    for (const point of markingScheme.markingPoints) {
      const found = parseAlternatives(point.alternativesJson, point.pointText).some((form) => matchesPhrase(text, form, tolerance));
      if (found) { earned += point.marks; matchedPoints.push(point.pointText); } else unmatchedPoints.push(point.pointText);
    }
    return { provisionalScore: Math.min(earned, maxMark), matchedPoints, unmatchedPoints, matched: earned > 0, stage: 'auto', reasoning: `${matchedPoints.length} of ${markingScheme.markingPoints.length} configured marking points matched${matchReason}.` };
  }
  return { provisionalScore: null, matchedPoints: [], unmatchedPoints: [], matched: false, stage: 'human', reasoning: 'Human grading required for this marking method.' };
}
