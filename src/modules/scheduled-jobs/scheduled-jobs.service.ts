import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { JobExecutionHistory } from './entities/job-execution-history.entity';
import { JobType, JobExecutionStatus, ScheduleType } from './enums/scheduled-job.enum';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly jobs: Repository<ScheduledJob>,
    @InjectRepository(JobExecutionHistory)
    private readonly histories: Repository<JobExecutionHistory>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }

  private inc(name: string) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  async create(dto: CreateScheduledJobDto): Promise<ScheduledJob> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const job = this.jobs.create({
      tenantId,
      name: dto.name,
      jobType: dto.jobType,
      scheduleType: dto.scheduleType ?? ScheduleType.DAILY,
      cronExpression: dto.cronExpression ?? null,
      isEnabled: dto.isEnabled ?? true,
      maxRetries: dto.maxRetries ?? 3,
      config: dto.config ?? {},
      createdBy: userId || null,
    });

    const saved = await this.jobs.save(job);

    try {
      await this.audit.logAction('scheduled_job', saved.id, AuditAction.CREATE, {
        newData: { name: saved.name, jobType: saved.jobType },
      });
    } catch {
      this.logger.warn('Audit skipped on job create');
    }

    this.inc('scheduled_jobs_created_total');
    return saved;
  }

  async list(): Promise<ScheduledJob[]> {
    const tenantId = this.getTenantId();
    return this.jobs.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<ScheduledJob> {
    const tenantId = this.getTenantId();
    const job = await this.jobs.findOne({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Scheduled job not found');
    return job;
  }

  async run(id: string): Promise<JobExecutionHistory> {
    const job = await this.get(id);
    if (!job.isEnabled) throw new BadRequestException('Job is disabled');

    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const history = this.histories.create({
      tenantId,
      jobId: job.id,
      status: JobExecutionStatus.RUNNING,
      startedAt: new Date(),
      createdBy: userId || null,
    });
    const saved = await this.histories.save(history);

    try {
      const result = await this.executeJob(job);
      saved.status = JobExecutionStatus.COMPLETED;
      saved.completedAt = new Date();
      saved.result = result;
      this.inc('job_executions_completed_total');
    } catch (err: any) {
      saved.status = JobExecutionStatus.FAILED;
      saved.errorMessage = err.message || String(err);
      saved.retryCount += 1;
      this.inc('job_executions_failed_total');
      this.logger.warn(`Job ${job.name} failed: ${err.message}`);
    }

    await this.histories.save(saved);

    job.lastRunAt = new Date();
    await this.jobs.save(job);

    try {
      await this.audit.logAction('job_execution', saved.id, AuditAction.CREATE, {
        newData: { jobId: job.id, status: saved.status },
      });
    } catch {}

    return saved;
  }

  private async executeJob(job: ScheduledJob): Promise<Record<string, unknown>> {
    // Foundation handlers – extend with real logic later
    switch (job.jobType) {
      case JobType.SUBSCRIPTION_RENEWAL:
        return { processed: 0, message: 'Subscription renewal placeholder' };
      case JobType.INVOICE_GENERATION:
        return { generated: 0, message: 'Invoice generation placeholder' };
      case JobType.USAGE_AGGREGATION:
        return { aggregated: true, message: 'Usage aggregation placeholder' };
      case JobType.TRIAL_EXPIRATION:
        return { expired: 0, message: 'Trial expiration placeholder' };
      case JobType.OFFBOARDING_CLEANUP:
        return { cleaned: 0, message: 'Offboarding cleanup placeholder' };
      case JobType.NOTIFICATION_CLEANUP:
        return { deleted: 0, message: 'Notification cleanup placeholder' };
      default:
        return { ok: true };
    }
  }

  async listHistory(jobId?: string): Promise<JobExecutionHistory[]> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (jobId) where.jobId = jobId;
    return this.histories.find({
      where,
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * System-triggered run (from cron). Does not require tenant context.
   */
  async runBySystem(jobId: string): Promise<void> {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job || !job.isEnabled) return;

    const history = this.histories.create({
      tenantId: job.tenantId,
      jobId: job.id,
      status: JobExecutionStatus.RUNNING,
      startedAt: new Date(),
    });
    const saved = await this.histories.save(history);

    try {
      const result = await this.executeJob(job);
      saved.status = JobExecutionStatus.COMPLETED;
      saved.completedAt = new Date();
      saved.result = result;
      this.inc('job_executions_completed_total');
    } catch (err: any) {
      saved.status = JobExecutionStatus.FAILED;
      saved.errorMessage = err.message || String(err);
      saved.retryCount += 1;
      this.inc('job_executions_failed_total');
    }

    await this.histories.save(saved);

    // Advance nextRunAt based on schedule type
    const next = new Date();
    switch (job.scheduleType) {
      case 'DAILY': next.setDate(next.getDate() + 1); break;
      case 'WEEKLY': next.setDate(next.getDate() + 7); break;
      case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
      default: next.setHours(next.getHours() + 1); break;
    }
    job.lastRunAt = new Date();
    job.nextRunAt = next;
    await this.jobs.save(job);
  }

}
