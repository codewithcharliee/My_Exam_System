'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ClipboardList, Plus, Loader2, Clock, Users, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { SafeDate } from '@/components/safe-format';
import { isFirstLevelCourse } from '@/lib/academic-rules';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';

const MARKING_METHODS = ['human_grading', 'marking_points', 'exact_match', 'acceptable_answer', 'ai_recommendation'];

export default function AssessmentsPage() {
  const { data: session } = useSession();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');
  const [form, setForm] = useState({
    courseId: '', title: '', type: 'exam', durationMins: 120,
    startAt: '', endAt: '', randomizeQuestions: false, randomizeOptions: false,
  });
  const [selectedQuestions, setSelectedQuestions] = useState<any[]>([]);
  const role = (session?.user as any)?.role ?? '';
  const selectedCourse = courses.find((course: any) => course.id === form.courseId);
  const objectiveQuestionsAllowed = isFirstLevelCourse(selectedCourse?.level);

  useEffect(() => {
    Promise.all([
      fetch('/api/assessments').then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
      role === 'lecturer' ? fetch('/api/questions').then(r => r.json()) : Promise.resolve([]),
    ]).then(([a, c, q]) => {
      setAssessments(a ?? []);
      setCourses(c?.courses ?? c ?? []);
      setQuestions(q ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [role]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          durationMins: parseInt(String(form.durationMins)),
          startAt: form.startAt || null,
          endAt: form.endAt || null,
          items: selectedQuestions.map((sq: any, i: number) => ({
            questionId: sq.id,
            displayOrder: i + 1,
            maxMark: sq.maxMark || 10,
            markingMethod: sq.markingMethod || 'human_grading',
          })),
        }),
      });
      if (res.ok) {
        toast.success('Assessment created');
        setShowCreate(false);
        setSelectedQuestions([]);
        const a = await fetch('/api/assessments').then(r => r.json());
        setAssessments(a ?? []);
      } else {
        const data = await res.json();
        toast.error(data?.error ?? 'Failed to create assessment');
      }
    } catch {
      toast.error('Error');
    }
    setCreating(false);
  };

  const togglePublish = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await fetch(`/api/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Assessment ${newStatus}`);
      const a = await fetch('/api/assessments').then(r => r.json());
      setAssessments(a ?? []);
    } catch {
      toast.error('Failed');
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      published: 'bg-green-100 text-green-700',
      closed: 'bg-red-100 text-red-700',
      archived: 'bg-slate-100 text-slate-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? ''}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Assessments
          </h1>
          <p className="text-muted-foreground">Configure and manage examinations by course semester</p>
        </div>

        {role === 'lecturer' && (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Assessment</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Assessment</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div><Label>Title</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} required /></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><Label>Course</Label>
                    <Select value={form.courseId} onValueChange={(v: string) => {
                      setForm({ ...form, courseId: v });
                      setSelectedQuestions([]);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{(courses ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c?.code ?? ''} · {courseSemesterLabel(c?.semester)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Type</Label>
                    <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exam">Examination</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div><Label>Duration (min)</Label><Input type="number" value={form.durationMins} onChange={(e: any) => setForm({ ...form, durationMins: parseInt(e.target.value) || 120 })} /></div>
                  <div><Label>Start</Label><Input type="datetime-local" value={form.startAt} onChange={(e: any) => setForm({ ...form, startAt: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="datetime-local" value={form.endAt} onChange={(e: any) => setForm({ ...form, endAt: e.target.value })} /></div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.randomizeQuestions} onChange={(e: any) => setForm({ ...form, randomizeQuestions: e.target.checked })} /> Randomize Questions</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.randomizeOptions} onChange={(e: any) => setForm({ ...form, randomizeOptions: e.target.checked })} /> Randomize Options</label>
                </div>

                <div>
                  <Label>Add Questions from Bank</Label>
                  <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-2 mt-1">
                    {(questions ?? []).filter((q: any) =>
                      (!form.courseId || q?.courseId === form.courseId)
                      && (q?.type !== 'multiple_choice' || objectiveQuestionsAllowed)
                    ).map((q: any) => {
                      const selected = selectedQuestions.find((s: any) => s.id === q.id);
                      return (
                        <div key={q.id} className="border rounded p-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!selected}
                              onChange={(e: any) => {
                                if (e.target.checked) {
                                  setSelectedQuestions([...selectedQuestions, { id: q.id, maxMark: 10, markingMethod: 'human_grading' }]);
                                } else {
                                  setSelectedQuestions(selectedQuestions.filter((s: any) => s.id !== q.id));
                                }
                              }}
                            />
                            <span className="truncate">{(q?.text ?? '').slice(0, 120)}</span>
                          </label>

                          {selected && (
                            <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2">
                              <div>
                                <Label className="text-xs">Max Mark</Label>
                                <Input
                                  type="number"
                                  value={selected.maxMark}
                                  onChange={(e: any) => {
                                    const value = Number(e.target.value) || 0;
                                    setSelectedQuestions((prev: any[]) => prev.map((s) => s.id === q.id ? { ...s, maxMark: value } : s));
                                  }}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Marking Method</Label>
                                <Select
                                  value={selected.markingMethod}
                                  onValueChange={(v: string) => setSelectedQuestions((prev: any[]) => prev.map((s) => s.id === q.id ? { ...s, markingMethod: v } : s))}
                                >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {MARKING_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={creating || selectedQuestions.length === 0}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create Assessment
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <label className="flex w-full max-w-xs flex-col gap-1 text-sm font-medium">
            Filter assessments by semester
            <select aria-label="Filter assessments by semester" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value as SemesterFilter)} className="h-10 rounded-md border bg-background px-3">
              <option value="all">All semesters</option>
              <option value="first">First semester</option>
              <option value="second">Second semester</option>
              <option value="full_year">Full year</option>
              <option value="unassigned">Semester not assigned</option>
            </select>
          </label>
          {(assessments ?? []).filter((assessment: any) => matchesSemester(assessment?.course?.semester, semesterFilter)).map((a: any) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{a?.title ?? ''}</span>
                      {statusBadge(a?.status ?? 'draft')}
                      <Badge variant="outline" className="text-xs">{a?.type ?? ''}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{a?.course?.code ?? ''} - {a?.course?.title ?? ''} · {courseSemesterLabel(a?.course?.semester)}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {a?.durationMins ?? 0} min</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {a?._count?.attempts ?? 0} attempts</span>
                      {a?.startAt && <span>Start: <SafeDate date={a.startAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} /></span>}
                    </div>
                  </div>
                  {(role === 'lecturer' || role === 'admin') && (
                    <Button variant="outline" size="sm" onClick={() => togglePublish(a.id, a?.status ?? 'draft')}>
                      {a?.status === 'published' ? <><XCircle className="h-3.5 w-3.5 mr-1" /> Unpublish</> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publish</>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(assessments ?? []).filter((assessment: any) => matchesSemester(assessment?.course?.semester, semesterFilter)).length === 0 && <p className="text-center text-muted-foreground py-12">No assessments found for this semester</p>}
        </div>
      )}
    </div>
  );
}
