import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createAuditEvent } from '../lib/audit';
import { prisma } from '../lib/prisma';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const database = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || database.pathname !== '/nextjs_local_db') {
  throw new Error('Refusing to seed: this script is restricted to local nextjs_local_db.');
}

const outputPath = path.join(os.homedir(), 'Downloads', 'New_Exam_System_Synthetic_Law_Credentials.csv');
const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`;
const catalogSource = 'Synthetic draft catalog; unverified against the official Bingham University Faculty of Law curriculum.';

const staff = [
  { key: 'dean', name: 'Synthetic Dean', title: 'Dean' },
  { key: 'hod', name: 'Synthetic Head of Department', title: 'Head of Department' },
  { key: 'assistant-lecturer-1', name: 'Synthetic Assistant Lecturer 1', title: 'Assistant Lecturer' },
  { key: 'assistant-lecturer-2', name: 'Synthetic Assistant Lecturer 2', title: 'Assistant Lecturer' },
  { key: 'lecturer-1', name: 'Synthetic Lecturer 1', title: 'Lecturer' },
  { key: 'lecturer-2', name: 'Synthetic Lecturer 2', title: 'Lecturer' },
  { key: 'lecturer-3', name: 'Synthetic Lecturer 3', title: 'Lecturer' },
];

const catalog = [
  { code: 'LAW101', title: 'Introduction to Legal Studies', level: 'LLB 100', isElective: false },
  { code: 'LAW102', title: 'Nigerian Legal System', level: 'LLB 100', isElective: false },
  { code: 'LAW201', title: 'Constitutional Law', level: 'LLB 200', isElective: false },
  { code: 'LAW202', title: 'Law of Contract', level: 'LLB 200', isElective: false },
  { code: 'LAW301', title: 'Criminal Law', level: 'LLB 300', isElective: false },
  { code: 'LAW302', title: 'Law of Torts', level: 'LLB 300', isElective: false },
  { code: 'LAW401', title: 'Law of Evidence', level: 'LLB 400', isElective: false },
  { code: 'LAW402', title: 'Company Law', level: 'LLB 400', isElective: false },
  { code: 'LAW403', title: 'Environmental Law', level: 'LLB 400', isElective: true },
  { code: 'LAW501', title: 'Jurisprudence and Legal Theory', level: 'LLB 500', isElective: false },
  { code: 'LAW502', title: 'Professional Ethics', level: 'LLB 500', isElective: false },
  { code: 'LAW503', title: 'Intellectual Property Law', level: 'LLB 500', isElective: true },
];

const coursesByLevel: Record<number, string[]> = {
  100: ['LAW101', 'LAW102'],
  200: ['LAW201', 'LAW202'],
  300: ['LAW301', 'LAW302'],
  400: ['LAW401', 'LAW402'],
  500: ['LAW501', 'LAW502'],
};

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  if (fs.existsSync(outputPath) || fs.existsSync(temporaryOutputPath)) {
    throw new Error(`Credentials output already exists: ${outputPath}. Refusing to overwrite it.`);
  }

  const profiles = [
    ...[100, 200, 300, 400, 500].flatMap((level) =>
      Array.from({ length: 5 }, (_, index) => ({
        key: `candidate-${level}-${String(index + 1).padStart(2, '0')}`,
        name: `Synthetic Candidate ${level}-${String(index + 1).padStart(2, '0')}`,
        email: `candidate.${level}.${String(index + 1).padStart(2, '0')}@example.test`,
        password: `Law!${crypto.randomBytes(18).toString('base64url')}`,
        role: 'candidate' as const,
        academicLevel: level,
        matricNumber: `SYN-LAW-${level}-${String(index + 1).padStart(3, '0')}`,
        staffTitle: null,
      })),
    ),
    ...staff.map((person) => ({
      key: person.key,
      name: person.name,
      email: `${person.key.replaceAll('-', '.')}@example.test`,
      password: `Law!${crypto.randomBytes(18).toString('base64url')}`,
      role: 'lecturer' as const,
      academicLevel: null,
      matricNumber: null,
      staffTitle: person.title,
    })),
  ];

  const expectedExistingCourses = new Map([
    ['LAW201', { title: 'Constitutional Law', level: 'LLB 200' }],
    ['LAW202', { title: 'Law of Contract', level: 'LLB 200' }],
    ['LAW301', { title: 'Criminal Law', level: 'LLB 300' }],
  ]);
  const existingProfiles = await prisma.user.findMany({
    where: { OR: [{ email: { in: profiles.map((profile) => profile.email) } }, { matricNumber: { in: profiles.flatMap((profile) => profile.matricNumber ? [profile.matricNumber] : []) } }] },
    select: { email: true, matricNumber: true },
  });
  if (existingProfiles.length > 0) {
    throw new Error('Synthetic profile identifiers already exist. No records were changed.');
  }

  const existingCourses = await prisma.course.findMany({
    where: { code: { in: catalog.map((course) => course.code) } },
    select: { code: true, title: true, level: true },
  });
  for (const course of existingCourses) {
    const expected = expectedExistingCourses.get(course.code);
    if (!expected || expected.title !== course.title || expected.level !== course.level) {
      throw new Error(`Unexpected existing course ${course.code}; no records were changed.`);
    }
  }
  for (const code of expectedExistingCourses.keys()) {
    if (!existingCourses.some((course) => course.code === code)) {
      throw new Error(`Expected existing course ${code} was not found; no records were changed.`);
    }
  }

  const passwordHashes = await Promise.all(profiles.map((profile) => bcrypt.hash(profile.password, 12)));
  const credentialHeader = ['name', 'email', 'temporary_password', 'role', 'academic_level', 'staff_title', 'assigned_courses'];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(temporaryOutputPath, `${credentialHeader.map(csvCell).join(',')}\n`, { flag: 'wx', mode: 0o600 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const userIds = new Map<string, string>();
      for (const [index, profile] of profiles.entries()) {
        const user = await tx.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            passwordHash: passwordHashes[index],
            role: profile.role,
            academicLevel: profile.academicLevel,
            matricNumber: profile.matricNumber,
            staffTitle: profile.staffTitle,
          },
          select: { id: true },
        });
        userIds.set(profile.key, user.id);
      }

      const courseIds = new Map<string, string>();
      const createdCourseCodes: string[] = [];
      for (const course of catalog) {
        const existing = existingCourses.find((item) => item.code === course.code);
        if (existing) {
          const current = await tx.course.findUniqueOrThrow({ where: { code: course.code }, select: { id: true } });
          courseIds.set(course.code, current.id);
          continue;
        }

        const created = await tx.course.create({
          data: { ...course, creditUnits: 3, catalogSource },
          select: { id: true },
        });
        courseIds.set(course.code, created.id);
        createdCourseCodes.push(course.code);
      }

      const assignedCourseCodes = new Map<string, string[]>();
      const addAssignment = async (userKey: string, courseCode: string, role: 'candidate' | 'lecturer') => {
        const userId = userIds.get(userKey);
        const courseId = courseIds.get(courseCode);
        if (!userId || !courseId) throw new Error(`Missing user or course for ${userKey}/${courseCode}.`);
        await tx.userCourse.create({ data: { userId, courseId, role } });
        const current = assignedCourseCodes.get(userKey) ?? [];
        current.push(courseCode);
        assignedCourseCodes.set(userKey, current);
      };

      for (const [levelText, coreCourseCodes] of Object.entries(coursesByLevel)) {
        const level = Number(levelText);
        for (let index = 0; index < 5; index += 1) {
          const candidateKey = `candidate-${level}-${String(index + 1).padStart(2, '0')}`;
          for (const courseCode of coreCourseCodes) await addAssignment(candidateKey, courseCode, 'candidate');
          const electiveCode = level === 400 ? 'LAW403' : level === 500 ? 'LAW503' : null;
          const electiveLimit = level === 400 ? 3 : level === 500 ? 2 : 0;
          if (electiveCode && index < electiveLimit) await addAssignment(candidateKey, electiveCode, 'candidate');
        }
      }

      for (const [index, course] of catalog.entries()) {
        const lecturer = staff[index % staff.length];
        await addAssignment(lecturer.key, course.code, 'lecturer');
      }

      return { userIds, createdCourseCodes, assignedCourseCodes };
    }, { maxWait: 10_000, timeout: 60_000 });

    const rows = profiles.map((profile) => [
      profile.name,
      profile.email,
      profile.password,
      profile.role,
      profile.academicLevel === null ? '' : String(profile.academicLevel),
      profile.staffTitle ?? '',
      (result.assignedCourseCodes.get(profile.key) ?? []).join('; '),
    ].map(csvCell).join(','));
    fs.appendFileSync(temporaryOutputPath, `${rows.join('\n')}\n`);
    fs.renameSync(temporaryOutputPath, outputPath);

    const administrator = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
    await createAuditEvent({
      actorId: administrator?.id ?? null,
      actionType: 'synthetic_law_directory_seeded',
      entityType: 'system',
      entityId: 'synthetic-law-directory-2026',
      metadata: {
        syntheticProfiles: profiles.length,
        newlyCreatedCourses: result.createdCourseCodes,
        electiveSelections: { LAW403: 3, LAW503: 2 },
        catalogSource,
      },
    });

    console.log(JSON.stringify({
      profilesCreated: profiles.length,
      candidatesByLevel: { 100: 5, 200: 5, 300: 5, 400: 5, 500: 5 },
      staffCreated: staff.length,
      coursesCreated: result.createdCourseCodes.length,
      coursesCreatedCodes: result.createdCourseCodes,
      lecturerAssignments: catalog.length,
      electiveAssignments: { LAW403: 3, LAW503: 2 },
      credentialsFile: outputPath,
    }, null, 2));
  } catch (error) {
    if (fs.existsSync(temporaryOutputPath)) fs.unlinkSync(temporaryOutputPath);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Synthetic seeding failed.');
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});