/**
 * AIProvider – Sprint 10 abstraction.
 * LLM never accesses the database. It only receives
 * already-scoped business context from QueryEngine.
 */
export interface AIProvider {
  readonly name: string;

  classifyIntent(question: string, allowedIntents: string[]): Promise<{
    intent: string;
    confidence: number;
    tokens: number;
  }>;

  summarize(context: Record<string, unknown>, instruction: string): Promise<{
    text: string;
    tokens: number;
  }>;

  generateInsights(metrics: Record<string, unknown>): Promise<{
    insights: string[];
    tokens: number;
  }>;

  generateRecommendations(signals: Record<string, unknown>): Promise<{
    recommendations: Array<{ type: string; message: string }>;
    tokens: number;
  }>;
}
