'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Save, CheckCircle } from 'lucide-react';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';

export default function PracticePage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePractice, setActivePractice] = useState<any>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');

  useEffect(() => {
    fetch('/api/assessments').then((r) => r.json()).then((a) => setAssessments(a ?? [])).finally(() => setLoading(false));
  }, []);

  const startPractice = async (assessmentId: string) => {
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId }),
    });
    const data = await res.json();
    if (res.ok) {
      setActivePractice(data);
      setResponses({});
    }
  };

  const savePractice = async (complete = false) => {
    if (!activePractice?.id) return;
    setSaving(true);
    await fetch('/api/practice', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceAttemptId: activePractice.id, responses, complete }),
    });
    setSaving(false);
    if (complete) setActivePractice(null);
  };

  const items = useMemo(() => activePractice?.assessment?.items ?? [], [activePractice]);

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (activePractice) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Practice Mode</h1>
          <p className="text-muted-foreground">
            {activePractice.assessment?.title} · {courseSemesterLabel(activePractice.assessment?.course?.semester)}
          </p>
        </div>

        <div className="space-y-4">
          {items.map((item: any, idx: number) => {
            const q = item.question;
            return (
              <div key={item.id} className="border rounded-lg p-4 space-y-3">
                <p className="font-medium">Q{idx + 1}. {q?.text}</p>
                {q?.type === 'multiple_choice' ? (
                  <div className="space-y-2">
                    {(q?.options ?? []).map((opt: any) => (
                      <label key={opt.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={responses[q.id]?.selectedOptionId === opt.id}
                          onChange={() => setResponses((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? {}), selectedOptionId: opt.id } }))}
                        />
                        <span>{opt.text}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="w-full border rounded-md p-2"
                    rows={5}
                    value={responses[q.id]?.text ?? ''}
                    onChange={(e) => setResponses((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? {}), text: e.target.value } }))}
                    placeholder="Write your practice response"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={() => savePractice(false)} className="px-4 py-2 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-2" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Practice
          </button>
          <button onClick={() => savePractice(true)} className="px-4 py-2 rounded-md bg-green-600 text-white inline-flex items-center gap-2" disabled={saving}>
            <CheckCircle className="h-4 w-4" /> Complete Practice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Assessments</h1>
        <p className="text-muted-foreground">Non-official practice records are stored separately from official exams.</p>
      </div>

      <div className="space-y-3">
        <label className="flex w-full max-w-xs flex-col gap-1 text-sm font-medium">
          Filter practice assessments by semester
          <select aria-label="Filter practice assessments by semester" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value as SemesterFilter)} className="h-10 rounded-md border bg-background px-3">
            <option value="all">All semesters</option>
            <option value="first">First semester</option>
            <option value="second">Second semester</option>
            <option value="full_year">Full year</option>
            <option value="unassigned">Semester not assigned</option>
          </select>
        </label>
        {(assessments ?? []).filter((assessment: any) => matchesSemester(assessment?.course?.semester, semesterFilter)).map((a: any) => (
          <div key={a.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a?.course?.code} - {a?.course?.title} · {courseSemesterLabel(a?.course?.semester)}</p>
            </div>
            <button onClick={() => startPractice(a.id)} className="px-3 py-2 rounded-md border inline-flex items-center gap-2">
              <Play className="h-4 w-4" /> Start Practice
            </button>
          </div>
        ))}
        {(assessments ?? []).filter((assessment: any) => matchesSemester(assessment?.course?.semester, semesterFilter)).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No practice assessments are available for this semester.</p>
        )}
      </div>
    </div>
  );
}
