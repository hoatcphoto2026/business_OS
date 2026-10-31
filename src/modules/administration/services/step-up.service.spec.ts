import { StepUpService } from '../services/step-up.service';
import { StepUpSession } from '../entities/step-up-session.entity';
import { Repository } from 'typeorm';

describe('StepUpService (unit)', () => {
  let service: StepUpService;
  let repo: jest.Mocked<Partial<Repository<StepUpSession>>>;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x as any),
      save: jest.fn(async (x) => x as any) as any,
      findOne: jest.fn(),
    } as any;
    service = new StepUpService(repo as any);
  });

  it('initiates a session and returns sessionId', async () => {
    const result = await service.initiate('tenant-1', 'user-1', 'apikey.create', 'totp');
    expect(result.sessionId).toBeDefined();
    expect(result.method).toBe('totp');
    expect(result.expiresIn).toBe(300);
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects verify on missing session', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.verify('bad-id', 't', 'u', '123456')).rejects.toThrow();
  });

  it('verifies a valid totp-style code and returns token', async () => {
    const session: Partial<StepUpSession> = {
      id: 'sess-1',
      tenantId: 't',
      userId: 'u',
      action: 'apikey.create',
      method: 'totp',
      expiresAt: new Date(Date.now() + 60_000),
    };
    (repo.findOne as jest.Mock).mockResolvedValue(session);
    const result = await service.verify('sess-1', 't', 'u', '123456');
    expect(result.stepUpToken).toBe('sess-1');
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it('consume fails if not verified', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: 's',
      verifiedAt: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const ok = await service.consume('s', 't', 'u', 'apikey.create');
    expect(ok).toBe(false);
  });

  it('consume succeeds when verified and not consumed', async () => {
    const session: any = {
      id: 's',
      verifiedAt: new Date(),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    (repo.findOne as jest.Mock).mockResolvedValue(session);
    const ok = await service.consume('s', 't', 'u', 'apikey.create');
    expect(ok).toBe(true);
    expect(session.consumedAt).toBeDefined();
  });
});
