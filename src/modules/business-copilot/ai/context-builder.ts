import { Injectable } from '@nestjs/common';

/**
 * ContextBuilder – RAG-style context for the LLM.
 *
 * CRITICAL: the context is built ONLY from QueryEngine results
 * that have already been filtered by tenant + scope.
 * The LLM never sees raw DB rows outside the user's scope.
 */
@Injectable()
export class ContextBuilder {
  build(intent: string, queryResult: Record<string, unknown>): Record<string, unknown> {
    return {
      intent,
      scope: queryResult.scope ?? null,
      data: queryResult,
      generatedAt: new Date().toISOString(),
    };
  }
}
