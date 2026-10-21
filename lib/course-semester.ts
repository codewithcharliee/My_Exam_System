export const COURSE_SEMESTERS = [
  { value: 'first', label: 'First semester' },
  { value: 'second', label: 'Second semester' },
  { value: 'full_year', label: 'Full year' },
] as const;

export type CourseSemester = typeof COURSE_SEMESTERS[number]['value'];
export type SemesterFilter = CourseSemester | 'unassigned' | 'all';

export function isCourseSemester(value: unknown): value is CourseSemester {
  return typeof value === 'string' && COURSE_SEMESTERS.some((semester) => semester.value === value);
}

export function courseSemesterLabel(value: string | null | undefined): string {
  return COURSE_SEMESTERS.find((semester) => semester.value === value)?.label ?? 'Semester not assigned';
}

export function matchesSemester(
  value: string | null | undefined,
  filter: SemesterFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'unassigned') return !value;
  return value === filter;
}

export function semesterOrder(value: string | null | undefined): number {
  switch (value) {
    case 'first': return 0;
    case 'second': return 1;
    case 'full_year': return 2;
    default: return 3;
  }
}

export function compareSemesters(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return semesterOrder(left) - semesterOrder(right);
}
