import { describe, expect, it } from 'vitest';
import {
  compareSemesters,
  courseSemesterLabel,
  isCourseSemester,
  matchesSemester,
} from '@/lib/course-semester';

describe('course semester helpers', () => {
  it('labels each semester and treats missing assignments explicitly', () => {
    expect(courseSemesterLabel('first')).toBe('First semester');
    expect(courseSemesterLabel('second')).toBe('Second semester');
    expect(courseSemesterLabel('full_year')).toBe('Full year');
    expect(courseSemesterLabel(null)).toBe('Semester not assigned');
  });

  it('validates the supported persisted semester values', () => {
    expect(isCourseSemester('first')).toBe(true);
    expect(isCourseSemester('second')).toBe(true);
    expect(isCourseSemester('full_year')).toBe(true);
    expect(isCourseSemester('all')).toBe(false);
    expect(isCourseSemester(null)).toBe(false);
  });

  it('filters assigned, unassigned, and all-semester records correctly', () => {
    expect(matchesSemester('first', 'first')).toBe(true);
    expect(matchesSemester('second', 'first')).toBe(false);
    expect(matchesSemester(null, 'unassigned')).toBe(true);
    expect(matchesSemester(undefined, 'unassigned')).toBe(true);
    expect(matchesSemester('full_year', 'all')).toBe(true);
  });

  it('sorts first, second, full-year, then unassigned semesters', () => {
    expect(['second', null, 'full_year', 'first'].sort(compareSemesters))
      .toEqual(['first', 'second', 'full_year', null]);
  });
});
