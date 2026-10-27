import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryEngine } from './query-engine';
import { InsightEngine } from './insight-engine';
import { CopilotResponse, CopilotIntent } from './copilot.types';
import { AIProviderFactory } from './ai/ai-provider.factory';
import { PromptTemplateService } from './ai/prompt-template.service';
import { ContextBuilder } from './ai/context-builder';
import { CopilotLog } from './entities/copilot-log.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { FeatureService } from '../feature/feature.service';

const ALLOWED_INTENTS = Object.values(CopilotIntent);

/**
 * CopilotService – Sprint 10 LLM Integration Layer.
 *
 * Flow:
 *   Question → LLM.classifyIntent → QueryEngine (scoped) → ContextBuilder → LLM.summarize
 *
 * QueryEngine is unchanged. LLM never touches the database.
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly queryEngine: QueryEngine,
    private readonly insightEngine: InsightEngine,
    private readonly aiFactory: AIProviderFactory,
    private readonly prompts: PromptTemplateService,
    private readonly contextBuilder: ContextBuilder,
    private readonly tenantContext: TenantContextService,
    private readonly featureService: FeatureService,
    @InjectRepository(CopilotLog)
    private readonly copilotLogs: Repository<CopilotLog>,
  ) {}

  async ask(question: string): Promise<CopilotResponse> {
    const provider = this.aiFactory.get();
    const classified = await provider.classifyIntent(question, ALLOWED_INTENTS);
    const intent = (classified.intent as CopilotIntent) || CopilotIntent.UNKNOWN;

    // Scope-aware query – LLM never sees unscoped data
    const answer = await this.queryEngine.execute(intent);
    const context = this.contextBuilder.build(intent, answer);

    const summary = await provider.summarize(context, this.prompts.answerSummary());
    const recResult = await provider.generateRecommendations({
      ...answer,
      accountingEnabled: await this.isAccountingOn(),
    });

    const response: CopilotResponse = {
      intent,
      answer: { ...answer, summary: summary.text },
      recommendations: recResult.recommendations,
      generatedAt: new Date().toISOString(),
    };

    await this.writeLog(question, intent, response, classified.tokens + summary.tokens + recResult.tokens, provider.name);
    return response;
  }

  async analyze(analysisType: string): Promise<Record<string, unknown>> {
    const metrics = await this.insightEngine.analyze(analysisType);
    const provider = this.aiFactory.get();
    const insights = await provider.generateInsights(metrics);
    return { ...metrics, insights: insights.insights, provider: provider.name };
  }

  async recommend(): Promise<{ recommendations: Array<{ type: string; message: string }>; generatedAt: string }> {
    const pending = await this.queryEngine.execute(CopilotIntent.PENDING_WORKFLOWS);
    const provider = this.aiFactory.get();
    const result = await provider.generateRecommendations({
      ...pending,
      accountingEnabled: await this.isAccountingOn(),
    });
    return { recommendations: result.recommendations, generatedAt: new Date().toISOString() };
  }

  async dashboard(): Promise<Record<string, unknown>> {
    const data = await this.insightEngine.dashboard();
    return { ...data, generatedAt: new Date().toISOString() };
  }

  async ceoSummary(): Promise<Record<string, unknown>> {
    const health = await this.insightEngine.analyze('business-health');
    const provider = this.aiFactory.get();
    const insights = await provider.generateInsights(health);
    const recs = await provider.generateRecommendations({
      ...health,
      accountingEnabled: await this.isAccountingOn(),
    });
    const summary = await provider.summarize(
      { health, insights: insights.insights, recommendations: recs.recommendations },
      this.prompts.ceoSummary(),
    );

    const result = {
      summary: summary.text,
      highlights: insights.insights,
      risks: this.extractRisks(health),
      recommendations: recs.recommendations,
      generatedAt: new Date().toISOString(),
      provider: provider.name,
    };

    await this.writeLog('ceo-summary', 'ceo_summary', result, summary.tokens + insights.tokens + recs.tokens, provider.name);
    return result;
  }

  private extractRisks(health: Record<string, unknown>): string[] {
    const risks: string[] = [];
    const pending = Number(health.pendingWorkflows ?? 0);
    if (pending > 10) risks.push(`Workflow tồn đọng: ${pending}`);
    if (health.revenueTrend === 'FLAT') risks.push('Doanh thu tháng này chưa phát sinh.');
    return risks;
  }

  private async isAccountingOn(): Promise<boolean> {
    const tenantId = this.tenantContext.getContext()?.tenantId;
    if (!tenantId) return false;
    return this.featureService.isEnabled(tenantId, 'accounting');
  }

  private async writeLog(
    question: string,
    intent: string,
    response: object,
    tokens: number,
    provider: string,
  ): Promise<void> {
    const ctx = this.tenantContext.getContext();
    if (!ctx?.tenantId) return;
    try {
      await this.copilotLogs.save(
        this.copilotLogs.create({
          tenantId: ctx.tenantId,
          userId: ctx.userId ?? null,
          question,
          intent,
          response: response as Record<string, unknown>,
          tokens,
          provider,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to write copilot_log: ${(err as Error).message}`);
    }
  }
}
