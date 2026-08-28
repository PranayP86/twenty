// ANANSI PATCH (WS-B): thin fetch wrappers for the Anansi Core endpoints the
// profile page consumes (core Task 6: anansi/api/routes_me.py,
// routes_policy.py, routes_automation.py). Deliberately plain `fetch` calls
// (not Apollo/GraphQL) — Core is a separate REST service from the Twenty
// GraphQL API, same pattern as AnansiProvisioningScreen's `/v1/provision`
// call.
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';

export type AnansiAwakeHours = {
  start: string;
  end: string;
};

export type AnansiMeResponse = {
  email: string;
  timezone: string | null;
  awake_hours: AnansiAwakeHours | null;
  mode: string;
  // ANANSI PATCH (WS-C): Core-owned wizard/tour stamps gate the root overlay.
  onboarding_completed_at: string | null;
  tour_seen_at: string | null;
  tour_state_revision: number;
};

export type AnansiMePatch = {
  timezone?: string;
  awake_hours?: AnansiAwakeHours;
};

// ANANSI PATCH (WS-C): wizard-facing profile and policy shapes mirror the
// bearer-authenticated Core routes without introducing GraphQL codegen.
export type AnansiProfileResponse = {
  version: number | null;
  profile: Record<string, unknown>;
};

export type AnansiWorkMode = 'remote_only' | 'in_person_ok' | 'hybrid';
export type AnansiFluffLevel = 'conservative' | 'balanced' | 'confident';
export type AnansiLocation = {
  model: 'anywhere' | 'tz_range' | 'city';
  city: string | null;
  radius_mi: number | null;
  tz_range: [string, string] | null;
};

// Every top-level key `anansi.policy.KNOWN_POLICY_KEYS` accepts. `automation`
// is written through the dedicated `POST /v1/automation/{chunk}` route below,
// never through this page's PUT /v1/policy calls, but it still round-trips
// through GET/PUT since PUT replaces the whole document.
export type AnansiAutomationMap = Record<string, number | boolean>;

export type AnansiPolicyDocument = {
  automation?: AnansiAutomationMap;
  remote_only?: boolean;
  relocation?: boolean;
  education_on_resume?: boolean;
  rate_floor?: number | null;
  plugins?: unknown;
  // ANANSI PATCH (WS-C): onboarding-only policy keys accepted by Core Task 1.
  title_palette?: string[];
  fluff_level?: AnansiFluffLevel;
  approved_fluff?: string[];
  location?: AnansiLocation;
  work_mode?: AnansiWorkMode;
};

export type AnansiPolicyResponse = {
  policy: AnansiPolicyDocument;
  version: number;
};

// Ruling: chunks match `anansi.approvals.autonomy.CHUNKS` exactly (core
// module, read-only reference) — "scheduling" is included so the disabled
// row and the toggle rows share one source of truth for ordering, even
// though scheduling never gets a POST call from this page.
export const ANANSI_AUTOMATION_CHUNKS = [
  'applications',
  'replies',
  'negotiation',
  'prescreen',
  'scheduling',
  'outreach',
] as const;

export type AnansiAutomationChunk = (typeof ANANSI_AUTOMATION_CHUNKS)[number];

export type AnansiAutomationLevel = 1 | 2;

// Mirrors the defensive read in anansi.approvals.autonomy.autonomy_level
// (Ruling 52): a malformed/paused-flag value under this key must never be
// mistaken for a real level, so anything that isn't a plain number falls
// back to the safe default (1 -- always ask).
export const getAnansiAutomationLevel = (
  automation: AnansiAutomationMap,
  chunk: AnansiAutomationChunk,
): number => {
  const value = automation[chunk];
  return typeof value === 'number' ? value : 1;
};

// ANANSI PATCH (WS-C): preserve Core's structured `detail` on failed requests
// so the wizard can surface onboarding-completion 409s verbatim.
export class AnansiApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(detail ?? `ANANSI: ${path} returned ${status}`);
  }
}

const getAnansiApiError = async (
  path: string,
  response: Response,
): Promise<AnansiApiError> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return new AnansiApiError(path, response.status, body.detail);
    }
  } catch {
    // A non-JSON error response still retains its status/path fallback below.
  }

  return new AnansiApiError(path, response.status);
};

const anansiApiRequest = async <T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${ANANSI_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await getAnansiApiError(path, response);
  }

  return response.json() as Promise<T>;
};

export const getAnansiMe = (
  accessToken: string,
): Promise<AnansiMeResponse> =>
  anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken);

export const patchAnansiMe = (
  accessToken: string,
  payload: AnansiMePatch,
): Promise<AnansiMeResponse> =>
  anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

// ANANSI PATCH (WS-C): tour close and Profile restart can happen back-to-back,
// including across an access-token refresh. Serialize all tour-seen writes so a
// slow `true` response cannot land after a later `false` restart. Bound every
// queued request so one lost connection cannot block later writes forever.
// Core owns the revision: each operation reads the current value, then PATCHes
// it as a compare-and-swap. This stays correct across tabs, users, and clocks.
const ANANSI_TOUR_SEEN_WRITE_TIMEOUT_MS = 15_000;
let anansiTourSeenWriteQueue: Promise<unknown> = Promise.resolve();

const runAnansiTourRequestWithTimeout = async <T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    ANANSI_TOUR_SEEN_WRITE_TIMEOUT_MS,
  );

  try {
    return await request(controller.signal);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const getAnansiMeWithTimeout = (
  accessToken: string,
): Promise<AnansiMeResponse> =>
  runAnansiTourRequestWithTimeout((signal) =>
    anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken, { signal }),
  );

const patchAnansiTourSeenWithTimeout = (
  accessToken: string,
  tourSeen: boolean,
  tourStateRevision: number,
): Promise<AnansiMeResponse> =>
  runAnansiTourRequestWithTimeout((signal) =>
    anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        tour_seen: tourSeen,
        tour_state_revision: tourStateRevision,
      }),
      signal,
    }),
  );

const patchAnansiTourSeenOrdered = async (
  accessToken: string,
  tourSeen: boolean,
  expectedRevision?: number,
): Promise<AnansiMeResponse> => {
  let tourStateRevision: number;
  if (tourSeen) {
    if (expectedRevision === undefined) {
      throw new Error('A guided-tour close requires its start revision');
    }
    tourStateRevision = expectedRevision;
  } else {
    tourStateRevision = (
      await getAnansiMeWithTimeout(accessToken)
    ).tour_state_revision;
  }

  try {
    return await patchAnansiTourSeenWithTimeout(
      accessToken,
      tourSeen,
      tourStateRevision,
    );
  } catch (error) {
    if (!(error instanceof AnansiApiError) || error.status !== 409) {
      throw error;
    }

    const refreshed = await getAnansiMeWithTimeout(accessToken);
    if (tourSeen) {
      // A newer restart won the compare-and-swap. Never replay this stale close.
      return refreshed;
    }

    // Restart is the explicit latest user action. Retry it once against the
    // refreshed server revision; a second conflict is surfaced to the caller.
    return patchAnansiTourSeenWithTimeout(
      accessToken,
      false,
      refreshed.tour_state_revision,
    );
  }
};

export function patchAnansiTourSeen(
  accessToken: string,
  tourSeen: true,
  expectedRevision: number,
): Promise<AnansiMeResponse>;
export function patchAnansiTourSeen(
  accessToken: string,
  tourSeen: false,
): Promise<AnansiMeResponse>;
export function patchAnansiTourSeen(
  accessToken: string,
  tourSeen: boolean,
  expectedRevision?: number,
): Promise<AnansiMeResponse> {
  const nextWrite = anansiTourSeenWriteQueue.then(() =>
    patchAnansiTourSeenOrdered(accessToken, tourSeen, expectedRevision),
  );

  anansiTourSeenWriteQueue = nextWrite.then(
    () => undefined,
    () => undefined,
  );

  return nextWrite;
}

// A valid Twenty workspace can reach the Anansi wizard before a lost or
// interrupted provisioning request creates its Core user. This call is
// idempotent and lets the wizard repair that exact workspace with its own
// bearer before it retries Profile.
const ANANSI_PROVISION_TIMEOUT_MS = 90_000;

export const provisionAnansiWorkspace = async (
  accessToken: string,
): Promise<void> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    ANANSI_PROVISION_TIMEOUT_MS,
  );

  try {
    await anansiApiRequest<Record<string, unknown>>(
      '/v1/provision',
      accessToken,
      {
        method: 'POST',
        body: '{}',
        signal: controller.signal,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

// ANANSI PATCH (WS-C): wizard resume/profile/completion calls. The multipart
// request intentionally omits Content-Type so fetch supplies its boundary.
export const getAnansiProfile = (
  accessToken: string,
): Promise<AnansiProfileResponse> =>
  anansiApiRequest<AnansiProfileResponse>('/v1/profile', accessToken);

export const patchAnansiProfile = (
  accessToken: string,
  payload: { target_roles: string[] },
): Promise<AnansiProfileResponse> =>
  anansiApiRequest<AnansiProfileResponse>('/v1/profile', accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const postAnansiResume = async (
  accessToken: string,
  file: File,
): Promise<{ ok: boolean; profile_version: number; parsed: unknown | null }> => {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${ANANSI_API_URL}/v1/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  if (!response.ok) {
    throw await getAnansiApiError('/v1/resume', response);
  }

  return response.json() as Promise<{
    ok: boolean;
    profile_version: number;
    parsed: unknown | null;
  }>;
};

export const postAnansiOnboardingComplete = (
  accessToken: string,
): Promise<{ mode: string; already: boolean }> =>
  anansiApiRequest<{ mode: string; already: boolean }>(
    '/v1/onboarding/complete',
    accessToken,
    { method: 'POST' },
  );

export const getAnansiPolicy = (
  accessToken: string,
): Promise<AnansiPolicyResponse> =>
  anansiApiRequest<AnansiPolicyResponse>('/v1/policy', accessToken);

export const putAnansiPolicy = (
  accessToken: string,
  policy: AnansiPolicyDocument,
): Promise<AnansiPolicyResponse> =>
  anansiApiRequest<AnansiPolicyResponse>('/v1/policy', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ policy }),
  });

// Returns the full updated automation map (server merges chunk+level into
// the latest policy version and returns just that map — see
// anansi.api.routes_automation.set_automation).
export const postAnansiAutomation = (
  accessToken: string,
  chunk: AnansiAutomationChunk,
  level: AnansiAutomationLevel,
): Promise<AnansiAutomationMap> =>
  anansiApiRequest<AnansiAutomationMap>(
    `/v1/automation/${chunk}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ level }),
    },
  );
