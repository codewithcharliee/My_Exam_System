import { prisma } from '../lib/prisma';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const database = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || database.pathname !== '/nextjs_local_db') {
  throw new Error('Refusing to seed: this script is restricted to local nextjs_local_db.');
}

const catalogSource = 'NUC CCMAS Law discipline; provisional benchmark, not verified against Bingham University curriculum. Semester inferred from course-code parity; Long Essay marked full-year.';

const catalog = ([
  { code: 'PUL 101', title: 'Legal Methods I', level: 'LLB 100', semester: 'first', creditUnits: 4 },
  { code: 'PUL 102', title: 'Legal Methods II', level: 'LLB 100', semester: 'second', creditUnits: 4 },
  { code: 'LAW 101', title: 'English for Legal Writing', level: 'LLB 100', semester: 'first', creditUnits: 2 },
  { code: 'LAW 102', title: 'Introduction to Logic', level: 'LLB 100', semester: 'second', creditUnits: 2 },
  { code: 'PUL 201', title: 'Constitutional Law I', level: 'LLB 200', semester: 'first', creditUnits: 4 },
  { code: 'PUL 202', title: 'Constitutional Law II', level: 'LLB 200', semester: 'second', creditUnits: 4 },
  { code: 'PUL 203', title: 'Nigerian Legal System I', level: 'LLB 200', semester: 'first', creditUnits: 4 },
  { code: 'PUL 204', title: 'Nigerian Legal System II', level: 'LLB 200', semester: 'second', creditUnits: 4 },
  { code: 'CIL 201', title: 'Law of Contract I', level: 'LLB 200', semester: 'first', creditUnits: 4 },
  { code: 'CIL 202', title: 'Law of Contract II', level: 'LLB 200', semester: 'second', creditUnits: 4 },
  { code: 'PUL 301', title: 'Criminal Law I', level: 'LLB 300', semester: 'first', creditUnits: 4 },
  { code: 'PUL 302', title: 'Criminal Law II', level: 'LLB 300', semester: 'second', creditUnits: 4 },
  { code: 'PPL 301', title: 'Law of Torts I', level: 'LLB 300', semester: 'first', creditUnits: 4 },
  { code: 'PPL 302', title: 'Law of Torts II', level: 'LLB 300', semester: 'second', creditUnits: 4 },
  { code: 'CIL 303', title: 'Commercial Law I', level: 'LLB 300', semester: 'first', creditUnits: 4 },
  { code: 'CIL 304', title: 'Commercial Law II', level: 'LLB 300', semester: 'second', creditUnits: 4 },
  { code: 'PUL 401', title: 'Law of Evidence I', level: 'LLB 400', semester: 'first', creditUnits: 4 },
  { code: 'PUL 402', title: 'Law of Evidence II', level: 'LLB 400', semester: 'second', creditUnits: 4 },
  { code: 'PPL 403', title: 'Equity and Trusts I', level: 'LLB 400', semester: 'first', creditUnits: 4 },
  { code: 'PPL 404', title: 'Equity and Trusts II', level: 'LLB 400', semester: 'second', creditUnits: 4 },
  { code: 'PPL 405', title: 'Property Law I', level: 'LLB 400', semester: 'first', creditUnits: 4 },
  { code: 'PPL 406', title: 'Property Law II', level: 'LLB 400', semester: 'second', creditUnits: 4 },
  { code: 'CLE 401', title: 'Clinical and Moot Court Practice', level: 'LLB 400', semester: 'first', creditUnits: 4 },
  { code: 'CLE 402', title: 'Clinical and Moot Court Practice', level: 'LLB 400', semester: 'second', creditUnits: 4 },
  { code: 'JIL 501', title: 'Jurisprudence and Legal Theory I', level: 'LLB 500', semester: 'first', creditUnits: 4 },
  { code: 'JIL 502', title: 'Jurisprudence and Legal Theory II', level: 'LLB 500', semester: 'second', creditUnits: 4 },
  { code: 'PPL 501', title: 'Company Law I', level: 'LLB 500', semester: 'first', creditUnits: 4 },
  { code: 'PPL 502', title: 'Company Law II', level: 'LLB 500', semester: 'second', creditUnits: 4 },
  { code: 'LAW 599', title: 'Long Essay', level: 'LLB 500', semester: 'full_year', creditUnits: 6 },
] as const).map((course) => ({ ...course, isElective: false }));

async function main() {
  const existingCourses = await prisma.course.findMany({
    where: { code: { in: catalog.map((course) => course.code) } },
    select: { code: true, title: true, level: true, semester: true, creditUnits: true, isElective: true },
  });

  for (const existing of existingCourses) {
    const expected = catalog.find((course) => course.code === existing.code);
    if (
      !expected
      || expected.title !== existing.title
      || expected.level !== existing.level
      || expected.semester !== existing.semester
      || expected.creditUnits !== existing.creditUnits
      || expected.isElective !== existing.isElective
    ) {
      throw new Error(`Unexpected existing course ${existing.code}; no records were changed.`);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    let createdCount = 0;
    for (const course of catalog) {
      const existing = existingCourses.find((item) => item.code === course.code);
      if (existing) {
        await tx.course.update({
          where: { code: course.code },
          data: { catalogSource, semester: course.semester },
        });
      } else {
        await tx.course.create({
          data: { ...course, catalogSource },
        });
        createdCount += 1;
      }
    }
    return createdCount;
  });

  console.log(`NUC provisional Law catalog: ${created} courses created; ${catalog.length - created} already existed.`);
}

main()
  .catch((error) => {
    console.error('Failed to seed the NUC provisional Law catalog.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
