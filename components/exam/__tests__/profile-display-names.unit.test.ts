import { describe, expect, it } from 'vitest';
import { PROFILE_DISPLAY_NAMES, profileDisplayName } from '@/scripts/profile-display-names';

describe('profile display names', () => {
  it('defines a unique personal display name for each of the 40 known profiles', () => {
    const names = Object.values(PROFILE_DISPLAY_NAMES);

    expect(Object.keys(PROFILE_DISPLAY_NAMES)).toHaveLength(40);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => !/^(synthetic |student \d+$|lecturer$|admin user$|test admin$|exam officer$|invigilator user$)/i.test(name))).toBe(true);
  });

  it('fails explicitly when a profile has no configured display name', () => {
    expect(() => profileDisplayName('unknown@example.test')).toThrow(
      'No display name is configured for profile unknown@example.test.',
    );
  });
});
