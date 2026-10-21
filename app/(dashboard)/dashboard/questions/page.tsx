'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Loader2, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { isFirstLevelCourse } from '@/lib/academic-rules';

const typeLabels: Record<string, string> = {
  multiple_choice: 'Multiple Choice',
  short_answer: 'Short Answer',
  essay: 'Essay',
  legal_problem: 'Legal Problem',
  case_analysis: 'Case Analysis',
};

export default function QuestionsPage() {
  const searchParams = useSearchParams();
  const [questions, setQuestions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCourseId, setFilterCourseId] = useState(searchParams.get('courseId') ?? 'all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [acceptedPhrasesRaw, setAcceptedPhrasesRaw] = useState('');
  const [pointText, setPointText] = useState('');
  const [pointMarks, setPointMarks] = useState(1);
  const [pointAlternativesRaw, setPointAlternativesRaw] = useState('');
  const [markingPoints, setMarkingPoints] = useState<any[]>([]);

  const [form, setForm] = useState({
    courseId: '',
    type: 'multiple_choice',
    text: '',
    difficulty: 'medium',
    topic: '',
    wordLimit: '',
    wordTarget: '',
    options: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
    markingScheme: {
      method: 'human_grading',
      maxMark: 10,
    },
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/questions').then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
    ]).then(([q, c]) => {
      setQuestions(q ?? []);
      setCourses(c?.courses ?? c ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const body: any = {
        courseId: form.courseId,
        type: form.type,
        text: form.text,
        difficulty: form.difficulty,
        topic: form.topic,
        wordLimit: form.wordLimit ? Number(form.wordLimit) : null,
        wordTarget: form.wordTarget ? Number(form.wordTarget) : null,
      };

      if (form.type === 'multiple_choice') {
        body.options = form.options;
      } else {
        const method = form.markingScheme.method;
        const markingScheme: any = {
          method,
          maxMark: Number(form.markingScheme.maxMark) || 0,
          configJson: null,
          markingPoints: [],
        };

        if (['exact_match', 'acceptable_answer', 'ai_recommendation'].includes(method)) {
          const phrases = acceptedPhrasesRaw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          markingScheme.configJson = { acceptedPhrases: phrases };
        }

        if (method === 'marking_points') {
          markingScheme.markingPoints = markingPoints.map((p: any) => ({
            pointText: p.pointText,
            marks: Number(p.marks),
            alternativesJson: p.alternatives,
          }));
        }

        body.markingScheme = markingScheme;
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Question created');
        setShowCreate(false);
        setAcceptedPhrasesRaw('');
        setMarkingPoints([]);
        const q = await fetch('/api/questions').then(r => r.json());
        setQuestions(q ?? []);
      } else {
        const data = await res.json();
        toast.error(data?.error || 'Failed');
      }
    } catch {
      toast.error('Error');
    }
    setCreating(false);
  };

  async function approveQuestion(question: any) {
    const res = await fetch(`/api/questions/${question.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
    if (res.ok) { setQuestions((prev) => prev.map((item) => item.id === question.id ? { ...item, status: 'approved' } : item)); toast.success('Question approved'); }
    else { const data = await res.json(); toast.error(data?.error ?? 'Approval failed'); }
  }

  const filtered = (questions ?? []).filter((q: any) => {
    if (filterCourseId !== 'all' && q?.courseId !== filterCourseId) return false;
    if (filterType !== 'all' && q?.type !== filterType) return false;
    if (search && !(q?.text ?? '').toLowerCase().includes(search.toLowerCase()) && !(q?.topic ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const formCourse = courses.find((course: any) => course.id === form.courseId);
  const objectiveQuestionsAllowed = isFirstLevelCourse(formCourse?.level);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Question Bank
          </h1>
          <p className="text-muted-foreground">Create and manage examination questions</p>
        </div>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Question</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Question</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Course</Label>
                  <Select value={form.courseId} onValueChange={(v: string) => {
                    const selectedCourse = courses.find((course: any) => course.id === v);
                    setForm({
                      ...form,
                      courseId: v,
                      type: !isFirstLevelCourse(selectedCourse?.level) && form.type === 'multiple_choice' ? 'short_answer' : form.type,
                    });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {(courses ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c?.code ?? ''} - {c?.title ?? ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).filter(([key]) => key !== 'multiple_choice' || objectiveQuestionsAllowed).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty} onValueChange={(v: string) => setForm({ ...form, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Topic</Label><Input value={form.topic} onChange={(e: any) => setForm({ ...form, topic: e.target.value })} placeholder="Topic" /></div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><Label>Word Target</Label><Input type="number" min="1" value={form.wordTarget} onChange={(e: any) => setForm({ ...form, wordTarget: e.target.value })} /></div><div><Label>Word Limit</Label><Input type="number" min="1" value={form.wordLimit} onChange={(e: any) => setForm({ ...form, wordLimit: e.target.value })} /></div></div>

              <div><Label>Question Text</Label><Textarea value={form.text} onChange={(e: any) => setForm({ ...form, text: e.target.value })} rows={4} required /></div>

              {form.type === 'multiple_choice' && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {form.options.map((opt: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="radio" name="correct" checked={opt.isCorrect} onChange={() => {
                        const opts = form.options.map((o: any, j: number) => ({ ...o, isCorrect: j === i }));
                        setForm({ ...form, options: opts });
                      }} />
                      <Input value={opt.text} onChange={(e: any) => {
                        const opts = [...form.options];
                        opts[i] = { ...opts[i], text: e.target.value };
                        setForm({ ...form, options: opts });
                      }} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                    </div>
                  ))}
                </div>
              )}

              {form.type !== 'multiple_choice' && (
                <div className="space-y-3 border rounded-md p-3">
                  <div>
                    <Label>Marking Method</Label>
                    <Select value={form.markingScheme.method} onValueChange={(v: string) => setForm({ ...form, markingScheme: { ...form.markingScheme, method: v } })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="human_grading">Human Grading</SelectItem>
                        <SelectItem value="marking_points">Marking Points</SelectItem>
                        <SelectItem value="exact_match">Exact Match</SelectItem>
                        <SelectItem value="acceptable_answer">Acceptable Answer</SelectItem>
                        <SelectItem value="ai_recommendation">AI Recommendation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Max Mark</Label><Input type="number" value={form.markingScheme.maxMark} onChange={(e: any) => setForm({ ...form, markingScheme: { ...form.markingScheme, maxMark: parseFloat(e.target.value) || 0 } })} /></div>

                  {['exact_match', 'acceptable_answer', 'ai_recommendation'].includes(form.markingScheme.method) && (
                    <div>
                      <Label>Accepted Phrases / Equivalent Answers (one per line)</Label>
                      <Textarea value={acceptedPhrasesRaw} onChange={(e: any) => setAcceptedPhrasesRaw(e.target.value)} rows={4} placeholder="contract\noffer and acceptance\nconsideration" />
                    </div>
                  )}

                  {form.markingScheme.method === 'marking_points' && (
                    <div className="space-y-2">
                      <Label>Marking Points</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Input placeholder="Point text" value={pointText} onChange={(e: any) => setPointText(e.target.value)} />
                        <Input type="number" placeholder="Marks" value={pointMarks} onChange={(e: any) => setPointMarks(Number(e.target.value))} />
                        <Input placeholder="Alternatives (comma-separated)" value={pointAlternativesRaw} onChange={(e: any) => setPointAlternativesRaw(e.target.value)} />
                      </div>
                      <Button type="button" variant="outline" onClick={() => {
                        if (!pointText.trim()) return;
                        const alternatives = pointAlternativesRaw.split(',').map((s) => s.trim()).filter(Boolean);
                        setMarkingPoints((prev) => [...prev, { pointText: pointText.trim(), marks: pointMarks || 1, alternatives }]);
                        setPointText('');
                        setPointMarks(1);
                        setPointAlternativesRaw('');
                      }}>Add Point</Button>

                      {(markingPoints ?? []).length > 0 && (
                        <div className="space-y-2">
                          {markingPoints.map((p: any, idx: number) => (
                            <div key={idx} className="text-sm border rounded p-2 flex justify-between">
                              <div>
                                <p className="font-medium">{p.pointText} ({p.marks} marks)</p>
                                <p className="text-xs text-muted-foreground">Alternatives: {(p.alternatives ?? []).join(', ') || 'None'}</p>
                              </div>
                              <Button type="button" variant="ghost" onClick={() => setMarkingPoints((prev) => prev.filter((_: any, i: number) => i !== idx))}>Remove</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create Question
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search questions..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterCourseId} onValueChange={setFilterCourseId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All Law courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assigned Law courses</SelectItem>
            {(courses ?? []).map((course: any) => (
              <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(typeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q: any) => (
            <Card key={q.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{q?.course?.code ?? ''}</span>
                      <Badge variant="outline" className="text-xs">{typeLabels[q?.type ?? ''] ?? q?.type ?? ''}</Badge>
                      <Badge variant={q?.status === 'draft' ? 'secondary' : 'default'} className="text-xs">{q?.status ?? 'approved'}</Badge>
                      {q?.topic && <span className="text-xs text-muted-foreground">{q.topic}</span>}
                    </div>
                    <p className="text-sm">{(q?.text ?? '').slice(0, 220)}{(q?.text ?? '').length > 220 ? '...' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground font-mono">v{q?.version ?? 1}</span>{q?.status === 'draft' && <Button size="sm" variant="outline" onClick={() => approveQuestion(q)}>Approve</Button>}</div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">No questions found</p>}
        </div>
      )}
    </div>
  );
}
