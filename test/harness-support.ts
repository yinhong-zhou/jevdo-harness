import { Judge } from '../src/vendor/mu/judge.ts';
import type { JudgeRequest, Answer, Question } from '../src/vendor/mu/types.ts';

export function fixtureJudge(answer: (id: string, question: Question, request: JudgeRequest) => string | number | undefined) {
  const requests: JudgeRequest[] = [];
  const judge = new Judge({ provider: { id: 'offline-behavior-fixture', async evaluate(request) {
    requests.push(request);
    const answers: Record<string, Answer> = {};
    for (const [id, question] of Object.entries(request.questions)) {
      const value = answer(id, question, request);
      answers[id] = question.type === 'boolean' ? { type: 'boolean', probability: typeof value === 'number' ? value : 0.05 }
        : question.type === 'score' ? { type: 'score', score: typeof value === 'number' ? value : 1.5 }
        : { type: 'choice', choice: typeof value === 'string' ? value : Object.keys(question.criteria).at(-1)!, confidence: 1 };
    }
    return { answers };
  } } });
  return { judge, requests };
}
