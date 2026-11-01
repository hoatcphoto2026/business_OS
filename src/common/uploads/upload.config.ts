import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const DEFAULT_UPLOAD_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_UPLOAD_MAX_FILES = 5;
export const DEFAULT_UPLOAD_MAX_FIELDS = 20;
export const DEFAULT_UPLOAD_MAX_REQUEST_BYTES = 25 * 1024 * 1024; // 25 MB

/** MIME types accepted by file upload endpoints (extend deliberately). */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

type EnvLike = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function resolveUploadLimits(env: EnvLike = process.env) {
  return {
    fileSize: positiveInt(
      env.UPLOAD_MAX_FILE_BYTES,
      DEFAULT_UPLOAD_MAX_FILE_BYTES,
    ),
    files: positiveInt(env.UPLOAD_MAX_FILES, DEFAULT_UPLOAD_MAX_FILES),
    fields: positiveInt(env.UPLOAD_MAX_FIELDS, DEFAULT_UPLOAD_MAX_FIELDS),
    parts:
      positiveInt(env.UPLOAD_MAX_FILES, DEFAULT_UPLOAD_MAX_FILES) +
      positiveInt(env.UPLOAD_MAX_FIELDS, DEFAULT_UPLOAD_MAX_FIELDS),
  };
}

export function resolveMaxMultipartRequestBytes(env: EnvLike = process.env) {
  const limits = resolveUploadLimits(env);
  return positiveInt(
    env.UPLOAD_MAX_REQUEST_BYTES,
    Math.max(
      limits.fileSize * limits.files + 1024 * 1024,
      DEFAULT_UPLOAD_MAX_REQUEST_BYTES,
    ),
  );
}

/**
 * Use with every FileInterceptor/FilesInterceptor:
 *   @UseInterceptors(FileInterceptor('file', buildMulterOptions()))
 *
 * Mitigates the multer/body-parser DoS advisories by enforcing hard caps on
 * file size, file count, field count and accepted MIME types.
 */
export function buildMulterOptions(env: EnvLike = process.env): MulterOptions {
  return {
    limits: resolveUploadLimits(env),
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
        callback(
          new BadRequestException(
            `Unsupported upload MIME type: ${file.mimetype}`,
          ),
          false,
        );
        return;
      }
      callback(null, true);
    },
  };
}
