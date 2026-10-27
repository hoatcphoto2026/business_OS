import { SetMetadata } from '@nestjs/common';

export const STEP_UP_ACTION = 'stepUpAction';

/**
 * Marks an admin endpoint as requiring a valid step-up token
 * for the given action (e.g. 'apikey.create').
 */
export const RequireStepUp = (action: string) => SetMetadata(STEP_UP_ACTION, action);
