import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

/**
 * Reusable decorator for Administration Center endpoints.
 * Documents RBAC, Audit, and Event side-effects.
 */
export function AdminApi(options: {
  summary: string;
  description?: string;
  rbac?: string;
  auditAction?: string;
  eventType?: string;
  stepUp?: boolean;
}) {
  const descParts = [
    options.description,
    `**RBAC**: ${options.rbac || 'owner | admin'}`,
    options.auditAction ? `**Audit**: writes \`${options.auditAction}\`` : '**Audit**: none',
    options.eventType ? `**Event**: publishes \`${options.eventType}\`` : '**Event**: none',
    options.stepUp ? '**Step-Up**: required (`X-Step-Up-Token`)' : undefined,
  ].filter(Boolean);

  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: options.summary,
      description: descParts.join('\n\n'),
    }),
    ApiBadRequestResponse({ description: 'Validation failed' }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT / tokenVersion mismatch' }),
    ApiForbiddenResponse({ description: 'Not owner/admin or missing admin.access' }),
    ApiNotFoundResponse({ description: 'Resource not found in tenant' }),
    ApiConflictResponse({ description: 'Conflict (duplicate, active resource, etc.)' }),
    ApiTooManyRequestsResponse({ description: 'Admin mutate rate limit exceeded' }),
    ApiInternalServerErrorResponse({ description: 'Internal server error' }),
  );
}
