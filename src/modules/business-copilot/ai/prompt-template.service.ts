import { Injectable } from '@nestjs/common';

/**
 * PromptTemplateService – Sprint 10.
 * Central place for prompts so Sprint 11+ can version them.
 */
@Injectable()
export class PromptTemplateService {
  intentDetection(allowed: string[]): string {
    return [
      'You are the Business OS intent classifier.',
      `Allowed intents: ${allowed.join(', ')}`,
      'Return JSON only: {"intent":"...","confidence":0.0}',
    ].join('\n');
  }

  businessAnalysis(): string {
    return 'Summarize the following already-scoped business metrics in Vietnamese. Be concise.';
  }

  recommendations(): string {
    return 'Generate practical business recommendations from the signals. Return JSON.';
  }

  ceoSummary(): string {
    return 'Write a short CEO summary in Vietnamese from the highlights, risks, and recommendations.';
  }

  answerSummary(): string {
    return 'Summarize the answer for a business user in one or two Vietnamese sentences. Do not invent numbers.';
  }
}
