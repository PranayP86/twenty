import { Injectable, Logger } from '@nestjs/common';

// ANANSI PATCH: gates workspace creation (when
// IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS denies a non-admin) on the
// Anansi Core allowlist service. Every failure mode below falls through to
// `false` (deny) so an unreachable/misconfigured Core, a slow response, or a
// malformed body can never open signup wider than the existing
// admin-only restriction — never fail open.
@Injectable()
export class AnansiAllowlistService {
  private readonly logger = new Logger(AnansiAllowlistService.name);

  private static readonly REQUEST_TIMEOUT_MS = 2000;

  async isApproved(email: string): Promise<boolean> {
    const coreUrl = process.env.ANANSI_CORE_URL;
    const internalToken = process.env.ANANSI_INTERNAL_TOKEN;

    // ANANSI PATCH: env unset -> deny (fail closed).
    if (!coreUrl || !internalToken) {
      this.logger.warn(
        'ANANSI_CORE_URL or ANANSI_INTERNAL_TOKEN is not configured, denying workspace creation',
      );

      return false;
    }

    try {
      const response = await fetch(
        `${coreUrl}/v1/allowlist/check?email=${encodeURIComponent(
          email.toLowerCase(),
        )}`,
        {
          method: 'GET',
          headers: { 'X-Anansi-Internal': internalToken },
          // ANANSI PATCH: 2s timeout budget; AbortSignal.timeout rejects the
          // fetch, which is caught below and treated as a deny.
          signal: AbortSignal.timeout(
            AnansiAllowlistService.REQUEST_TIMEOUT_MS,
          ),
        },
      );

      // ANANSI PATCH: non-200 (401/403/5xx/etc.) -> deny (fail closed).
      if (!response.ok) {
        this.logger.warn(
          `Anansi Core allowlist check returned ${response.status}, denying workspace creation`,
        );

        return false;
      }

      // ANANSI PATCH: malformed JSON throws here and is caught below -> deny.
      const body: unknown = await response.json();

      return (
        typeof body === 'object' &&
        body !== null &&
        (body as { approved?: unknown }).approved === true
      );
    } catch (error) {
      // ANANSI PATCH: network error / timeout / abort -> deny (fail closed).
      this.logger.warn(
        `Anansi Core allowlist check failed (${
          error instanceof Error ? error.message : String(error)
        }), denying workspace creation`,
      );

      return false;
    }
  }
}
