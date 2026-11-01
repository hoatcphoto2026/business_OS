import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportDelivery } from './entities/report-delivery.entity';
import { ReportRun } from './entities/report-run.entity';
import { ReportChannel, ReportDeliveryStatus } from './enums/reporting.enum';
import { ReportDefinition } from './reporting-definitions';
import { Webhook } from '../integration/entities/webhook.entity';
import { IntegrationLog } from '../integration/entities/integration-log.entity';
import { NotificationService } from '../notification/notification.service';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { assertSafeWebhookUrl } from '../../common/security/ssrf';

/**
 * Report Delivery.
 *
 * IN_APP  – real notification row (visible in `/notifications`).
 * EMAIL   – email-channel notification (platform mock transport; a real provider
 *           can drain the same delivery rows in production).
 * WEBHOOK – outbound `integration_logs` entry per webhook, using the same SSRF
 *           guard + mock transport as `WebhookDispatcher`.
 */
@Injectable()
export class ReportDeliveryService {
  private readonly logger = new Logger(ReportDeliveryService.name);

  constructor(
    @InjectRepository(ReportDelivery)
    private readonly deliveries: Repository<ReportDelivery>,
    @InjectRepository(Webhook)
    private readonly webhooks: Repository<Webhook>,
    @InjectRepository(IntegrationLog)
    private readonly integrationLogs: Repository<IntegrationLog>,
    private readonly notifications: NotificationService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
  ) {}

  async deliver(
    run: ReportRun,
    definition: ReportDefinition,
    channels: ReportChannel[],
    recipients: string[],
    webhookIds: string[],
  ): Promise<ReportDelivery[]> {
    const results: ReportDelivery[] = [];
    const userId = this.currentUserId();

    for (const channel of Array.from(new Set(channels))) {
      if (channel === ReportChannel.IN_APP) {
        results.push(await this.deliverInApp(run, definition, recipients, userId));
        continue;
      }
      if (channel === ReportChannel.EMAIL) {
        results.push(await this.deliverEmail(run, definition, recipients, userId));
        continue;
      }
      results.push(...(await this.deliverWebhook(run, definition, webhookIds)));
    }

    for (const delivery of results) {
      this.metrics.inc('report_deliveries_total', {
        channel: delivery.channel,
        status: delivery.status,
      });
    }
    this.logger.log(
      `Report ${run.id} delivered via ${results.length} channel(s) for tenant ${run.tenantId}`,
    );
    return results;
  }

  private async deliverInApp(
    run: ReportRun,
    definition: ReportDefinition,
    recipients: string[],
    userId: string | null,
  ): Promise<ReportDelivery> {
    // Recipients can be user ids or email addresses; in-app needs a real user id.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const target = recipients.find((value) => uuid.test(value)) ?? userId;
    if (!target) {
      return this.save(run, {
        channel: ReportChannel.IN_APP,
        status: ReportDeliveryStatus.SKIPPED,
        error: 'No in-app recipient',
      });
    }
    try {
      await this.notifications.create({
        userId: target,
        title: `${definition.title} is ready`,
        body: `Report ${run.id} generated with ${run.rowCount} row(s).`,
        type: 'report',
        channel: 'in_app',
        data: {
          runId: run.id,
          reportType: run.reportType,
          format: run.format,
          summary: run.summary,
        },
      });
      return this.save(run, {
        channel: ReportChannel.IN_APP,
        target,
        status: ReportDeliveryStatus.SENT,
        metadata: { transport: 'notification' },
      });
    } catch (error) {
      return this.save(run, {
        channel: ReportChannel.IN_APP,
        target,
        status: ReportDeliveryStatus.FAILED,
        error: this.message(error),
      });
    }
  }

  private async deliverEmail(
    run: ReportRun,
    definition: ReportDefinition,
    recipients: string[],
    userId: string | null,
  ): Promise<ReportDelivery> {
    if (recipients.length === 0) {
      return this.save(run, {
        channel: ReportChannel.EMAIL,
        status: ReportDeliveryStatus.SKIPPED,
        error: 'No email recipients configured',
      });
    }
    const target = recipients.join(',');
    try {
      if (userId) {
        await this.notifications.create({
          userId,
          title: `[Email] ${definition.title}`,
          body: `Sent to ${target} (${run.rowCount} row(s))`,
          type: 'report',
          channel: 'email',
          data: { runId: run.id, recipients, reportType: run.reportType },
        });
      }
      return this.save(run, {
        channel: ReportChannel.EMAIL,
        target,
        status: ReportDeliveryStatus.SENT,
        metadata: { transport: 'notification-email', recipients },
      });
    } catch (error) {
      return this.save(run, {
        channel: ReportChannel.EMAIL,
        target,
        status: ReportDeliveryStatus.FAILED,
        error: this.message(error),
      });
    }
  }

  private async deliverWebhook(
    run: ReportRun,
    definition: ReportDefinition,
    webhookIds: string[],
  ): Promise<ReportDelivery[]> {
    if (webhookIds.length === 0) {
      return [
        await this.save(run, {
          channel: ReportChannel.WEBHOOK,
          status: ReportDeliveryStatus.SKIPPED,
          error: 'No webhook ids configured',
        }),
      ];
    }

    const results: ReportDelivery[] = [];
    for (const webhookId of webhookIds) {
      const hook = await this.webhooks.findOne({
        where: { id: webhookId, tenantId: run.tenantId },
      });
      if (!hook) {
        results.push(
          await this.save(run, {
            channel: ReportChannel.WEBHOOK,
            target: webhookId,
            status: ReportDeliveryStatus.FAILED,
            error: 'Webhook not found in tenant',
          }),
        );
        continue;
      }
      try {
        await assertSafeWebhookUrl(hook.url);
        const log = await this.integrationLogs.save(
          this.integrationLogs.create({
            tenantId: run.tenantId,
            webhookId: hook.id,
            direction: 'outbound',
            event: 'report.generated',
            status: 'success',
            payload: {
              url: hook.url,
              runId: run.id,
              reportType: run.reportType,
              format: run.format,
              title: definition.title,
              rowCount: run.rowCount,
              summary: run.summary,
            },
            response: { mock: true, delivered: true },
          }),
        );
        results.push(
          await this.save(run, {
            channel: ReportChannel.WEBHOOK,
            target: hook.url,
            status: ReportDeliveryStatus.SENT,
            metadata: { webhookId: hook.id, integrationLogId: log.id },
          }),
        );
      } catch (error) {
        results.push(
          await this.save(run, {
            channel: ReportChannel.WEBHOOK,
            target: hook.url,
            status: ReportDeliveryStatus.FAILED,
            error: this.message(error),
          }),
        );
      }
    }
    return results;
  }


  async listForRun(runId: string): Promise<ReportDelivery[]> {
    return this.deliveries.find({
      where: { runId, tenantId: this.tenantContext.getCurrentTenantId() },
      order: { createdAt: 'ASC' },
    });
  }

  private async save(
    run: ReportRun,
    data: Partial<ReportDelivery>,
  ): Promise<ReportDelivery> {
    return this.deliveries.save(
      this.deliveries.create({
        tenantId: run.tenantId,
        runId: run.id,
        channel: data.channel,
        target: data.target ?? null,
        status: data.status ?? ReportDeliveryStatus.SENT,
        error: data.error ?? null,
        deliveredAt:
          data.status === ReportDeliveryStatus.SENT ? new Date() : null,
        metadata: data.metadata ?? {},
        createdBy: this.currentUserId(),
      }),
    );
  }

  private currentUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

