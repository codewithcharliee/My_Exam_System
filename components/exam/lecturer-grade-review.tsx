'use client';

import { useState } from 'react';

export type LecturerGradeDecision = 'accepted' | 'modified' | 'rejected';

type LecturerGradeReviewProps = {
  provisionalScore: number | null;
  officialGrade: number | null;
  lecturerDecision: string;
  maxMark: number;
  gradedBy: string | null;
  gradedAt: string | null;
  onDecision: (decision: LecturerGradeDecision, officialGrade: number | null) => Promise<void>;
};

export function LecturerGradeReview({
  provisionalScore,
  officialGrade,
  lecturerDecision,
  maxMark,
  gradedBy,
  gradedAt,
  onDecision,
}: LecturerGradeReviewProps) {
  const [changedGrade, setChangedGrade] = useState(provisionalScore ?? 0);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const isRejected = lecturerDecision === 'rejected';

  async function submitDecision(decision: LecturerGradeDecision, grade: number | null) {
    if (decision === 'modified' && (grade === null || grade < 0 || grade > maxMark)) {
      setValidationError(`Enter a grade between 0 and ${maxMark}.`);
      return;
    }
    setValidationError('');
    setSaving(true);
    try {
      await onDecision(decision, grade);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Lecturer grade review" className="space-y-4">
      <div>
        <p className="text-sm">Provisional score: <strong data-testid="provisional-score">{provisionalScore ?? 'Not yet scored'}/{maxMark}</strong></p>
        <p className="text-sm" data-testid="official-grade">
          {officialGrade === null
            ? isRejected ? 'Official grade: Not assigned — returned for re-marking' : 'Official grade: Awaiting lecturer review'
            : `Official grade: ${officialGrade}/${maxMark}`}
        </p>
        {gradedBy && <p className="text-sm" data-testid="reviewer">Reviewed by: {gradedBy}</p>}
        {gradedAt && <p className="text-sm" data-testid="reviewed-at">Reviewed at: {gradedAt}</p>}
      </div>

      <label className="block space-y-1 text-sm">
        <span>Changed grade (maximum {maxMark})</span>
        <input
          aria-label="Changed grade"
          type="number"
          min={0}
          max={maxMark}
          step="any"
          value={changedGrade}
          onChange={(event) => setChangedGrade(Number(event.currentTarget.value))}
        />
      </label>

      {validationError && <p role="alert">{validationError}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving || provisionalScore === null} onClick={() => submitDecision('accepted', provisionalScore)}>
          Confirm provisional score
        </button>
        <button type="button" disabled={saving} onClick={() => submitDecision('modified', changedGrade)}>
          Change grade
        </button>
        <button type="button" disabled={saving} onClick={() => submitDecision('rejected', null)}>
          Reject for re-marking
        </button>
      </div>
    </section>
  );
}
