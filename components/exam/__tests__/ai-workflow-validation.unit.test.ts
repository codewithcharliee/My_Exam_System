import { describe, expect, it } from 'vitest';
import { assessmentRecommendationSchema, extractAssessmentRubricCriteria, validateAssessmentRecommendation } from '@/lib/ai/workflow-validation';

const validRecommendation = assessmentRecommendationSchema.parse({
  suggested_score: 7.5,
  max_score: 10,
  strengths: ['Uses relevant authority'],
  weaknesses: ['Needs a fuller conclusion'],
  criterion_observations: [
    { criterion: 'Knowledge', met: true, comment: 'Accurate.', awarded_score: 4, max_score: 4 },
    { criterion: 'Analysis', met: false, comment: 'Partially developed.', awarded_score: 3.5, max_score: 6 },
  ],
  uncertainty_level: 'low',
  rationale: 'A mostly sound response.',
});

describe('AI assessment recommendation validation', () => {
  it('accepts in-range scores whose criterion awards and maxima add up', () => {
    expect(validateAssessmentRecommendation(validRecommendation, 10)).toMatchObject({
      passed: true,
      review_required: false,
      issues: [],
    });
  });

  it('requires lecturer review when criterion totals do not equal the suggested score', () => {
    const inconsistent = {
      ...validRecommendation,
      suggested_score: 8,
    };

    expect(validateAssessmentRecommendation(inconsistent, 10)).toMatchObject({
      passed: false,
      review_required: true,
      issues: ['Criterion awarded marks do not add up to the suggested score.'],
    });
  });

  it('requires lecturer review for uncertain recommendations even when arithmetic is valid', () => {
    const uncertain = {
      ...validRecommendation,
      uncertainty_level: 'high' as const,
    };

    expect(validateAssessmentRecommendation(uncertain, 10)).toMatchObject({
      passed: true,
      review_required: true,
    });
  });

  it('flags out-of-range scores and criterion mark totals', () => {
    const outOfRange = {
      ...validRecommendation,
      suggested_score: 11,
      criterion_observations: [
        { criterion: 'Knowledge', met: true, comment: '', awarded_score: 4, max_score: 4 },
        { criterion: 'Analysis', met: true, comment: '', awarded_score: 7, max_score: 6 },
      ],
    };

    const result = validateAssessmentRecommendation(outOfRange, 10);
    expect(result.passed).toBe(false);
    expect(result.checks.scoreWithinBounds).toBe(false);
    expect(result.checks.criterionScoresWithinBounds).toBe(false);
  });

  it('requires criterion observations to match the supplied rubric', () => {
    const result = validateAssessmentRecommendation(validRecommendation, 10, ['Knowledge', 'Application']);

    expect(result.passed).toBe(false);
    expect(result.review_required).toBe(true);
    expect(result.issues).toContain('Criterion observations do not match the supplied marking rubric.');
  });

  it('extracts criterion names from stored question marking schemes', () => {
    expect(extractAssessmentRubricCriteria({
      configJson: JSON.stringify({
        rubric: [{ criterion: 'Knowledge', maxMark: 4 }, { criterion: 'Application', maxMark: 6 }],
      }),
    })).toEqual(['Knowledge', 'Application']);
  });
});
