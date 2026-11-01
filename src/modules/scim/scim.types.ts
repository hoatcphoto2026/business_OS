import { ScimEndpoint } from './entities/scim-endpoint.entity';

/** Per-request SCIM context (no JWT/ALS – the endpoint carries the tenant). */
export interface ScimContext {
  endpoint: ScimEndpoint;
  traceId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ScimListResult {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: unknown[];
}

export interface ScimMeta {
  resourceType: string;
  created: string;
  lastModified: string;
  location: string;
  version: string;
}

export interface ScimFilter {
  attribute?: string;
  value?: string;
}
