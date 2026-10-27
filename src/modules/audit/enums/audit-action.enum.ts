/**
 * Audit actions – Sprint 5.
 * Stored as varchar (not a Postgres enum) so Sprint 6 Workflow can add
 * actions without rewriting the column type.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  POST = 'POST',
  CANCEL = 'CANCEL',
  CLOSE = 'CLOSE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

export const AUDIT_ACTIONS: readonly AuditAction[] = Object.values(AuditAction);