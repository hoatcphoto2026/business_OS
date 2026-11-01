import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import {
  buildMulterOptions,
  DEFAULT_UPLOAD_MAX_FILE_BYTES,
  resolveMaxMultipartRequestBytes,
  resolveUploadLimits,
} from './upload.config';
import { multipartLimitMiddleware } from './multipart-limit.middleware';

type MulterFile = Parameters<
  NonNullable<NonNullable<ReturnType<typeof buildMulterOptions>['fileFilter']>>
>[1];
type FileFilterCallback = Parameters<
  NonNullable<NonNullable<ReturnType<typeof buildMulterOptions>['fileFilter']>>
>[2];

const asFile = (mimetype: string): MulterFile =>
  ({ mimetype }) as unknown as MulterFile;

describe('upload limits', () => {
  it('uses safe defaults when env is empty', () => {
    const limits = resolveUploadLimits({});
    expect(limits.fileSize).toBe(DEFAULT_UPLOAD_MAX_FILE_BYTES);
    expect(limits.files).toBe(5);
    expect(limits.fields).toBe(20);
    expect(limits.parts).toBe(25);
  });

  it('reads positive integer overrides and ignores invalid values', () => {
    const limits = resolveUploadLimits({
      UPLOAD_MAX_FILE_BYTES: '2048',
      UPLOAD_MAX_FILES: '2',
      UPLOAD_MAX_FIELDS: '0',
    });
    expect(limits.fileSize).toBe(2048);
    expect(limits.files).toBe(2);
    expect(limits.fields).toBe(20);
    expect(resolveMaxMultipartRequestBytes({ UPLOAD_MAX_REQUEST_BYTES: '4096' })).toBe(
      4096,
    );
  });

  it('accepts allowlisted MIME types and rejects the rest', () => {
    const options = buildMulterOptions({});
    const filter = options.fileFilter as (
      req: unknown,
      file: MulterFile,
      cb: FileFilterCallback,
    ) => void;

    const ok = jest.fn<FileFilterCallback>();
    filter({}, asFile('application/pdf'), ok);
    expect(ok).toHaveBeenCalledWith(null, true);

    const rejected = jest.fn<FileFilterCallback>();
    filter({}, asFile('application/x-msdownload'), rejected);
    const [error, accepted] = rejected.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect(accepted).toBe(false);
  });

  it('rejects oversized multipart requests before multer runs', () => {
    const middleware = multipartLimitMiddleware({
      UPLOAD_MAX_REQUEST_BYTES: '1024',
    });
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();

    middleware(
      {
        headers: {
          'content-type': 'multipart/form-data; boundary=x',
          'content-length': '2048',
        },
      } as never,
      { status } as never,
      next,
    );
    expect(status).toHaveBeenCalledWith(413);
    expect(next).not.toHaveBeenCalled();

    const okNext = jest.fn();
    middleware(
      {
        headers: {
          'content-type': 'multipart/form-data; boundary=x',
          'content-length': '512',
        },
      } as never,
      { status } as never,
      okNext,
    );
    expect(okNext).toHaveBeenCalled();

    const jsonNext = jest.fn();
    middleware(
      { headers: { 'content-type': 'application/json' } } as never,
      { status } as never,
      jsonNext,
    );
    expect(jsonNext).toHaveBeenCalled();
  });
});
