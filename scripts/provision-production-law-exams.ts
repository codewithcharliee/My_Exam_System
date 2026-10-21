import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '../lib/prisma';
import { createAuditEvent } from '../lib/audit';
import { z } from 'zod';

type CourseSpec = {
  code: string;
  title: string;
  level: string;
  semester: 'first' | 'second' | 'full_year' | null;
  creditUnits: number;
  sourceCode: string;
  examType: 'essay' | 'multiple_choice' | 'case_analysis';
};

const sourceText = 'NUC CCMAS Law discipline; provisional benchmark, not verified against Bingham University curriculum.';
const existingLawCourses = [
  { code: 'LAW201', title: 'Constitutional Law', level: 'LLB 200', sourceCode: 'PUL201' },
  { code: 'LAW202', title: 'Law of Contract', level: 'LLB 200', sourceCode: 'CIL201' },
  { code: 'LAW301', title: 'Criminal Law', level: 'LLB 300', sourceCode: 'PUL301' },
] as const;

const catalog: CourseSpec[] = [
  { code: 'PUL 101', title: 'Legal Methods I', level: 'LLB 100', semester: 'first', creditUnits: 4, sourceCode: 'PUL101', examType: 'essay' },
  { code: 'PUL 102', title: 'Legal Methods II', level: 'LLB 100', semester: 'second', creditUnits: 4, sourceCode: 'PUL102', examType: 'essay' },
  { code: 'LAW 101', title: 'English for Legal Writing', level: 'LLB 100', semester: 'first', creditUnits: 2, sourceCode: 'LAW101', examType: 'essay' },
  { code: 'LAW 102', title: 'Introduction to Logic', level: 'LLB 100', semester: 'second', creditUnits: 2, sourceCode: 'LAW102', examType: 'essay' },
  { code: 'PUL 201', title: 'Constitutional Law I', level: 'LLB 200', semester: 'first', creditUnits: 4, sourceCode: 'PUL201', examType: 'essay' },
  { code: 'PUL 202', title: 'Constitutional Law II', level: 'LLB 200', semester: 'second', creditUnits: 4, sourceCode: 'PUL202', examType: 'essay' },
  { code: 'PUL 203', title: 'Nigerian Legal System I', level: 'LLB 200', semester: 'first', creditUnits: 4, sourceCode: 'PUL203', examType: 'essay' },
  { code: 'PUL 204', title: 'Nigerian Legal System II', level: 'LLB 200', semester: 'second', creditUnits: 4, sourceCode: 'PUL204', examType: 'essay' },
  { code: 'CIL 201', title: 'Law of Contract I', level: 'LLB 200', semester: 'first', creditUnits: 4, sourceCode: 'CIL201', examType: 'essay' },
  { code: 'CIL 202', title: 'Law of Contract II', level: 'LLB 200', semester: 'second', creditUnits: 4, sourceCode: 'CIL202', examType: 'essay' },
  { code: 'PUL 301', title: 'Criminal Law I', level: 'LLB 300', semester: 'first', creditUnits: 4, sourceCode: 'PUL301', examType: 'essay' },
  { code: 'PUL 302', title: 'Criminal Law II', level: 'LLB 300', semester: 'second', creditUnits: 4, sourceCode: 'PUL302', examType: 'essay' },
  { code: 'PPL 301', title: 'Law of Torts I', level: 'LLB 300', semester: 'first', creditUnits: 4, sourceCode: 'PPL301', examType: 'essay' },
  { code: 'PPL 302', title: 'Law of Torts II', level: 'LLB 300', semester: 'second', creditUnits: 4, sourceCode: 'PPL302', examType: 'essay' },
  { code: 'CIL 303', title: 'Commercial Law I', level: 'LLB 300', semester: 'first', creditUnits: 4, sourceCode: 'CIL303', examType: 'essay' },
  { code: 'CIL 304', title: 'Commercial Law II', level: 'LLB 300', semester: 'second', creditUnits: 4, sourceCode: 'CIL304', examType: 'essay' },
  { code: 'PUL 401', title: 'Law of Evidence I', level: 'LLB 400', semester: 'first', creditUnits: 4, sourceCode: 'PUL401', examType: 'essay' },
  { code: 'PUL 402', title: 'Law of Evidence II', level: 'LLB 400', semester: 'second', creditUnits: 4, sourceCode: 'PUL402', examType: 'essay' },
  { code: 'PPL 403', title: 'Equity and Trusts I', level: 'LLB 400', semester: 'first', creditUnits: 4, sourceCode: 'PPL403', examType: 'essay' },
  { code: 'PPL 404', title: 'Equity and Trusts II', level: 'LLB 400', semester: 'second', creditUnits: 4, sourceCode: 'PPL404', examType: 'essay' },
  { code: 'PPL 405', title: 'Property Law I', level: 'LLB 400', semester: 'first', creditUnits: 4, sourceCode: 'PPL405', examType: 'essay' },
  { code: 'PPL 406', title: 'Property Law II', level: 'LLB 400', semester: 'second', creditUnits: 4, sourceCode: 'PPL406', examType: 'essay' },
  { code: 'CLE 401', title: 'Clinical and Moot Court Practice', level: 'LLB 400', semester: 'first', creditUnits: 4, sourceCode: 'CLE401', examType: 'case_analysis' },
  { code: 'CLE 402', title: 'Clinical and Moot Court Practice', level: 'LLB 400', semester: 'second', creditUnits: 4, sourceCode: 'CLE402', examType: 'case_analysis' },
  { code: 'JIL 501', title: 'Jurisprudence and Legal Theory I', level: 'LLB 500', semester: 'first', creditUnits: 4, sourceCode: 'JIL501', examType: 'essay' },
  { code: 'JIL 502', title: 'Jurisprudence and Legal Theory II', level: 'LLB 500', semester: 'second', creditUnits: 4, sourceCode: 'JIL502', examType: 'essay' },
  { code: 'PPL 501', title: 'Company Law I', level: 'LLB 500', semester: 'first', creditUnits: 4, sourceCode: 'PPL501', examType: 'essay' },
  { code: 'PPL 502', title: 'Company Law II', level: 'LLB 500', semester: 'second', creditUnits: 4, sourceCode: 'PPL502', examType: 'essay' },
  { code: 'LAW 599', title: 'Long Essay', level: 'LLB 500', semester: 'full_year', creditUnits: 6, sourceCode: 'LAW599', examType: 'essay' },
];

const questionsPerEssayExam = 6;
const questionsPerObjectiveExam = 60;
const essayQuestionSchema = z.object({
  text: z.string().trim().min(20),
  topic: z.string().trim().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  type: z.enum(['essay', 'case_analysis']),
  markingScheme: z.object({
    method: z.literal('human_grading'),
    maxMark: z.number().positive(),
    rubric: z.array(z.object({
      criterion: z.string().trim().min(1),
      maxMark: z.number().positive(),
    })).min(3).max(5),
  }),
}).superRefine((question, context) => {
  const total = question.markingScheme.rubric.reduce((sum, item) => sum + item.maxMark, 0);
  if (Math.abs(total - question.markingScheme.maxMark) > 0.01) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Rubric marks must add up to the maximum mark.' });
  }
});

const objectiveQuestionSchema = z.object({
  text: z.string().trim().min(20),
  topic: z.string().trim().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  type: z.literal('multiple_choice'),
  options: z.array(z.object({
    text: z.string().trim().min(1),
    isCorrect: z.boolean(),
  })).length(4),
}).superRefine((question, context) => {
  if (question.options.filter((option) => option.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one objective option must be correct.' });
  }
  if (new Set(question.options.map((option) => option.text.toLocaleLowerCase())).size !== 4) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Objective options must be unique.' });
  }
});

type GeneratedQuestion = z.infer<typeof essayQuestionSchema> | z.infer<typeof objectiveQuestionSchema>;
type ExamJob = {
  courseCode: string;
  courseTitle: string;
  level: string;
  examType: 'essay' | 'multiple_choice' | 'case_analysis';
  questions: Array<{ id: string; maxMark: number }>;
  generated: GeneratedQuestion[];
};

function randomItem<T>(items: readonly T[]): T {
  if (!items.length) throw new Error('Cannot choose from an empty list.');
  return items[randomInt(items.length)];
}

function uniqueRandomItems<T>(items: readonly T[], count: number): T[] {
  if (count > items.length) throw new Error('Not enough distinct choices.');
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function assertProductionContext() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  if (process.env.VERCEL_ENV !== 'production') throw new Error('Refusing to proceed unless VERCEL_ENV is production.');
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('Expected a PostgreSQL database.');
  if (['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname) || databaseUrl.pathname === '/nextjs_local_db') {
    throw new Error('Refusing to modify a local database.');
  }
}

async function loadMaterials() {
  const filePath = process.env.NUC_LAW_MATERIALS_PATH;
  if (!filePath) throw new Error('NUC_LAW_MATERIALS_PATH is required.');
  const materials = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, { title: string; material: string }>;
  const missing = catalog.map((course) => course.sourceCode).filter((code) => !materials[code]?.material);
  if (missing.length) throw new Error(`Missing official course materials: ${missing.join(', ')}`);
  return materials;
}

async function inspectProduction() {
  const db = await prisma.$queryRaw<Array<{ databaseName: string }>>`SELECT current_database() AS "databaseName"`;
  const candidates = await prisma.user.findMany({
    where: { role: 'candidate' },
    select: { id: true, academicLevel: true, email: true },
  });
  const levelCounts = Object.fromEntries([100, 200, 300, 400, 500].map((level) => [
    level,
    candidates.filter((candidate) => candidate.academicLevel === level).length,
  ]));
  const invalidLevels = candidates.filter((candidate) => ![100, 200, 300, 400, 500].includes(candidate.academicLevel ?? 0));
  const codes = [...catalog.map((course) => course.code), ...existingLawCourses.map((course) => course.code)];
  const matchingCourses = await prisma.course.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, title: true, level: true, semester: true, creditUnits: true, isElective: true },
  });
  const conflictingCourses = matchingCourses.filter((existing) => {
    const catalogEntry = catalog.find((course) => course.code === existing.code);
    if (catalogEntry) {
      return existing.title !== catalogEntry.title
        || existing.level !== catalogEntry.level
        || (existing.semester && existing.semester !== catalogEntry.semester)
        || (existing.creditUnits && existing.creditUnits !== catalogEntry.creditUnits)
        || existing.isElective;
    }
    const preserved = existingLawCourses.find((course) => course.code === existing.code);
    return !preserved || existing.title !== preserved.title || existing.level !== preserved.level;
  });
  const nonLawCourses = await prisma.course.findMany({
    where: {
      NOT: {
        OR: ['LAW', 'PUL', 'PPL', 'CIL', 'CLE', 'JIL'].map((prefix) => ({
          code: { startsWith: prefix, mode: 'insensitive' as const },
        })),
      },
    },
    select: { code: true },
  });
  const publishedAssessments = await prisma.assessment.findMany({
    where: { status: 'published' },
    select: { id: true, courseId: true, title: true, _count: { select: { attempts: true } } },
  });
  const staff = await prisma.user.findFirst({
    where: { role: { in: ['admin', 'exam_officer'] }, accountStatus: 'active' },
    select: { id: true, role: true },
  });
  const materials = await loadMaterials();
  validateAuthoredQuestions(materials);

  if (db[0]?.databaseName === 'nextjs_local_db') throw new Error('Connected to the local development database.');
  if (candidates.length !== 28 || invalidLevels.length || JSON.stringify(levelCounts) !== JSON.stringify({ 100: 6, 200: 6, 300: 6, 400: 5, 500: 5 })) {
    throw new Error(`Candidate level preflight failed: ${JSON.stringify({ count: candidates.length, levelCounts, invalidLevels: invalidLevels.length })}`);
  }
  if (conflictingCourses.length) throw new Error(`Course code/title/level conflicts found: ${conflictingCourses.map((course) => course.code).join(', ')}`);
  if (nonLawCourses.length) throw new Error(`Non-Law courses found; refusing to change them: ${nonLawCourses.map((course) => course.code).join(', ')}`);
  if (publishedAssessments.length !== 7 || publishedAssessments.some((assessment) => assessment._count.attempts !== 0)) {
    throw new Error(`Published assessment preflight failed: ${JSON.stringify({ count: publishedAssessments.length, attempts: publishedAssessments.map((assessment) => assessment._count.attempts) })}`);
  }
  if (!staff) throw new Error('No active admin or exam officer is available to own generated questions and assessments.');

  return {
    databaseName: db[0].databaseName,
    candidates,
    levelCounts,
    matchingCourses,
    publishedAssessments,
    staff,
    materials,
  };
}

function parseCourseTopics(material: string): string[] {
  let contents = material.replace(/\uFFFD/g, '').replace(/\s+/g, ' ').trim();
  contents = contents.split(/course contents/i).at(-1)?.trim() ?? contents;
  contents = contents.split(/\b(?:200|300|400|500)\s+Level\b/i)[0];
  contents = contents.replace(/\s+\d{1,3}\s*$/, '');

  const topics = contents
    .split(/[.,;:]\s+|\s+[–—]\s+/)
    .map((topic) => topic.replace(/^[\s,:;.-]+/, '').trim())
    .filter((topic) => topic.length >= 6 && topic.length <= 180)
    .filter((topic) => !/^(learning outcomes?|at the end of|students are expected)/i.test(topic));

  const uniqueTopics = [...new Map(topics.map((topic) => [topic.toLocaleLowerCase(), topic])).values()];
  if (uniqueTopics.length < 6) {
    throw new Error(`The course outline for "${contents.slice(0, 80)}" does not contain enough distinct assessable topics.`);
  }
  return uniqueTopics;
}

function createEssayQuestions(
  course: { code: string; title: string },
  material: string,
  examType: 'essay' | 'case_analysis',
): GeneratedQuestion[] {
  const topics = parseCourseTopics(material);
  const prompts = [
    `Explain the principal legal rules and elements associated with "${topics[0]}" as covered in ${course.title}.`,
    `Analyze the purpose and legal significance of "${topics[1]}" in the Nigerian legal system, using the course outline as your scope.`,
    `Apply the principles concerning "${topics[2]}" to a clearly stated hypothetical and explain the reasoning behind your conclusion.`,
    `Compare "${topics[3]}" with "${topics[4]}" and explain the practical consequences of their similarities or differences.`,
    examType === 'case_analysis'
      ? `A client or moot-court problem raises an issue concerning "${topics[5]}". Identify the issues, explain the applicable principles, and set out a reasoned course of action.`
      : `Critically evaluate how "${topics[5]}" should be interpreted or applied, addressing its rationale and any limitations identified by the course material.`,
    `Advise a reader new to ${course.title} on how "${topics[6] ?? topics[0]}" operates, the relevant considerations, and the conclusion supported by the course material.`,
  ];
  const questions = prompts.map((text, index) => ({
    text,
    topic: topics[index] ?? course.title,
    difficulty: index < 2 ? 'medium' as const : 'hard' as const,
    type: examType,
    markingScheme: {
      method: 'human_grading' as const,
      maxMark: 20,
      rubric: [
        { criterion: 'Identifies the relevant issues, rules, or concepts accurately', maxMark: 4 },
        { criterion: 'Explains the applicable principles in the context of the course outline', maxMark: 4 },
        { criterion: 'Applies the principles through clear and reasoned analysis', maxMark: 4 },
        { criterion: 'Supports conclusions with relevant legal authority where appropriate', maxMark: 4 },
        { criterion: 'Presents a coherent structure and well-supported conclusion', maxMark: 4 },
      ],
    },
  }));
  return questions.map((question) => essayQuestionSchema.parse(question));
}

function createObjectiveQuestions(
  course: { code: string; title: string },
  material: string,
  distractorTopics: string[],
): GeneratedQuestion[] {
  const topics = parseCourseTopics(material);
  const questionStems = [
    `Which subject is expressly included in the NUC CCMAS course contents for ${course.title}?`,
    `Which topic does the NUC CCMAS outline identify for ${course.title}?`,
    `Which area falls within the stated course contents of ${course.title}?`,
    `Which entry appears in the NUC CCMAS outline for ${course.title}?`,
    `Which subject should a candidate preparing for ${course.title} expect to study, according to the outline?`,
  ];
  const distinctDistractors = [...new Set(distractorTopics.filter((topic) =>
    !topics.some((courseTopic) => courseTopic.toLocaleLowerCase() === topic.toLocaleLowerCase()),
  ))];
  if (distinctDistractors.length < 3) throw new Error('Not enough distinct course topics to author objective distractors.');

  const questions: GeneratedQuestion[] = [];
  const answerPositions = [0, 1, 2, 3];
  for (let index = 0; index < questionsPerObjectiveExam; index++) {
    const correctTopic = topics[index % topics.length];
    const distractors: string[] = [];
    for (let offset = 0; distractors.length < 3; offset++) {
      const candidate = distinctDistractors[(index * 7 + offset * 11) % distinctDistractors.length];
      if (candidate.toLocaleLowerCase() !== correctTopic.toLocaleLowerCase()
        && !distractors.some((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase())) {
        distractors.push(candidate);
      }
    }
    const order = [...answerPositions];
    for (let position = order.length - 1; position > 0; position--) {
      const swap = randomInt(position + 1);
      [order[position], order[swap]] = [order[swap], order[position]];
    }
    const optionTexts = new Array<string>(4);
    optionTexts[order[0]] = correctTopic;
    distractors.forEach((distractor, distractorIndex) => {
      optionTexts[order[distractorIndex + 1]] = distractor;
    });
    const question = {
      text: `${questionStems[index % questionStems.length]} (Question ${index + 1})`,
      topic: correctTopic,
      difficulty: 'medium' as const,
      type: 'multiple_choice' as const,
      options: optionTexts.map((text, optionIndex) => ({
        text,
        isCorrect: optionIndex === order[0],
      })),
    };
    questions.push(objectiveQuestionSchema.parse(question));
  }
  return questions;
}

function validateAuthoredQuestions(materials: Record<string, { title: string; material: string }>) {
  const allTopics = [...new Set(Object.values(materials).flatMap((source) => parseCourseTopics(source.material)))];
  const objectiveCourse = randomItem(catalog.filter((course) => course.level === 'LLB 100'));
  const essaySpecs = [
    ...catalog.filter((course) =>
      course.sourceCode !== 'LAW599'
      && course.code !== objectiveCourse.code,
    ),
    ...existingLawCourses.map((course) => ({
      ...course,
      examType: 'essay' as const,
    })),
  ];
  for (const spec of essaySpecs) {
    const material = materials[spec.sourceCode]?.material;
    if (!material) throw new Error(`No course outline found for ${spec.code}.`);
    const questions = createEssayQuestions(spec, material, spec.examType === 'case_analysis' ? 'case_analysis' : 'essay');
    if (questions.length !== questionsPerEssayExam) throw new Error(`Expected six essay questions for ${spec.code}.`);
    if (new Set(questions.map((question) => question.text.toLocaleLowerCase())).size !== questions.length) {
      throw new Error(`Duplicate authored essay questions found for ${spec.code}.`);
    }
  }
  for (const spec of catalog.filter((course) => course.level === 'LLB 100')) {
    const material = materials[spec.sourceCode]?.material;
    if (!material) throw new Error(`No course outline found for ${spec.code}.`);
    const questions = createObjectiveQuestions(spec, material, allTopics);
    if (questions.length !== questionsPerObjectiveExam) {
      throw new Error(`Expected 60 objective questions for ${spec.code}.`);
    }
    if (new Set(questions.map((question) => question.text.toLocaleLowerCase())).size !== questions.length) {
      throw new Error(`Duplicate authored objective questions found for ${spec.code}.`);
    }
  }
}

function buildSchedule(count: number, durations: number[]) {
  const slots: Date[] = [];
  const now = new Date();
  for (let daysAhead = 14; daysAhead <= 60; daysAhead++) {
    const localDate = new Date(now.getTime() + daysAhead * 86_400_000);
    const weekday = localDate.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const localHour of [9, 14]) {
      slots.push(new Date(Date.UTC(
        localDate.getUTCFullYear(),
        localDate.getUTCMonth(),
        localDate.getUTCDate(),
        localHour - 1,
      )));
    }
  }
  if (slots.length < count) throw new Error('Not enough non-overlapping weekday exam slots.');
  const selected = uniqueRandomItems(slots, count);
  return selected.map((startAt, index) => ({
    startAt,
    endAt: new Date(startAt.getTime() + durations[index] * 60_000),
  }));
}

async function apply() {
  assertProductionContext();
  const preflight = await inspectProduction();
  const allSpecs = [
    ...catalog,
    ...existingLawCourses.map((course) => ({
      ...course,
      semester: null,
      creditUnits: 4,
      examType: 'essay' as const,
    })),
  ];
  const courseByCode = new Map(preflight.matchingCourses.map((course) => [course.code, course]));
  const targetCourses = allSpecs.map((spec) => {
    const existing = courseByCode.get(spec.code);
    return {
      ...spec,
      id: existing?.id ?? null,
    };
  });
  const firstLevelCourses = targetCourses.filter((course) => course.level === 'LLB 100');
  const objectiveCourse = randomItem(firstLevelCourses);
  const candidatesByLevel = new Map<number, typeof preflight.candidates>();
  for (const level of [100, 200, 300, 400, 500]) {
    candidatesByLevel.set(level, preflight.candidates.filter((candidate) => candidate.academicLevel === level));
  }
  const carryovers = [200, 300, 400, 500].map((level) => {
    const candidate = randomItem(candidatesByLevel.get(level)!);
    const eligibleCourses = targetCourses.filter((course) =>
      Number(course.level.replace('LLB ', '')) < level && course.code !== objectiveCourse.code,
    );
    const course = randomItem(eligibleCourses);
    return { level, candidateId: candidate.id, courseCode: course.code };
  });
  const objectiveSpec = catalog.find((course) => course.code === objectiveCourse.code)!;
  const allSourceTopics = [...new Set(Object.values(preflight.materials).flatMap((source) => parseCourseTopics(source.material)))];
  const examSpecs = [
    ...catalog.filter((course) => course.sourceCode !== 'LAW599' && course.code !== objectiveCourse.code),
    ...existingLawCourses.map((course) => ({
      ...course,
      semester: null,
      creditUnits: 4,
      examType: 'essay' as const,
    })),
    { ...objectiveSpec, examType: 'multiple_choice' as const },
  ];
  const existingQuestions = await prisma.question.findMany({
    where: {
      status: 'approved',
      courseId: { in: targetCourses.flatMap((course) => course.id ? [course.id] : []) },
      type: { in: ['essay', 'case_analysis', 'legal_problem', 'multiple_choice'] },
    },
    select: {
      id: true,
      courseId: true,
      type: true,
      text: true,
      markingSchemes: { select: { maxMark: true, version: true }, orderBy: { version: 'desc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const jobs: ExamJob[] = [];

  for (const spec of examSpecs) {
    const course = targetCourses.find((entry) => entry.code === spec.code)!;
    const needed = spec.examType === 'multiple_choice' ? questionsPerObjectiveExam : questionsPerEssayExam;
    const acceptableTypes = spec.examType === 'multiple_choice'
      ? ['multiple_choice']
      : ['essay', 'case_analysis', 'legal_problem'];
    const reused = existingQuestions
      .filter((question) => question.courseId === course.id && acceptableTypes.includes(question.type))
      .slice(0, needed);
    const material = preflight.materials[spec.sourceCode]?.material;
    if (!material) throw new Error(`No course outline found for ${spec.code}.`);
    const authored = spec.examType === 'multiple_choice'
      ? createObjectiveQuestions(spec, material, allSourceTopics)
      : createEssayQuestions(spec, material, spec.examType);
    const generated = authored.slice(0, Math.max(0, needed - reused.length));
    const oldTexts = new Set(reused.map((question) => question.text.toLocaleLowerCase()));
    if (generated.some((question) => oldTexts.has(question.text.toLocaleLowerCase()))) {
      throw new Error(`Generated questions duplicate approved questions for ${spec.code}.`);
    }
    const allTexts = [...reused.map((question) => question.text), ...generated.map((question) => question.text)];
    if (new Set(allTexts.map((text) => text.toLocaleLowerCase())).size !== allTexts.length) {
      throw new Error(`Duplicate questions would be included in the ${spec.code} assessment.`);
    }
    jobs.push({
      courseCode: spec.code,
      courseTitle: spec.title,
      level: spec.level,
      examType: spec.examType,
      questions: reused.map((question) => ({
        id: question.id,
        maxMark: question.type === 'multiple_choice' ? 1 : question.markingSchemes[0]?.maxMark ?? 20,
      })),
      generated,
    });
  }

  const schedules = buildSchedule(
    jobs.length,
    jobs.map((job) => job.examType === 'multiple_choice' ? 120 : 180),
  );
  const scheduleByJob = new Map(jobs.map((job, index) => [job.courseCode, schedules[index]]));
  const oldAssessmentIds = preflight.publishedAssessments.map((assessment) => assessment.id);

  const created = await prisma.$transaction(async (tx) => {
    const stillPublished = await tx.assessment.findMany({
      where: { id: { in: oldAssessmentIds }, status: 'published' },
      select: { id: true, _count: { select: { attempts: true } } },
    });
    if (stillPublished.length !== 7 || stillPublished.some((assessment) => assessment._count.attempts !== 0)) {
      throw new Error('Published assessment state changed during question generation; no changes were applied.');
    }

    let newCatalogCourseCount = 0;
    for (const course of catalog) {
      const existing = await tx.course.findUnique({ where: { code: course.code }, select: { id: true } });
      if (existing) {
        await tx.course.update({
          where: { code: course.code },
          data: {
            catalogSource: sourceText,
            semester: course.semester,
            creditUnits: course.creditUnits,
            isElective: false,
          },
        });
      } else {
        await tx.course.create({
          data: {
            code: course.code,
            title: course.title,
            level: course.level,
            semester: course.semester,
            creditUnits: course.creditUnits,
            isElective: false,
            catalogSource: sourceText,
          },
        });
        newCatalogCourseCount += 1;
      }
    }

    const allCourses = await tx.course.findMany({
      where: { code: { in: allSpecs.map((course) => course.code) } },
      select: { id: true, code: true, level: true },
    });
    const courseIds = new Map(allCourses.map((course) => [course.code, course.id]));

    await tx.userCourse.deleteMany({ where: { role: 'candidate' } });
    const enrollments = preflight.candidates.flatMap((candidate) => {
      const level = `LLB ${candidate.academicLevel}`;
      return allCourses
        .filter((course) => course.level === level)
        .map((course) => ({ userId: candidate.id, courseId: course.id, role: 'candidate' as const }));
    });
    for (const carryover of carryovers) {
      const courseId = courseIds.get(carryover.courseCode);
      if (!courseId) throw new Error(`Carry-over course ${carryover.courseCode} was not created.`);
      enrollments.push({ userId: carryover.candidateId, courseId, role: 'candidate' });
    }
    await tx.userCourse.createMany({ data: enrollments, skipDuplicates: true });

    const generatedQuestionRows = jobs.flatMap((job) => {
      const courseId = courseIds.get(job.courseCode);
      if (!courseId) throw new Error(`Course ${job.courseCode} was not found for generated questions.`);
      return job.generated.map((question) => ({
        courseId,
        type: question.type,
        text: question.text,
        topic: question.topic,
        difficulty: question.difficulty,
        status: 'approved' as const,
        createdBy: preflight.staff.id,
      }));
    });
    const insertedQuestions = generatedQuestionRows.length
      ? await tx.question.createManyAndReturn({
        data: generatedQuestionRows,
        select: { id: true, courseId: true, text: true },
      })
      : [];
    const courseCodeById = new Map(allCourses.map((course) => [course.id, course.code]));
    const questionIdByKey = new Map(insertedQuestions.map((question) => [
      `${courseCodeById.get(question.courseId)}\0${question.text}`,
      question.id,
    ]));
    const optionRows: Array<{ questionId: string; text: string; isCorrect: boolean; sortOrder: number }> = [];
    const markingSchemeRows: Array<{
      questionId: string;
      method: 'human_grading';
      maxMark: number;
      configJson: string;
      version: number;
    }> = [];
    const newAssessmentIds: string[] = [];
    for (const job of jobs) {
      const courseId = courseIds.get(job.courseCode);
      if (!courseId) throw new Error(`Course ${job.courseCode} was not found after catalog creation.`);
      const questions = job.questions;
      for (const generated of job.generated) {
        const questionId = questionIdByKey.get(`${job.courseCode}\0${generated.text}`);
        if (!questionId) throw new Error(`Generated question ${job.courseCode} was not saved.`);
        questions.push({ id: questionId, maxMark: generated.type === 'multiple_choice' ? 1 : generated.markingScheme.maxMark });
        if (generated.type === 'multiple_choice' && 'options' in generated) {
          generated.options.forEach((option, index) => optionRows.push({
            questionId,
            text: option.text,
            isCorrect: option.isCorrect,
            sortOrder: index,
          }));
        } else if ('markingScheme' in generated) {
          markingSchemeRows.push({
            questionId,
            method: 'human_grading',
            maxMark: generated.markingScheme.maxMark,
            configJson: JSON.stringify({ rubric: generated.markingScheme.rubric }),
            version: 1,
          });
        }
      }
      if (questions.length !== (job.examType === 'multiple_choice' ? questionsPerObjectiveExam : questionsPerEssayExam)) {
        throw new Error(`Question count mismatch for ${job.courseCode}.`);
      }
    }
    if (optionRows.length) {
      await tx.questionOption.createMany({ data: optionRows });
      const correctOptions = await tx.questionOption.findMany({
        where: {
          questionId: { in: optionRows.map((option) => option.questionId) },
          isCorrect: true,
        },
        select: { id: true, questionId: true },
      });
      const expectedCorrectCount = optionRows
        .filter((option) => option.isCorrect)
        .length;
      if (correctOptions.length !== expectedCorrectCount) {
        throw new Error('Generated objective answer keys did not pass integrity validation.');
      }
      await tx.answerKey.createMany({
        data: correctOptions.map((option) => ({
          questionId: option.questionId,
          correctOptionId: option.id,
          version: 1,
        })),
      });
    }
    if (markingSchemeRows.length) {
      await tx.markingScheme.createMany({ data: markingSchemeRows });
    }
    for (const job of jobs) {
      const courseId = courseIds.get(job.courseCode)!;
      const schedule = scheduleByJob.get(job.courseCode)!;
      const assessment = await tx.assessment.create({
        data: {
          courseId,
          title: `${job.courseTitle} Final Examination`,
          type: 'exam',
          durationMins: job.examType === 'multiple_choice' ? 120 : 180,
          startAt: schedule.startAt,
          endAt: schedule.endAt,
          status: 'published',
          randomizeQuestions: true,
          randomizeOptions: job.examType === 'multiple_choice',
          maxAttempts: 1,
          createdBy: preflight.staff.id,
          items: {
            create: job.questions.map((question, index) => ({
              questionId: question.id,
              displayOrder: index + 1,
              maxMark: question.maxMark,
              markingMethod: job.examType === 'multiple_choice' ? 'exact_match' : 'human_grading',
            })),
          },
        },
      });
      newAssessmentIds.push(assessment.id);
    }

    await tx.assessment.updateMany({
      where: { id: { in: oldAssessmentIds }, status: 'published' },
      data: { status: 'archived' },
    });
    return { newAssessmentIds, courseIds, enrollmentCount: enrollments.length, newCatalogCourseCount };
  }, { maxWait: 10_000, timeout: 120_000 });

  const audit = await createAuditEvent({
    actorId: preflight.staff.id,
    actionType: 'law_exam_catalog_provisioned',
    entityType: 'assessment_batch',
    entityId: created.newAssessmentIds[0],
    reason: 'Provisioned the NUC CCMAS Law-only benchmark catalog and scheduled assessments as authorized.',
    metadata: {
      databaseName: preflight.databaseName,
      courseCodes: allSpecs.map((course) => course.code),
      projectOnlyCourse: 'LAW 599',
      objectiveCourse: objectiveCourse.code,
      carryovers,
      archivedAssessmentIds: oldAssessmentIds,
      createdAssessmentIds: created.newAssessmentIds,
      schedules: Object.fromEntries([...scheduleByJob].map(([code, schedule]) => [code, {
        startAt: schedule.startAt.toISOString(),
        endAt: schedule.endAt.toISOString(),
      }])),
    },
  });
  if (!audit) throw new Error('Database changes committed, but the audit event could not be written.');

  const archivedCount = await prisma.assessment.count({
    where: { id: { in: oldAssessmentIds }, status: 'archived' },
  });
  const createdAssessmentCount = await prisma.assessment.count({
    where: { id: { in: created.newAssessmentIds }, status: 'published' },
  });
  const objectiveAssessment = await prisma.assessment.findFirst({
    where: {
      id: { in: created.newAssessmentIds },
      courseId: created.courseIds.get(objectiveCourse.code),
    },
    select: { id: true },
  });
  if (!objectiveAssessment) throw new Error('Objective assessment was not created.');
  const objectiveQuestionCount = await prisma.assessmentItem.count({
    where: { assessmentId: objectiveAssessment.id, question: { type: 'multiple_choice' } },
  });
  if (archivedCount !== 7 || createdAssessmentCount !== jobs.length) {
    throw new Error('Post-write verification failed for assessment statuses.');
  }
  if (objectiveQuestionCount !== questionsPerObjectiveExam) {
    throw new Error('Post-write verification failed for objective question count.');
  }
  const assessmentSummaries = await prisma.assessment.findMany({
    where: { id: { in: created.newAssessmentIds } },
    select: {
      id: true,
      title: true,
      durationMins: true,
      startAt: true,
      endAt: true,
      status: true,
      course: { select: { code: true, level: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ course: { level: 'asc' } }, { course: { code: 'asc' } }],
  });
  console.log(JSON.stringify({
    databaseName: preflight.databaseName,
    addedCatalogCourses: created.newCatalogCourseCount,
    preservedExistingCourses: existingLawCourses.length,
    projectOnlyCourse: 'LAW 599',
    examCount: assessmentSummaries.length,
    objectiveCourse: objectiveCourse.code,
    objectiveQuestionCount,
    essayExamCount: assessmentSummaries.filter((assessment) => assessment.course.code !== objectiveCourse.code).length,
    totalCandidateEnrollments: created.enrollmentCount,
    carryovers: carryovers.map(({ level, courseCode }) => ({ level, courseCode })),
    archivedOldAssessments: archivedCount,
    schedules: assessmentSummaries.map((assessment) => ({
      courseCode: assessment.course.code,
      level: assessment.course.level,
      type: assessment._count.items === questionsPerObjectiveExam ? 'objective' : 'essay',
      durationMins: assessment.durationMins,
      startAt: assessment.startAt?.toISOString(),
      endAt: assessment.endAt?.toISOString(),
      status: assessment.status,
    })),
  }, null, 2));
}

async function verifyProduction() {
  assertProductionContext();
  const expectedCodes = [...catalog.map((course) => course.code), ...existingLawCourses.map((course) => course.code)];
  const courses = await prisma.course.findMany({
    where: { code: { in: expectedCodes } },
    select: { id: true, code: true, level: true },
  });
  const candidates = await prisma.user.findMany({
    where: { role: 'candidate' },
    select: { id: true, academicLevel: true },
  });
  const enrollments = await prisma.userCourse.findMany({
    where: { role: 'candidate' },
    select: { userId: true, courseId: true, course: { select: { level: true } } },
  });
  const assessments = await prisma.assessment.findMany({
    where: {
      status: 'published',
      course: { code: { in: expectedCodes } },
    },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      durationMins: true,
      course: { select: { code: true, level: true } },
      items: {
        select: {
          question: {
            select: {
              type: true,
              options: { select: { isCorrect: true } },
              answerKeys: { select: { id: true } },
              markingSchemes: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  const audit = await prisma.auditEvent.findFirst({
    where: { actionType: 'law_exam_catalog_provisioned' },
    orderBy: { occurredAt: 'desc' },
    select: { metadataJson: true },
  });

  if (courses.length !== expectedCodes.length) throw new Error(`Expected ${expectedCodes.length} catalog courses, found ${courses.length}.`);
  if (candidates.length !== 28 || candidates.some((candidate) => !candidate.academicLevel)) {
    throw new Error('Candidate count or academic-level verification failed.');
  }
  const levelCounts = Object.fromEntries([100, 200, 300, 400, 500].map((level) => [
    level,
    candidates.filter((candidate) => candidate.academicLevel === level).length,
  ]));
  if (JSON.stringify(levelCounts) !== JSON.stringify({ 100: 6, 200: 6, 300: 6, 400: 5, 500: 5 })) {
    throw new Error(`Candidate level distribution changed: ${JSON.stringify(levelCounts)}`);
  }
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const misplacedEnrollments = enrollments.filter((enrollment) => {
    const course = courseById.get(enrollment.courseId);
    const candidate = candidateById.get(enrollment.userId);
    return course && candidate && course.level !== `LLB ${candidate.academicLevel}`;
  });
  const objectiveAssessments = assessments.filter((assessment) =>
    assessment.items.length === questionsPerObjectiveExam
    && assessment.items.every((item) => item.question.type === 'multiple_choice'),
  );
  const essayAssessments = assessments.filter((assessment) => assessment.items.length === questionsPerEssayExam);
  if (assessments.length !== 31 || objectiveAssessments.length !== 1 || essayAssessments.length !== 30) {
    throw new Error(`Assessment count/type verification failed: ${JSON.stringify({ published: assessments.length, objective: objectiveAssessments.length, essay: essayAssessments.length })}`);
  }
  const objective = objectiveAssessments[0];
  if (!objective.course.level.includes('100') || objective.durationMins !== 120) {
    throw new Error('Objective assessment course level or duration is invalid.');
  }
  const objectiveItemsValid = objective.items.every((item) =>
    item.question.options.length === 4
    && item.question.options.filter((option) => option.isCorrect).length === 1
    && item.question.answerKeys.length === 1,
  );
  if (!objectiveItemsValid) throw new Error('Objective answer options or answer keys failed verification.');
  const essayItemsMissingSchemes = essayAssessments.reduce((missing, assessment) =>
    missing + assessment.items.filter((item) => item.question.markingSchemes.length === 0).length,
  0);
  if (essayItemsMissingSchemes) {
    throw new Error(`${essayItemsMissingSchemes} essay questions lack a marking scheme.`);
  }
  const publishedObjectiveElsewhere = assessments.some((assessment) =>
    assessment !== objective && assessment.items.some((item) => item.question.type === 'multiple_choice'),
  );
  if (publishedObjectiveElsewhere) throw new Error('Objective questions appear outside the selected 100-level exam.');
  const invalidSchedules = assessments.filter((assessment) =>
    !assessment.startAt || !assessment.endAt || assessment.startAt >= assessment.endAt,
  );
  if (invalidSchedules.length) throw new Error('One or more published exam schedules are missing or invalid.');
  const auditMetadata = audit?.metadataJson ? JSON.parse(audit.metadataJson) as {
    archivedAssessmentIds?: string[];
    createdAssessmentIds?: string[];
    carryovers?: Array<{ candidateId: string; courseCode: string }>;
  } : null;
  if (!auditMetadata?.createdAssessmentIds || auditMetadata.createdAssessmentIds.length !== 31) {
    throw new Error('Provisioning audit record is missing or incomplete.');
  }
  const archivedOldAssessments = await prisma.assessment.count({
    where: { id: { in: auditMetadata.archivedAssessmentIds ?? [] }, status: 'archived' },
  });
  const carryoversValid: boolean[] = [];
  for (const carryover of auditMetadata.carryovers ?? []) {
    const course = courses.find((item) => item.code === carryover.courseCode);
    carryoversValid.push(Boolean(course && await prisma.userCourse.findFirst({
      where: { userId: carryover.candidateId, courseId: course.id, role: 'candidate' },
      select: { id: true },
    })));
  }
  const nonLawCourses = await prisma.course.count({
    where: {
      NOT: {
        OR: ['LAW', 'PUL', 'PPL', 'CIL', 'CLE', 'JIL'].map((prefix) => ({
          code: { startsWith: prefix, mode: 'insensitive' as const },
        })),
      },
    },
  });
  if (archivedOldAssessments !== 7) throw new Error(`Expected seven archived legacy exams, found ${archivedOldAssessments}.`);
  if (carryoversValid.length !== 4 || carryoversValid.some((isValid) => !isValid)) {
    throw new Error('One or more carry-over candidates are not enrolled in their selected prior-level course.');
  }
  if (nonLawCourses !== 0) throw new Error(`Found ${nonLawCourses} non-Law courses.`);

  console.log(JSON.stringify({
    catalogCourses: courses.length,
    candidates: candidates.length,
    candidatesByLevel: levelCounts,
    candidateEnrollments: enrollments.length,
    enrollmentsForSameLevel: enrollments.length - misplacedEnrollments.length,
    misplacedEnrollments: misplacedEnrollments.length,
    publishedExams: assessments.length,
    essayExamsWithSixItems: essayAssessments.length,
    essayItemsWithMarkingSchemes: essayAssessments.reduce((total, assessment) => total + assessment.items.length, 0),
    objectiveExamCourse: objective.course.code,
    objectiveExamItemsWithValidKeys: objective.items.length,
    archivedLegacyExams: archivedOldAssessments,
    carryovers: auditMetadata.carryovers?.length,
    nonLawCourses,
    auditRecord: true,
    verification: 'passed',
  }, null, 2));
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--validate-local') {
    const materials = await loadMaterials();
    validateAuthoredQuestions(materials);
    console.log(JSON.stringify({
      curriculumOutlines: Object.keys(materials).length,
      essayExamCount: essayExamQuestionTotal() / questionsPerEssayExam,
      essayQuestionCount: essayExamQuestionTotal(),
      objectiveQuestionCountPerFirstLevelCourse: questionsPerObjectiveExam,
      objectiveCoursesValidated: catalog.filter((course) => course.level === 'LLB 100').length,
      aiProviderRequired: false,
      validation: 'passed',
    }, null, 2));
    return;
  }
  assertProductionContext();
  if (mode === '--preflight') {
    const state = await inspectProduction();
    console.log(JSON.stringify({
      databaseName: state.databaseName,
      candidateCount: state.candidates.length,
      levelCounts: state.levelCounts,
      existingLawCourseCount: state.matchingCourses.length,
      publishedAssessmentCount: state.publishedAssessments.length,
      publishedAssessmentsHaveNoAttempts: state.publishedAssessments.every((assessment) => assessment._count.attempts === 0),
      nonLawCourseCount: 0,
      activeStaffAvailable: true,
      materialsCount: Object.keys(state.materials).length,
      authoredEssayQuestionCount: essayExamQuestionTotal(),
      authoredObjectiveQuestionCountPerFirstLevelCourse: questionsPerObjectiveExam,
      questionGeneration: 'authored and validated from NUC CCMAS outlines; no external AI service required',
    }, null, 2));
    return;
  }
  if (mode === '--verify') {
    await verifyProduction();
    return;
  }
  if (mode === '--apply') {
    await apply();
    return;
  }
  throw new Error('Use --validate-local, --preflight, --apply, or --verify.');
}

function essayExamQuestionTotal() {
  return (catalog.filter((course) => course.sourceCode !== 'LAW599').length - 1 + existingLawCourses.length)
    * questionsPerEssayExam;
}

main()
  .catch((error) => {
    console.error('Production Law exam provisioning failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
