import { NextFunction, Request, Response } from 'express';
import { resolveMaxMultipartRequestBytes } from './upload.config';

/**
 * Rejects oversized multipart/form-data requests before multer buffers them.
 * Non-multipart traffic is untouched (json/urlencoded use BODY_LIMIT).
 */
export function multipartLimitMiddleware(
  env: Record<string, string | undefined> = process.env,
) {
  const maxBytes = resolveMaxMultipartRequestBytes(env);
  return (req: Request, res: Response, next: NextFunction): void => {
    const isMultipart = (req.headers['content-type'] || '').startsWith(
      'multipart/form-data',
    );
    if (!isMultipart) {
      next();
      return;
    }
    const declared = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.status(413).json({
        statusCode: 413,
        error: 'Payload Too Large',
        message: `Multipart payload exceeds ${maxBytes} bytes`,
      });
      return;
    }
    next();
  };
}
