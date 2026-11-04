import type { ExamQuestion } from '../../api/types';

export type QuestionMap = Map<number, ExamQuestion>;

export function toQuestionMap(questions: ExamQuestion[] | undefined): QuestionMap {
  return new Map((questions ?? []).map((question) => [question.id, question]));
}

export function questionLabel(questionId: number | null, questions: QuestionMap): string {
  if (questionId === null) {
    return 'Across questions';
  }
  const question = questions.get(questionId);
  return question ? `Q${question.orderIndex}` : `Question ${questionId}`;
}
