import { z } from 'zod';
import { AI_MATERIAL_MAX_CHARACTERS, AI_RULES_MAX_CHARACTERS } from './limits';

export { AI_MATERIAL_MAX_CHARACTERS, AI_RULES_MAX_CHARACTERS } from './limits';

export const assessmentRecommendationSchema = z.object({
  suggested_score: z.number().finite(),
  max_score: z.number().finite(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  criterion_observations: z.array(z.object({
    criterion: z.string().min(1),
    met: z.boolean(),
    comment: z.string(),
    awarded_score: z.number().finite(),
    max_score: z.number().finite(),
  })).min(1),
  uncertainty_level: z.enum(['low', 'medium', 'high']),
  rationale: z.string(),
});

export type AssessmentRecommendation = z.infer<typeof assessmentRecommendationSchema>;

export function validateAssessmentRecommendation(
  recommendation: AssessmentRecommendation,
  expectedMaxMark: number,
  expectedCriteria?: readonly string[],
) {
  const tolerance = 0.01;
  const criterionAwardedTotal = recommendation.criterion_observations
    .reduce((sum, criterion) => sum + criterion.awarded_score, 0);
  const criterionMaximumTotal = recommendation.criterion_observations
    .reduce((sum, criterion) => sum + criterion.max_score, 0);
  const scoreWithinBounds = recommendation.suggested_score >= 0
    && recommendation.suggested_score <= expectedMaxMark;
  const criterionScoresWithinBounds = recommendation.criterion_observations.every(
    (criterion) => criterion.awarded_score >= 0
      && criterion.max_score > 0
      && criterion.awarded_score <= criterion.max_score,
  );
  const criterionMetFlagsMatchScores = recommendation.criterion_observations.every(
    (criterion) => criterion.met === (criterion.awarded_score >= criterion.max_score - tolerance),
  );
  const maxMarkMatchesQuestion = Math.abs(recommendation.max_score - expectedMaxMark) <= tolerance;
  const criterionMaximumMatchesQuestion = Math.abs(criterionMaximumTotal - expectedMaxMark) <= tolerance;
  const criterionTotalMatchesSuggestedScore = Math.abs(criterionAwardedTotal - recommendation.suggested_score) <= tolerance;
  const normalizedCriteria = recommendation.criterion_observations
    .map((criterion) => criterion.criterion.trim().toLocaleLowerCase())
    .sort();
  const normalizedExpectedCriteria = expectedCriteria?.map((criterion) => criterion.trim().toLocaleLowerCase()).sort();
  const criteriaMatchRubric = normalizedExpectedCriteria === undefined
    || (normalizedCriteria.length === normalizedExpectedCriteria.length
      && normalizedCriteria.every((criterion, index) => criterion === normalizedExpectedCriteria[index]));
  const checks = {
    scoreWithinBounds,
    criterionScoresWithinBounds,
    criterionMetFlagsMatchScores,
    maxMarkMatchesQuestion,
    criterionMaximumMatchesQuestion,
    criterionTotalMatchesSuggestedScore,
    criteriaMatchRubric,
  };
  const issues: string[] = [];

  if (!scoreWithinBounds) issues.push('Suggested score is outside the allowed mark range.');
  if (!criterionScoresWithinBounds) issues.push('One or more criterion scores are outside their allowed mark ranges.');
  if (!criterionMetFlagsMatchScores) issues.push('Criterion met flags do not agree with the awarded marks.');
  if (!maxMarkMatchesQuestion) issues.push('AI maximum mark does not match the question maximum.');
  if (!criterionMaximumMatchesQuestion) issues.push('Criterion maximum marks do not add up to the question maximum.');
  if (!criterionTotalMatchesSuggestedScore) issues.push('Criterion awarded marks do not add up to the suggested score.');
  if (!criteriaMatchRubric) issues.push('Criterion observations do not match the supplied marking rubric.');

  const passed = Object.values(checks).every(Boolean);
  return {
    passed,
    review_required: !passed || recommendation.uncertainty_level !== 'low',
    issues,
    checks,
  };
}

export function extractAssessmentRubricCriteria(markingScheme: Record<string, unknown>): string[] | undefined {
  let source: unknown = markingScheme.rubric ?? markingScheme.criteria ?? markingScheme.markingPoints;

  if (!Array.isArray(source) && typeof markingScheme.configJson === 'string') {
    try {
      const config = JSON.parse(markingScheme.configJson) as { rubric?: unknown };
      source = config.rubric;
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(source) || source.length === 0) return undefined;
  const criteria = source.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const candidate = item as Record<string, unknown>;
      const name = candidate.criterion ?? candidate.name ?? candidate.pointText;
      return typeof name === 'string' ? name.trim() : '';
    }
    return '';
  });
  return criteria.every(Boolean) ? criteria : undefined;
}

export function validateAiText(value: unknown, label: string, maxCharacters: number): string | null {
  if (typeof value !== 'string') return `${label} must be text.`;
  if (value.length > maxCharacters) return `${label} must be ${maxCharacters.toLocaleString()} characters or fewer.`;
  return null;
}
