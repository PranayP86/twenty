import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { createHash, timingSafeEqual } from 'crypto';
import { type Request } from 'express';

const MAX_REQUEST_BODY_BYTES = 512;
const FORWARDED_REQUEST_HEADERS = [
  'cf-connecting-ip',
  'cf-ray',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
] as const;

type RawBodyRequest = Request & { rawBody?: Buffer };

@Injectable()
export class AnansiInternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const expectedToken = process.env.ANANSI_INTERNAL_TOKEN;
    const expectedHost = process.env.ANANSI_INTERNAL_TWENTY_HOST;
    const providedToken = request.headers['x-anansi-internal'];
    const providedHost = request.headers.host;
    const isForwardedRequest = FORWARDED_REQUEST_HEADERS.some(
      (header) => request.headers[header] !== undefined,
    );

    if (
      !expectedToken ||
      !expectedHost ||
      providedHost !== expectedHost ||
      isForwardedRequest ||
      typeof providedToken !== 'string' ||
      !this.tokensMatch(expectedToken, providedToken)
    ) {
      throw new HttpException(
        { message: 'Unauthorized', statusCode: HttpStatus.UNAUTHORIZED },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const contentType = request.headers['content-type'];

    if (
      typeof contentType !== 'string' ||
      !/^application\/json(?:\s*;|$)/i.test(contentType)
    ) {
      throw new HttpException(
        { message: 'Invalid request', statusCode: HttpStatus.BAD_REQUEST },
        HttpStatus.BAD_REQUEST,
      );
    }

    const contentLength = request.headers['content-length'];
    const parsedContentLength =
      typeof contentLength === 'string' ? Number(contentLength) : undefined;

    if (
      (parsedContentLength !== undefined &&
        (!Number.isSafeInteger(parsedContentLength) ||
          parsedContentLength < 0 ||
          parsedContentLength > MAX_REQUEST_BODY_BYTES)) ||
      (Buffer.isBuffer(request.rawBody) &&
        request.rawBody.byteLength > MAX_REQUEST_BODY_BYTES)
    ) {
      throw new HttpException(
        {
          message: 'Request body too large',
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    return true;
  }

  private tokensMatch(expectedToken: string, providedToken: string): boolean {
    const expectedDigest = createHash('sha256').update(expectedToken).digest();
    const providedDigest = createHash('sha256').update(providedToken).digest();

    return timingSafeEqual(expectedDigest, providedDigest);
  }
}
