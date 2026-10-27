import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './ai-provider.interface';

/**
 * AzureOpenAIProvider – adapter for Azure OpenAI.
 * Config: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
 */
@Injectable()
export class AzureOpenAIProvider implements AIProvider {
  readonly name = 'azure-openai';
  private readonly logger = new Logger(AzureOpenAIProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get endpoint(): string | undefined {
    return this.config.get<string>('AZURE_OPENAI_ENDPOINT');
  }
  private get apiKey(): string | undefined {
    return this.config.get<string>('AZURE_OPENAI_API_KEY');
  }
  private get deployment(): string {
    return this.config.get<string>('AZURE_OPENAI_DEPLOYMENT') || 'gpt-4o-mini';
  }

  async classifyIntent(question: string, allowedIntents: string[]) {
    const prompt = [
      'Classify the user question into exactly one intent.',
      `Allowed intents: ${allowedIntents.join(', ')}`,
      'Return JSON only: {"intent":"...","confidence":0.0}',
      `Question: ${question}`,
    ].join('\n');
    const raw = await this.chat(prompt);
    return this.parseIntent(raw, allowedIntents);
  }

  async summarize(context: Record<string, unknown>, instruction: string) {
    const prompt = `${instruction}\n\nContext (already scope-filtered):\n${JSON.stringify(context)}`;
    const text = await this.chat(prompt);
    return { text, tokens: this.estimate(prompt + text) };
  }

  async generateInsights(metrics: Record<string, unknown>) {
    const prompt = `Generate 2-4 short business insights (Vietnamese). Return JSON {"insights":["..."]}.\n${JSON.stringify(metrics)}`;
    const raw = await this.chat(prompt);
    try {
      const parsed = JSON.parse(raw);
      return { insights: parsed.insights ?? [raw], tokens: this.estimate(raw) };
    } catch {
      return { insights: [raw], tokens: this.estimate(raw) };
    }
  }

  async generateRecommendations(signals: Record<string, unknown>) {
    const prompt = `Generate business recommendations. Return JSON {"recommendations":[{"type":"...","message":"..."}]}.\n${JSON.stringify(signals)}`;
    const raw = await this.chat(prompt);
    try {
      const parsed = JSON.parse(raw);
      return { recommendations: parsed.recommendations ?? [], tokens: this.estimate(raw) };
    } catch {
      return { recommendations: [{ type: 'general', message: raw }], tokens: this.estimate(raw) };
    }
  }

  private async chat(prompt: string): Promise<string> {
    if (!this.endpoint || !this.apiKey) {
      throw new Error('Azure OpenAI is not configured');
    }
    const url = `${this.endpoint.replace(/\/$/, '')}/openai/deployments/${this.deployment}/chat/completions?api-version=2024-02-15-preview`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Azure OpenAI error ${res.status}: ${body}`);
      throw new Error(`Azure OpenAI request failed: ${res.status}`);
    }
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  private parseIntent(raw: string, allowed: string[]) {
    try {
      const parsed = JSON.parse(raw);
      const intent = allowed.includes(parsed.intent) ? parsed.intent : 'unknown';
      return { intent, confidence: Number(parsed.confidence ?? 0.5), tokens: this.estimate(raw) };
    } catch {
      return { intent: 'unknown', confidence: 0, tokens: this.estimate(raw) };
    }
  }

  private estimate(text: string): number {
    return Math.ceil((text || '').length / 4);
  }
}
