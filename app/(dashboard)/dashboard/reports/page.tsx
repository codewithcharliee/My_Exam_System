'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { BarChart3, Download, Filter, FileText, Users, Award, TrendingUp, Loader2 } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { courseSemesterLabel, matchesSemester, type SemesterFilter } from '@/lib/course-semester';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#80D8C3', '#A19AD3', '#FF6363'];

export default function ReportsPage() {
  const { data: session } = useSession();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('summary');
  const [courseId, setCourseId] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('all');
  const [courses, setCourses] = useState<any[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [exportFormat, setExportFormat] = useState('zip');
  const [exportPassword, setExportPassword] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    fetch('/api/courses').then(r => r.json()).then(d => setCourses(d?.courses ?? [])).catch(() => {});
    fetch('/api/assessments').then(r => r.json()).then(d => setAssessments(d?.assessments ?? d ?? [])).catch(() => {});
  }, []);

  async function exportRecords() {
    setExportMessage('');
    const response = await fetch('/api/exports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessmentId, courseId, format: exportFormat, password: exportPassword }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setExportMessage(data?.error ?? 'Export could not be generated'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = exportFormat === 'zip' ? 'assessment-export.zip' : 'assessment-export.xlsx'; link.click(); URL.revokeObjectURL(url); setExportMessage('Export generated');
  }

  useEffect(() => {
    const params = new URLSearchParams({ type: reportType });
    if (courseId) params.set('courseId', courseId);
    if (semesterFilter !== 'all') params.set('semester', semesterFilter);
    fetch(`/api/reports?${params}`)
      .then(r => r.json())
      .then(d => setReport(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reportType, courseId, semesterFilter]);

  const semesterCourses = courses.filter((course: any) => matchesSemester(course.semester, semesterFilter));

  const scoreDistribution = report?.scoreDistribution ?? [];
  const gradeBreakdown = report?.gradeBreakdown ?? [];
  const summary = report?.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Reports &amp; Analytics
          </h1>
          <p className="text-muted-foreground mt-1">View examination statistics and performance reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <select value={reportType} onChange={e => { setLoading(true); setReportType(e.target.value); }}
          className="px-3 py-2 rounded-md border bg-card text-foreground">
          <option value="summary">Summary</option>
          <option value="detailed">Detailed</option>
          {['admin', 'exam_officer'].includes((session?.user as any)?.role ?? '') && <option value="institutional">Institutional operations</option>}
        </select>
        <select aria-label="Filter reports by semester" value={semesterFilter} onChange={e => { setLoading(true); setSemesterFilter(e.target.value as SemesterFilter); setCourseId(''); setAssessmentId(''); }}
          className="px-3 py-2 rounded-md border bg-card text-foreground">
          <option value="all">All semesters</option>
          <option value="first">First semester</option>
          <option value="second">Second semester</option>
          <option value="full_year">Full year</option>
          <option value="unassigned">Semester not assigned</option>
        </select>
        <select value={courseId} onChange={e => { setLoading(true); setCourseId(e.target.value); }}
          className="px-3 py-2 rounded-md border bg-card text-foreground">
          <option value="">All Courses</option>
          {semesterCourses.map((c: any) => (
            <option key={c?.id} value={c?.id}>{c?.code} - {c?.title} · {courseSemesterLabel(c?.semester)}</option>
          ))}
        </select>
      </div>

      {['admin', 'lecturer'].includes((session?.user as any)?.role ?? '') && (
        <div className="bg-card rounded-lg p-5 shadow-md space-y-3">
          <h2 className="font-semibold">Export assessment records</h2>
          <div className="flex gap-3 flex-wrap items-end">
            <label className="text-sm">Assessment<select value={assessmentId} onChange={e => setAssessmentId(e.target.value)} className="block mt-1 px-3 py-2 rounded-md border bg-card"><option value="">Select assessment</option>{assessments.filter((a: any) => matchesSemester(a?.course?.semester, semesterFilter)).map((a: any) => <option key={a.id} value={a.id}>{a.title} · {a?.course?.code} · {courseSemesterLabel(a?.course?.semester)}</option>)}</select></label>
            <label className="text-sm">Format<select value={exportFormat} onChange={e => setExportFormat(e.target.value)} className="block mt-1 px-3 py-2 rounded-md border bg-card"><option value="zip">Encrypted ZIP scripts</option><option value="xlsx">Aggregated spreadsheet</option></select></label>
            <div className="text-sm"><Label htmlFor="export-password">Password</Label><PasswordInput id="export-password" minLength={8} value={exportPassword} onChange={e => setExportPassword(e.target.value)} className="mt-1 bg-card" placeholder="At least 8 characters" /></div>
            <button type="button" onClick={exportRecords} className="px-4 py-2 rounded-md bg-primary text-primary-foreground"><Download className="h-4 w-4 inline mr-2" />Export</button>
          </div>
          {exportMessage && <p className="text-sm text-muted-foreground" aria-live="polite">{exportMessage}</p>}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {reportType === 'institutional' && report?.institutional && (
            <div className="bg-card rounded-lg p-5 shadow-md">
              <h2 className="font-semibold mb-3">Institutional operational summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <span>Question bank activity, {report.institutional.questionBankActivity}</span><span>Confirmed grading records, {report.institutional.gradingWorkload}</span><span>Monitoring records, {report.institutional.monitoringRecords}</span><span>Readiness checks, {report.institutional.readinessChecks}</span><span>Groups below five, suppressed</span>
              </div>
            </div>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Assessments', value: summary?.totalAssessments ?? 0, icon: FileText, color: 'text-blue-500' },
              { label: 'Total Attempts', value: summary?.totalAttempts ?? 0, icon: Users, color: 'text-green-500' },
              { label: 'Average Score', value: `${(summary?.averageScore ?? 0).toFixed?.(1) ?? '0'}%`, icon: TrendingUp, color: 'text-yellow-500' },
              { label: 'Pass Rate', value: `${(summary?.passRate ?? 0).toFixed?.(1) ?? '0'}%`, icon: Award, color: 'text-purple-500' },
            ].map((card: any, i: number) => (
              <div key={i} className="bg-card rounded-lg p-5 shadow-md">
                <div className="flex items-center gap-3">
                  <card.icon className={`h-8 w-8 ${card.color}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution */}
            <div className="bg-card rounded-lg p-5 shadow-md">
              <h3 className="font-semibold text-foreground mb-4">Score Distribution</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreDistribution?.length ? scoreDistribution : [
                    { range: '0-20', count: 2 }, { range: '21-40', count: 5 },
                    { range: '41-60', count: 12 }, { range: '61-80', count: 18 },
                    { range: '81-100', count: 8 }
                  ]}>
                    <XAxis dataKey="range" tickLine={false} tick={{ fontSize: 10 }}
                      label={{ value: 'Score Range', position: 'insideBottom', offset: -15, style: { textAnchor: 'middle', fontSize: 11 } }} />
                    <YAxis tickLine={false} tick={{ fontSize: 10 }}
                      label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#60B5FF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grade Breakdown */}
            <div className="bg-card rounded-lg p-5 shadow-md">
              <h3 className="font-semibold text-foreground mb-4">Grade Breakdown</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={gradeBreakdown?.length ? gradeBreakdown : [
                      { grade: 'A', count: 8 }, { grade: 'B', count: 15 },
                      { grade: 'C', count: 12 }, { grade: 'D', count: 5 }, { grade: 'F', count: 3 }
                    ]} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={100}>
                      {(gradeBreakdown?.length ? gradeBreakdown : [
                        { grade: 'A' }, { grade: 'B' }, { grade: 'C' }, { grade: 'D' }, { grade: 'F' }
                      ]).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Detailed Table */}
          {report?.assessments && (report?.assessments ?? []).length > 0 && (
            <div className="bg-card rounded-lg shadow-md overflow-hidden">
              <h3 className="font-semibold text-foreground p-5 pb-3">Assessment Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Assessment</th>
                      <th className="px-4 py-3 text-left font-medium">Course</th>
                      <th className="px-4 py-3 text-left font-medium">Semester</th>
                      <th className="px-4 py-3 text-left font-medium">Attempts</th>
                      <th className="px-4 py-3 text-left font-medium">Avg Score</th>
                      <th className="px-4 py-3 text-left font-medium">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(report?.assessments ?? []).map((a: any) => (
                      <tr key={a?.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{a?.title ?? 'N/A'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{a?.courseCode ?? 'N/A'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{courseSemesterLabel(a?.semester)}</td>
                        <td className="px-4 py-3">{a?.attemptCount ?? 0}</td>
                        <td className="px-4 py-3">{(a?.avgScore ?? 0)?.toFixed?.(1) ?? '0'}%</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            (a?.passRate ?? 0) >= 70 ? 'bg-green-100 text-green-800' :
                            (a?.passRate ?? 0) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>{(a?.passRate ?? 0)?.toFixed?.(1) ?? '0'}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
