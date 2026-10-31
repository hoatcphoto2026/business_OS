import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { StepUpSession } from '../entities/step-up-session.entity';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { v4 as uuid } from 'uuid';

export interface StepUpInitiateResult {
  sessionId: string;
  method: string;
  expiresIn: number;
  challenge?: string; // only for demo / email_otp; TOTP is user-side
}

@Injectable()
export class StepUpService {
  private readonly logger = new Logger('StepUp');
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(StepUpSession)
    private readonly sessions: Repository<StepUpSession>,
  ) {}

  async initiate(
    tenantId: string,
    userId: string,
    action: string,
    method: 'totp' | 'email_otp' | 'password' = 'totp',
    ip?: string,
  ): Promise<StepUpInitiateResult> {
    if (!userId || !tenantId) {
      throw new Error('userId and tenantId are required for step-up');
    }
    const sessionId = uuid();
    const expiresAt = new Date(Date.now() + this.TTL_MS);

    // For demo / non-TOTP we generate a simple challenge code
    let challenge: string | undefined;
    let challengeHash: string | undefined;
    if (method !== 'totp') {
      challenge = Math.floor(100000 + Math.random() * 900000).toString();
      challengeHash = this.hash(challenge);
    }

    const session = this.sessions.create({
      id: sessionId,
      tenantId,
      userId,
      action,
      method,
      challengeHash,
      expiresAt,
      ipAddress: ip,
    });
    await this.sessions.save(session);

    this.logger.log(`Step-up initiated action=${action} method=${method} user=${userId}`);

    return {
      sessionId,
      method,
      expiresIn: Math.floor(this.TTL_MS / 1000),
      challenge: process.env.NODE_ENV === 'development' ? challenge : undefined,
    };
  }

  async verify(
    sessionId: string,
    tenantId: string,
    userId: string,
    code: string,
  ): Promise<{ stepUpToken: string; expiresIn: number }> {
    const session = await this.sessions.findOne({
      where: { id: sessionId, tenantId, userId, expiresAt: MoreThan(new Date()) },
    });

    if (!session || session.consumedAt || session.verifiedAt) {
      throw new BadRequestException('Invalid or expired step-up session');
    }

    // Demo verification: accept any 6-digit for totp, or match challenge for others
    // In production replace with real TOTP verification (otplib) + password check
    let ok = false;
    if (session.method === 'totp') {
      ok = /^\d{6}$/.test(code);
    } else if (session.challengeHash) {
      const provided = this.hash(code);
      ok = timingSafeEqual(Buffer.from(provided), Buffer.from(session.challengeHash));
    }

    if (!ok) {
      this.logger.warn(`Step-up failed session=${sessionId}`);
      throw new BadRequestException('Invalid step-up code');
    }

    session.verifiedAt = new Date();
    await this.sessions.save(session);

    // Opaque token = session id (bound to action/user/tenant, single use)
    const stepUpToken = sessionId;

    return {
      stepUpToken,
      expiresIn: Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  async consume(
    token: string,
    tenantId: string,
    userId: string,
    action: string,
  ): Promise<boolean> {
    const session = await this.sessions.findOne({
      where: {
        id: token,
        tenantId,
        userId,
        action,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!session || !session.verifiedAt || session.consumedAt) return false;

    session.consumedAt = new Date();
    await this.sessions.save(session);
    this.logger.log(`Step-up consumed action=${action} user=${userId}`);
    return true;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
