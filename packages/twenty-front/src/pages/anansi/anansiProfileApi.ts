// ANANSI PATCH (WS-B): thin fetch wrappers for the Anansi Core endpoints the
// profile page consumes (core Task 6: anansi/api/routes_me.py,
// routes_policy.py, routes_automation.py). Deliberately plain `fetch` calls
// (not Apollo/GraphQL) — Core is a separate REST service from the Twenty
// GraphQL API, same pattern as AnansiProvisioningScreen's `/v1/provision`
// call.
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { ensureTokenRenewed } from '@/auth/utils/ensureTokenRenewed';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { isDefined } from 'twenty-shared/utils';

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

export type AnansiGmailConnection = {
  id: string;
  address: string;
  is_primary: boolean;
  state: string;
  last_success_at?: string | null;
  error_code?: string | null;
};

export type AnansiGmailStatus = {
  connections: AnansiGmailConnection[];
  primary_connection_id: string | null;
  main_application_email: string | null;
};

export type AnansiGmailOAuthStart = {
  authorize_url: string;
  expires_at: string;
};

export type AnansiGmailOAuthComplete =
  | AnansiGmailConnection
  | { status: 'exchanging' };

export type AnansiReadinessDimension = {
  ready: boolean;
  code: string;
};

export type AnansiReadinessStatus = {
  ready: boolean;
  profile: AnansiReadinessDimension;
  gmail: AnansiReadinessDimension;
  calendar: AnansiReadinessDimension;
  extension: AnansiReadinessDimension;
  remote: AnansiReadinessDimension;
  browser: AnansiReadinessDimension;
};

export type AnansiAuthorizationMode = 'review_first' | 'auto_now';

export type AnansiAutomationModeResponse = {
  mode: AnansiAuthorizationMode;
  version: number;
  automation: AnansiAutomationMap;
};

export type AnansiBrowserDevice = {
  id: string;
  key_thumbprint: string;
  extension_id: string;
  workspace_origin: string;
  last_heartbeat_at: string | null;
  revoked_at: string | null;
  version: number;
};

export type AnansiBrowserPreference = {
  preferred_runtime: 'extension' | 'remote';
  remote_fallback_enabled: boolean;
  extension_state: 'unavailable' | 'healthy' | 'unhealthy';
  remote_state: 'unavailable' | 'healthy' | 'unhealthy';
  last_health_at: string | null;
  version: number;
};

export type AnansiBrowserPreferencePatch = {
  preferred_runtime: 'extension' | 'remote';
  remote_fallback_enabled: boolean;
  expected_version: number;
};

export type AnansiBrowserPairingStart = {
  user_id: string;
  intent_id: string;
  token: string;
  nonce: string;
  extension_id: string;
  workspace_origin: string;
  expires_at: string;
};

export type AnansiApplicationAttempt = {
  id: string;
  job_id: string;
  state: string;
  state_version: number;
  runtime: 'extension' | 'remote';
  risk_class: 'low' | 'high' | 'unsupported';
  portal: string;
  automation_mode: string;
  submit_reserved_at: string | null;
  outward_observed_at: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  failure_code: string | null;
};

export type AnansiApplicationStart = {
  attempt: AnansiApplicationAttempt;
  created: boolean;
  page_url: string;
};

export type AnansiRemoteBrowserSession = {
  id: string;
  attempt_id: string;
  state: string;
  state_version: number;
  recipe_id: string;
  recipe_version: string;
  recipe_digest: string;
  review_generation: number;
  expires_at: string;
  started_at: string | null;
  last_heartbeat_at: string | null;
  terminal_at: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AnansiRemoteBrowserSessionStart = {
  session: AnansiRemoteBrowserSession;
  created: boolean;
};

export type AnansiRemoteBrowserReview = {
  session: AnansiRemoteBrowserSession;
  review_url: string;
  expires_at: string;
};

export type AnansiManualApplicationControl = {
  id: string;
  attempt_id: string;
  session_id: string;
  state:
    | 'handoff_ready'
    | 'control_ready'
    | 'confirmed'
    | 'not_submitted'
    | 'expired';
  version: number;
  handoff_reason: 'challenge' | 'mfa' | 'login';
  packet_digest: string;
  control_action: 'manual_application_submit' | null;
  control_expires_at: string | null;
  authorized_at: string | null;
  resolved_at: string | null;
  resolution: 'confirmed' | 'not_submitted' | null;
  created_at: string;
  updated_at: string;
};

export type AnansiManualControlAuthorizationInput = {
  expected_attempt_version: number;
  expected_session_version: number;
  expected_control_version: number;
  packet_digest: string;
  authorization_key: string;
};

export type AnansiManualControlResolutionInput =
  AnansiManualControlAuthorizationInput & {
    outcome: 'confirmed' | 'not_submitted';
  };

export type AnansiApplicationAttemptOutput = AnansiApplicationAttempt & {
  job_id: string;
  engagement_id: string | null;
  resume_id: string | null;
  connection_id: string;
  canonical_key: string;
  company_key: string;
  requisition_key: string;
  runtime_session_id: string | null;
  recipe_id: string | null;
  recipe_version: string | null;
  recipe_digest: string | null;
  policy_version: number;
  contact_email: string;
  resume_sha256: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  submit_idempotency_key: string | null;
  submit_grant_expires_at: string | null;
  evidence_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type AnansiManualControlAuthorization = {
  attempt: AnansiApplicationAttemptOutput;
  control: AnansiManualApplicationControl;
  session_id: string;
  session_state: 'control_ready';
  session_state_version: number;
  control_generation: number;
  control_url: string;
  expires_at: string;
};

export type AnansiManualControlResolution = {
  attempt: AnansiApplicationAttemptOutput;
  control: AnansiManualApplicationControl;
  session: AnansiRemoteBrowserSession;
};

export type AnansiApplicationReviewAnswerValue =
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'strings'; value: string[] };

export type AnansiApplicationReview = {
  id: string;
  attempt_id: string;
  packet_digest: string;
  packet: {
    schema: 'anansi.application-review.v1';
    attempt: { canonical_key: string; page_url: string };
    recipe: { id: string; version: string; digest: string };
    policy: {
      version: number;
      digest: string;
      mode: 'review_first' | 'auto_now';
    };
    answers: {
      bundle_ref: string;
      items: Array<{
        key: string;
        value: AnansiApplicationReviewAnswerValue;
        provenance: {
          kind:
            | 'profile_fact'
            | 'user_confirmed'
            | 'policy'
            | 'application_answer';
          ref: string;
        };
      }>;
    };
    documents: {
      bundle_ref: string;
      items: Array<{
        key: string;
        id: string;
        file_name: string;
        media_type: 'application/pdf';
        sha256: string;
      }>;
    };
    bindings: Array<{
      key: string;
      status: 'verified' | 'skipped' | 'unresolved';
    }>;
    unresolved: Array<{
      key: string;
      reason:
        | 'answer_missing'
        | 'answer_invalid'
        | 'document_missing'
        | 'document_invalid'
        | 'control_missing'
        | 'control_ambiguous'
        | 'value_mismatch'
        | 'portal_validation'
        | 'runtime_failure';
    }>;
  };
  state:
    | 'pending'
    | 'needs_user'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'consumed'
    | 'invalidated';
  version: number;
  approval_id: string | null;
  approval_expires_at: string | null;
  decided_at: string | null;
  consumed_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REVIEW_KEY_PATTERN =
  /^[A-Za-z0-9_$:-](?:[A-Za-z0-9._$:-]{0,126}[A-Za-z0-9_$:-])?$/u;
const SAFE_REVIEW_REFERENCE_PATTERN =
  /^(?:answer|application-answer|attempt|policy|profile):[A-Za-z0-9_$-](?:[A-Za-z0-9._$:-]{0,2038}[A-Za-z0-9_$-])?$/u;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;
const BROWSER_HEALTH_STATES = new Set(['unavailable', 'healthy', 'unhealthy']);
const APPLICATION_REVIEW_STATES = new Set([
  'pending',
  'needs_user',
  'approved',
  'rejected',
  'expired',
  'consumed',
  'invalidated',
]);
const APPLICATION_REVIEW_PROVENANCE_KINDS = new Set([
  'profile_fact',
  'user_confirmed',
  'policy',
  'application_answer',
]);
const APPLICATION_REVIEW_BINDING_STATES = new Set([
  'verified',
  'skipped',
  'unresolved',
]);
const APPLICATION_REVIEW_UNRESOLVED_REASONS = new Set([
  'answer_missing',
  'answer_invalid',
  'document_missing',
  'document_invalid',
  'control_missing',
  'control_ambiguous',
  'value_mismatch',
  'portal_validation',
  'runtime_failure',
]);
const APPLICATION_ATTEMPT_STATES = new Set([
  'prepared',
  'queued',
  'filling',
  'review_ready',
  'handoff_ready',
  'submit_reserved',
  'submitted_unconfirmed',
  'needs_user',
  'confirmed',
  'blocked',
  'failed',
  'expired',
  'cancelled',
]);
const REMOTE_SESSION_STATES = new Set([
  'pending',
  'starting',
  'running',
  'review_ready',
  'handoff_ready',
  'control_ready',
  'stopping',
  'completed',
  'failed',
  'stopped',
  'expired',
]);
const MANUAL_CONTROL_STATES = new Set([
  'handoff_ready',
  'control_ready',
  'confirmed',
  'not_submitted',
  'expired',
]);
const MANUAL_CONTROL_REASONS = new Set(['challenge', 'mfa', 'login']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSafeIntegerAtLeast = (value: unknown, minimum: number): boolean =>
  Number.isSafeInteger(value) && (value as number) >= minimum;

const isDateString = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isNullableDateString = (value: unknown): value is string | null =>
  value === null || isDateString(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isExactRecord = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> =>
  isRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const isBoundedText = (
  value: unknown,
  maximum: number,
  minimum = 1,
): value is string =>
  typeof value === 'string' &&
  value.length >= minimum &&
  value.length <= maximum &&
  !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });

const isApplicationReviewAnswerValue = (
  value: unknown,
): value is AnansiApplicationReviewAnswerValue => {
  if (!isExactRecord(value, ['type', 'value'])) {
    return false;
  }
  if (value.type === 'string') {
    return isBoundedText(value.value, 10_000);
  }
  if (value.type === 'boolean') {
    return typeof value.value === 'boolean';
  }
  return (
    value.type === 'strings' &&
    Array.isArray(value.value) &&
    value.value.length >= 1 &&
    value.value.length <= 32 &&
    value.value.every((item) => isBoundedText(item, 1_000))
  );
};

const isApplicationReviewAnswer = (
  value: unknown,
): value is AnansiApplicationReview['packet']['answers']['items'][number] =>
  isExactRecord(value, ['key', 'value', 'provenance']) &&
  typeof value.key === 'string' &&
  REVIEW_KEY_PATTERN.test(value.key) &&
  isApplicationReviewAnswerValue(value.value) &&
  isExactRecord(value.provenance, ['kind', 'ref']) &&
  typeof value.provenance.kind === 'string' &&
  APPLICATION_REVIEW_PROVENANCE_KINDS.has(value.provenance.kind) &&
  typeof value.provenance.ref === 'string' &&
  SAFE_REVIEW_REFERENCE_PATTERN.test(value.provenance.ref);

const isApplicationReviewDocument = (
  value: unknown,
): value is AnansiApplicationReview['packet']['documents']['items'][number] =>
  isExactRecord(value, ['key', 'id', 'file_name', 'media_type', 'sha256']) &&
  typeof value.key === 'string' &&
  REVIEW_KEY_PATTERN.test(value.key) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  isBoundedText(value.file_name, 255) &&
  value.media_type === 'application/pdf' &&
  typeof value.sha256 === 'string' &&
  SHA256_PATTERN.test(value.sha256);

const isApplicationReviewBinding = (
  value: unknown,
): value is AnansiApplicationReview['packet']['bindings'][number] =>
  isExactRecord(value, ['key', 'status']) &&
  typeof value.key === 'string' &&
  REVIEW_KEY_PATTERN.test(value.key) &&
  typeof value.status === 'string' &&
  APPLICATION_REVIEW_BINDING_STATES.has(value.status);

const isApplicationReviewUnresolved = (
  value: unknown,
): value is AnansiApplicationReview['packet']['unresolved'][number] =>
  isExactRecord(value, ['key', 'reason']) &&
  typeof value.key === 'string' &&
  REVIEW_KEY_PATTERN.test(value.key) &&
  typeof value.reason === 'string' &&
  APPLICATION_REVIEW_UNRESOLVED_REASONS.has(value.reason);

const hasUniqueKeys = (items: Array<{ key: string }>): boolean =>
  new Set(items.map((item) => item.key)).size === items.length;

const hasConsistentApplicationReviewBindings = (
  packet: AnansiApplicationReview['packet'],
): boolean => {
  const itemKeys = new Set([
    ...packet.answers.items.map((item) => item.key),
    ...packet.documents.items.map((item) => item.key),
  ]);
  if (
    packet.bindings.some(
      (binding) => binding.status === 'verified' && !itemKeys.has(binding.key),
    )
  ) {
    return false;
  }
  const unresolvedBindingKeys = packet.bindings
    .filter((binding) => binding.status === 'unresolved')
    .map((binding) => binding.key);
  return (
    unresolvedBindingKeys.length === packet.unresolved.length &&
    unresolvedBindingKeys.every(
      (key, index) => packet.unresolved[index]?.key === key,
    )
  );
};

const isApplicationReviewPacket = (
  value: unknown,
): value is AnansiApplicationReview['packet'] => {
  if (
    !isExactRecord(value, [
      'schema',
      'attempt',
      'recipe',
      'policy',
      'answers',
      'documents',
      'bindings',
      'unresolved',
    ]) ||
    value.schema !== 'anansi.application-review.v1' ||
    !isExactRecord(value.attempt, ['canonical_key', 'page_url']) ||
    typeof value.attempt.canonical_key !== 'string' ||
    !SHA256_PATTERN.test(value.attempt.canonical_key) ||
    !isBoundedText(value.attempt.page_url, 2_048) ||
    !value.attempt.page_url.startsWith('https://') ||
    !isExactRecord(value.recipe, ['id', 'version', 'digest']) ||
    typeof value.recipe.id !== 'string' ||
    !REVIEW_KEY_PATTERN.test(value.recipe.id) ||
    !isBoundedText(value.recipe.version, 64) ||
    typeof value.recipe.digest !== 'string' ||
    !SHA256_PATTERN.test(value.recipe.digest) ||
    !isExactRecord(value.policy, ['version', 'digest', 'mode']) ||
    !isSafeIntegerAtLeast(value.policy.version, 1) ||
    typeof value.policy.digest !== 'string' ||
    !SHA256_PATTERN.test(value.policy.digest) ||
    !['review_first', 'auto_now'].includes(String(value.policy.mode)) ||
    !isExactRecord(value.answers, ['bundle_ref', 'items']) ||
    !isBoundedText(value.answers.bundle_ref, 512) ||
    !Array.isArray(value.answers.items) ||
    value.answers.items.length > 128 ||
    !value.answers.items.every(isApplicationReviewAnswer) ||
    !hasUniqueKeys(value.answers.items) ||
    !isExactRecord(value.documents, ['bundle_ref', 'items']) ||
    !isBoundedText(value.documents.bundle_ref, 512) ||
    !Array.isArray(value.documents.items) ||
    value.documents.items.length > 16 ||
    !value.documents.items.every(isApplicationReviewDocument) ||
    !hasUniqueKeys(value.documents.items) ||
    !Array.isArray(value.bindings) ||
    value.bindings.length < 1 ||
    value.bindings.length > 128 ||
    !value.bindings.every(isApplicationReviewBinding) ||
    !hasUniqueKeys(value.bindings) ||
    !Array.isArray(value.unresolved) ||
    value.unresolved.length > 128 ||
    !value.unresolved.every(isApplicationReviewUnresolved) ||
    !hasUniqueKeys(value.unresolved)
  ) {
    return false;
  }
  return hasConsistentApplicationReviewBindings(
    value as AnansiApplicationReview['packet'],
  );
};

const isApplicationReview = (
  value: unknown,
): value is AnansiApplicationReview =>
  isExactRecord(value, [
    'id',
    'attempt_id',
    'packet_digest',
    'packet',
    'state',
    'version',
    'approval_id',
    'approval_expires_at',
    'decided_at',
    'consumed_at',
    'invalidated_at',
    'created_at',
    'updated_at',
  ]) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  typeof value.attempt_id === 'string' &&
  UUID_PATTERN.test(value.attempt_id) &&
  typeof value.packet_digest === 'string' &&
  SHA256_PATTERN.test(value.packet_digest) &&
  isApplicationReviewPacket(value.packet) &&
  typeof value.state === 'string' &&
  APPLICATION_REVIEW_STATES.has(value.state) &&
  isSafeIntegerAtLeast(value.version, 1) &&
  (value.approval_id === null ||
    (typeof value.approval_id === 'string' &&
      UUID_PATTERN.test(value.approval_id))) &&
  isNullableDateString(value.approval_expires_at) &&
  isNullableDateString(value.decided_at) &&
  isNullableDateString(value.consumed_at) &&
  isNullableDateString(value.invalidated_at) &&
  isDateString(value.created_at) &&
  isDateString(value.updated_at) &&
  ['approved', 'expired', 'consumed'].includes(value.state) ===
    (value.approval_id !== null) &&
  ['approved', 'expired', 'consumed'].includes(value.state) ===
    (value.approval_expires_at !== null) &&
  ['approved', 'rejected', 'expired', 'consumed'].includes(value.state) ===
    (value.decided_at !== null) &&
  (value.state === 'consumed') === (value.consumed_at !== null) &&
  (value.state === 'invalidated') === (value.invalidated_at !== null);

const isWorkspaceOrigin = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 255) {
    return false;
  }
  try {
    const url = new URL(value);
    const isLocalDevelopment =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      (url.protocol === 'https:' || isLocalDevelopment) &&
      url.origin === value &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

const isReadinessDimension = (
  value: unknown,
): value is AnansiReadinessDimension =>
  isRecord(value) &&
  typeof value.ready === 'boolean' &&
  typeof value.code === 'string' &&
  value.code.length >= 1;

const isReadinessStatus = (value: unknown): value is AnansiReadinessStatus =>
  isRecord(value) &&
  typeof value.ready === 'boolean' &&
  isReadinessDimension(value.profile) &&
  isReadinessDimension(value.gmail) &&
  isReadinessDimension(value.calendar) &&
  isReadinessDimension(value.extension) &&
  isReadinessDimension(value.remote) &&
  isReadinessDimension(value.browser);

const isOnboardingComplete = (
  value: unknown,
): value is { mode: 'live'; already: boolean } =>
  isRecord(value) &&
  value.mode === 'live' &&
  typeof value.already === 'boolean';

const isBrowserPreference = (
  value: unknown,
): value is AnansiBrowserPreference =>
  isRecord(value) &&
  (value.preferred_runtime === 'extension' ||
    value.preferred_runtime === 'remote') &&
  typeof value.remote_fallback_enabled === 'boolean' &&
  typeof value.extension_state === 'string' &&
  BROWSER_HEALTH_STATES.has(value.extension_state) &&
  typeof value.remote_state === 'string' &&
  BROWSER_HEALTH_STATES.has(value.remote_state) &&
  isNullableDateString(value.last_health_at) &&
  isSafeIntegerAtLeast(value.version, 0);

const isBrowserPairingStart = (
  value: unknown,
): value is AnansiBrowserPairingStart =>
  isRecord(value) &&
  typeof value.user_id === 'string' &&
  UUID_PATTERN.test(value.user_id) &&
  typeof value.intent_id === 'string' &&
  UUID_PATTERN.test(value.intent_id) &&
  typeof value.token === 'string' &&
  value.token.length >= 43 &&
  value.token.length <= 512 &&
  BASE64URL_PATTERN.test(value.token) &&
  typeof value.nonce === 'string' &&
  value.nonce.length >= 43 &&
  value.nonce.length <= 512 &&
  BASE64URL_PATTERN.test(value.nonce) &&
  typeof value.extension_id === 'string' &&
  EXTENSION_ID_PATTERN.test(value.extension_id) &&
  isWorkspaceOrigin(value.workspace_origin) &&
  isDateString(value.expires_at);

const isBrowserDevice = (value: unknown): value is AnansiBrowserDevice =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  typeof value.key_thumbprint === 'string' &&
  value.key_thumbprint.length >= 1 &&
  typeof value.extension_id === 'string' &&
  EXTENSION_ID_PATTERN.test(value.extension_id) &&
  isWorkspaceOrigin(value.workspace_origin) &&
  isNullableDateString(value.last_heartbeat_at) &&
  isNullableDateString(value.revoked_at) &&
  isSafeIntegerAtLeast(value.version, 1);

const isApplicationAttempt = (
  value: unknown,
): value is AnansiApplicationAttempt =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  typeof value.job_id === 'string' &&
  UUID_PATTERN.test(value.job_id) &&
  typeof value.state === 'string' &&
  APPLICATION_ATTEMPT_STATES.has(value.state) &&
  isSafeIntegerAtLeast(value.state_version, 1) &&
  (value.runtime === 'extension' || value.runtime === 'remote') &&
  (value.risk_class === 'low' ||
    value.risk_class === 'high' ||
    value.risk_class === 'unsupported') &&
  typeof value.portal === 'string' &&
  value.portal.length >= 1 &&
  typeof value.automation_mode === 'string' &&
  value.automation_mode.length >= 1 &&
  isNullableDateString(value.submit_reserved_at) &&
  isNullableDateString(value.outward_observed_at) &&
  isNullableDateString(value.submitted_at) &&
  isNullableDateString(value.confirmed_at) &&
  isNullableString(value.failure_code);

const isRemoteBrowserSession = (
  value: unknown,
): value is AnansiRemoteBrowserSession =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  typeof value.attempt_id === 'string' &&
  UUID_PATTERN.test(value.attempt_id) &&
  typeof value.state === 'string' &&
  REMOTE_SESSION_STATES.has(value.state) &&
  isSafeIntegerAtLeast(value.state_version, 1) &&
  typeof value.recipe_id === 'string' &&
  value.recipe_id.length >= 1 &&
  typeof value.recipe_version === 'string' &&
  value.recipe_version.length >= 1 &&
  typeof value.recipe_digest === 'string' &&
  SHA256_PATTERN.test(value.recipe_digest) &&
  isSafeIntegerAtLeast(value.review_generation, 0) &&
  isDateString(value.expires_at) &&
  isNullableDateString(value.started_at) &&
  isNullableDateString(value.last_heartbeat_at) &&
  isNullableDateString(value.terminal_at) &&
  isNullableString(value.failure_code) &&
  isDateString(value.created_at) &&
  isDateString(value.updated_at);

const isNullableUuid = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && UUID_PATTERN.test(value));

const isNullableSha256 = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && SHA256_PATTERN.test(value));

const isExactApplicationAttemptOutput = (
  value: unknown,
): value is AnansiApplicationAttemptOutput => {
  if (
    !isExactRecord(value, [
      'id',
      'job_id',
      'engagement_id',
      'resume_id',
      'connection_id',
      'canonical_key',
      'portal',
      'company_key',
      'requisition_key',
      'risk_class',
      'runtime',
      'runtime_session_id',
      'automation_mode',
      'recipe_id',
      'recipe_version',
      'recipe_digest',
      'policy_version',
      'contact_email',
      'resume_sha256',
      'state',
      'state_version',
      'lease_owner',
      'lease_expires_at',
      'submit_idempotency_key',
      'submit_grant_expires_at',
      'submit_reserved_at',
      'outward_observed_at',
      'submitted_at',
      'confirmed_at',
      'evidence_ref',
      'failure_code',
      'created_at',
      'updated_at',
    ])
  ) {
    return false;
  }
  const attempt = value;
  if (!isApplicationAttempt(attempt)) {
    return false;
  }
  return (
    typeof value.job_id === 'string' &&
    UUID_PATTERN.test(value.job_id) &&
    isNullableUuid(value.engagement_id) &&
    isNullableUuid(value.resume_id) &&
    typeof value.connection_id === 'string' &&
    UUID_PATTERN.test(value.connection_id) &&
    typeof value.canonical_key === 'string' &&
    SHA256_PATTERN.test(value.canonical_key) &&
    isBoundedText(value.company_key, 200) &&
    isBoundedText(value.requisition_key, 200) &&
    (value.runtime_session_id === null ||
      isBoundedText(value.runtime_session_id, 200)) &&
    (value.recipe_id === null || isBoundedText(value.recipe_id, 200)) &&
    (value.recipe_version === null ||
      isBoundedText(value.recipe_version, 200)) &&
    isNullableSha256(value.recipe_digest) &&
    isSafeIntegerAtLeast(value.policy_version, 1) &&
    isBoundedText(value.contact_email, 320) &&
    isNullableSha256(value.resume_sha256) &&
    (value.lease_owner === null || isBoundedText(value.lease_owner, 255)) &&
    isNullableDateString(value.lease_expires_at) &&
    (value.submit_idempotency_key === null ||
      isBoundedText(value.submit_idempotency_key, 512)) &&
    isNullableDateString(value.submit_grant_expires_at) &&
    isNullableString(value.evidence_ref) &&
    isDateString(value.created_at) &&
    isDateString(value.updated_at)
  );
};

const isExactRemoteBrowserSession = (
  value: unknown,
): value is AnansiRemoteBrowserSession =>
  isExactRecord(value, [
    'id',
    'attempt_id',
    'state',
    'state_version',
    'recipe_id',
    'recipe_version',
    'recipe_digest',
    'review_generation',
    'expires_at',
    'started_at',
    'last_heartbeat_at',
    'terminal_at',
    'failure_code',
    'created_at',
    'updated_at',
  ]) && isRemoteBrowserSession(value);

const isManualApplicationControl = (
  value: unknown,
): value is AnansiManualApplicationControl => {
  if (
    !isExactRecord(value, [
      'id',
      'attempt_id',
      'session_id',
      'state',
      'version',
      'handoff_reason',
      'packet_digest',
      'control_action',
      'control_expires_at',
      'authorized_at',
      'resolved_at',
      'resolution',
      'created_at',
      'updated_at',
    ]) ||
    typeof value.id !== 'string' ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.attempt_id !== 'string' ||
    !UUID_PATTERN.test(value.attempt_id) ||
    typeof value.session_id !== 'string' ||
    !UUID_PATTERN.test(value.session_id) ||
    typeof value.state !== 'string' ||
    !MANUAL_CONTROL_STATES.has(value.state) ||
    !isSafeIntegerAtLeast(value.version, 1) ||
    typeof value.handoff_reason !== 'string' ||
    !MANUAL_CONTROL_REASONS.has(value.handoff_reason) ||
    typeof value.packet_digest !== 'string' ||
    !SHA256_PATTERN.test(value.packet_digest) ||
    ![null, 'manual_application_submit'].includes(
      value.control_action as string | null,
    ) ||
    !isNullableDateString(value.control_expires_at) ||
    !isNullableDateString(value.authorized_at) ||
    !isNullableDateString(value.resolved_at) ||
    ![null, 'confirmed', 'not_submitted'].includes(
      value.resolution as string | null,
    ) ||
    !isDateString(value.created_at) ||
    !isDateString(value.updated_at)
  ) {
    return false;
  }
  if (value.state === 'handoff_ready') {
    return (
      value.control_action === null &&
      value.control_expires_at === null &&
      value.authorized_at === null &&
      value.resolved_at === null &&
      value.resolution === null
    );
  }
  if (value.state === 'control_ready') {
    return (
      value.control_action === 'manual_application_submit' &&
      value.control_expires_at !== null &&
      value.authorized_at !== null &&
      value.resolved_at === null &&
      value.resolution === null
    );
  }
  if (value.state === 'confirmed' || value.state === 'not_submitted') {
    return (
      value.control_action === null &&
      value.control_expires_at === null &&
      value.authorized_at !== null &&
      value.resolved_at !== null &&
      value.resolution === value.state
    );
  }
  return (
    value.control_action === null &&
    value.control_expires_at === null &&
    value.resolved_at === null &&
    value.resolution === null
  );
};

const isManualControlAuthorization = (
  value: unknown,
): value is AnansiManualControlAuthorization =>
  isExactRecord(value, [
    'attempt',
    'control',
    'session_id',
    'session_state',
    'session_state_version',
    'control_generation',
    'control_url',
    'expires_at',
  ]) &&
  isExactApplicationAttemptOutput(value.attempt) &&
  isManualApplicationControl(value.control) &&
  typeof value.session_id === 'string' &&
  UUID_PATTERN.test(value.session_id) &&
  value.session_state === 'control_ready' &&
  isSafeIntegerAtLeast(value.session_state_version, 1) &&
  isSafeIntegerAtLeast(value.control_generation, 1) &&
  isBoundedText(value.control_url, 2_048) &&
  isDateString(value.expires_at);

const isManualControlResolution = (
  value: unknown,
): value is AnansiManualControlResolution =>
  isExactRecord(value, ['attempt', 'control', 'session']) &&
  isExactApplicationAttemptOutput(value.attempt) &&
  isManualApplicationControl(value.control) &&
  isExactRemoteBrowserSession(value.session);

const isApplicationStart = (value: unknown): value is AnansiApplicationStart =>
  isRecord(value) &&
  isApplicationAttempt(value.attempt) &&
  typeof value.created === 'boolean' &&
  typeof value.page_url === 'string' &&
  value.page_url.length >= 1;

const isRemoteBrowserSessionStart = (
  value: unknown,
): value is AnansiRemoteBrowserSessionStart =>
  isRecord(value) &&
  isRemoteBrowserSession(value.session) &&
  typeof value.created === 'boolean';

const isRemoteBrowserReview = (
  value: unknown,
): value is AnansiRemoteBrowserReview =>
  isRecord(value) &&
  isRemoteBrowserSession(value.session) &&
  typeof value.review_url === 'string' &&
  value.review_url.length >= 1 &&
  isDateString(value.expires_at);

const parseResponse = <T>(
  value: unknown,
  isValid: (candidate: unknown) => candidate is T,
  responseName: string,
): T => {
  if (!isValid(value)) {
    throw new Error(`ANANSI: invalid ${responseName} response`);
  }
  return value;
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

const getReadinessDetailMessage = (detail: unknown): string | undefined => {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    return undefined;
  }
  const record = detail as Record<string, unknown>;
  if (
    record.code !== 'readiness_incomplete' ||
    typeof record.dimensions !== 'object' ||
    record.dimensions === null ||
    Array.isArray(record.dimensions)
  ) {
    return undefined;
  }

  const dimensions = record.dimensions as Record<string, unknown>;
  const actions: string[] = [];
  if (dimensions.profile !== 'profile_ready') {
    actions.push('add a resume and target roles');
  }
  if (dimensions.gmail !== 'gmail_ready') {
    actions.push('connect a healthy main Gmail account');
  }
  if (dimensions.calendar !== 'calendar_ready') {
    actions.push('grant Gmail calendar access');
  }
  if (dimensions.browser !== 'browser_ready') {
    actions.push('pair Chrome or enable a healthy remote browser');
  }

  return actions.length > 0
    ? `Finish setup: ${actions.join('; ')}.`
    : 'Finish setup before going live.';
};

const getAnansiApiError = async (
  path: string,
  response: Response,
): Promise<AnansiApiError> => {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      if (typeof body.detail === 'string') {
        return new AnansiApiError(path, response.status, body.detail);
      }
      const readinessMessage = getReadinessDetailMessage(body.detail);
      if (readinessMessage !== undefined) {
        return new AnansiApiError(path, response.status, readinessMessage);
      }
    }
  } catch {
    // A non-JSON error response still retains its status/path fallback below.
  }

  return new AnansiApiError(path, response.status);
};

// ANANSI PATCH: Core is a separate REST service reached with the signed-in
// user's Twenty access token. Those tokens expire after 30 minutes
// (ACCESS_TOKEN_EXPIRES_IN) and are only refreshed reactively inside Apollo's
// error link on GraphQL calls -- a path these plain `fetch` calls never take.
// Without this, a wizard or Profile page that sits past the access-token
// lifetime sends a dead bearer, every Core call fails 401 with no recovery,
// and the wizard misreads that 401 as "workspace not provisioned". Mirror
// Apollo: on a 401, renew once through the shared single-flight renewer and
// retry with the fresh token from state. Idempotent Core routes make the one
// retry safe.
const anansiFetchWithRenew = async (
  accessToken: string,
  attempt: (token: string) => Promise<Response>,
): Promise<Response> => {
  const response = await attempt(accessToken);
  if (response.status !== 401) {
    return response;
  }

  const renewed = await ensureTokenRenewed(jotaiStore);
  if (!renewed) {
    return response;
  }

  const freshToken = jotaiStore.get(tokenPairState.atom)
    ?.accessOrWorkspaceAgnosticToken.token;
  if (!isDefined(freshToken) || freshToken === accessToken) {
    return response;
  }

  return attempt(freshToken);
};

const anansiApiRequest = async <T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await anansiFetchWithRenew(accessToken, (token) =>
    fetch(`${ANANSI_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    }),
  );

  if (!response.ok) {
    throw await getAnansiApiError(path, response);
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
    tourStateRevision = (await getAnansiMeWithTimeout(accessToken))
      .tour_state_revision;
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
): Promise<{
  ok: boolean;
  profile_version: number;
  parsed: unknown | null;
}> => {
  const response = await anansiFetchWithRenew(accessToken, (token) => {
    const body = new FormData();
    body.append('file', file);
    return fetch(`${ANANSI_API_URL}/v1/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
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

export const getAnansiReadiness = async (
  accessToken: string,
): Promise<AnansiReadinessStatus> =>
  parseResponse(
    await anansiApiRequest<unknown>('/v1/readiness', accessToken),
    isReadinessStatus,
    'readiness',
  );

export const postAnansiOnboardingComplete = async (
  accessToken: string,
  authorizationMode?: AnansiAuthorizationMode,
): Promise<{ mode: 'live'; already: boolean }> =>
  parseResponse(
    await anansiApiRequest<unknown>('/v1/onboarding/complete', accessToken, {
      method: 'POST',
      body: JSON.stringify({ authorization_mode: authorizationMode }),
    }),
    isOnboardingComplete,
    'onboarding completion',
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

export const putAnansiAutomationMode = (
  accessToken: string,
  mode: AnansiAuthorizationMode,
  expectedVersion: number,
): Promise<AnansiAutomationModeResponse> =>
  anansiApiRequest<AnansiAutomationModeResponse>(
    '/v1/automation',
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ mode, expected_version: expectedVersion }),
    },
  );

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

export const getAnansiGmailStatus = (
  accessToken: string,
): Promise<AnansiGmailStatus> =>
  anansiApiRequest<AnansiGmailStatus>(
    '/v1/connections/gmail/status',
    accessToken,
  );

export const startAnansiGmailOAuth = (
  accessToken: string,
  returnTarget: 'onboarding' | 'profile',
  accountBehavior: 'default_account' | 'choose_account',
): Promise<AnansiGmailOAuthStart> =>
  anansiApiRequest<AnansiGmailOAuthStart>(
    '/v1/connections/gmail/oauth/start',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        return_target: returnTarget,
        account_behavior: accountBehavior,
      }),
    },
  );

export const completeAnansiGmailOAuth = (
  accessToken: string,
  completionNonce: string,
): Promise<AnansiGmailOAuthComplete> =>
  anansiApiRequest<AnansiGmailOAuthComplete>(
    '/v1/connections/gmail/oauth/complete',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ completion_nonce: completionNonce }),
    },
  );

export const setAnansiPrimaryGmail = (
  accessToken: string,
  connectionId: string,
): Promise<AnansiGmailConnection> =>
  anansiApiRequest<AnansiGmailConnection>(
    '/v1/connections/gmail/primary',
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ connection_id: connectionId }),
    },
  );

export const disconnectAnansiGmail = (
  accessToken: string,
  connectionId: string,
): Promise<AnansiGmailConnection> =>
  anansiApiRequest<AnansiGmailConnection>(
    `/v1/connections/gmail/${connectionId}`,
    accessToken,
    { method: 'DELETE' },
  );

export const getAnansiBrowserPreferences = async (
  accessToken: string,
): Promise<AnansiBrowserPreference> =>
  parseResponse(
    await anansiApiRequest<unknown>('/v1/browser/preferences', accessToken),
    isBrowserPreference,
    'browser preferences',
  );

export const patchAnansiBrowserPreferences = async (
  accessToken: string,
  payload: AnansiBrowserPreferencePatch,
): Promise<AnansiBrowserPreference> =>
  parseResponse(
    await anansiApiRequest<unknown>('/v1/browser/preferences', accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    isBrowserPreference,
    'browser preferences',
  );

export const getAnansiBrowserDevices = async (
  accessToken: string,
): Promise<AnansiBrowserDevice[]> => {
  const value = await anansiApiRequest<unknown>(
    '/v1/browser/devices',
    accessToken,
  );
  if (!Array.isArray(value) || !value.every(isBrowserDevice)) {
    throw new Error('ANANSI: invalid browser devices response');
  }
  return value;
};

export const startAnansiBrowserPairing = async (
  accessToken: string,
  extensionId: string,
): Promise<AnansiBrowserPairingStart> =>
  parseResponse(
    await anansiApiRequest<unknown>('/v1/browser/pairing/start', accessToken, {
      method: 'POST',
      body: JSON.stringify({ extension_id: extensionId }),
    }),
    isBrowserPairingStart,
    'browser pairing',
  );

export const revokeAnansiBrowserDevice = async (
  accessToken: string,
  deviceId: string,
  expectedVersion: number,
): Promise<AnansiBrowserDevice> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/browser/devices/${deviceId}/revoke`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ expected_version: expectedVersion }),
      },
    ),
    isBrowserDevice,
    'browser device',
  );

export const startAnansiJobApplication = async (
  accessToken: string,
  jobId: string,
): Promise<AnansiApplicationStart> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/jobs/${jobId}/start`,
      accessToken,
      { method: 'POST' },
    ),
    isApplicationStart,
    'application start',
  );

export const getAnansiApplicationAttempt = async (
  accessToken: string,
  attemptId: string,
): Promise<AnansiApplicationAttempt> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}`,
      accessToken,
    ),
    isApplicationAttempt,
    'application attempt',
  );

export const getAnansiApplicationAttemptOutput = async (
  accessToken: string,
  attemptId: string,
): Promise<AnansiApplicationAttemptOutput> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}`,
      accessToken,
    ),
    isExactApplicationAttemptOutput,
    'application attempt output',
  );

export const getAnansiManualApplicationControl = async (
  accessToken: string,
  attemptId: string,
): Promise<AnansiManualApplicationControl> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/manual-control`,
      accessToken,
    ),
    isManualApplicationControl,
    'manual application control',
  );

export const authorizeAnansiManualApplicationControl = async (
  accessToken: string,
  attemptId: string,
  input: AnansiManualControlAuthorizationInput,
): Promise<AnansiManualControlAuthorization> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/manual-control/authorize`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          expected_attempt_version: input.expected_attempt_version,
          expected_session_version: input.expected_session_version,
          expected_control_version: input.expected_control_version,
          packet_digest: input.packet_digest,
          authorization_key: input.authorization_key,
        }),
      },
    ),
    isManualControlAuthorization,
    'manual application control authorization',
  );

export const resolveAnansiManualApplicationControl = async (
  accessToken: string,
  attemptId: string,
  input: AnansiManualControlResolutionInput,
): Promise<AnansiManualControlResolution> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/manual-control/resolve`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          expected_attempt_version: input.expected_attempt_version,
          expected_session_version: input.expected_session_version,
          expected_control_version: input.expected_control_version,
          packet_digest: input.packet_digest,
          authorization_key: input.authorization_key,
          outcome: input.outcome,
        }),
      },
    ),
    isManualControlResolution,
    'manual application control resolution',
  );

export const getAnansiApplicationReview = async (
  accessToken: string,
  attemptId: string,
): Promise<AnansiApplicationReview> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/review`,
      accessToken,
    ),
    isApplicationReview,
    'application review',
  );

const mutateAnansiApplicationReview = async (
  accessToken: string,
  attemptId: string,
  action: 'approve' | 'reject',
  expectedVersion: number,
  packetDigest: string,
): Promise<AnansiApplicationReview> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/review/${action}`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          expected_version: expectedVersion,
          packet_digest: packetDigest,
        }),
      },
    ),
    isApplicationReview,
    'application review',
  );

export const approveAnansiApplicationReview = (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
  packetDigest: string,
): Promise<AnansiApplicationReview> =>
  mutateAnansiApplicationReview(
    accessToken,
    attemptId,
    'approve',
    expectedVersion,
    packetDigest,
  );

export const rejectAnansiApplicationReview = (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
  packetDigest: string,
): Promise<AnansiApplicationReview> =>
  mutateAnansiApplicationReview(
    accessToken,
    attemptId,
    'reject',
    expectedVersion,
    packetDigest,
  );

export const startAnansiRemoteBrowserSession = async (
  accessToken: string,
  attemptId: string,
  expectedAttemptVersion: number,
  callerRequestKey: string,
): Promise<AnansiRemoteBrowserSessionStart> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/remote/session`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          expected_attempt_version: expectedAttemptVersion,
          caller_request_key: callerRequestKey,
        }),
      },
    ),
    isRemoteBrowserSessionStart,
    'remote browser session',
  );

export const getAnansiRemoteBrowserSession = async (
  accessToken: string,
  attemptId: string,
): Promise<AnansiRemoteBrowserSession> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/remote/session`,
      accessToken,
    ),
    isRemoteBrowserSession,
    'remote browser session',
  );

export const stopAnansiRemoteBrowserSession = async (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
): Promise<AnansiRemoteBrowserSession> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/remote/session/stop`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ expected_version: expectedVersion }),
      },
    ),
    isRemoteBrowserSession,
    'remote browser session',
  );

export const createAnansiRemoteBrowserReview = async (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
): Promise<AnansiRemoteBrowserReview> =>
  parseResponse(
    await anansiApiRequest<unknown>(
      `/v1/applications/attempts/${attemptId}/remote/session/review`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ expected_version: expectedVersion }),
      },
    ),
    isRemoteBrowserReview,
    'remote browser review',
  );

const mutateAnansiApplicationAttempt = async (
  path: string,
  accessToken: string,
  expectedVersion: number,
): Promise<AnansiApplicationAttempt> =>
  parseResponse(
    await anansiApiRequest<unknown>(path, accessToken, {
      method: 'POST',
      body: JSON.stringify({ expected_version: expectedVersion }),
    }),
    isApplicationAttempt,
    'application attempt',
  );

export const confirmAnansiApplicationAttempt = (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
): Promise<AnansiApplicationAttempt> =>
  mutateAnansiApplicationAttempt(
    `/v1/applications/attempts/${attemptId}/manual-confirm`,
    accessToken,
    expectedVersion,
  );

export const retryAnansiApplicationAttempt = (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
): Promise<AnansiApplicationAttempt> =>
  mutateAnansiApplicationAttempt(
    `/v1/applications/attempts/${attemptId}/retry`,
    accessToken,
    expectedVersion,
  );

export const cancelAnansiApplicationAttempt = (
  accessToken: string,
  attemptId: string,
  expectedVersion: number,
): Promise<AnansiApplicationAttempt> =>
  mutateAnansiApplicationAttempt(
    `/v1/applications/attempts/${attemptId}/cancel`,
    accessToken,
    expectedVersion,
  );
