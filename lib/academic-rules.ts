export function isFirstLevelCourse(level: unknown): boolean {
  return typeof level === 'string' && /\b100\b/.test(level);
}