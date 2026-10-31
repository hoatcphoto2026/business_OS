import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '../enums/payment.enum';
import {
  PaymentGateway,
  CreatePaymentInput,
  PaymentResult,
  WebhookPayload,
} from './payment-gateway.interface';
import * as crypto from 'crypto';

/**
 * PayOSGateway – Vietnamese payment link + VietQR.
 *
 * Sandbox: set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY
 * Docs: https://payos.vn/docs
 */
@Injectable()
export class PayOSGateway implements PaymentGateway {
  readonly provider = PaymentProvider.PAYOS;
  private readonly logger = new Logger(PayOSGateway.name);

  private readonly clientId = process.env.PAYOS_CLIENT_ID || '';
  private readonly apiKey = process.env.PAYOS_API_KEY || '';
  private readonly checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';
  private readonly baseUrl = process.env.PAYOS_BASE_URL || 'https://api-merchant.payos.vn';

  private get sandbox(): boolean {
    return !this.clientId || process.env.PAYOS_SANDBOX === 'true';
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const orderCode = Date.now();
    const description = `PAY ${input.idempotencyKey}`.slice(0, 25);

    if (this.sandbox) {
      this.logger.debug('PayOS sandbox mode – returning mock payment link');
      return {
        status: PaymentStatus.PENDING,
        externalId: `payos_${orderCode}`,
        providerRef: description,
      };
    }

    const body = {
      orderCode,
      amount: Math.round(input.amount),
      description,
      cancelUrl: process.env.PAYOS_CANCEL_URL || 'https://example.com/cancel',
      returnUrl: process.env.PAYOS_RETURN_URL || 'https://example.com/success',
    };

    const signature = this.sign(body);
    const res = await fetch(`${this.baseUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.clientId,
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ ...body, signature }),
    });

    const json = await res.json();
    if (json.code !== '00') {
      return { status: PaymentStatus.FAILED, failureReason: json.desc };
    }

    return {
      status: PaymentStatus.PENDING,
      externalId: json.data.paymentLinkId,
      providerRef: String(orderCode),
    };
  }

  async refund(): Promise<PaymentResult> {
    return { status: PaymentStatus.FAILED, failureReason: 'PayOS refund via dashboard' };
  }

  verifySignature(payload: WebhookPayload, secret: string): boolean {
    // PayOS webhook: HMAC-SHA256 of sorted data with checksumKey
    if (!payload.raw) return payload.signature === secret;
    const data = payload.raw;
    const sorted = Object.keys(data)
      .filter((k) => k !== 'signature')
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join('&');
    const expected = crypto.createHmac('sha256', this.checksumKey || secret).update(sorted).digest('hex');
    return expected === payload.signature;
  }

  private sign(data: Record<string, unknown>): string {
    const sorted = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join('&');
    return crypto.createHmac('sha256', this.checksumKey).update(sorted).digest('hex');
  }

  /** Build checkout URL for sandbox or real */
  getCheckoutUrl(externalId: string): string {
    if (this.sandbox) return `https://pay.payos.vn/web/${externalId}`;
    return `https://pay.payos.vn/web/${externalId}`;
  }
}
