export enum PaymentProvider {
  PAYOS = 'PAYOS',
  VNPAY = 'VNPAY',
  MOMO = 'MOMO',
  BANKING = 'BANKING',
  VIETQR = 'VIETQR',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CHARGEBACK = 'CHARGEBACK',
}

export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = Object.values(PaymentProvider);
export const PAYMENT_STATUSES: readonly PaymentStatus[] = Object.values(PaymentStatus);
