import { Injectable, Logger } from '@nestjs/common';

// Anansi Core allowlist gate. Only an explicit `approved: false` response is a
// denial; unavailable or malformed upstream responses throw so callers fail
// closed without mislabeling an approved user as not allowlisted.
@Injectable()
export class AnansiAllowlistService {
  private readonly logger = new Logger(AnansiAllowlistService.name);

  private static readonly REQUEST_TIMEOUT_MS = 2000;

  async isApproved(email: string): Promise<boolean> {
    const coreUrl = process.env.ANANSI_CORE_URL;
    const internalToken = process.env.ANANSI_INTERNAL_TOKEN;

    if (!coreUrl || !internalToken) {
      const error = new Error(
        'ANANSI_CORE_URL or ANANSI_INTERNAL_TOKEN is not configured',
      );

      this.logger.warn(error.message);
      throw error;
    }

    try {
      const response = await fetch(
        `${coreUrl}/v1/allowlist/check?email=${encodeURIComponent(
          email.toLowerCase(),
        )}`,
        {
          method: 'GET',
          headers: { 'X-Anansi-Internal': internalToken },
          // Keep the workspace gate closed if Core does not answer promptly.
          signal: AbortSignal.timeout(
            AnansiAllowlistService.REQUEST_TIMEOUT_MS,
          ),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Anansi Core allowlist check returned ${response.status}`,
        );
      }

      const body: unknown = await response.json();

      if (
        typeof body !== 'object' ||
        body === null ||
        !('approved' in body) ||
        typeof body.approved !== 'boolean'
      ) {
        throw new Error(
          'Anansi Core allowlist check returned a malformed body',
        );
      }

      return body.approved;
    } catch (error) {
      this.logger.warn(
        `Anansi Core allowlist check unavailable (${
          error instanceof Error ? error.message : String(error)
        }); workspace creation remains blocked`,
      );

      throw error instanceof Error
        ? error
        : new Error('Anansi Core allowlist check unavailable');
    }
  }
}
