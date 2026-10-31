import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentProvider, PaymentStatus } from '../enums/payment.enum';
import {
  PaymentGateway,
  CreatePaymentInput,
  PaymentResult,
  WebhookPayload,
} from './payment-gateway.interface';

/**
 * MockGateway – in-memory adapter used for tests and local development.
 * Production adapters (Stripe, VNPay, etc.) implement the same interface.
 */
@Injectable()
export class MockGateway implements PaymentGateway {
  readonly provider = PaymentProvider.VNPAY;
  private readonly logger = new Logger(MockGateway.name);
  private readonly secret = process.env.PAYMENT_WEBHOOK_SECRET || 'test-secret';

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    this.logger.debug(`Mock create ${input.amount} ${input.currency}`);
    if (input.amount <= 0) {
      return { status: PaymentStatus.FAILED, failureReason: 'Invalid amount' };
    }
    // Only auto-succeed in test/dev. Production must use a real gateway.
    const allowMockSuccess = process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PAYMENTS === 'true';
    return {
      status: allowMockSuccess ? PaymentStatus.SUCCESS : PaymentStatus.PENDING,
      externalId: `mock_${Date.now()}`,
      providerRef: `ref_${input.idempotencyKey}`,
    };
  }

  async refund(externalId: string, amount: number): Promise<PaymentResult> {
    this.logger.debug(`Mock refund ${externalId} ${amount}`);
    return { status: PaymentStatus.REFUNDED, externalId };
  }

  verifySignature(payload: WebhookPayload, secret: string): boolean {
    // HMAC-SHA256 of externalId|status using secret
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${payload.externalId}|${payload.status}`)
      .digest('hex');
    // Accept HMAC or (non-prod only) plain secret match for backward compat in tests
    if (payload.signature === expected) return true;
    if (process.env.NODE_ENV !== 'production' && payload.signature === secret) return true;
    return false;
  }
}
