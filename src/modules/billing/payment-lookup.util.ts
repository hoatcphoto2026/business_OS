import { BadRequestException } from '@nestjs/common';

/**
 * Reject when more than one row matches.
 * Cross-tenant or same-tenant duplicates are both ambiguous.
 */
export function assertUniqueMatch<T>(matches: T[], label: string): T | null {
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new BadRequestException(`Ambiguous ${label}`);
  }
  return matches[0];
}
