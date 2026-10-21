export function maskCandidateIdentifier(candidateId: string): string {
  return `${candidateId.slice(0, 4)}****${candidateId.slice(-4)}`;
}

export function createSubmissionReceipt(
  assessmentId: string,
  attemptId: string,
  candidateId: string,
  submittedAt: Date,
): string {
  const maskedCandidateId = maskCandidateIdentifier(candidateId);
  return `EXAM-${assessmentId.slice(0, 8)}-ATT-${attemptId.slice(0, 8)}-CAND-${maskedCandidateId}-${submittedAt.toISOString()}-SUBMITTED`;
}
