'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Brain, Sparkles, Loader2, Copy, Check, BookOpen } from 'lucide-react';
import { COURSE_MATERIAL_ACCEPT, extractCourseMaterial } from '@/lib/ai/course-material';
import { AI_GENERATION_MAX_QUESTIONS, AI_MATERIAL_MAX_CHARACTERS } from '@/lib/ai/limits';
import { isFirstLevelCourse } from '@/lib/academic-rules';
import { courseSemesterLabel } from '@/lib/course-semester';

export default function AIToolsPage() {
  const [tab, setTab] = useState<'generate' | 'assess'>('generate');

  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState('');

  const [topic, setTopic] = useState('');
  const [courseMaterial, setCourseMaterial] = useState('');
  const [courseMaterialFileName, setCourseMaterialFileName] = useState('');
  const [generationMaterialError, setGenerationMaterialError] = useState('');
  const [generationMaterialLoading, setGenerationMaterialLoading] = useState(false);
  const [markingRules, setMarkingRules] = useState('');
  const [qType, setQType] = useState('multiple_choice');
  const [count, setCount] = useState('5');
  const [difficulty, setDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [genProgress, setGenProgress] = useState(0);
  const [addingQuestionId, setAddingQuestionId] = useState('');
  const [addedQuestionIds, setAddedQuestionIds] = useState<string[]>([]);

  const [attemptId, setAttemptId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [assessmentMaterial, setAssessmentMaterial] = useState('');
  const [assessmentMaterialFileName, setAssessmentMaterialFileName] = useState('');
  const [assessmentMaterialError, setAssessmentMaterialError] = useState('');
  const [assessmentMaterialLoading, setAssessmentMaterialLoading] = useState(false);
  const [assessmentMarkingRules, setAssessmentMarkingRules] = useState('');
  const [markingSchemeRaw, setMarkingSchemeRaw] = useState('{\n  "method": "human_grading",\n  "maxMark": 10\n}');
  const [assessing, setAssessing] = useState(false);
  const [assessResult, setAssessResult] = useState<any>(null);
  const [assessProgress, setAssessProgress] = useState(0);

  const [copied, setCopied] = useState(false);
  const parsedQuestionCount = Number(count);
  const questionCountIsValid = count.trim() !== ''
    && Number.isInteger(parsedQuestionCount)
    && parsedQuestionCount >= 1
    && parsedQuestionCount <= AI_GENERATION_MAX_QUESTIONS;
  const selectedGenerationCourse = courses.find((course: any) => course.id === courseId);
  const objectiveGenerationAllowed = isFirstLevelCourse(selectedGenerationCourse?.level);

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json())
      .then((d) => {
        const list = d?.courses ?? d ?? [];
        setCourses(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list.length > 0) {
          const initialCourse = list.find((course: any) => isFirstLevelCourse(course.level)) ?? list[0];
          setCourseId(initialCourse.id);
          if (!isFirstLevelCourse(initialCourse.level)) setQType('short_answer');
        }
      })
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!topic?.trim() || !courseId || !courseMaterial.trim() || !questionCountIsValid) return;
    setGenerating(true); setGenResult(null); setGenProgress(0); setAddedQuestionIds([]);

    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          topic,
          courseMaterial,
          markingRules,
          questionType: qType,
          count: parsedQuestionCount,
          difficulty,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Question generation failed.');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream returned');
      const decoder = new TextDecoder();
      let partialRead = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }
          if (parsed?.status === 'processing') setGenProgress((p: number) => Math.min(p + 2, 99));
          else if (parsed?.status === 'completed') { setGenResult(parsed?.result); setGenProgress(100); }
          else if (parsed?.status === 'error') throw new Error(parsed?.message ?? 'Generation failed');
        }
      }
    } catch (e: any) {
      setGenResult({ error: e?.message ?? 'Generation failed' });
    } finally {
      setGenerating(false);
    }
  }

  async function addGeneratedQuestionToBank(questionIndex: number) {
    const questionId = genResult?.draftIds?.[questionIndex];
    if (!questionId || addingQuestionId) return;

    setAddingQuestionId(questionId);
    try {
      const response = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not add question to the course question bank.');
      setAddedQuestionIds((current) => [...current, questionId]);
    } catch (error) {
      setGenResult((current: any) => ({
        ...current,
        actionError: error instanceof Error ? error.message : 'Could not add question to the course question bank.',
      }));
    } finally {
      setAddingQuestionId('');
    }
  }

  async function handleAssess() {
    if (!questionText?.trim() || !responseText?.trim()) return;
    setAssessing(true); setAssessResult(null); setAssessProgress(0);

    let parsedMarkingScheme: any = null;
    try {
      parsedMarkingScheme = markingSchemeRaw ? JSON.parse(markingSchemeRaw) : null;
    } catch {
      setAssessResult({ error: 'Marking scheme JSON is invalid.' });
      setAssessing(false);
      return;
    }

    try {
      const res = await fetch('/api/ai/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: attemptId || undefined,
          questionId: questionId || undefined,
          responseText,
          questionText,
          courseMaterial: assessmentMaterial,
          markingRules: assessmentMarkingRules,
          markingScheme: parsedMarkingScheme,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Assessment failed.');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream returned');
      const decoder = new TextDecoder();
      let partialRead = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }
          if (parsed?.status === 'processing') setAssessProgress((p: number) => Math.min(p + 3, 99));
          else if (parsed?.status === 'completed') { setAssessResult(parsed?.result); setAssessProgress(100); }
          else if (parsed?.status === 'error') throw new Error(parsed?.message ?? 'Assessment failed');
        }
      }
    } catch (e: any) {
      setAssessResult({ error: e?.message ?? 'Assessment failed' });
    } finally {
      setAssessing(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText?.(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> AI Tools
        </h1>
        <p className="text-muted-foreground mt-1">AI-powered question generation and assessment recommendation</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('generate')} className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'generate' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          <Sparkles className="h-4 w-4 inline mr-2" />Generate Questions
        </button>
        <button onClick={() => setTab('assess')} className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'assess' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          <BookOpen className="h-4 w-4 inline mr-2" />Assess Response
        </button>
      </div>

      {tab === 'generate' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg p-6 shadow-md space-y-4">
            <h3 className="font-semibold text-foreground">Question Generator</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Course *</label>
              <select value={courseId} onChange={(e) => {
                const nextCourseId = e.target.value;
                const nextCourse = courses.find((course: any) => course.id === nextCourseId);
                setCourseId(nextCourseId);
                if (!isFirstLevelCourse(nextCourse?.level) && qType === 'multiple_choice') setQType('short_answer');
              }} className="w-full px-3 py-2 border rounded-md bg-background text-foreground">
                {(courses ?? []).map((c: any) => (
                  <option key={c?.id} value={c?.id}>{c?.code} - {c?.title} · {courseSemesterLabel(c?.semester)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Topic *</label>
              <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="e.g. Constitutional law and judicial review" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Course material *</label>
              <textarea value={courseMaterial} onChange={e => setCourseMaterial(e.target.value)} rows={5} maxLength={AI_MATERIAL_MAX_CHARACTERS} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Paste relevant lecture notes, cases, or course material here." />
              <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
                {courseMaterial.length.toLocaleString()} / {AI_MATERIAL_MAX_CHARACTERS.toLocaleString()} characters
              </p>
              <p className="text-xs text-muted-foreground">This material is sent to your configured AI provider. Do not include sensitive personal information.</p>
              <label className="mt-2 block text-sm font-medium">Or upload course material</label>
              <input
                type="file"
                accept={COURSE_MATERIAL_ACCEPT}
                className="mt-1 block w-full text-sm"
                disabled={generationMaterialLoading}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setGenerationMaterialError('');
                  setCourseMaterial('');
                  setCourseMaterialFileName('');
                  setGenerationMaterialLoading(true);
                  extractCourseMaterial(file)
                    .then(text => {
                      setCourseMaterial(text);
                      setCourseMaterialFileName(file.name);
                    })
                    .catch(error => setGenerationMaterialError(error instanceof Error ? error.message : 'Could not read the selected file.'))
                    .finally(() => setGenerationMaterialLoading(false));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, OpenDocument, RTF, TXT, Markdown, CSV, and HTML files up to 10 MB. Text is extracted in your browser.</p>
              {generationMaterialLoading && <p role="status" className="mt-1 text-sm text-muted-foreground">Extracting course material...</p>}
              {courseMaterialFileName && <p className="mt-1 text-xs text-muted-foreground">Loaded: {courseMaterialFileName}</p>}
              {generationMaterialError && <p role="alert" className="mt-1 text-sm text-destructive">{generationMaterialError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Marking rules (optional)</label>
              <textarea value={markingRules} onChange={e => setMarkingRules(e.target.value)} rows={3} maxLength={12_000} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Add mark allocation, acceptable answers, or exclusions if needed." />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={qType} onChange={e => setQType(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground">
                  {objectiveGenerationAllowed && <option value="multiple_choice">Multiple Choice</option>}
                  <option value="short_answer">Short Answer</option>
                  <option value="essay">Essay</option>
                  <option value="legal_problem">Legal Problem</option>
                  <option value="case_analysis">Case Analysis</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Count</label>
                <input type="number" value={count} onChange={e => setCount(e.target.value)} min={1} max={AI_GENERATION_MAX_QUESTIONS} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
                <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
                  {count.trim() ? `${count} / ${AI_GENERATION_MAX_QUESTIONS} questions` : `Max ${AI_GENERATION_MAX_QUESTIONS} questions`}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <button onClick={handleGenerate} disabled={generating || !topic?.trim() || !courseId || !courseMaterial.trim() || !questionCountIsValid} className="w-full py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" />Generating... ({genProgress}%)</> : <><Sparkles className="h-4 w-4" />Generate</>}
            </button>
          </div>

          <div className="bg-card rounded-lg p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Generated Questions</h3>
              {genResult && !genResult?.error && (
                <button onClick={() => copyToClipboard(JSON.stringify(genResult, null, 2))} className="text-sm text-primary flex items-center gap-1">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
              )}
            </div>
            {genResult?.error ? (
              <p className="text-destructive">{genResult.error}</p>
            ) : genResult ? (
              <div className="max-h-[500px] overflow-y-auto space-y-4">
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Saved as draft questions. Review and approve each item before adding it to the approved question bank.
                </p>
                {(genResult?.questions ?? [genResult]).map((q: any, i: number) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-md">
                    <p className="font-medium text-sm">Q{i + 1}: {q?.text ?? q?.question ?? JSON.stringify(q)}</p>
                    {q?.options?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {q.options.map((option: any, optionIndex: number) => (
                          <li key={optionIndex}>{option.text}{option.isCorrect ? ' — correct answer' : ''}</li>
                        ))}
                      </ul>
                    )}
                    {q?.markingScheme && (
                      <div className="mt-2 text-sm">
                        <p className="font-medium">Marking scheme: {q.markingScheme.maxMark} marks</p>
                        <ul className="list-disc pl-5">
                          {(q.markingScheme.rubric ?? []).map((criterion: any, criterionIndex: number) => (
                            <li key={criterionIndex}>{criterion.criterion}: {criterion.maxMark} marks</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {genResult?.draftIds?.[i] && (
                      <button
                        type="button"
                        className="mt-3 rounded-md border px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-60"
                        disabled={addingQuestionId !== '' || addedQuestionIds.includes(genResult.draftIds[i])}
                        onClick={() => addGeneratedQuestionToBank(i)}
                      >
                        {addedQuestionIds.includes(genResult.draftIds[i])
                          ? 'Added to question bank'
                          : addingQuestionId === genResult.draftIds[i]
                            ? 'Adding...'
                            : 'Add to question bank'}
                      </button>
                    )}
                  </div>
                ))}
                {genResult?.actionError && <p role="alert" className="text-sm text-destructive">{genResult.actionError}</p>}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Generated questions will appear here...</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg p-6 shadow-md space-y-4">
            <h3 className="font-semibold text-foreground">Assessment Recommendation</h3>
            <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">For a saved exam response, open the Grading Interface and choose a submitted script. The response and question will load automatically.</p>
              <Link href="/dashboard/grading" className="shrink-0 rounded-md border bg-background px-3 py-2 text-center text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Open Grading Interface
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Attempt ID (optional)</label>
                <input value={attemptId} onChange={(e) => setAttemptId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Question ID (optional)</label>
                <input value={questionId} onChange={(e) => setQuestionId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Enter both IDs to save the recommendation to an exam script. Leave both blank for an unlinked practice assessment.</p>
            <div>
              <label className="block text-sm font-medium mb-1">Question Text *</label>
              <textarea value={questionText} onChange={e => setQuestionText(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Student Response *</label>
              <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Course material (optional)</label>
              <textarea value={assessmentMaterial} onChange={e => setAssessmentMaterial(e.target.value)} rows={4} maxLength={50_000} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Paste the relevant course material used to assess this answer." />
              <p className="text-xs text-muted-foreground">This material is sent to your configured AI provider. Do not include sensitive personal information.</p>
              <label className="mt-2 block text-sm font-medium">Or upload course material</label>
              <input
                type="file"
                accept={COURSE_MATERIAL_ACCEPT}
                className="mt-1 block w-full text-sm"
                disabled={assessmentMaterialLoading}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setAssessmentMaterialError('');
                  setAssessmentMaterial('');
                  setAssessmentMaterialFileName('');
                  setAssessmentMaterialLoading(true);
                  extractCourseMaterial(file)
                    .then(text => {
                      setAssessmentMaterial(text);
                      setAssessmentMaterialFileName(file.name);
                    })
                    .catch(error => setAssessmentMaterialError(error instanceof Error ? error.message : 'Could not read the selected file.'))
                    .finally(() => setAssessmentMaterialLoading(false));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, OpenDocument, RTF, TXT, Markdown, CSV, and HTML files up to 10 MB. Text is extracted in your browser.</p>
              {assessmentMaterialLoading && <p role="status" className="mt-1 text-sm text-muted-foreground">Extracting course material...</p>}
              {assessmentMaterialFileName && <p className="mt-1 text-xs text-muted-foreground">Loaded: {assessmentMaterialFileName}</p>}
              {assessmentMaterialError && <p role="alert" className="mt-1 text-sm text-destructive">{assessmentMaterialError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Additional marking rules (optional)</label>
              <textarea value={assessmentMarkingRules} onChange={e => setAssessmentMarkingRules(e.target.value)} rows={3} maxLength={12_000} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Marking Scheme JSON *</label>
              <textarea value={markingSchemeRaw} onChange={e => setMarkingSchemeRaw(e.target.value)} rows={5} className="w-full px-3 py-2 border rounded-md bg-background text-foreground font-mono text-xs" />
            </div>
            <button onClick={handleAssess} disabled={assessing || !questionText?.trim() || !responseText?.trim()} className="w-full py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {assessing ? <><Loader2 className="h-4 w-4 animate-spin" />Assessing... ({assessProgress}%)</> : <><Brain className="h-4 w-4" />Assess</>}
            </button>
          </div>

          <div className="bg-card rounded-lg p-6 shadow-md">
            <h3 className="font-semibold text-foreground mb-4">Assessment Result</h3>
            {assessResult?.error ? (
              <p className="text-destructive">{assessResult.error}</p>
            ) : assessResult ? (
              <div className="space-y-4">
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <p className="text-3xl font-bold text-primary">{assessResult?.suggested_score ?? 0} / {assessResult?.max_score ?? '-'}</p>
                  <p className="text-sm text-muted-foreground mt-1">AI Suggested Score</p>
                </div>
                {assessResult?.rationale && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{assessResult.rationale}</p>}
                {assessResult?.strengths && <p className="text-sm"><strong>Strengths:</strong> {JSON.stringify(assessResult.strengths)}</p>}
                {assessResult?.weaknesses && <p className="text-sm"><strong>Weaknesses:</strong> {JSON.stringify(assessResult.weaknesses)}</p>}
                {assessResult?.criterion_observations?.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">Criterion-by-criterion marks</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {assessResult.criterion_observations.map((criterion: any, index: number) => (
                        <li key={`${criterion.criterion}-${index}`}>
                          <strong>{criterion.criterion}:</strong> {criterion.awarded_score}/{criterion.max_score}
                          {criterion.comment ? ` — ${criterion.comment}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {assessResult?.validation && (
                  <div role={assessResult.validation.review_required ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm ${assessResult.validation.review_required ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-900'}`}>
                    <p className="font-semibold">{assessResult.validation.passed ? 'Score calculations validated' : 'Validation checks failed'}{assessResult.validation.review_required ? ' — lecturer review required' : ''}</p>
                    {assessResult.validation.issues?.length > 0 && <ul className="mt-1 list-disc pl-5">{assessResult.validation.issues.map((issue: string) => <li key={issue}>{issue}</li>)}</ul>}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Uncertainty: {assessResult?.uncertainty_level ?? 'unknown'} · AI output is a recommendation; lecturer confirmation is required before recording an official grade.</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Assessment results will appear here...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
