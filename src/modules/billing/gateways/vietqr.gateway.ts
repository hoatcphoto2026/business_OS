import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '../enums/payment.enum';
import {
  PaymentGateway,
  CreatePaymentInput,
  PaymentResult,
  WebhookPayload,
} from './payment-gateway.interface';

/**
 * VietQRGateway – generates VietQR payload for bank transfer.
 *
 * In production, replace the URL builder with the official VietQR API
 * or your bank's QR generation endpoint.
 */
@Injectable()
export class VietQRGateway implements PaymentGateway {
  readonly provider = PaymentProvider.VIETQR;
  private readonly logger = new Logger(VietQRGateway.name);

  // Demo bank account – override via env in production
  private readonly bankBin = process.env.VIETQR_BANK_BIN || '970422'; // MB Bank
  private readonly accountNo = process.env.VIETQR_ACCOUNT_NO || '0123456789';
  private readonly accountName = process.env.VIETQR_ACCOUNT_NAME || 'CONG TY ABC';

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const content = `PAY ${input.idempotencyKey}`.slice(0, 25);
    const qrUrl = this.buildQrUrl(input.amount, content);

    this.logger.debug(`VietQR generated: ${qrUrl}`);

    return {
      status: PaymentStatus.PENDING, // waiting for bank transfer
      externalId: `vietqr_${input.idempotencyKey}`,
      providerRef: content,
      // QR payload returned via metadata in the service layer
    };
  }

  buildQrUrl(amount: number, content: string): string {
    // VietQR standard URL format
    const params = new URLSearchParams({
      amount: String(Math.round(amount)),
      addInfo: content,
      accountName: this.accountName,
    });
    return `https://img.vietqr.io/image/${this.bankBin}-${this.accountNo}-compact2.png?${params}`;
  }

  async refund(): Promise<PaymentResult> {
    // Bank transfers are not auto-refundable via QR
    return { status: PaymentStatus.FAILED, failureReason: 'VietQR refund must be manual' };
  }

  verifySignature(payload: WebhookPayload, secret: string): boolean {
    return payload.signature === secret;
  }
}
