'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Award, FileText, Clock, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';

export default function MyResultsPage() {
  const { data: session } = useSession();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');
  const filteredResults = results.filter((result: any) =>
    matchesSemester(result?.attempt?.assessment?.course?.semester, semesterFilter),
  );

  useEffect(() => {
    fetch('/api/results')
      .then(r => r.json())
      .then(d => setResults(d?.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function getGradeColor(grade: string) {
    const g = grade?.toUpperCase?.() ?? '';
    if (g === 'A' || g === 'A+') return 'text-green-600 bg-green-100';
    if (g === 'B' || g === 'B+') return 'text-blue-600 bg-blue-100';
    if (g === 'C' || g === 'C+') return 'text-yellow-600 bg-yellow-100';
    if (g === 'D') return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" /> My Results
        </h1>
        <p className="text-muted-foreground mt-1">View released examination results and grades</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex w-full max-w-xs flex-col gap-1 text-sm font-medium">
            Filter results by semester
            <select aria-label="Filter results by semester" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value as SemesterFilter)} className="h-10 rounded-md border bg-background px-3">
              <option value="all">All semesters</option>
              <option value="first">First semester</option>
              <option value="second">Second semester</option>
              <option value="full_year">Full year</option>
              <option value="unassigned">Semester not assigned</option>
            </select>
          </label>
          {filteredResults.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Award className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No results available for this semester</p>
              <p className="text-sm mt-1">Results will appear here once they are released</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResults.map((r: any) => (
            <div key={r?.id} className="bg-card rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedResult(selectedResult?.id === r?.id ? null : r)}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{r?.attempt?.assessment?.title ?? 'Assessment'}</h3>
                  <p className="text-sm text-muted-foreground">{r?.attempt?.assessment?.course?.code ?? ''} - {r?.attempt?.assessment?.course?.title ?? ''} · {courseSemesterLabel(r?.attempt?.assessment?.course?.semester)}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-lg font-bold ${getGradeColor(r?.grade)}`}>
                  {r?.grade ?? '-'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="text-center p-2 bg-muted/50 rounded">
                  <p className="text-2xl font-bold text-primary">{r?.totalScore ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                  <p className="text-2xl font-bold text-foreground">{r?.percentage?.toFixed?.(1) ?? '0'}%</p>
                  <p className="text-xs text-muted-foreground">Percentage</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <SafeDate date={r?.releasedAt ?? r?.createdAt} options={{ dateStyle: 'medium' }} />
                </span>
                {r?.passed ? (
                  <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" />Passed</span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" />Failed</span>
                )}
              </div>

              {selectedResult?.id === r?.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <p className="text-sm font-medium">Details</p>
                  {r?.feedback && (
                    <p className="text-sm text-muted-foreground"><strong>Feedback:</strong> {r.feedback}</p>
                  )}
                  {r?.attempt?.submittedAt && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Submitted:</strong> <SafeDate date={r.attempt.submittedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} />
                    </p>
                  )}
                  {r?.attempt?.receipt && (
                    <p className="text-sm font-mono text-xs text-muted-foreground break-all">
                      <strong>Receipt:</strong> {r.attempt.receipt}
                    </p>
                  )}
                </div>
              )}
            </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
