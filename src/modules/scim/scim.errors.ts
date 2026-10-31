import { HttpException } from '@nestjs/common';
import { SCIM_ERROR } from './enums/scim.enum';

export function scimError(status: number, detail: string, scimType?: string): never {
  throw new HttpException(
    {
      schemas: [SCIM_ERROR],
      status: String(status),
      detail,
      ...(scimType ? { scimType } : {}),
    },
    status,
  );
}
