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
};

export type AnansiMePatch = {
  timezone?: string;
  awake_hours?: AnansiAwakeHours;
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

class AnansiApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
  ) {
    super(`ANANSI: ${path} returned ${status}`);
  }
}

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
    throw new AnansiApiError(path, response.status);
  }

  return response.json() as Promise<T>;
};

export const getAnansiMe = (accessToken: string): Promise<AnansiMeResponse> =>
  anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken);

export const patchAnansiMe = (
  accessToken: string,
  payload: AnansiMePatch,
): Promise<AnansiMeResponse> =>
  anansiApiRequest<AnansiMeResponse>('/v1/me', accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

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
