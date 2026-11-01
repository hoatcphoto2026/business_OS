export enum EvidenceCategory {
  SECURITY = 'SECURITY',
  ACCESS = 'ACCESS',
  DATA_PROTECTION = 'DATA_PROTECTION',
  OPERATIONS = 'OPERATIONS',
  AUDIT = 'AUDIT',
  FINANCE = 'FINANCE',
  RETENTION = 'RETENTION',
}

export enum EvidenceSource {
  MANUAL = 'MANUAL',
  AUDIT = 'AUDIT',
  SCIM = 'SCIM',
  SSO = 'SSO',
  SYSTEM = 'SYSTEM',
}

export enum EvidenceStatus {
  COLLECTED = 'COLLECTED',
  VERIFIED = 'VERIFIED',
  EXPIRED = 'EXPIRED',
}

export enum AccessReviewStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum AccessReviewScope {
  ALL_USERS = 'ALL_USERS',
  ROLE = 'ROLE',
  DEPARTMENT = 'DEPARTMENT',
}

export enum RiskSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum RiskStatus {
  OPEN = 'OPEN',
  MITIGATED = 'MITIGATED',
  ACCEPTED = 'ACCEPTED',
}

export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}
