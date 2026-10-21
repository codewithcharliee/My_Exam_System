'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClipboardList, CheckCircle, Loader2, Brain, Star, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import { LecturerGradeReview, type LecturerGradeDecision } from '@/components/exam/lecturer-grade-review';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';

export default function GradingPage() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [levelFilter, setLevelFilter] = useState('');
  const [matricNumberFilter, setMatricNumberFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch('/api/grading').then(r => r.json()).then(d => setAttempts(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openScript = async (attempt: any) => {
    try {
      const res = await fetch(`/api/attempts/${attempt.id}`);
      const data = await res.json();
      setSelectedAttempt(data);
    } catch (e) { toast.error('Failed to load script'); }
  };

  const searchScripts = async (level = levelFilter, matricNumber = matricNumberFilter, semester = semesterFilter) => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (matricNumber.trim()) params.set('matricNumber', matricNumber.trim());
    if (semester !== 'all') params.set('semester', semester);
    setSearching(true);
    try {
      const query = params.toString();
      const res = await fetch(`/api/grading${query ? `?${query}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not search submitted scripts.');
      setAttempts(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not search submitted scripts.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchScripts();
  };

  const visibleAttempts = attempts.filter((attempt: any) =>
    matchesSemester(attempt?.assessment?.course?.semester, semesterFilter),
  );

  const saveGrade = async (
    attemptId: string,
    questionId: string,
    lecturerDecision: LecturerGradeDecision,
    officialGrade: number | null,
  ) => {
    try {
      const res = await fetch(`/api/grading/${attemptId}/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lecturerDecision, officialGrade }),
      });
      if (res.ok) {
        toast.success('Grade saved');
        setSelectedQuestion(null);
        openScript(selectedAttempt);
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to save grade');
      }
    } catch (e) { toast.error('Error'); }
  };

  const getAiRecommendation = async (attemptId: string, questionId: string, responseText: string, questionText: string, markingScheme: any, maxMark: number) => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, questionId, responseText, questionText, markingScheme, maxMark }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'AI recommendation unavailable.');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('AI provider returned an empty response.');
      const decoder = new TextDecoder();
      let partialRead = '';
      let completed = false;

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let parsed;
            try { parsed = JSON.parse(line.slice(6)); } catch { continue; }
            if (parsed?.status === 'completed') {
              setAiResult({ attemptId, questionId, result: parsed.result });
              completed = true;
              break;
            }
            if (parsed?.status === 'error') throw new Error(parsed?.message ?? 'AI recommendation failed validation.');
          }
        }
        if (completed) break;
      }
      if (!completed) throw new Error('AI response ended without a completed recommendation.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI recommendation unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const releaseResult = async (attemptId: string) => {
    try {
      await fetch('/api/results/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      });
      toast.success('Result released');
    } catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Grading Interface
        </h1>
        <p className="text-muted-foreground">Grade submitted examination scripts</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : selectedAttempt ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">{selectedAttempt?.assessment?.title ?? ''}</h2>
              <p className="text-sm text-muted-foreground">Candidate: {selectedAttempt?.candidate?.name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">
                {selectedAttempt?.candidate?.academicLevel ? `Level ${selectedAttempt.candidate.academicLevel}` : 'Level not set'}
                {selectedAttempt?.candidate?.matricNumber ? ` · ${selectedAttempt.candidate.matricNumber}` : ' · Matric number not set'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => releaseResult(selectedAttempt.id)}><Send className="h-4 w-4 mr-2" /> Release Result</Button>
              <Button variant="ghost" onClick={() => setSelectedAttempt(null)}>Back to Scripts</Button>
            </div>
          </div>

          {(selectedAttempt?.presentationMappings ?? []).map((pm: any, idx: number) => {
            const item = (selectedAttempt?.assessment?.items ?? []).find((i: any) => i?.questionId === pm?.questionId);
            const question = item?.question;
            const response = (selectedAttempt?.responses ?? []).find((r: any) => r?.questionId === pm?.questionId);
            const outcome = (selectedAttempt?.objectiveOutcomes ?? [])?.find?.((o: any) => o?.questionId === pm?.questionId);
            const gradeDecision = (selectedAttempt?.gradeDecisions ?? [])?.find?.((g: any) => g?.questionId === pm?.questionId);
            const currentAiResult = aiResult?.attemptId === selectedAttempt?.id && aiResult?.questionId === pm?.questionId
              ? aiResult.result
              : null;

            return (
              <Card key={pm.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">Q{idx + 1}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{question?.type ?? ''}</Badge>
                      <span className="text-xs text-muted-foreground ml-2">{item?.maxMark ?? 0} marks</span>
                    </div>
                    {gradeDecision?.officialGrade !== null && gradeDecision?.officialGrade !== undefined && (
                      <Badge className="bg-green-100 text-green-700"><Star className="h-3 w-3 mr-1" /> {gradeDecision.officialGrade}/{item?.maxMark ?? 0}</Badge>
                    )}
                  </div>

                  <p className="text-sm mb-3">{question?.text ?? ''}</p>

                  {question?.type === 'multiple_choice' && outcome && (
                    <div className={`p-3 rounded-lg ${outcome?.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className="text-sm">Selected: {question?.options?.find?.((o: any) => o.id === outcome?.selectedOptionId)?.text ?? 'No answer'}</p>
                      <p className="text-xs mt-1">{outcome?.isCorrect ? '✓ Correct' : '✗ Incorrect'} — Score: {outcome?.score ?? 0}/{item?.maxMark ?? 0}</p>
                    </div>
                  )}

                  {question?.type !== 'multiple_choice' && (
                    <div>
                      <div className="bg-muted/50 p-3 rounded-lg mb-3">
                        <p className="text-sm whitespace-pre-wrap">{response?.currentText || <em className="text-muted-foreground">No response</em>}</p>
                        {response?.wordCount > 0 && <p className="text-xs text-muted-foreground mt-2">Word count: {response.wordCount}</p>}
                      </div>

                      {gradeDecision?.aiRecommendationJson && (
                        <div className="border border-purple-200 bg-purple-50 p-3 rounded-lg mb-3">
                          <p className="text-xs font-medium text-purple-700 mb-2">AI Recommendation (for lecturer review only)</p>
                          {(() => {
                            try {
                              const rec = JSON.parse(gradeDecision.aiRecommendationJson);
                              return (
                                <div className="text-sm space-y-1">
                                  <p>Suggested Score: <strong>{rec?.suggested_score ?? 'N/A'}/{rec?.max_score ?? 'N/A'}</strong></p>
                                  {rec?.strengths?.length > 0 && <p className="text-green-700">Strengths: {(rec.strengths ?? []).join(', ')}</p>}
                                  {rec?.weaknesses?.length > 0 && <p className="text-red-700">Weaknesses: {(rec.weaknesses ?? []).join(', ')}</p>}
                                  {rec?.criterion_observations?.length > 0 && (
                                    <ul className="mt-1 list-disc pl-5 text-xs">
                                      {rec.criterion_observations.map((criterion: any, index: number) => (
                                        <li key={`${criterion.criterion}-${index}`}>
                                          {criterion.criterion}: {criterion.awarded_score}/{criterion.max_score} — {criterion.comment}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <p className="text-xs">Uncertainty: {rec?.uncertainty_level ?? 'unknown'}</p>
                                  {rec?.validation && (
                                    <div className={`mt-2 rounded border p-2 text-xs ${rec.validation.review_required ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-900'}`}>
                                      <p>{rec.validation.passed ? 'Score calculations validated' : 'Validation checks failed'}{rec.validation.review_required ? ' — lecturer review required' : ''}</p>
                                      {rec.validation.issues?.length > 0 && <ul className="mt-1 list-disc pl-4">{rec.validation.issues.map((issue: string) => <li key={issue}>{issue}</li>)}</ul>}
                                    </div>
                                  )}
                                </div>
                              );
                            } catch { return <p className="text-xs">Unable to parse AI recommendation</p>; }
                          })()}
                        </div>
                      )}

                      {currentAiResult && (
                        <div role={currentAiResult.validation?.review_required ? 'alert' : 'status'} className={`mb-3 rounded-lg border p-3 ${currentAiResult.validation?.review_required ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
                          <p className="text-xs font-semibold">AI marking recommendation — not an official grade</p>
                          <p className="mt-1 text-sm">Suggested score: <strong>{currentAiResult.suggested_score}/{currentAiResult.max_score}</strong></p>
                          <p className="text-xs">Uncertainty: {currentAiResult.uncertainty_level}. Lecturer review required before the grade can be recorded.</p>
                          {currentAiResult.criterion_observations?.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 text-xs">
                              {currentAiResult.criterion_observations.map((criterion: any, index: number) => (
                                <li key={`${criterion.criterion}-${index}`}>
                                  {criterion.criterion}: {criterion.awarded_score}/{criterion.max_score} — {criterion.comment}
                                </li>
                              ))}
                            </ul>
                          )}
                          {currentAiResult.validation?.issues?.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 text-xs">
                              {currentAiResult.validation.issues.map((issue: string) => <li key={issue}>{issue}</li>)}
                            </ul>
                          )}
                          {currentAiResult.rationale && <p className="mt-2 text-sm">{currentAiResult.rationale}</p>}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setSelectedQuestion({
                            attemptId: selectedAttempt.id,
                            questionId: pm.questionId,
                            maxMark: item?.maxMark ?? 0,
                            provisionalScore: currentAiResult?.validation?.passed
                              ? currentAiResult.suggested_score
                              : gradeDecision?.provisionalScore ?? null,
                            officialGrade: gradeDecision?.officialGrade ?? null,
                            lecturerDecision: gradeDecision?.lecturerDecision ?? 'pending',
                            gradedBy: gradeDecision?.gradedBy ?? null,
                            gradedAt: gradeDecision?.gradedAt ?? null,
                          });
                        }}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Grade
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const ms = question?.markingSchemes?.[0] ?? { method: 'ai_recommendation', maxMark: item?.maxMark };
                          getAiRecommendation(selectedAttempt.id, pm.questionId, response?.currentText ?? '', question?.text ?? '', ms, item?.maxMark ?? 0);
                        }} disabled={aiLoading}>
                          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
                          Get AI Recommendation
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1.3fr)_minmax(11rem,0.8fr)_auto_auto] sm:items-end">
            <div>
              <label htmlFor="grading-level-filter" className="mb-1 block text-sm font-medium">Student level</label>
              <select
                id="grading-level-filter"
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All levels</option>
                {[100, 200, 300, 400, 500].map((level) => <option key={level} value={level}>{level} Level</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="grading-matric-filter" className="mb-1 block text-sm font-medium">Find by matric number</label>
              <input
                id="grading-matric-filter"
                type="search"
                value={matricNumberFilter}
                onChange={(event) => setMatricNumberFilter(event.target.value)}
                placeholder="Enter full or partial matric number"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="grading-semester-filter" className="mb-1 block text-sm font-medium">Course semester</label>
              <select
                id="grading-semester-filter"
                value={semesterFilter}
                onChange={(event) => setSemesterFilter(event.target.value as SemesterFilter)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All semesters</option>
                <option value="first">First semester</option>
                <option value="second">Second semester</option>
                <option value="full_year">Full year</option>
                <option value="unassigned">Semester not assigned</option>
              </select>
            </div>
            <Button type="submit" disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search scripts
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={searching || (!levelFilter && !matricNumberFilter)}
              onClick={() => {
                setLevelFilter('');
                setMatricNumberFilter('');
                setSemesterFilter('all');
                void searchScripts('', '', 'all');
              }}
            >
              Clear
            </Button>
          </form>
          {visibleAttempts.map((a: any) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openScript(a)}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{a?.assessment?.title ?? ''}</h3>
                    <p className="text-sm text-muted-foreground">
                      {a?.candidate?.name ?? ''} — {a?.assessment?.course?.code ?? ''} · {courseSemesterLabel(a?.assessment?.course?.semester)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a?.candidate?.academicLevel ? `Level ${a.candidate.academicLevel}` : 'Level not set'}
                      {a?.candidate?.matricNumber ? ` · ${a.candidate.matricNumber}` : ' · Matric number not set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a?.status === 'submitted' || a?.status === 'auto_submitted_violation' ? 'default' : 'secondary'}>{a?.status ?? ''}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => { event.stopPropagation(); void openScript(a); }}
                    >
                      Access response
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {visibleAttempts.length === 0 && <p className="text-center text-muted-foreground py-12">No submitted scripts match these filters.</p>}
        </div>
      )}

      {/* Grade Dialog */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lecturer grade review</DialogTitle></DialogHeader>
          {selectedQuestion && (
            <LecturerGradeReview
              provisionalScore={selectedQuestion.provisionalScore}
              officialGrade={selectedQuestion.officialGrade}
              lecturerDecision={selectedQuestion.lecturerDecision}
              maxMark={selectedQuestion.maxMark}
              gradedBy={selectedQuestion.gradedBy}
              gradedAt={selectedQuestion.gradedAt ? new Date(selectedQuestion.gradedAt).toLocaleString() : null}
              onDecision={(decision, officialGrade) =>
                saveGrade(selectedQuestion.attemptId, selectedQuestion.questionId, decision, officialGrade)
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
