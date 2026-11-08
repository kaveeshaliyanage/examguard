import { describe, expect, it } from 'vitest';
import { emptyQuestion, validateQuestion } from './QuestionFields';

describe('question authoring validation', () => {
  it('rejects a single choice question without a correct option', () => {
    const question = emptyQuestion('SINGLE_CHOICE');
    question.prompt = 'Pick one';
    question.content = { options: [{ key: 'A', text: 'Alpha' }, { key: 'B', text: 'Beta' }] };
    expect(validateQuestion(question, 0)).toMatch(/at least one correct option/);
  });

  it('rejects two correct options on a single choice question', () => {
    const question = emptyQuestion('SINGLE_CHOICE');
    question.prompt = 'Pick one';
    question.content = { options: [{ key: 'A', text: 'Alpha' }, { key: 'B', text: 'Beta' }] };
    question.answerKey = { selectedKeys: ['A', 'B'] };
    expect(validateQuestion(question, 0)).toMatch(/exactly one correct option/);
  });

  it('accepts a multi choice question with two keys', () => {
    const question = emptyQuestion('MULTI_CHOICE');
    question.prompt = 'Pick two';
    question.points = 2;
    question.content = { options: [{ key: 'A', text: 'Alpha' }, { key: 'B', text: 'Beta' }] };
    question.answerKey = { selectedKeys: ['A', 'B'] };
    expect(validateQuestion(question, 0)).toBeNull();
  });

  it('requires an accepted answer for auto-marked short answers', () => {
    const question = emptyQuestion('SHORT_ANSWER');
    question.prompt = 'Name the protocol';
    expect(validateQuestion(question, 0)).toMatch(/accepted answer/);
    question.answerKey = { acceptedAnswers: ['TCP'] };
    expect(validateQuestion(question, 0)).toBeNull();
  });

  it('allows an essay with a model answer but no rubric', () => {
    const question = emptyQuestion('ESSAY');
    question.prompt = 'Explain congestion control';
    expect(validateQuestion(question, 0)).toBeNull();
  });

  it('rejects non-positive points', () => {
    const question = emptyQuestion('ESSAY');
    question.prompt = 'Explain';
    question.points = 0;
    expect(validateQuestion(question, 0)).toMatch(/points greater than zero/);
  });
});
