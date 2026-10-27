/**
 * Workflow Status – Sprint 6 Generic Workflow Engine
 *
 * Every business entity can follow:
 * DRAFT → PENDING → APPROVED → POSTED → CLOSED
 * or REJECTED / CANCELLED at allowed points.
 */
export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED',
}

export const WORKFLOW_STATUSES: readonly WorkflowStatus[] = Object.values(WorkflowStatus);
