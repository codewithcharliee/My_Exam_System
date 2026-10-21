import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createAuditEvent } from '../lib/audit';
import { PROFILE_DISPLAY_NAMES } from './profile-display-names';

const profileEmails = Object.keys(PROFILE_DISPLAY_NAMES);

function expectedRole(email: string): string {
  if (email.startsWith('candidate.') || email.startsWith('student')) return 'candidate';
  if (email === 'admin@bingham.edu' || email === 'abacus-11a6e251@example.com') return 'admin';
  if (email === 'examofficer@bingham.edu') return 'exam_officer';
  if (email === 'invigilator@bingham.edu') return 'invigilator';
  return 'lecturer';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const profiles = await prisma.user.findMany({
    where: { email: { in: profileEmails } },
    select: { id: true, email: true, name: true, role: true },
  });
  const mismatchedRoles = profiles.filter((profile) => profile.role !== expectedRole(profile.email));
  if (mismatchedRoles.length) {
    throw new Error('One or more matching accounts have unexpected roles. No names were changed.');
  }

  const changed = profiles.filter((profile) => profile.name !== PROFILE_DISPLAY_NAMES[profile.email]);
  const missing = profileEmails.length - profiles.length;
  if (!apply) {
    console.log(`Dry run: ${profiles.length} matching profiles found, ${changed.length} names need updating, ${missing} profiles not found. Use --apply to update names only.`);
    return;
  }

  const targets = changed.map((profile) => Prisma.sql`(
    ${profile.email},
    CAST(${profile.role} AS "UserRole"),
    ${PROFILE_DISPLAY_NAMES[profile.email]}
  )`);
  const updatedProfiles = changed.length
    ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        WITH targets(email, role, name) AS (
          VALUES ${Prisma.join(targets)}
        ),
        guard AS (
          SELECT COUNT(*) = (SELECT COUNT(*) FROM targets) AS all_profiles_match
          FROM users AS profile
          JOIN targets AS target
            ON profile.email = target.email
            AND profile.role = target.role
        )
        UPDATE users AS profile
        SET name = target.name, updated_at = CURRENT_TIMESTAMP
        FROM targets AS target, guard
        WHERE guard.all_profiles_match
          AND profile.email = target.email
          AND profile.role = target.role
        RETURNING profile.id
      `)
    : [];
  if (updatedProfiles.length !== changed.length) {
    throw new Error('A profile changed during the update. No profile names were changed.');
  }
  const updatedCount = updatedProfiles.length;

  const auditEvent = await createAuditEvent({
    actorId: null,
    actionType: 'profile_display_names_updated',
    entityType: 'user',
    metadata: { updatedCount, missingCount: missing },
  });
  if (!auditEvent) {
    throw new Error(`Updated ${updatedCount} profile names, but failed to record the audit event.`);
  }
  console.log(`Updated ${updatedCount} profile names. ${missing} mapped profiles were not found. Passwords and other profile fields were not changed.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to update profile names.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
