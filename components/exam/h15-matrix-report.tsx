import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
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
import type { CategorySummary, MatrixRow, MatrixStatus } from '@/lib/h15-acceptance';

type AcceptanceMatrixReportProps = {
  rows: MatrixRow[];
  categorySummaries: CategorySummary[];
};

function statusVariant(status: MatrixStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'Pass':
      return 'default';
    case 'Fail':
      return 'destructive';
    case 'Partially Pass':
      return 'secondary';
    case 'Not Tested':
      return 'outline';
  }
}

function renderSummary(summary: CategorySummary): ReactNode {
  return (
    <Card key={summary.category}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base capitalize">{summary.category}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label={`${summary.category} results`}>
          <Badge>Pass {summary.pass}</Badge>
          <Badge variant="destructive">Fail {summary.fail}</Badge>
          <Badge variant="secondary">Partially Pass {summary.partiallyPass}</Badge>
          <Badge variant="outline">Not Tested {summary.notTested}</Badge>
        </div>
        {summary.failedRequirements.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Failed requirements: {summary.failedRequirements.join(', ')}
          </p>
        )}
        {summary.partiallyPassedRequirements.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Partially passed requirements: {summary.partiallyPassedRequirements.join(', ')}
          </p>
        )}
        {summary.notTestedRequirements.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Not tested requirements: {summary.notTestedRequirements.join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AcceptanceMatrixReport({ rows, categorySummaries }: AcceptanceMatrixReportProps): JSX.Element {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Acceptance testing</p>
        <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
          H15 acceptance matrix
        </h1>
        <p className="text-sm text-muted-foreground">
          Requirement status, measured outcomes, and mapped evidence.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>
            {rows.length} requirement{rows.length === 1 ? '' : 's'} in the acceptance matrix
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Measured result</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.id}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell className="capitalize">{row.category}</TableCell>
                  <TableCell>{row.evidence.join(', ') || 'None'}</TableCell>
                  <TableCell>{row.measuredResult}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="min-w-56">{row.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="category-summaries-heading">
        <div>
          <h2 id="category-summaries-heading" className="text-lg font-semibold text-foreground">
            Category summaries
          </h2>
          <p className="text-sm text-muted-foreground">
            Results grouped by requirement category.
          </p>
        </div>
        {categorySummaries.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categorySummaries.map(renderSummary)}
          </div>
        ) : (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No category summary is available.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

export default AcceptanceMatrixReport;
