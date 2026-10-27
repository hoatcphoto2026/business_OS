import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './ai-provider.interface';
import { MockProvider } from './mock.provider';
import { OpenAIProvider } from './openai.provider';
import { AzureOpenAIProvider } from './azure-openai.provider';

/**
 * Selects the active AIProvider from AI_PROVIDER env.
 * Default: mock (safe for tests and demo).
 */
@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockProvider,
    private readonly openai: OpenAIProvider,
    private readonly azure: AzureOpenAIProvider,
  ) {}

  get(): AIProvider {
    const name = (this.config.get<string>('AI_PROVIDER') || 'mock').toLowerCase();
    if (name === 'openai') return this.openai;
    if (name === 'azure' || name === 'azure-openai') return this.azure;
    return this.mock;
  }
}
