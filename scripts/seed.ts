import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { profileDisplayName } from './profile-display-names';

const prisma = new PrismaClient();

async function createAuditHash(prevHash: string, content: any) {
  const data = JSON.stringify({ ...content, prevHash, timestamp: new Date().toISOString() });
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  console.log('Seeding database...');

  // Hash passwords
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  const officerHash = await bcrypt.hash('Officer@1234', 12);
  const lecturerHash = await bcrypt.hash('Lecturer@1234', 12);
  const invigilatorHash = await bcrypt.hash('Invigilator@1234', 12);
  const studentHash = await bcrypt.hash('Student@1234', 12);
  const testHash = await bcrypt.hash('30gbQsA1Q@', 12);

  // Create users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@bingham.edu' },
    update: { name: profileDisplayName('admin@bingham.edu') },
    create: { name: profileDisplayName('admin@bingham.edu'), email: 'admin@bingham.edu', passwordHash: adminHash, role: 'admin' },
  });

  const testAdmin = await prisma.user.upsert({
    where: { email: 'abacus-11a6e251@example.com' },
    update: { name: profileDisplayName('abacus-11a6e251@example.com') },
    create: { name: profileDisplayName('abacus-11a6e251@example.com'), email: 'abacus-11a6e251@example.com', passwordHash: testHash, role: 'admin' },
  });

  const examOfficer = await prisma.user.upsert({
    where: { email: 'examofficer@bingham.edu' },
    update: { name: profileDisplayName('examofficer@bingham.edu') },
    create: { name: profileDisplayName('examofficer@bingham.edu'), email: 'examofficer@bingham.edu', passwordHash: officerHash, role: 'exam_officer' },
  });

  const lecturer = await prisma.user.upsert({
    where: { email: 'lecturer@bingham.edu' },
    update: { name: profileDisplayName('lecturer@bingham.edu') },
    create: { name: profileDisplayName('lecturer@bingham.edu'), email: 'lecturer@bingham.edu', passwordHash: lecturerHash, role: 'lecturer' },
  });

  const invigilator = await prisma.user.upsert({
    where: { email: 'invigilator@bingham.edu' },
    update: { name: profileDisplayName('invigilator@bingham.edu') },
    create: { name: profileDisplayName('invigilator@bingham.edu'), email: 'invigilator@bingham.edu', passwordHash: invigilatorHash, role: 'invigilator' },
  });

  const student1 = await prisma.user.upsert({
    where: { email: 'student1@bingham.edu' },
    update: { name: profileDisplayName('student1@bingham.edu') },
    create: { name: profileDisplayName('student1@bingham.edu'), email: 'student1@bingham.edu', passwordHash: studentHash, role: 'candidate' },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@bingham.edu' },
    update: { name: profileDisplayName('student2@bingham.edu') },
    create: { name: profileDisplayName('student2@bingham.edu'), email: 'student2@bingham.edu', passwordHash: studentHash, role: 'candidate' },
  });

  const student3 = await prisma.user.upsert({
    where: { email: 'student3@bingham.edu' },
    update: { name: profileDisplayName('student3@bingham.edu') },
    create: { name: profileDisplayName('student3@bingham.edu'), email: 'student3@bingham.edu', passwordHash: studentHash, role: 'candidate' },
  });

  // Create courses
  const constLaw = await prisma.course.upsert({
    where: { code: 'LAW201' },
    update: {},
    create: { code: 'LAW201', title: 'Constitutional Law', level: 'LLB 200' },
  });

  const crimLaw = await prisma.course.upsert({
    where: { code: 'LAW301' },
    update: {},
    create: { code: 'LAW301', title: 'Criminal Law', level: 'LLB 300' },
  });

  const contractLaw = await prisma.course.upsert({
    where: { code: 'LAW202' },
    update: {},
    create: { code: 'LAW202', title: 'Law of Contract', level: 'LLB 200' },
  });

  // Assign lecturer to courses
  for (const course of [constLaw, crimLaw, contractLaw]) {
    await prisma.userCourse.upsert({
      where: { userId_courseId: { userId: lecturer.id, courseId: course.id } },
      update: {},
      create: { userId: lecturer.id, courseId: course.id, role: 'lecturer' },
    });
  }

  // Assign every candidate (seeded and later sign-ups) to all courses
  const allCandidates = await prisma.user.findMany({ where: { role: 'candidate' }, select: { id: true } });
  for (const student of allCandidates) {
    for (const course of [constLaw, crimLaw, contractLaw]) {
      await prisma.userCourse.upsert({
        where: { userId_courseId: { userId: student.id, courseId: course.id } },
        update: {},
        create: { userId: student.id, courseId: course.id, role: 'candidate' },
      });
    }
  }

  // Create questions for Constitutional Law
  const mcq1 = await prisma.question.upsert({
    where: { id: 'q-mcq-const-1' },
    update: {},
    create: {
      id: 'q-mcq-const-1',
      courseId: constLaw.id,
      type: 'multiple_choice',
      text: 'Which section of the 1999 Constitution provides for the supremacy of the Constitution?',
      difficulty: 'easy',
      topic: 'Supremacy of the Constitution',
      createdBy: lecturer.id,
    },
  });

  const opt1a = await prisma.questionOption.upsert({
    where: { id: 'opt-1a' },
    update: {},
    create: { id: 'opt-1a', questionId: mcq1.id, text: 'Section 1', isCorrect: true, sortOrder: 0 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-1b' },
    update: {},
    create: { id: 'opt-1b', questionId: mcq1.id, text: 'Section 4', isCorrect: false, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-1c' },
    update: {},
    create: { id: 'opt-1c', questionId: mcq1.id, text: 'Section 14', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-1d' },
    update: {},
    create: { id: 'opt-1d', questionId: mcq1.id, text: 'Section 36', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-1' },
    update: {},
    create: { id: 'ak-1', questionId: mcq1.id, correctOptionId: opt1a.id },
  });

  const mcq2 = await prisma.question.upsert({
    where: { id: 'q-mcq-const-2' },
    update: {},
    create: {
      id: 'q-mcq-const-2',
      courseId: constLaw.id,
      type: 'multiple_choice',
      text: 'The principle of separation of powers divides government into how many arms?',
      difficulty: 'easy',
      topic: 'Separation of Powers',
      createdBy: lecturer.id,
    },
  });

  const opt2a = await prisma.questionOption.upsert({
    where: { id: 'opt-2a' },
    update: {},
    create: { id: 'opt-2a', questionId: mcq2.id, text: 'Two', isCorrect: false, sortOrder: 0 },
  });
  const opt2b = await prisma.questionOption.upsert({
    where: { id: 'opt-2b' },
    update: {},
    create: { id: 'opt-2b', questionId: mcq2.id, text: 'Three', isCorrect: true, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-2c' },
    update: {},
    create: { id: 'opt-2c', questionId: mcq2.id, text: 'Four', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-2d' },
    update: {},
    create: { id: 'opt-2d', questionId: mcq2.id, text: 'Five', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-2' },
    update: {},
    create: { id: 'ak-2', questionId: mcq2.id, correctOptionId: opt2b.id },
  });

  const mcq3 = await prisma.question.upsert({
    where: { id: 'q-mcq-const-3' },
    update: {},
    create: {
      id: 'q-mcq-const-3',
      courseId: constLaw.id,
      type: 'multiple_choice',
      text: 'Which chapter of the 1999 Constitution contains the Fundamental Rights provisions?',
      difficulty: 'medium',
      topic: 'Fundamental Rights',
      createdBy: lecturer.id,
    },
  });

  const opt3a = await prisma.questionOption.upsert({
    where: { id: 'opt-3a' },
    update: {},
    create: { id: 'opt-3a', questionId: mcq3.id, text: 'Chapter II', isCorrect: false, sortOrder: 0 },
  });
  const opt3b = await prisma.questionOption.upsert({
    where: { id: 'opt-3b' },
    update: {},
    create: { id: 'opt-3b', questionId: mcq3.id, text: 'Chapter IV', isCorrect: true, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-3c' },
    update: {},
    create: { id: 'opt-3c', questionId: mcq3.id, text: 'Chapter V', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-3d' },
    update: {},
    create: { id: 'opt-3d', questionId: mcq3.id, text: 'Chapter VII', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-3' },
    update: {},
    create: { id: 'ak-3', questionId: mcq3.id, correctOptionId: opt3b.id },
  });

  // Short answer questions
  const sa1 = await prisma.question.upsert({
    where: { id: 'q-sa-const-1' },
    update: {},
    create: {
      id: 'q-sa-const-1',
      courseId: constLaw.id,
      type: 'short_answer',
      text: 'Define the doctrine of judicial review as applied in Nigerian Constitutional Law.',
      difficulty: 'medium',
      topic: 'Judicial Review',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-sa-1' },
    update: {},
    create: {
      id: 'ms-sa-1',
      questionId: sa1.id,
      method: 'marking_points',
      maxMark: 10,
      configJson: JSON.stringify({ acceptedPhrases: ['judicial review', 'power of courts', 'constitutionality'] }),
    },
  });

  await prisma.markingPoint.upsert({
    where: { id: 'mp-sa-1a' },
    update: {},
    create: { id: 'mp-sa-1a', schemeId: 'ms-sa-1', pointText: 'Power of courts to examine legislative and executive actions', marks: 4 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-sa-1b' },
    update: {},
    create: { id: 'mp-sa-1b', schemeId: 'ms-sa-1', pointText: 'Determination of constitutionality of such actions', marks: 3 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-sa-1c' },
    update: {},
    create: { id: 'mp-sa-1c', schemeId: 'ms-sa-1', pointText: 'Reference to relevant case law (e.g., Marbury v Madison or Nigerian equivalents)', marks: 3 },
  });

  const sa2 = await prisma.question.upsert({
    where: { id: 'q-sa-const-2' },
    update: {},
    create: {
      id: 'q-sa-const-2',
      courseId: constLaw.id,
      type: 'short_answer',
      text: 'What is the doctrine of covering the field in Nigerian federalism?',
      difficulty: 'hard',
      topic: 'Federalism',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-sa-2' },
    update: {},
    create: {
      id: 'ms-sa-2',
      questionId: sa2.id,
      method: 'exact_match',
      maxMark: 5,
      configJson: JSON.stringify({ acceptedPhrases: ['covering the field', 'federal law prevails', 'inconsistency doctrine'] }),
    },
  });

  async function upsertEssayQuestion(params: {
    id: string;
    courseId: string;
    text: string;
    topic: string;
    difficulty?: 'medium' | 'hard';
    schemeId: string;
    maxMark: number;
    rubric: string[];
    wordLimit?: number;
    wordTarget?: number;
  }) {
    const question = await prisma.question.upsert({
      where: { id: params.id },
      update: {
        status: 'approved',
        text: params.text,
        topic: params.topic,
        difficulty: params.difficulty || 'hard',
        wordLimit: params.wordLimit ?? 1200,
        wordTarget: params.wordTarget ?? 800,
      },
      create: {
        id: params.id,
        courseId: params.courseId,
        type: 'essay',
        text: params.text,
        difficulty: params.difficulty || 'hard',
        topic: params.topic,
        wordLimit: params.wordLimit ?? 1200,
        wordTarget: params.wordTarget ?? 800,
        createdBy: lecturer.id,
      },
    });

    await prisma.markingScheme.upsert({
      where: { id: params.schemeId },
      update: {
        maxMark: params.maxMark,
        configJson: JSON.stringify({ rubric: params.rubric }),
      },
      create: {
        id: params.schemeId,
        questionId: question.id,
        method: 'human_grading',
        maxMark: params.maxMark,
        configJson: JSON.stringify({ rubric: params.rubric }),
      },
    });

    return question;
  }

  async function upsertEssayExam(params: {
    id: string;
    courseId: string;
    title: string;
    durationMins: number;
    items: { questionId: string; order: number; maxMark: number }[];
  }) {
    const exam = await prisma.assessment.upsert({
      where: { id: params.id },
      update: {
        title: params.title,
        durationMins: params.durationMins,
        startAt: now,
        endAt: endDate,
        status: 'published',
        type: 'exam',
      },
      create: {
        id: params.id,
        courseId: params.courseId,
        title: params.title,
        type: 'exam',
        durationMins: params.durationMins,
        startAt: now,
        endAt: endDate,
        status: 'published',
        randomizeQuestions: false,
        randomizeOptions: false,
        maxAttempts: 1,
        createdBy: lecturer.id,
      },
    });

    for (const item of params.items) {
      await prisma.assessmentItem.upsert({
        where: { assessmentId_questionId: { assessmentId: exam.id, questionId: item.questionId } },
        update: { displayOrder: item.order, maxMark: item.maxMark, markingMethod: 'human_grading' },
        create: {
          assessmentId: exam.id,
          questionId: item.questionId,
          displayOrder: item.order,
          maxMark: item.maxMark,
          markingMethod: 'human_grading',
        },
      });
    }

    return exam;
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const essay1 = await upsertEssayQuestion({
    id: 'q-essay-const-1',
    courseId: constLaw.id,
    text: 'Critically examine the concept of federalism under the 1999 Constitution of Nigeria. Discuss whether Nigeria operates a true federal system.',
    topic: 'Federalism',
    schemeId: 'ms-essay-1',
    maxMark: 25,
    rubric: [
      'Introduction and definition of federalism (5 marks)',
      'Features of Nigerian federalism (5 marks)',
      'Critical analysis of whether Nigeria is truly federal (8 marks)',
      'Use of case law and constitutional provisions (4 marks)',
      'Conclusion (3 marks)',
    ],
  });

  const essayConst2 = await upsertEssayQuestion({
    id: 'q-essay-const-2',
    courseId: constLaw.id,
    text: 'Evaluate the doctrine of separation of powers under the 1999 Constitution. To what extent do checks and balances restrain the three arms of government in Nigeria?',
    topic: 'Separation of Powers',
    schemeId: 'ms-essay-const-2',
    maxMark: 25,
    rubric: [
      'Meaning and constitutional basis of separation of powers (5 marks)',
      'Functions of the legislature, executive and judiciary (6 marks)',
      'Checks and balances and practical overlaps (8 marks)',
      'Authorities and conclusion (6 marks)',
    ],
  });

  const essayConst3 = await upsertEssayQuestion({
    id: 'q-essay-const-3',
    courseId: constLaw.id,
    text: 'Discuss the enforcement of Chapter IV fundamental rights in Nigeria. Assess the effectiveness of available remedies where a public authority infringes a citizen’s rights.',
    topic: 'Fundamental Rights',
    schemeId: 'ms-essay-const-3',
    maxMark: 25,
    rubric: [
      'Scope of Chapter IV rights (5 marks)',
      'Limitation clauses and derogation (6 marks)',
      'Enforcement procedure and remedies (8 marks)',
      'Critical evaluation and authorities (6 marks)',
    ],
  });

  // Legal problem questions
  const lp1 = await prisma.question.upsert({
    where: { id: 'q-lp-const-1' },
    update: {},
    create: {
      id: 'q-lp-const-1',
      courseId: constLaw.id,
      type: 'legal_problem',
      text: 'The Governor of State X signed an Executive Order banning all social media platforms within the state, citing national security concerns. Mr. Ade, a journalist, challenged the order in court arguing it violates his fundamental rights. Advise Mr. Ade on the constitutionality of the Executive Order.',
      difficulty: 'hard',
      topic: 'Fundamental Rights',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-lp-1' },
    update: {},
    create: {
      id: 'ms-lp-1',
      questionId: lp1.id,
      method: 'marking_points',
      maxMark: 20,
    },
  });

  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-1a' },
    update: {},
    create: { id: 'mp-lp-1a', schemeId: 'ms-lp-1', pointText: 'Identification of relevant rights (freedom of expression, access to information)', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-1b' },
    update: {},
    create: { id: 'mp-lp-1b', schemeId: 'ms-lp-1', pointText: 'Analysis of constitutional limitations on rights', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-1c' },
    update: {},
    create: { id: 'mp-lp-1c', schemeId: 'ms-lp-1', pointText: 'Application of proportionality test', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-1d' },
    update: {},
    create: { id: 'mp-lp-1d', schemeId: 'ms-lp-1', pointText: 'Conclusion and advice with relevant case law', marks: 5 },
  });

  // Case analysis question
  const ca1 = await prisma.question.upsert({
    where: { id: 'q-ca-const-1' },
    update: {},
    create: {
      id: 'q-ca-const-1',
      courseId: constLaw.id,
      type: 'case_analysis',
      text: 'Analyze the Supreme Court decision in Attorney General of Abia State v. Attorney General of the Federation (2006). Discuss its impact on fiscal federalism in Nigeria.',
      difficulty: 'hard',
      topic: 'Fiscal Federalism',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-ca-1' },
    update: {},
    create: {
      id: 'ms-ca-1',
      questionId: ca1.id,
      method: 'human_grading',
      maxMark: 20,
      configJson: JSON.stringify({
        rubric: [
          'Facts of the case (3 marks)',
          'Issues for determination (3 marks)',
          'Ratio decidendi (5 marks)',
          'Impact analysis on fiscal federalism (6 marks)',
          'Critical evaluation (3 marks)',
        ],
      }),
    },
  });

  // Criminal Law MCQs
  const mcqCrim1 = await prisma.question.upsert({
    where: { id: 'q-mcq-crim-1' },
    update: {},
    create: {
      id: 'q-mcq-crim-1',
      courseId: crimLaw.id,
      type: 'multiple_choice',
      text: 'Under Nigerian Criminal Law, what is the minimum age of criminal responsibility?',
      difficulty: 'easy',
      topic: 'General Principles',
      createdBy: lecturer.id,
    },
  });

  await prisma.questionOption.upsert({
    where: { id: 'opt-c1a' },
    update: {},
    create: { id: 'opt-c1a', questionId: mcqCrim1.id, text: '7 years', isCorrect: true, sortOrder: 0 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c1b' },
    update: {},
    create: { id: 'opt-c1b', questionId: mcqCrim1.id, text: '10 years', isCorrect: false, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c1c' },
    update: {},
    create: { id: 'opt-c1c', questionId: mcqCrim1.id, text: '12 years', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c1d' },
    update: {},
    create: { id: 'opt-c1d', questionId: mcqCrim1.id, text: '14 years', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-c1' },
    update: {},
    create: { id: 'ak-c1', questionId: mcqCrim1.id, correctOptionId: 'opt-c1a' },
  });

  const mcqCrim2 = await prisma.question.upsert({
    where: { id: 'q-mcq-crim-2' },
    update: {},
    create: {
      id: 'q-mcq-crim-2',
      courseId: crimLaw.id,
      type: 'multiple_choice',
      text: 'The mens rea for murder under Nigerian law requires:',
      difficulty: 'medium',
      topic: 'Homicide',
      createdBy: lecturer.id,
    },
  });

  await prisma.questionOption.upsert({
    where: { id: 'opt-c2a' },
    update: {},
    create: { id: 'opt-c2a', questionId: mcqCrim2.id, text: 'Negligence', isCorrect: false, sortOrder: 0 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c2b' },
    update: {},
    create: { id: 'opt-c2b', questionId: mcqCrim2.id, text: 'Intention to kill or cause grievous bodily harm', isCorrect: true, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c2c' },
    update: {},
    create: { id: 'opt-c2c', questionId: mcqCrim2.id, text: 'Recklessness only', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-c2d' },
    update: {},
    create: { id: 'opt-c2d', questionId: mcqCrim2.id, text: 'Strict liability', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-c2' },
    update: {},
    create: { id: 'ak-c2', questionId: mcqCrim2.id, correctOptionId: 'opt-c2b' },
  });

  const essayCrim1 = await upsertEssayQuestion({
    id: 'q-essay-crim-1',
    courseId: crimLaw.id,
    text: 'Discuss the defences available to a person charged with murder under Nigerian Criminal Law. Illustrate with relevant case law.',
    topic: 'Defences',
    schemeId: 'ms-essay-crim-1',
    maxMark: 25,
    rubric: [
      'Introduction (3 marks)',
      'Self-defence (5 marks)',
      'Provocation (5 marks)',
      'Insanity and diminished responsibility (5 marks)',
      'Use of case law (4 marks)',
      'Conclusion (3 marks)',
    ],
  });

  const essayCrim2 = await upsertEssayQuestion({
    id: 'q-essay-crim-2',
    courseId: crimLaw.id,
    text: 'Explain the relationship between actus reus and mens rea in Nigerian criminal law. Using decided cases, discuss coincidence of act and intent, transferred malice, and strict liability offences.',
    topic: 'General Principles',
    schemeId: 'ms-essay-crim-2',
    maxMark: 25,
    rubric: [
      'Definitions of actus reus and mens rea (5 marks)',
      'Coincidence of act and intent (6 marks)',
      'Transferred malice and strict liability (8 marks)',
      'Authorities and conclusion (6 marks)',
    ],
  });

  const essayCrim3 = await upsertEssayQuestion({
    id: 'q-essay-crim-3',
    courseId: crimLaw.id,
    text: 'Critically examine the offence of stealing under the Criminal Code. Distinguish it from related property offences and assess the adequacy of the current statutory definition.',
    topic: 'Property Offences',
    schemeId: 'ms-essay-crim-3',
    maxMark: 25,
    rubric: [
      'Elements of stealing (6 marks)',
      'Comparison with related offences (7 marks)',
      'Critical evaluation of the statutory definition (7 marks)',
      'Authorities and conclusion (5 marks)',
    ],
  });

  // Contract Law MCQs
  const mcqCon1 = await prisma.question.upsert({
    where: { id: 'q-mcq-con-1' },
    update: {},
    create: {
      id: 'q-mcq-con-1',
      courseId: contractLaw.id,
      type: 'multiple_choice',
      text: 'Which of the following is NOT an essential element of a valid contract?',
      difficulty: 'easy',
      topic: 'Formation of Contract',
      createdBy: lecturer.id,
    },
  });

  await prisma.questionOption.upsert({
    where: { id: 'opt-co1a' },
    update: {},
    create: { id: 'opt-co1a', questionId: mcqCon1.id, text: 'Offer and acceptance', isCorrect: false, sortOrder: 0 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co1b' },
    update: {},
    create: { id: 'opt-co1b', questionId: mcqCon1.id, text: 'Consideration', isCorrect: false, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co1c' },
    update: {},
    create: { id: 'opt-co1c', questionId: mcqCon1.id, text: 'Written form', isCorrect: true, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co1d' },
    update: {},
    create: { id: 'opt-co1d', questionId: mcqCon1.id, text: 'Intention to create legal relations', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-co1' },
    update: {},
    create: { id: 'ak-co1', questionId: mcqCon1.id, correctOptionId: 'opt-co1c' },
  });

  const mcqCon2 = await prisma.question.upsert({
    where: { id: 'q-mcq-con-2' },
    update: {},
    create: {
      id: 'q-mcq-con-2',
      courseId: contractLaw.id,
      type: 'multiple_choice',
      text: 'In the case of Carlill v Carbolic Smoke Ball Co., the court held that:',
      difficulty: 'medium',
      topic: 'Offer and Acceptance',
      createdBy: lecturer.id,
    },
  });

  await prisma.questionOption.upsert({
    where: { id: 'opt-co2a' },
    update: {},
    create: { id: 'opt-co2a', questionId: mcqCon2.id, text: 'An advertisement can never constitute an offer', isCorrect: false, sortOrder: 0 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co2b' },
    update: {},
    create: { id: 'opt-co2b', questionId: mcqCon2.id, text: 'A unilateral offer to the world at large is valid', isCorrect: true, sortOrder: 1 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co2c' },
    update: {},
    create: { id: 'opt-co2c', questionId: mcqCon2.id, text: 'Consideration must be adequate', isCorrect: false, sortOrder: 2 },
  });
  await prisma.questionOption.upsert({
    where: { id: 'opt-co2d' },
    update: {},
    create: { id: 'opt-co2d', questionId: mcqCon2.id, text: 'Only bilateral contracts are enforceable', isCorrect: false, sortOrder: 3 },
  });

  await prisma.answerKey.upsert({
    where: { id: 'ak-co2' },
    update: {},
    create: { id: 'ak-co2', questionId: mcqCon2.id, correctOptionId: 'opt-co2b' },
  });

  // Contract Law short answer
  const saCon1 = await prisma.question.upsert({
    where: { id: 'q-sa-con-1' },
    update: {},
    create: {
      id: 'q-sa-con-1',
      courseId: contractLaw.id,
      type: 'short_answer',
      text: 'Explain the postal rule of acceptance in contract law.',
      difficulty: 'medium',
      topic: 'Offer and Acceptance',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-sa-con-1' },
    update: {},
    create: {
      id: 'ms-sa-con-1',
      questionId: saCon1.id,
      method: 'ai_recommendation',
      maxMark: 10,
      configJson: JSON.stringify({ acceptedPhrases: ['postal rule', 'Adams v Lindsell', 'acceptance effective when posted'] }),
    },
  });

  // Contract Law legal problem
  const lpCon1 = await prisma.question.upsert({
    where: { id: 'q-lp-con-1' },
    update: {},
    create: {
      id: 'q-lp-con-1',
      courseId: contractLaw.id,
      type: 'legal_problem',
      text: 'Ade offered to sell his car to Bola for N5 million. Bola replied by email accepting the offer but stating that payment would be in installments. Ade did not respond and sold the car to Chioma. Advise Bola.',
      difficulty: 'hard',
      topic: 'Offer and Acceptance',
      createdBy: lecturer.id,
    },
  });

  await prisma.markingScheme.upsert({
    where: { id: 'ms-lp-con-1' },
    update: {},
    create: {
      id: 'ms-lp-con-1',
      questionId: lpCon1.id,
      method: 'marking_points',
      maxMark: 20,
    },
  });

  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-con-1a' },
    update: {},
    create: { id: 'mp-lp-con-1a', schemeId: 'ms-lp-con-1', pointText: 'Identification of counter-offer issue', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-con-1b' },
    update: {},
    create: { id: 'mp-lp-con-1b', schemeId: 'ms-lp-con-1', pointText: 'Application of Hyde v Wrench principle', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-con-1c' },
    update: {},
    create: { id: 'mp-lp-con-1c', schemeId: 'ms-lp-con-1', pointText: 'Analysis of whether installment term is a counter-offer or mere inquiry', marks: 5 },
  });
  await prisma.markingPoint.upsert({
    where: { id: 'mp-lp-con-1d' },
    update: {},
    create: { id: 'mp-lp-con-1d', schemeId: 'ms-lp-con-1', pointText: 'Conclusion and advice to Bola', marks: 5 },
  });

  const essayCon1 = await upsertEssayQuestion({
    id: 'q-essay-con-1',
    courseId: contractLaw.id,
    text: 'Critically examine the requirements for forming a valid contract under Nigerian law, with particular reference to offer, acceptance, consideration and intention to create legal relations. Explain how Nigerian courts determine whether parties have become legally bound, using relevant authorities.',
    topic: 'Formation of Contract',
    schemeId: 'ms-essay-con-1',
    maxMark: 25,
    rubric: [
      'Explains offer and acceptance, including communication and the postal rule (7 marks)',
      'Analyzes consideration and the intention to create legal relations (6 marks)',
      'Applies relevant Nigerian statutes and decided cases (7 marks)',
      'Presents a coherent, critical analysis and supported conclusion (5 marks)',
    ],
  });

  const essayCon2 = await upsertEssayQuestion({
    id: 'q-essay-con-2',
    courseId: contractLaw.id,
    text: 'Discuss the doctrine of consideration and the exceptions that allow a promise to be enforced without fresh consideration. Evaluate whether Nigerian law should adopt promissory estoppel more fully.',
    topic: 'Consideration',
    schemeId: 'ms-essay-con-2',
    maxMark: 25,
    rubric: [
      'Meaning and rules of consideration (6 marks)',
      'Exceptions and existing-duty cases (7 marks)',
      'Promissory estoppel and reform arguments (7 marks)',
      'Authorities and conclusion (5 marks)',
    ],
  });

  const essayCon3 = await upsertEssayQuestion({
    id: 'q-essay-con-3',
    courseId: contractLaw.id,
    text: 'Examine the vitiating factors of misrepresentation, duress and undue influence. Advise on how a Nigerian court would approach a contract alleged to have been procured by economic pressure.',
    topic: 'Vitiating Factors',
    schemeId: 'ms-essay-con-3',
    maxMark: 25,
    rubric: [
      'Misrepresentation (6 marks)',
      'Duress including economic duress (7 marks)',
      'Undue influence and remedies (7 marks)',
      'Application, authorities and conclusion (5 marks)',
    ],
  });

  await upsertEssayExam({
    id: 'assessment-essay-const-1',
    courseId: constLaw.id,
    title: 'Constitutional Law Essay Examination I — Federalism',
    durationMins: 90,
    items: [{ questionId: essay1.id, order: 1, maxMark: 25 }],
  });

  await upsertEssayExam({
    id: 'assessment-essay-const-2',
    courseId: constLaw.id,
    title: 'Constitutional Law Essay Examination II — Powers and Rights',
    durationMins: 120,
    items: [
      { questionId: essayConst2.id, order: 1, maxMark: 25 },
      { questionId: essayConst3.id, order: 2, maxMark: 25 },
    ],
  });

  await upsertEssayExam({
    id: 'assessment-essay-crim-1',
    courseId: crimLaw.id,
    title: 'Criminal Law Essay Examination I — Homicide Defences',
    durationMins: 90,
    items: [{ questionId: essayCrim1.id, order: 1, maxMark: 25 }],
  });

  await upsertEssayExam({
    id: 'assessment-essay-crim-2',
    courseId: crimLaw.id,
    title: 'Criminal Law Essay Examination II — Principles and Property',
    durationMins: 120,
    items: [
      { questionId: essayCrim2.id, order: 1, maxMark: 25 },
      { questionId: essayCrim3.id, order: 2, maxMark: 25 },
    ],
  });

  await upsertEssayExam({
    id: 'assessment-essay-con-1',
    courseId: contractLaw.id,
    title: 'Law of Contract Essay Examination I — Formation',
    durationMins: 90,
    items: [{ questionId: essayCon1.id, order: 1, maxMark: 25 }],
  });

  await upsertEssayExam({
    id: 'assessment-essay-con-2',
    courseId: contractLaw.id,
    title: 'Law of Contract Essay Examination II — Consideration and Vitiating Factors',
    durationMins: 120,
    items: [
      { questionId: essayCon2.id, order: 1, maxMark: 25 },
      { questionId: essayCon3.id, order: 2, maxMark: 25 },
    ],
  });

  // Create a published active mixed assessment

  const assessment = await prisma.assessment.upsert({
    where: { id: 'assessment-const-1' },
    update: {},
    create: {
      id: 'assessment-const-1',
      courseId: constLaw.id,
      title: 'Constitutional Law Mid-Semester Examination',
      type: 'exam',
      durationMins: 120,
      startAt: now,
      endAt: endDate,
      status: 'published',
      randomizeQuestions: true,
      randomizeOptions: true,
      maxAttempts: 1,
      createdBy: lecturer.id,
    },
  });

  // Add assessment items
  const questionsForAssessment = [
    { id: mcq1.id, order: 1, maxMark: 2, method: null },
    { id: mcq2.id, order: 2, maxMark: 2, method: null },
    { id: mcq3.id, order: 3, maxMark: 2, method: null },
    { id: sa1.id, order: 4, maxMark: 10, method: 'marking_points' as const },
    { id: sa2.id, order: 5, maxMark: 5, method: 'exact_match' as const },
    { id: essay1.id, order: 6, maxMark: 25, method: 'human_grading' as const },
    { id: lp1.id, order: 7, maxMark: 20, method: 'marking_points' as const },
    { id: ca1.id, order: 8, maxMark: 20, method: 'human_grading' as const },
  ];

  for (const q of questionsForAssessment) {
    await prisma.assessmentItem.upsert({
      where: { assessmentId_questionId: { assessmentId: assessment.id, questionId: q.id } },
      update: {},
      create: {
        assessmentId: assessment.id,
        questionId: q.id,
        displayOrder: q.order,
        maxMark: q.maxMark,
        markingMethod: q.method,
      },
    });
  }

  // Create a genesis audit event
  const genesisContent = JSON.stringify({
    actorId: admin.id,
    actionType: 'system_seed',
    entityType: 'system',
    entityId: 'seed',
    prevHash: 'GENESIS',
    timestamp: now.toISOString(),
  });
  const genesisHash = crypto.createHash('sha256').update(genesisContent).digest('hex');

  await prisma.auditEvent.upsert({
    where: { id: 'audit-genesis' },
    update: {},
    create: {
      id: 'audit-genesis',
      actorId: admin.id,
      actionType: 'system_seed',
      entityType: 'system',
      entityId: 'seed',
      metadataJson: JSON.stringify({ message: 'Database seeded with initial data' }),
      prevHash: 'GENESIS',
      hash: genesisHash,
    },
  });

  console.log('Seed completed successfully!');
  console.log('Users: admin, exam_officer, lecturer, invigilator, 3 candidates');
  console.log('Courses: Constitutional Law, Criminal Law, Law of Contract');
  console.log('Questions: Multiple types seeded');
  console.log('Assessment: Constitutional Law Mid-Semester Examination (published)');
  console.log('Essay exams: 6 published essay examinations across LAW201, LAW301, LAW202');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
