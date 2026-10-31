import { PaymentProvider, PaymentStatus } from '../enums/payment.enum';

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  status: PaymentStatus;
  externalId?: string;
  providerRef?: string;
  failureReason?: string;
}

export interface WebhookPayload {
  provider: PaymentProvider;
  externalId: string;
  status: PaymentStatus;
  signature?: string;
  raw?: Record<string, unknown>;
}

/**
 * PaymentGateway – abstraction for provider adapters.
 */
export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  refund(externalId: string, amount: number): Promise<PaymentResult>;
  verifySignature(payload: WebhookPayload, secret: string): boolean;
}
