'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookOpen, Plus, Loader2, Users, FileText, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');
  const [form, setForm] = useState({ code: '', title: '', level: 'LLB', semester: 'first', isElective: false, creditUnits: '' });
  const [creating, setCreating] = useState(false);
  const [assigningCourse, setAssigningCourse] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [updatingCandidateId, setUpdatingCandidateId] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [selectedLecturerByCourse, setSelectedLecturerByCourse] = useState<Record<string, string>>({});
  const [assigningLecturerCourseId, setAssigningLecturerCourseId] = useState('');

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/courses');
      if (res.ok) setCourses(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const res = await fetch('/api/courses');
        if (res.ok) setCourses(await res.json());
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    void loadCourses();
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then(async (session) => {
        const role = session?.user?.role ?? '';
        setCurrentRole(role);
        if (role === 'admin') {
          const response = await fetch('/api/users');
          if (response.ok) {
            const users = await response.json();
            setLecturers(users.filter((user: any) => user.role === 'lecturer'));
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('Course created');
        setShowCreate(false);
        setForm({ code: '', title: '', level: 'LLB', semester: 'first', isElective: false, creditUnits: '' });
        fetchCourses();
      } else {
        const data = await res.json();
        toast.error(data?.error || 'Failed');
      }
    } catch (e) { toast.error('Error'); }
    setCreating(false);
  };

  const openElectiveSelection = async (course: any) => {
    setAssigningCourse(course);
    setLoadingCandidates(true);
    try {
      const response = await fetch(`/api/users?courseId=${encodeURIComponent(course.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not load candidates');
      setCandidates(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load candidates');
      setAssigningCourse(null);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const toggleElectiveCandidate = async (candidate: any) => {
    if (!assigningCourse) return;
    setUpdatingCandidateId(candidate.id);
    try {
      const response = await fetch(`/api/courses/${assigningCourse.id}/assign`, {
        method: candidate.assigned ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: candidate.id, role: 'candidate' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not update elective selection');
      setCandidates((current) => current.map((item) => item.id === candidate.id
        ? { ...item, assigned: !candidate.assigned }
        : item));
      toast.success(candidate.assigned ? 'Candidate removed from elective' : 'Candidate selected for elective');
      fetchCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update elective selection');
    } finally {
      setUpdatingCandidateId('');
    }
  };

  const assignLecturer = async (course: any) => {
    const userId = selectedLecturerByCourse[course.id];
    if (!userId) return;
    setAssigningLecturerCourseId(course.id);
    try {
      const response = await fetch(`/api/courses/${course.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: 'lecturer' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not assign lecturer');
      setSelectedLecturerByCourse((current) => ({ ...current, [course.id]: '' }));
      toast.success('Lecturer assigned to course');
      fetchCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign lecturer');
    } finally {
      setAssigningLecturerCourseId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Course Management
          </h1>
          <p className="text-muted-foreground">Manage LLB courses grouped by level and academic semester, and manage lecturer assignments.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Course</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Course</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Course Code</Label><Input value={form.code} onChange={(e: any) => setForm({...form, code: e.target.value})} placeholder="LAW101" required /></div>
              <div><Label>Title</Label><Input value={form.title} onChange={(e: any) => setForm({...form, title: e.target.value})} placeholder="Introduction to Law" required /></div>
              <div><Label>Level</Label><Input value={form.level} onChange={(e: any) => setForm({...form, level: e.target.value})} placeholder="LLB 100" /></div>
              <div>
                <Label htmlFor="course-semester">Semester</Label>
                <select id="course-semester" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.semester} onChange={(e) => setForm({...form, semester: e.target.value})}>
                  <option value="first">First semester</option>
                  <option value="second">Second semester</option>
                  <option value="full_year">Full year</option>
                </select>
              </div>
              <div><Label>Credit units</Label><Input type="number" min="1" value={form.creditUnits} onChange={(e: any) => setForm({...form, creditUnits: e.target.value})} placeholder="Optional" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isElective} onChange={(e) => setForm({...form, isElective: e.target.checked})} /> Elective course</label>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create Course
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <label className="flex w-full max-w-xs flex-col gap-1 text-sm font-medium">
            Filter courses by semester
            <select
              aria-label="Filter courses by semester"
              className="h-10 rounded-md border border-input bg-background px-3 py-2"
              value={semesterFilter}
              onChange={(event) => setSemesterFilter(event.target.value as SemesterFilter)}
            >
              <option value="all">All semesters</option>
              <option value="first">First semester</option>
              <option value="second">Second semester</option>
              <option value="full_year">Full year</option>
              <option value="unassigned">Semester not assigned</option>
            </select>
          </label>
          <div className="space-y-8">
          {[...new Set(courses.map((course: any) => course.level ?? 'Level not set'))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((level) => {
              const levelCourses = courses.filter((course: any) =>
                (course.level ?? 'Level not set') === level && matchesSemester(course.semester, semesterFilter),
              );
              if (levelCourses.length === 0) return null;
              const semesterGroups = [
                { value: 'first', label: 'First semester' },
                { value: 'second', label: 'Second semester' },
                { value: 'full_year', label: 'Full year' },
                { value: null, label: 'Semester not assigned' },
              ].map((group) => ({ ...group, courses: levelCourses.filter((course: any) => (course.semester ?? null) === group.value) }))
                .filter((group) => group.courses.length > 0);

              return (
                <section key={level} className="space-y-5">
                  <h2 className="text-xl font-semibold">{level}</h2>
                  {semesterGroups.map((group) => (
                    <div key={group.label} className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {group.courses.map((c: any) => (
                          <Card key={c.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">{c?.code ?? ''}</span>
                                  <Badge variant="outline">{courseSemesterLabel(c?.semester)}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {c?.isElective && <Badge variant="secondary">Elective</Badge>}
                                  {c?.catalogSource && <Badge variant="outline">Provisional</Badge>}
                                </div>
                              </div>
                              <CardTitle className="text-lg mt-2">{c?.title ?? ''}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {c?._count?.questions ?? 0} questions</span>
                                <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {c?._count?.assessments ?? 0} assessments</span>
                              </div>
                              <Link
                                className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                                href={`/dashboard/questions?courseId=${encodeURIComponent(c.id)}`}
                              >
                                Open question bank
                              </Link>
                              {(c?.userCourses ?? []).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {(c?.userCourses ?? []).filter((uc: any) => uc?.user?.role === 'lecturer').map((uc: any) => (
                                    <span key={uc?.user?.id ?? `uc-${uc?.userId}`} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                      {uc?.user?.staffTitle ? `${uc.user.staffTitle} · ` : ''}{uc?.user?.name ?? 'Lecturer'}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {c?.isElective && (
                                <Button className="mt-4 w-full" size="sm" variant="outline" onClick={() => openElectiveSelection(c)}>
                                  <Users className="mr-2 h-4 w-4" /> Select candidates
                                </Button>
                              )}
                              {currentRole === 'admin' && (
                                <div className="mt-4 flex gap-2">
                                  <select
                                    aria-label={`Lecturer for ${c.code}`}
                                    className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm"
                                    value={selectedLecturerByCourse[c.id] ?? ''}
                                    onChange={(event) => setSelectedLecturerByCourse((current) => ({ ...current, [c.id]: event.target.value }))}
                                  >
                                    <option value="">Assign lecturer</option>
                                    {lecturers.map((lecturer) => (
                                      <option key={lecturer.id} value={lecturer.id}>
                                        {lecturer.staffTitle ? `${lecturer.staffTitle} · ` : ''}{lecturer.name}
                                      </option>
                                    ))}
                                  </select>
                                  <Button size="sm" variant="outline" disabled={!selectedLecturerByCourse[c.id] || assigningLecturerCourseId === c.id} onClick={() => assignLecturer(c)}>
                                    {assigningLecturerCourseId === c.id ? 'Assigning…' : 'Assign'}
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
            </div>
            {courses.filter((course: any) => matchesSemester(course.semester, semesterFilter)).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No courses are assigned to this semester.</p>
            )}
        </div>
      )}
      <Dialog open={Boolean(assigningCourse)} onOpenChange={(open) => { if (!open) setAssigningCourse(null); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Elective selection{assigningCourse ? ` · ${assigningCourse.code}` : ''}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Select candidates individually. Their level and matric number are shown for eligibility review.</p>
          {loadingCandidates ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No candidate profiles found.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {candidates.map((candidate) => (
                <label key={candidate.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(candidate.assigned)}
                    disabled={updatingCandidateId === candidate.id}
                    onChange={() => toggleElectiveCandidate(candidate)}
                    aria-label={`${candidate.assigned ? 'Remove' : 'Select'} ${candidate.name} for ${assigningCourse?.code}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{candidate.matricNumber ?? candidate.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{candidate.academicLevel ? `Level ${candidate.academicLevel}` : 'Level not set'}</span>
                </label>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
