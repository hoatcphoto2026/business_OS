export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
  REFUNDED = 'REFUNDED',
}

export const INVOICE_STATUSES: readonly InvoiceStatus[] = Object.values(InvoiceStatus);
