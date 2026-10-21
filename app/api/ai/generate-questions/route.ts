export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { requireRouteAuthorization } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { createAuditEvent } from '@/lib/audit';
import { isFirstLevelCourse } from '@/lib/academic-rules';
import { AiProviderUnavailableError, callAiProvider } from '@/lib/ai/provider';
import { AI_GENERATION_MAX_QUESTIONS } from '@/lib/ai/limits';
import { AI_MATERIAL_MAX_CHARACTERS, AI_RULES_MAX_CHARACTERS, validateAiText } from '@/lib/ai/workflow-validation';
import { z } from 'zod';

const generatedQuestionSchema = z.object({
  text: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  type: z.enum(['multiple_choice', 'short_answer', 'essay', 'legal_problem', 'case_analysis']),
  options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).optional(),
  markingScheme: z.object({
    method: z.enum(['human_grading', 'marking_points', 'exact_match', 'acceptable_answer', 'ai_recommendation']),
    maxMark: z.number().positive(),
    rubric: z.array(z.object({ criterion: z.string().min(1), maxMark: z.number().positive() })).min(1),
  }).optional(),
}).superRefine((question, context) => {
  if (question.type === 'multiple_choice') {
    if (!question.options || question.options.length !== 4 || question.options.filter((option) => option.isCorrect).length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Multiple-choice questions must contain four options and exactly one correct answer.', path: ['options'] });
    }
    return;
  }

  if (!question.markingScheme) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Subjective questions require a marking scheme.', path: ['markingScheme'] });
    return;
  }

  const rubricTotal = question.markingScheme.rubric.reduce((sum, criterion) => sum + criterion.maxMark, 0);
  if (Math.abs(rubricTotal - question.markingScheme.maxMark) > 0.01) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Rubric marks must add up to the question maximum.', path: ['markingScheme', 'rubric'] });
  }
});
const generatedResponseSchema = z.object({ questions: z.array(generatedQuestionSchema).min(1) });

function parseGeneratedResponse(content: string): unknown {
  let jsonContent = content.trim().replace(/^\uFEFF/, '');
  const fenced = jsonContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) jsonContent = fenced[1];

  const parsed: unknown = JSON.parse(jsonContent);
  return Array.isArray(parsed) ? { questions: parsed } : parsed;
}

const generationRequestSchema = z.object({
  courseId: z.string().min(1),
  topic: z.string().trim().min(1).max(500),
  questionType: z.enum(['multiple_choice', 'short_answer', 'essay', 'legal_problem', 'case_analysis']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().int().min(1).max(AI_GENERATION_MAX_QUESTIONS),
  courseMaterial: z.string().trim().min(1).max(AI_MATERIAL_MAX_CHARACTERS),
  markingRules: z.string().trim().max(AI_RULES_MAX_CHARACTERS).optional().default(''),
  instructions: z.string().max(4_000).optional(),
});

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/ai/generate-questions');
  if (error) return error;

  try {
    const requestBody = await request.json();
    const parsedRequest = generationRequestSchema.safeParse(requestBody);
      if (!parsedRequest.success) {
        return NextResponse.json({ error: `Provide a course, topic, supported question settings, and course material. Count must be between 1 and ${AI_GENERATION_MAX_QUESTIONS}.` }, { status: 400 });
    }
    const { courseId, topic, questionType, difficulty, count, courseMaterial, markingRules, instructions } = parsedRequest.data;
    const materialError = validateAiText(courseMaterial, 'Course material', AI_MATERIAL_MAX_CHARACTERS);
    const rulesError = markingRules
      ? validateAiText(markingRules, 'Marking rules', AI_RULES_MAX_CHARACTERS)
      : null;
    if (materialError || rulesError) {
      return NextResponse.json({ error: materialError ?? rulesError }, { status: 400 });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const lecturerCourses = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'lecturer' },
      select: { courseId: true },
    });
    if (!lecturerCourses.some((assignment) => assignment.courseId === courseId)) {
      return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }
    if (questionType === 'multiple_choice' && !isFirstLevelCourse(course.level)) {
      return NextResponse.json({ error: 'Objective questions are only available for 100-level Law courses.' }, { status: 400 });
    }

    const prompt = `You are a law professor creating exam questions for ${course.title} (${course.code}).

Use the lecturer-provided course material as the authoritative source. Do not invent facts or test content outside it.

Course material:
${courseMaterial}

${markingRules
  ? `Lecturer marking rules:\n${markingRules}\nFollow these rules exactly.`
  : 'No lecturer-specific marking rules were supplied. For subjective questions, create a clear rubric with criteria totaling the suggested maximum mark.'}

Generate exactly ${count} ${questionType} questions on the topic "${topic}" at ${difficulty} difficulty level.
${instructions ? `Additional instructions: ${instructions}` : ''}

For each question, provide:
- "text": the question text
- "topic": the topic
- "difficulty": "${difficulty}"
- "type": "${questionType}"
${questionType === 'multiple_choice' ? '- "options": array of 4 options, each with "text" and "isCorrect" (exactly one true)' : ''}
${questionType !== 'multiple_choice' ? '- "markingScheme": { "method": appropriate method, "maxMark": suggested mark, "rubric": array of marking criteria }' : ''}

For each subjective question, return rubric criteria as objects with "criterion" and numeric "maxMark"; their maxMark values must add up exactly to the scheme maxMark.
Keep question text and options concise. For subjective questions, use a compact rubric with three to five criteria.

Please respond in JSON format with the following structure:
{
  "questions": [
    {
      "text": "Question text",
      "topic": "Topic",
      "difficulty": "${difficulty}",
      "type": "${questionType}"${questionType === 'multiple_choice' ? ',\n      "options": [{"text": "Option", "isCorrect": true}, ...]' : ',\n      "markingScheme": {"method": "human_grading", "maxMark": 10, "rubric": [{"criterion": "Criterion 1", "maxMark": 5}, {"criterion": "Criterion 2", "maxMark": 5}]}'}
    }
  ]
}
Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`;

    const response = await callAiProvider({
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      maxTokens: Math.min(32_000, Math.max(4_000, count * (questionType === 'multiple_choice' ? 500 : 1_000))),
      responseFormat: { type: 'json_object' },
    });

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'AI provider returned an empty response.' }, { status: 502 });
    }
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        let partialRead = '';
        let finishReason: string | null = null;

        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            partialRead += decoder.decode(value, { stream: true });
                    const lines = partialRead.split('\n');
            partialRead = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  let providerPayload: unknown;
                  try {
                    providerPayload = parseGeneratedResponse(buffer);
                  } catch (error) {
                    console.error('AI question generation returned invalid JSON:', {
                      finishReason,
                      outputCharacters: buffer.length,
                      error: error instanceof Error ? error.message : 'Unknown parse error',
                    });
                    const message = finishReason === 'length'
                      ? 'The AI response was truncated. Reduce the question count or shorten the course material, then retry. No questions were saved.'
                      : 'The AI provider returned malformed JSON. No questions were saved; please retry.';
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message })}\n\n`));
                    return;
                  }

                  const parsedResult = generatedResponseSchema.safeParse(providerPayload);
                  if (!parsedResult.success
                    || parsedResult.data.questions.length !== count
                    || parsedResult.data.questions.some((question) => question.type !== questionType || question.difficulty !== difficulty)) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: 'AI questions failed validation (question count, requested settings, answer key, or rubric totals) and were not saved' })}\n\n`));
                    return;
                  }

                  let savedDrafts: string[];
                  try {
                    savedDrafts = await prisma.$transaction(async (tx) => {
                      const draftIds: string[] = [];
                      for (const generated of parsedResult.data.questions) {
                        const draft = await tx.question.create({ data: { courseId, type: generated.type, text: generated.text, topic: generated.topic ?? topic, difficulty: generated.difficulty, status: 'draft', createdBy: session!.user.id } });
                        draftIds.push(draft.id);
                        if (generated.type === 'multiple_choice' && generated.options) {
                          const createdOptions = [];
                          for (let index = 0; index < generated.options.length; index++) createdOptions.push(await tx.questionOption.create({ data: { questionId: draft.id, text: generated.options[index].text, isCorrect: generated.options[index].isCorrect, sortOrder: index } }));
                          const correct = createdOptions.find((option) => option.isCorrect);
                          if (correct) await tx.answerKey.create({ data: { questionId: draft.id, correctOptionId: correct.id, version: 1 } });
                        } else if (generated.markingScheme) {
                          await tx.markingScheme.create({ data: { questionId: draft.id, method: generated.markingScheme.method, maxMark: generated.markingScheme.maxMark, configJson: generated.markingScheme.rubric ? JSON.stringify({ rubric: generated.markingScheme.rubric }) : null, version: 1 } });
                        }
                      }

                      await tx.aiRequest.create({
                        data: {
                          actorId: session!.user.id,
                          requestType: 'question_generation',
                          requestMetaJson: JSON.stringify({ courseId, topic, questionType, difficulty, count, courseMaterialCharacters: courseMaterial.length, markingRulesCharacters: markingRules.length }),
                          responseJson: buffer,
                        },
                      });
                      return draftIds;
                    });
                  } catch (error) {
                    console.error('AI question generation persistence failed:', error);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: 'Generated questions could not be saved. No drafts were created; please retry or contact support.' })}\n\n`));
                    return;
                  }

                  const finalResult = { ...parsedResult.data, draftIds: savedDrafts };
                  const finalData = JSON.stringify({ status: 'completed', result: finalResult });
                  await createAuditEvent({
                    actorId: session!.user.id,
                    actionType: 'ai_question_generation',
                    entityType: 'ai_request',
                    metadata: { courseId, topic, questionType, count },
                  });
                  controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  buffer += parsed.choices?.[0]?.delta?.content || '';
                  const responseFinishReason = parsed.choices?.[0]?.finish_reason;
                  if (typeof responseFinishReason === 'string') finishReason = responseFinishReason;
                  const progressData = JSON.stringify({ status: 'processing', message: 'Generating questions...' });
                  controller.enqueue(encoder.encode(`data: ${progressData}\n\n`));
                } catch { /* skip */ }
              }
            }
          }
        } catch (err) {
          console.error('AI question generation stream failed:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: 'Stream error' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err: any) {
    console.error('AI generation error:', err);
    if (err instanceof AiProviderUnavailableError) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
