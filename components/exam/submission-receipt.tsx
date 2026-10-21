export interface SubmissionReceiptDetails {
  receiptId: string;
  attemptId: string;
  candidateIdentifier: string;
  status: string;
  submittedAt: string;
}

export function SubmissionReceipt({ receipt }: { receipt: SubmissionReceiptDetails }) {
  return (
    <section aria-label="Submission receipt" className="mt-4 rounded-md bg-muted p-4 text-left">
      <h2 className="mb-3 text-sm font-semibold">Submission Receipt</h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Receipt ID</dt>
          <dd className="break-all font-mono text-xs" data-testid="receipt-id">{receipt.receiptId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Attempt ID</dt>
          <dd className="break-all font-mono text-xs" data-testid="attempt-id">{receipt.attemptId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Candidate</dt>
          <dd data-testid="candidate-identifier">{receipt.candidateIdentifier}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Submission status</dt>
          <dd data-testid="submission-status">{receipt.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Server timestamp</dt>
          <dd data-testid="server-timestamp">{receipt.submittedAt}</dd>
        </div>
      </dl>
    </section>
  );
}
