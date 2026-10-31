import { LoginHistoryRetentionJob } from '../jobs/login-history-retention.job';
import { Repository } from 'typeorm';
import { LoginHistory } from '../entities/login-history.entity';

describe('LoginHistoryRetentionJob (unit)', () => {
  let job: LoginHistoryRetentionJob;
  let repo: jest.Mocked<Partial<Repository<LoginHistory>>>;

  beforeEach(() => {
    repo = {
      count: jest.fn().mockResolvedValue(5),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    job = new LoginHistoryRetentionJob(repo as any);
  });

  it('counts archive and purge candidates without deleting when purge disabled', async () => {
    delete process.env.RETENTION_PURGE_ENABLED;
    await job.runNow();
    expect(repo.count).toHaveBeenCalledTimes(2);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('purges when RETENTION_PURGE_ENABLED=true', async () => {
    process.env.RETENTION_PURGE_ENABLED = 'true';
    await job.runNow();
    expect(repo.delete).toHaveBeenCalled();
    delete process.env.RETENTION_PURGE_ENABLED;
  });
});
