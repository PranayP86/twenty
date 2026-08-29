import { ANANSI_BROWSER_EXTENSION_ID } from '@/auth/constants/AnansiBrowserExtensionId';
import { ANANSI_BROWSER_PUBLIC_ORIGIN } from '@/auth/constants/AnansiBrowserPublicOrigin';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  type AnansiApplicationAttempt,
  AnansiApiError,
  type AnansiApplicationReview,
  type AnansiApplicationReviewAnswerValue,
  type AnansiManualApplicationControl,
  type AnansiManualControlAuthorization,
  type AnansiManualControlAuthorizationInput,
  type AnansiManualControlResolution,
  type AnansiManualControlResolutionInput,
  type AnansiRemoteBrowserSession,
  approveAnansiApplicationReview,
  authorizeAnansiManualApplicationControl,
  cancelAnansiApplicationAttempt,
  confirmAnansiApplicationAttempt,
  createAnansiRemoteBrowserReview,
  getAnansiApplicationAttempt,
  getAnansiApplicationAttemptOutput,
  getAnansiApplicationReview,
  getAnansiManualApplicationControl,
  getAnansiRemoteBrowserSession,
  rejectAnansiApplicationReview,
  resolveAnansiManualApplicationControl,
  retryAnansiApplicationAttempt,
  startAnansiJobApplication,
  startAnansiRemoteBrowserSession,
  stopAnansiRemoteBrowserSession,
} from '~/pages/anansi/anansiProfileApi';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const EXTENSION_STATUS_TIMEOUT_MS = 5_000;
const RUN_RESPONSE_TIMEOUT_MS = 180_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RUNNABLE_STATES = new Set(['queued', 'filling']);
const ATTEMPT_STATES_WITH_REVIEW = new Set([
  'review_ready',
  'handoff_ready',
  'submit_reserved',
  'submitted_unconfirmed',
  'needs_user',
  'confirmed',
]);
const RUN_STATUSES = new Set([
  'assist_ready',
  'authorization_unconfirmed',
  'blocked',
  'busy',
  'confirmed',
  'failed',
  'needs_user',
  'review_ready',
  'submitted_unconfirmed',
]);
const RUN_STATUSES_WITHOUT_VERSION = new Set([
  'assist_ready',
  'busy',
  'failed',
]);
const SAFE_SEGMENT = '[a-z0-9](?:[a-z0-9._~-]{0,198}[a-z0-9])?';
const SUPPORTED_APPLICATION_URL_PATTERNS = [
  new RegExp(
    `^https://job-boards\\.greenhouse\\.io/${SAFE_SEGMENT}/jobs/${SAFE_SEGMENT}$`,
    'u',
  ),
  new RegExp(
    `^https://jobs\\.lever\\.co/${SAFE_SEGMENT}/${SAFE_SEGMENT}$`,
    'u',
  ),
  new RegExp(
    `^https://jobs\\.ashbyhq\\.com/${SAFE_SEGMENT}/${SAFE_SEGMENT}$`,
    'u',
  ),
  /^https:\/\/www\.linkedin\.com\/jobs\/view\/[1-9][0-9]{0,31}$/u,
  /^https:\/\/www\.indeed\.com\/viewjob\?jk=[0-9a-f]{4,64}$/u,
  /^https:\/\/www\.dice\.com\/job-detail\/[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u,
  /^https:\/\/wellfound\.com\/jobs\/[1-9][0-9]{0,31}$/u,
];
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
const REMOTE_SESSION_RUNNING_STATES = new Set([
  'pending',
  'starting',
  'running',
  'review_ready',
  'handoff_ready',
  'control_ready',
]);
const REMOTE_SESSION_STOPPABLE_STATES = new Set([
  'pending',
  'starting',
  'running',
  'review_ready',
  'handoff_ready',
  'control_ready',
  'stopping',
]);
const REVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const StyledApplicationAction = styled.div`
  position: relative;
`;

const StyledApplicationStatus = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  bottom: calc(100% + ${themeCssVariables.spacing[3]});
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  max-height: min(640px, 70vh);
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
  position: absolute;
  right: 0;
  width: min(360px, calc(100vw - ${themeCssVariables.spacing[8]}));
  z-index: 3;
`;

const StyledStatusHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledStatusTitle = styled.strong`
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledStatusList = styled.dl`
  display: grid;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  margin: 0;

  dt {
    color: ${themeCssVariables.font.color.secondary};
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const StyledReviewItems = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledReviewItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledReviewMetadata = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledPacketDigest = styled.code`
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  overflow-wrap: anywhere;
`;

const StyledManualControlWarning = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledStatusActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

type ChromeRuntimePort = {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ): void;
};

type ApplicationRunResponse = {
  ok: true;
  status: string;
  attemptStateVersion?: number;
};

type LocalBrowserStatus = {
  ok: true;
  paired: true;
  deviceId: string;
  userId: string;
  workspaceOrigin: string;
};

class BrowserExtensionUnavailable extends Error {}

const getChromeRuntime = (): ChromeRuntimePort | undefined =>
  (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: ChromeRuntimePort };
    }
  ).chrome?.runtime;

const hasUnsafeUrlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 32 || codePoint === 127 || character === '\\';
  });

const supportedApplicationPage = (value: string | null): value is string =>
  value !== null &&
  value.length >= 1 &&
  value.length <= 2048 &&
  !hasUnsafeUrlCharacter(value) &&
  SUPPORTED_APPLICATION_URL_PATTERNS.some((pattern) => pattern.test(value));

const isRunResponse = (value: unknown): value is ApplicationRunResponse => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const response = value as Partial<ApplicationRunResponse>;
  const hasValidStateVersion =
    Number.isSafeInteger(response.attemptStateVersion) &&
    (response.attemptStateVersion ?? 0) >= 1;
  return (
    response.ok === true &&
    typeof response.status === 'string' &&
    RUN_STATUSES.has(response.status) &&
    (RUN_STATUSES_WITHOUT_VERSION.has(response.status)
      ? response.attemptStateVersion === undefined || hasValidStateVersion
      : hasValidStateVersion)
  );
};

const isLocalBrowserStatus = (
  value: unknown,
  expectedUserId: string,
): value is LocalBrowserStatus => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const response = value as Partial<LocalBrowserStatus>;
  return (
    response.ok === true &&
    response.paired === true &&
    typeof response.deviceId === 'string' &&
    UUID_PATTERN.test(response.deviceId) &&
    response.userId === expectedUserId &&
    response.workspaceOrigin === globalThis.location.origin
  );
};

const checkLocalBrowser = (
  expectedUserId: string,
): Promise<LocalBrowserStatus> => {
  const runtime = getChromeRuntime();
  if (runtime === undefined || typeof runtime.sendMessage !== 'function') {
    return Promise.reject(new BrowserExtensionUnavailable());
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new BrowserExtensionUnavailable());
      }
    }, EXTENSION_STATUS_TIMEOUT_MS);
    const finish = (response: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      if (runtime.lastError !== undefined) {
        reject(new BrowserExtensionUnavailable());
        return;
      }
      if (!isLocalBrowserStatus(response, expectedUserId)) {
        const candidate = response as {
          paired?: unknown;
          userId?: unknown;
        } | null;
        reject(
          candidate?.paired === false ||
            (candidate?.paired === true &&
              typeof candidate.userId === 'string' &&
              UUID_PATTERN.test(candidate.userId) &&
              candidate.userId !== expectedUserId)
            ? new BrowserExtensionUnavailable()
            : new Error('browser status changed'),
        );
        return;
      }
      resolve(response);
    };
    try {
      runtime.sendMessage(
        ANANSI_BROWSER_EXTENSION_ID,
        { type: 'anansi.browser.status.v1' },
        finish,
      );
    } catch {
      settled = true;
      globalThis.clearTimeout(timeoutId);
      reject(new BrowserExtensionUnavailable());
    }
  });
};

const runApplicationInExtension = (
  attemptId: string,
  pageUrl: string,
): Promise<ApplicationRunResponse> => {
  const runtime = getChromeRuntime();
  if (runtime === undefined || typeof runtime.sendMessage !== 'function') {
    throw new Error('browser extension unavailable');
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('browser extension unavailable'));
      }
    }, RUN_RESPONSE_TIMEOUT_MS);
    const finish = (response: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      if (runtime.lastError !== undefined || !isRunResponse(response)) {
        reject(new Error('browser extension unavailable'));
        return;
      }
      resolve(response);
    };
    try {
      runtime.sendMessage(
        ANANSI_BROWSER_EXTENSION_ID,
        { type: 'anansi.browser.run.v1', attemptId, pageUrl },
        finish,
      );
    } catch {
      settled = true;
      globalThis.clearTimeout(timeoutId);
      reject(new Error('browser extension unavailable'));
    }
  });
};

const validAttemptRuntime = (
  value: unknown,
): value is AnansiApplicationAttempt['runtime'] =>
  value === 'extension' || value === 'remote';

const sameApplicationAttempt = (
  candidate: AnansiApplicationAttempt,
  current: AnansiApplicationAttempt,
): boolean =>
  candidate.id === current.id &&
  candidate.job_id === current.job_id &&
  candidate.runtime === current.runtime;

const validAttemptMutation = (
  candidate: AnansiApplicationAttempt,
  current: AnansiApplicationAttempt,
  expectedState: string,
): boolean =>
  sameApplicationAttempt(candidate, current) &&
  candidate.state === expectedState &&
  candidate.state_version === current.state_version + 1;

const isRemoteBrowserSession = (
  value: unknown,
  attemptId: string,
): value is AnansiRemoteBrowserSession => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const session = value as Partial<AnansiRemoteBrowserSession>;
  return (
    typeof session.id === 'string' &&
    UUID_PATTERN.test(session.id) &&
    session.attempt_id === attemptId &&
    typeof session.state === 'string' &&
    REMOTE_SESSION_STATES.has(session.state) &&
    Number.isSafeInteger(session.state_version) &&
    (session.state_version ?? 0) >= 1 &&
    typeof session.review_generation === 'number' &&
    Number.isSafeInteger(session.review_generation) &&
    session.review_generation >= 0 &&
    typeof session.recipe_id === 'string' &&
    session.recipe_id.length >= 1 &&
    typeof session.recipe_version === 'string' &&
    session.recipe_version.length >= 1 &&
    typeof session.recipe_digest === 'string' &&
    /^[0-9a-f]{64}$/u.test(session.recipe_digest)
  );
};

const createCallerRequestKey = (): string => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
};

const isFutureExpiry = (value: string): boolean => {
  const expiry = Date.parse(value);
  return !Number.isNaN(expiry) && expiry > Date.now();
};

const isOneUseReviewUrl = (value: string, sessionId: string): boolean => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.origin !== ANANSI_BROWSER_PUBLIC_ORIGIN ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== `/review/${sessionId}` ||
      url.search !== ''
    ) {
      return false;
    }
    const prefix = '#anansi_review_token=';
    return (
      url.hash.startsWith(prefix) &&
      REVIEW_TOKEN_PATTERN.test(url.hash.slice(prefix.length))
    );
  } catch {
    return false;
  }
};

type ManualControlAuthorizationTuple = Readonly<{
  ownerKey: string;
  recordOwnerKey: string;
  attemptId: string;
  sessionId: string;
  controlId: string;
  packetDigest: string;
  expectedAttemptVersion: number;
  expectedSessionVersion: number;
  expectedControlVersion: number;
  authorizationKey: string;
}>;

type ManualControlResolutionTuple = Readonly<{
  ownerKey: string;
  recordOwnerKey: string;
  attemptId: string;
  sessionId: string;
  controlId: string;
  body: Readonly<AnansiManualControlResolutionInput>;
}>;

type ManualControlAuthorizationReceipt = Readonly<{
  attemptVersion: number;
  sessionVersion: number;
  controlVersion: number;
}>;

type RetainedManualControlAuthorization = Readonly<{
  tuple: ManualControlAuthorizationTuple;
  receipt?: ManualControlAuthorizationReceipt;
}>;

type CompletedRetainedManualControlAuthorization = Readonly<{
  tuple: ManualControlAuthorizationTuple;
  receipt: ManualControlAuthorizationReceipt;
}>;

const MANUAL_CONTROL_STORAGE_PREFIX = 'anansi.manual-control.v1:';
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

const isStoredManualControlAuthorization = (
  value: unknown,
): value is RetainedManualControlAuthorization => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const retained = value as {
    tuple?: unknown;
    receipt?: unknown;
  };
  const retainedKeys = Object.keys(retained);
  if (
    ![1, 2].includes(retainedKeys.length) ||
    retainedKeys.some((key) => !['tuple', 'receipt'].includes(key)) ||
    !retainedKeys.includes('tuple') ||
    retained.tuple === null ||
    typeof retained.tuple !== 'object' ||
    Array.isArray(retained.tuple)
  ) {
    return false;
  }
  const tuple = retained.tuple as Partial<ManualControlAuthorizationTuple>;
  const validVersion = (candidate: unknown): candidate is number =>
    Number.isSafeInteger(candidate) && (candidate as number) >= 1;
  const validTuple =
    Object.keys(tuple).length === 10 &&
    typeof tuple.ownerKey === 'string' &&
    tuple.ownerKey.length >= 1 &&
    typeof tuple.recordOwnerKey === 'string' &&
    tuple.recordOwnerKey.length >= 1 &&
    typeof tuple.attemptId === 'string' &&
    UUID_PATTERN.test(tuple.attemptId) &&
    typeof tuple.sessionId === 'string' &&
    UUID_PATTERN.test(tuple.sessionId) &&
    typeof tuple.controlId === 'string' &&
    UUID_PATTERN.test(tuple.controlId) &&
    typeof tuple.packetDigest === 'string' &&
    HEX_DIGEST_PATTERN.test(tuple.packetDigest) &&
    validVersion(tuple.expectedAttemptVersion) &&
    validVersion(tuple.expectedSessionVersion) &&
    validVersion(tuple.expectedControlVersion) &&
    typeof tuple.authorizationKey === 'string' &&
    HEX_DIGEST_PATTERN.test(tuple.authorizationKey);
  if (!validTuple) {
    return false;
  }
  if (!retainedKeys.includes('receipt')) {
    return true;
  }
  if (
    retained.receipt === null ||
    typeof retained.receipt !== 'object' ||
    Array.isArray(retained.receipt)
  ) {
    return false;
  }
  const receipt =
    retained.receipt as Partial<ManualControlAuthorizationReceipt>;
  return (
    Object.keys(receipt).length === 3 &&
    validVersion(receipt.attemptVersion) &&
    validVersion(receipt.sessionVersion) &&
    validVersion(receipt.controlVersion) &&
    receipt.attemptVersion === tuple.expectedAttemptVersion + 1 &&
    receipt.sessionVersion === tuple.expectedSessionVersion + 1 &&
    receipt.controlVersion === tuple.expectedControlVersion + 1
  );
};

const manualControlStorageKey = (attemptId: string): string =>
  `${MANUAL_CONTROL_STORAGE_PREFIX}${attemptId}`;

const readRetainedManualControlAuthorization = (
  attemptId: string,
): RetainedManualControlAuthorization | undefined => {
  try {
    const key = manualControlStorageKey(attemptId);
    const serialized = globalThis.sessionStorage.getItem(key);
    if (serialized === null) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(serialized);
    if (!isStoredManualControlAuthorization(parsed)) {
      globalThis.sessionStorage.removeItem(key);
      return undefined;
    }
    return Object.freeze({
      tuple: Object.freeze(parsed.tuple),
      ...(parsed.receipt === undefined
        ? {}
        : { receipt: Object.freeze(parsed.receipt) }),
    });
  } catch {
    return undefined;
  }
};

const retainManualControlAuthorization = (
  retained: RetainedManualControlAuthorization,
): void => {
  try {
    globalThis.sessionStorage.setItem(
      manualControlStorageKey(retained.tuple.attemptId),
      JSON.stringify(retained),
    );
  } catch {
    // Same-document resolution remains available through component refs.
  }
};

const removeRetainedManualControlAuthorization = (attemptId: string): void => {
  try {
    globalThis.sessionStorage.removeItem(manualControlStorageKey(attemptId));
  } catch {
    // Storage can be unavailable without weakening current component ownership.
  }
};

const clearRetainedManualControlAuthorizationsForOwner = (
  retainedOwnerKey: string,
): void => {
  try {
    for (
      let index = globalThis.sessionStorage.length - 1;
      index >= 0;
      index -= 1
    ) {
      const key = globalThis.sessionStorage.key(index);
      if (key === null || !key.startsWith(MANUAL_CONTROL_STORAGE_PREFIX)) {
        continue;
      }
      const attemptId = key.slice(MANUAL_CONTROL_STORAGE_PREFIX.length);
      const retained = readRetainedManualControlAuthorization(attemptId);
      if (
        retained === undefined ||
        retained.tuple.ownerKey === retainedOwnerKey
      ) {
        globalThis.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable without weakening current component ownership.
  }
};

const createManualControlAuthorizationTuple = (
  ownerKey: string,
  recordOwnerKey: string,
  attempt: AnansiApplicationAttempt,
  session: AnansiRemoteBrowserSession,
  control: AnansiManualApplicationControl,
): ManualControlAuthorizationTuple | undefined => {
  if (
    attempt.state !== 'handoff_ready' ||
    attempt.runtime !== 'remote' ||
    session.attempt_id !== attempt.id ||
    session.state !== 'handoff_ready' ||
    control.attempt_id !== attempt.id ||
    control.session_id !== session.id ||
    control.state !== 'handoff_ready'
  ) {
    return undefined;
  }
  return Object.freeze({
    ownerKey,
    recordOwnerKey,
    attemptId: attempt.id,
    sessionId: session.id,
    controlId: control.id,
    packetDigest: control.packet_digest,
    expectedAttemptVersion: attempt.state_version,
    expectedSessionVersion: session.state_version,
    expectedControlVersion: control.version,
    authorizationKey: createCallerRequestKey(),
  });
};

const authorizationInput = (
  tuple: ManualControlAuthorizationTuple,
): AnansiManualControlAuthorizationInput => ({
  expected_attempt_version: tuple.expectedAttemptVersion,
  expected_session_version: tuple.expectedSessionVersion,
  expected_control_version: tuple.expectedControlVersion,
  packet_digest: tuple.packetDigest,
  authorization_key: tuple.authorizationKey,
});

const isValidManualControlAuthorization = (
  response: AnansiManualControlAuthorization,
  tuple: ManualControlAuthorizationTuple,
): boolean =>
  response.attempt.id === tuple.attemptId &&
  response.attempt.runtime === 'remote' &&
  response.attempt.runtime_session_id === tuple.sessionId &&
  response.attempt.state === 'submitted_unconfirmed' &&
  response.attempt.state_version === tuple.expectedAttemptVersion + 1 &&
  response.attempt.outward_observed_at !== null &&
  response.attempt.submitted_at !== null &&
  response.attempt.confirmed_at === null &&
  response.attempt.failure_code === 'submission_outcome_unknown' &&
  response.control.id === tuple.controlId &&
  response.control.attempt_id === tuple.attemptId &&
  response.control.session_id === tuple.sessionId &&
  response.control.packet_digest === tuple.packetDigest &&
  response.control.state === 'control_ready' &&
  response.control.version === tuple.expectedControlVersion + 1 &&
  response.control.control_action === 'manual_application_submit' &&
  response.control.control_expires_at === response.expires_at &&
  response.control.authorized_at !== null &&
  response.control.resolved_at === null &&
  response.control.resolution === null &&
  response.session_id === tuple.sessionId &&
  response.session_state === 'control_ready' &&
  response.session_state_version === tuple.expectedSessionVersion + 1 &&
  isOneUseReviewUrl(response.control_url, tuple.sessionId);

const createManualControlAuthorizationReceipt = (
  response: AnansiManualControlAuthorization,
): ManualControlAuthorizationReceipt =>
  Object.freeze({
    attemptVersion: response.attempt.state_version,
    sessionVersion: response.session_state_version,
    controlVersion: response.control.version,
  });

const isExactRetainedManualControlAuthorization = (
  retained: CompletedRetainedManualControlAuthorization,
  ownerKey: string,
  recordOwnerKey: string,
  attempt: AnansiApplicationAttempt,
  session: AnansiRemoteBrowserSession,
  control: AnansiManualApplicationControl,
): boolean => {
  const { tuple, receipt } = retained;
  return (
    tuple.ownerKey === ownerKey &&
    tuple.recordOwnerKey === recordOwnerKey &&
    receipt.attemptVersion === tuple.expectedAttemptVersion + 1 &&
    receipt.sessionVersion === tuple.expectedSessionVersion + 1 &&
    receipt.controlVersion === tuple.expectedControlVersion + 1 &&
    attempt.id === tuple.attemptId &&
    attempt.runtime === 'remote' &&
    attempt.state === 'submitted_unconfirmed' &&
    attempt.state_version === receipt.attemptVersion &&
    attempt.outward_observed_at !== null &&
    attempt.submitted_at !== null &&
    attempt.confirmed_at === null &&
    attempt.failure_code === 'submission_outcome_unknown' &&
    session.id === tuple.sessionId &&
    session.attempt_id === tuple.attemptId &&
    session.state === 'control_ready' &&
    session.state_version === receipt.sessionVersion &&
    control.id === tuple.controlId &&
    control.attempt_id === tuple.attemptId &&
    control.session_id === tuple.sessionId &&
    control.packet_digest === tuple.packetDigest &&
    control.state === 'control_ready' &&
    control.version === receipt.controlVersion &&
    control.control_action === 'manual_application_submit' &&
    control.authorized_at !== null &&
    control.resolved_at === null &&
    control.resolution === null
  );
};

const createManualControlResolutionTuple = (
  tuple: ManualControlAuthorizationTuple,
  receipt: ManualControlAuthorizationReceipt,
  outcome: 'confirmed' | 'not_submitted',
): ManualControlResolutionTuple =>
  Object.freeze({
    ownerKey: tuple.ownerKey,
    recordOwnerKey: tuple.recordOwnerKey,
    attemptId: tuple.attemptId,
    sessionId: tuple.sessionId,
    controlId: tuple.controlId,
    body: Object.freeze({
      expected_attempt_version: receipt.attemptVersion,
      expected_session_version: receipt.sessionVersion,
      expected_control_version: receipt.controlVersion,
      packet_digest: tuple.packetDigest,
      authorization_key: tuple.authorizationKey,
      outcome,
    }),
  });

const isValidManualControlResolution = (
  response: AnansiManualControlResolution,
  tuple: ManualControlResolutionTuple,
): boolean => {
  const { body } = tuple;
  const expectedAttemptState =
    body.outcome === 'confirmed' ? 'confirmed' : 'failed';
  return (
    response.attempt.id === tuple.attemptId &&
    response.attempt.runtime === 'remote' &&
    response.attempt.runtime_session_id === tuple.sessionId &&
    response.attempt.state === expectedAttemptState &&
    response.attempt.state_version === body.expected_attempt_version + 1 &&
    response.attempt.outward_observed_at !== null &&
    response.attempt.submitted_at !== null &&
    (body.outcome === 'confirmed'
      ? response.attempt.confirmed_at !== null &&
        response.attempt.failure_code === null &&
        response.attempt.evidence_ref === `manual-control:${tuple.controlId}`
      : response.attempt.confirmed_at === null &&
        response.attempt.failure_code === 'manual_not_submitted') &&
    response.control.id === tuple.controlId &&
    response.control.attempt_id === tuple.attemptId &&
    response.control.session_id === tuple.sessionId &&
    response.control.packet_digest === body.packet_digest &&
    response.control.state === body.outcome &&
    response.control.resolution === body.outcome &&
    response.control.version === body.expected_control_version + 1 &&
    response.control.control_action === null &&
    response.control.control_expires_at === null &&
    response.control.resolved_at !== null &&
    response.session.id === tuple.sessionId &&
    response.session.attempt_id === tuple.attemptId &&
    ['stopping', 'stopped', 'expired'].includes(response.session.state) &&
    [
      body.expected_session_version + 1,
      body.expected_session_version + 2,
    ].includes(response.session.state_version)
  );
};

const remoteStateLabel = (state: string): string => {
  if (state === 'review_ready') {
    return 'Remote browser ready for view-only review';
  }
  if (state === 'handoff_ready') {
    return 'Remote browser needs manual control';
  }
  if (state === 'control_ready') {
    return 'Manual browser control active';
  }
  if (['pending', 'starting', 'running'].includes(state)) {
    return `Remote browser ${state}`;
  }
  return 'Remote browser unavailable';
};

const reviewAnswerLabel = (
  value: AnansiApplicationReviewAnswerValue,
): string => {
  if (value.type === 'boolean') {
    return value.value ? 'Yes' : 'No';
  }
  if (value.type === 'strings') {
    return value.value.join(', ');
  }
  return value.value;
};

const reviewStateLabel = (state: AnansiApplicationReview['state']): string =>
  `${state.slice(0, 1).toUpperCase()}${state.slice(1).replaceAll('_', ' ')}`;

const reviewExpiryLabel = (review: AnansiApplicationReview): string => {
  if (review.approval_expires_at !== null) {
    return new Date(review.approval_expires_at).toLocaleString();
  }
  return review.state === 'pending' ? 'After approval' : 'Not active';
};

const confirmationLabel = (attempt: AnansiApplicationAttempt): string => {
  if (attempt.confirmed_at !== null || attempt.state === 'confirmed') {
    return 'Confirmed';
  }
  if (
    attempt.submitted_at !== null ||
    attempt.outward_observed_at !== null ||
    attempt.state === 'submitted_unconfirmed'
  ) {
    return 'Waiting for confirmation';
  }
  if (attempt.state === 'review_ready') {
    return 'Waiting for application review';
  }
  if (attempt.state === 'handoff_ready') {
    return 'Waiting for explicit manual control authorization';
  }
  return 'Not submitted';
};

const titleForAttempt = (attempt: AnansiApplicationAttempt): string => {
  if (attempt.state === 'confirmed') {
    return 'Application submitted';
  }
  if (attempt.state === 'review_ready') {
    return 'Review application';
  }
  if (attempt.state === 'handoff_ready') {
    return 'Manual control required';
  }
  if (attempt.state === 'submitted_unconfirmed') {
    return 'Confirm after submitting';
  }
  if (attempt.state === 'submit_reserved' || attempt.state === 'prepared') {
    return 'Check application';
  }
  if (attempt.state === 'needs_user') {
    return 'Application needs you';
  }
  if (
    attempt.state === 'failed' &&
    attempt.failure_code === 'manual_not_submitted'
  ) {
    return 'Application not submitted';
  }
  if (['blocked', 'failed', 'cancelled', 'expired'].includes(attempt.state)) {
    return 'Application stopped';
  }
  return 'Fill application';
};

const titleForRunStatus = (status: string): string => {
  if (status === 'confirmed') {
    return 'Application submitted';
  }
  if (status === 'review_ready') {
    return 'Review application';
  }
  if (status === 'submitted_unconfirmed') {
    return 'Confirm after submitting';
  }
  if (status === 'authorization_unconfirmed') {
    return 'Check application';
  }
  if (status === 'assist_ready') {
    return 'Open page, click Anansi, then check here';
  }
  if (status === 'needs_user') {
    return 'Application needs you';
  }
  if (status === 'busy') {
    return 'Application busy';
  }
  return 'Application stopped';
};

const terminalTitle = (title: string): boolean =>
  [
    'Application submitted',
    'Application not submitted',
    'Check application',
    'Application needs you',
    'Application stopped',
  ].includes(title);

export const AnansiApplicationRecordButton = ({
  objectNameSingular,
  recordId,
}: {
  objectNameSingular: string;
  recordId: string;
}) => {
  const anansiId = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: 'anansiId',
  }) as string | null;
  const canonicalUrl = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: 'canonicalUrl',
  }) as string | null;
  const tokenPair = useAtomStateValue(tokenPairState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken.token;
  const currentUserId = currentUser?.id;
  const ownerKey =
    currentUserId && currentWorkspace?.id
      ? `${currentUserId}:${currentWorkspace.id}`
      : undefined;
  const recordOwnerKey = `${objectNameSingular}:${recordId}:${anansiId ?? ''}:${canonicalUrl ?? ''}`;
  const [title, setTitle] = useState('Fill application');
  const [attempt, setAttempt] = useState<AnansiApplicationAttempt>();
  const [review, setReview] = useState<AnansiApplicationReview>();
  const [remoteSession, setRemoteSession] =
    useState<AnansiRemoteBrowserSession>();
  const [manualControl, setManualControl] =
    useState<AnansiManualApplicationControl>();
  const [resolutionOutcome, setResolutionOutcome] = useState<
    'confirmed' | 'not_submitted'
  >();
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(true);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentAttemptRef = useRef(attempt);
  // oxlint-disable-next-line twenty/no-state-useref
  const isMountedRef = useRef(true);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentAccessTokenRef = useRef(accessToken);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentOwnerKeyRef = useRef(ownerKey);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentRecordOwnerKeyRef = useRef(recordOwnerKey);
  // oxlint-disable-next-line twenty/no-state-useref
  const manualAuthorizationTupleRef = useRef<
    ManualControlAuthorizationTuple | undefined
  >(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const manualAuthorizationReceiptRef = useRef<
    ManualControlAuthorizationReceipt | undefined
  >(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const manualResolutionTupleRef = useRef<
    ManualControlResolutionTuple | undefined
  >(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const openedAuthorizationKeyRef = useRef<string | undefined>(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const manualControlWindowRef = useRef<Window | undefined>(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const previousIdentityRef = useRef({ ownerKey, recordOwnerKey });
  // oxlint-disable-next-line twenty/no-state-useref
  const runIdRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const runningRef = useRef(false);

  useEffect(() => {
    currentAttemptRef.current = attempt;
    currentAccessTokenRef.current = accessToken;
    currentOwnerKeyRef.current = ownerKey;
    currentRecordOwnerKeyRef.current = recordOwnerKey;
  }, [accessToken, attempt, ownerKey, recordOwnerKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      runIdRef.current += 1;
      runningRef.current = false;
      const controlWindow = manualControlWindowRef.current;
      manualControlWindowRef.current = undefined;
      if (controlWindow !== undefined && !controlWindow.closed) {
        controlWindow.close();
      }
    };
  }, []);

  useEffect(() => {
    runIdRef.current += 1;
    runningRef.current = false;
    setIsRunning(false);
    const currentAttempt = currentAttemptRef.current;
    setTitle(
      currentAttempt === undefined
        ? 'Fill application'
        : titleForAttempt(currentAttempt),
    );
  }, [accessToken]);

  useEffect(() => {
    const controlWindow = manualControlWindowRef.current;
    manualControlWindowRef.current = undefined;
    if (controlWindow !== undefined && !controlWindow.closed) {
      controlWindow.close();
    }
    const previousIdentity = previousIdentityRef.current;
    if (
      previousIdentity.ownerKey !== undefined &&
      previousIdentity.ownerKey !== ownerKey
    ) {
      clearRetainedManualControlAuthorizationsForOwner(
        previousIdentity.ownerKey,
      );
    }
    previousIdentityRef.current = { ownerKey, recordOwnerKey };
    runIdRef.current += 1;
    runningRef.current = false;
    setIsRunning(false);
    setIsStatusOpen(true);
    setAttempt(undefined);
    setReview(undefined);
    setRemoteSession(undefined);
    setManualControl(undefined);
    setResolutionOutcome(undefined);
    setConfirmArmed(false);
    setTitle('Fill application');
    manualAuthorizationTupleRef.current = undefined;
    manualAuthorizationReceiptRef.current = undefined;
    manualResolutionTupleRef.current = undefined;
    openedAuthorizationKeyRef.current = undefined;
  }, [ownerKey, recordOwnerKey]);

  const syncApplicationReview = useCallback(
    async (
      targetAttempt: AnansiApplicationAttempt,
      requestAccessToken: string,
      isCurrentRequest: () => boolean,
    ): Promise<AnansiApplicationReview | undefined> => {
      if (!ATTEMPT_STATES_WITH_REVIEW.has(targetAttempt.state)) {
        if (isCurrentRequest()) {
          setReview(undefined);
        }
        return undefined;
      }
      try {
        const fetchedReview = await getAnansiApplicationReview(
          requestAccessToken,
          targetAttempt.id,
        );
        if (
          fetchedReview.attempt_id !== targetAttempt.id ||
          !isCurrentRequest()
        ) {
          return undefined;
        }
        setReview(fetchedReview);
        return fetchedReview;
      } catch {
        if (isCurrentRequest()) {
          setReview(undefined);
        }
        return undefined;
      }
    },
    [],
  );

  const acceptManualApplicationHandoff = useCallback(
    (
      targetAttempt: AnansiApplicationAttempt,
      targetSession: AnansiRemoteBrowserSession,
      targetControl: AnansiManualApplicationControl,
      isCurrentRequest: () => boolean,
    ): boolean => {
      if (!isCurrentRequest() || ownerKey === undefined) {
        return false;
      }
      let currentTuple = manualAuthorizationTupleRef.current;
      if (currentTuple === undefined) {
        const retained = readRetainedManualControlAuthorization(
          targetAttempt.id,
        );
        if (
          retained !== undefined &&
          retained.tuple.ownerKey === ownerKey &&
          retained.tuple.recordOwnerKey === recordOwnerKey
        ) {
          if (retained.receipt === undefined) {
            currentTuple = retained.tuple;
            manualAuthorizationTupleRef.current = currentTuple;
          } else {
            removeRetainedManualControlAuthorization(targetAttempt.id);
          }
        }
      }
      if (currentTuple !== undefined) {
        const tupleMatches =
          targetAttempt.state === 'handoff_ready' &&
          targetSession.state === 'handoff_ready' &&
          targetControl.state === 'handoff_ready' &&
          currentTuple.ownerKey === ownerKey &&
          currentTuple.recordOwnerKey === recordOwnerKey &&
          currentTuple.attemptId === targetAttempt.id &&
          currentTuple.sessionId === targetSession.id &&
          currentTuple.controlId === targetControl.id &&
          currentTuple.packetDigest === targetControl.packet_digest &&
          currentTuple.expectedAttemptVersion === targetAttempt.state_version &&
          currentTuple.expectedSessionVersion === targetSession.state_version &&
          currentTuple.expectedControlVersion === targetControl.version;
        if (!tupleMatches) {
          removeRetainedManualControlAuthorization(currentTuple.attemptId);
          manualAuthorizationTupleRef.current = undefined;
          manualAuthorizationReceiptRef.current = undefined;
          manualResolutionTupleRef.current = undefined;
          openedAuthorizationKeyRef.current = undefined;
          currentTuple = undefined;
        }
      }
      if (currentTuple === undefined) {
        const candidate = createManualControlAuthorizationTuple(
          ownerKey,
          recordOwnerKey,
          targetAttempt,
          targetSession,
          targetControl,
        );
        if (candidate === undefined) {
          setManualControl(undefined);
          return false;
        }
        manualAuthorizationTupleRef.current = candidate;
      }
      setRemoteSession(targetSession);
      setManualControl(targetControl);
      setResolutionOutcome(undefined);
      setConfirmArmed(false);
      setTitle('Manual control required');
      return true;
    },
    [ownerKey, recordOwnerKey],
  );

  const acceptRetainedManualControlResolution = useCallback(
    (
      targetAttempt: AnansiApplicationAttempt,
      targetSession: AnansiRemoteBrowserSession,
      targetControl: AnansiManualApplicationControl,
      isCurrentRequest: () => boolean,
    ): boolean => {
      const retained = readRetainedManualControlAuthorization(targetAttempt.id);
      if (
        retained === undefined ||
        retained.receipt === undefined ||
        ownerKey === undefined ||
        !isCurrentRequest()
      ) {
        return false;
      }
      const completedRetained: CompletedRetainedManualControlAuthorization =
        Object.freeze({
          tuple: retained.tuple,
          receipt: retained.receipt,
        });
      if (
        !isExactRetainedManualControlAuthorization(
          completedRetained,
          ownerKey,
          recordOwnerKey,
          targetAttempt,
          targetSession,
          targetControl,
        )
      ) {
        if (
          retained.tuple.ownerKey === ownerKey &&
          retained.tuple.recordOwnerKey === recordOwnerKey
        ) {
          removeRetainedManualControlAuthorization(retained.tuple.attemptId);
          if (manualAuthorizationTupleRef.current === retained.tuple) {
            manualAuthorizationTupleRef.current = undefined;
            manualAuthorizationReceiptRef.current = undefined;
            manualResolutionTupleRef.current = undefined;
            openedAuthorizationKeyRef.current = undefined;
          }
        }
        return false;
      }
      manualAuthorizationTupleRef.current = completedRetained.tuple;
      manualAuthorizationReceiptRef.current = completedRetained.receipt;
      manualResolutionTupleRef.current = undefined;
      openedAuthorizationKeyRef.current =
        completedRetained.tuple.authorizationKey;
      setAttempt(targetAttempt);
      setRemoteSession(targetSession);
      setManualControl(targetControl);
      setResolutionOutcome(undefined);
      setConfirmArmed(false);
      setTitle('Resolve manual control');
      return true;
    },
    [ownerKey, recordOwnerKey],
  );

  const syncManualApplicationHandoff = useCallback(
    async (
      targetAttempt: AnansiApplicationAttempt,
      requestAccessToken: string,
      isCurrentRequest: () => boolean,
    ): Promise<boolean> => {
      const retained = readRetainedManualControlAuthorization(targetAttempt.id);
      const retainedForRecord =
        retained !== undefined &&
        retained.tuple.ownerKey === ownerKey &&
        retained.tuple.recordOwnerKey === recordOwnerKey &&
        retained.tuple.attemptId === targetAttempt.id;
      const supportsManualControlSync =
        targetAttempt.runtime === 'remote' &&
        ['handoff_ready', 'submitted_unconfirmed'].includes(
          targetAttempt.state,
        );
      if (!supportsManualControlSync) {
        if (
          retained !== undefined &&
          retained.tuple.ownerKey === ownerKey &&
          retained.tuple.recordOwnerKey === recordOwnerKey
        ) {
          removeRetainedManualControlAuthorization(retained.tuple.attemptId);
        }
        return false;
      }
      const [attemptResult, sessionResult, controlResult] =
        await Promise.allSettled([
          targetAttempt.state === 'handoff_ready' && retainedForRecord
            ? getAnansiApplicationAttempt(requestAccessToken, targetAttempt.id)
            : Promise.resolve(targetAttempt),
          getAnansiRemoteBrowserSession(requestAccessToken, targetAttempt.id),
          getAnansiManualApplicationControl(
            requestAccessToken,
            targetAttempt.id,
          ),
        ]);
      if (
        attemptResult.status !== 'fulfilled' ||
        !sameApplicationAttempt(attemptResult.value, targetAttempt) ||
        attemptResult.value.state_version < targetAttempt.state_version ||
        sessionResult.status !== 'fulfilled' ||
        controlResult.status !== 'fulfilled' ||
        !isRemoteBrowserSession(sessionResult.value, targetAttempt.id)
      ) {
        if (isCurrentRequest()) {
          setManualControl(undefined);
          setTitle('Check application');
        }
        return false;
      }
      const currentAttempt = attemptResult.value;
      if (currentAttempt.state === 'submitted_unconfirmed') {
        if (
          retainedForRecord &&
          retained !== undefined &&
          retained.receipt === undefined
        ) {
          try {
            const replay = await authorizeAnansiManualApplicationControl(
              requestAccessToken,
              retained.tuple.attemptId,
              authorizationInput(retained.tuple),
            );
            if (!isCurrentRequest()) {
              return false;
            }
            if (!isValidManualControlAuthorization(replay, retained.tuple)) {
              throw new Error('manual application control changed');
            }
            retainManualControlAuthorization(
              Object.freeze({
                tuple: retained.tuple,
                receipt: createManualControlAuthorizationReceipt(replay),
              }),
            );
          } catch (error) {
            if (
              isCurrentRequest() &&
              error instanceof AnansiApiError &&
              error.status === 409
            ) {
              removeRetainedManualControlAuthorization(
                retained.tuple.attemptId,
              );
              if (
                manualAuthorizationTupleRef.current?.authorizationKey ===
                retained.tuple.authorizationKey
              ) {
                manualAuthorizationTupleRef.current = undefined;
                manualAuthorizationReceiptRef.current = undefined;
                manualResolutionTupleRef.current = undefined;
                openedAuthorizationKeyRef.current = undefined;
              }
              setAttempt(currentAttempt);
              setRemoteSession(sessionResult.value);
              setManualControl(undefined);
              setTitle(titleForAttempt(currentAttempt));
              return true;
            }
            return false;
          }
        }
        return acceptRetainedManualControlResolution(
          currentAttempt,
          sessionResult.value,
          controlResult.value,
          isCurrentRequest,
        );
      }
      if (currentAttempt.state !== 'handoff_ready') {
        if (retainedForRecord && retained !== undefined) {
          removeRetainedManualControlAuthorization(retained.tuple.attemptId);
        }
        return false;
      }
      return acceptManualApplicationHandoff(
        currentAttempt,
        sessionResult.value,
        controlResult.value,
        isCurrentRequest,
      );
    },
    [
      acceptManualApplicationHandoff,
      acceptRetainedManualControlResolution,
      ownerKey,
      recordOwnerKey,
    ],
  );

  const reconcileApplicationState = useCallback(
    async (
      targetAttempt: AnansiApplicationAttempt,
      requestAccessToken: string,
      isCurrentRequest: () => boolean,
      expectedRemoteSessionId?: string,
    ): Promise<AnansiApplicationAttempt | undefined> => {
      const [attemptResult, remoteResult] = await Promise.allSettled([
        getAnansiApplicationAttempt(requestAccessToken, targetAttempt.id),
        targetAttempt.runtime === 'remote'
          ? getAnansiRemoteBrowserSession(requestAccessToken, targetAttempt.id)
          : Promise.resolve(undefined),
      ]);
      if (!isCurrentRequest()) {
        return undefined;
      }
      const refreshedAttempt =
        attemptResult.status === 'fulfilled' &&
        attemptResult.value.id === targetAttempt.id &&
        attemptResult.value.runtime === targetAttempt.runtime
          ? attemptResult.value
          : undefined;
      if (refreshedAttempt === undefined) {
        setReview(undefined);
        if (targetAttempt.runtime === 'remote') {
          setRemoteSession(undefined);
        }
        setConfirmArmed(false);
        setTitle('Check application');
        return undefined;
      }
      const refreshedSession =
        remoteResult.status === 'fulfilled' &&
        remoteResult.value !== undefined &&
        isRemoteBrowserSession(remoteResult.value, targetAttempt.id) &&
        (expectedRemoteSessionId === undefined ||
          remoteResult.value.id === expectedRemoteSessionId)
          ? remoteResult.value
          : undefined;
      setAttempt(refreshedAttempt);
      if (targetAttempt.runtime === 'remote') {
        setRemoteSession(refreshedSession);
      }
      setConfirmArmed(false);
      await syncApplicationReview(
        refreshedAttempt,
        requestAccessToken,
        isCurrentRequest,
      );
      const acceptedHandoff = await syncManualApplicationHandoff(
        refreshedAttempt,
        requestAccessToken,
        isCurrentRequest,
      );
      if (!isCurrentRequest()) {
        return undefined;
      }
      if (acceptedHandoff) {
        return refreshedAttempt;
      }
      setTitle(
        refreshedAttempt.state === 'submitted_unconfirmed'
          ? titleForAttempt(refreshedAttempt)
          : refreshedSession !== undefined &&
              refreshedSession.state !== 'review_ready'
            ? remoteStateLabel(refreshedSession.state)
            : titleForAttempt(refreshedAttempt),
      );
      return refreshedAttempt;
    },
    [syncApplicationReview, syncManualApplicationHandoff],
  );

  const run = useCallback(async () => {
    if (
      runningRef.current ||
      accessToken === undefined ||
      currentUserId === undefined ||
      ownerKey === undefined ||
      anansiId === null ||
      !UUID_PATTERN.test(anansiId)
    ) {
      return;
    }
    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    setIsRunning(true);
    setTitle('Starting application…');
    let startedAttempt: AnansiApplicationAttempt | undefined;
    let reconcileAfterFailure = false;
    try {
      const started = await startAnansiJobApplication(accessToken, anansiId);
      if (!isCurrentRun()) {
        return;
      }
      if (
        started.attempt.job_id !== anansiId ||
        !validAttemptRuntime(started.attempt.runtime)
      ) {
        throw new Error('application runtime unavailable');
      }
      startedAttempt = started.attempt;
      setAttempt(started.attempt);
      setReview(undefined);
      setRemoteSession(undefined);
      setConfirmArmed(false);

      if (started.attempt.runtime === 'extension') {
        const attemptTitle = titleForAttempt(started.attempt);
        if (!RUNNABLE_STATES.has(started.attempt.state)) {
          const fetchedReview = await syncApplicationReview(
            started.attempt,
            accessToken,
            isCurrentRun,
          );
          if (!isCurrentRun()) {
            return;
          }
          const canResumeApprovedReview =
            started.attempt.state === 'review_ready' &&
            fetchedReview?.state === 'approved';
          if (!canResumeApprovedReview) {
            setTitle(attemptTitle);
            return;
          }
        }
        reconcileAfterFailure = true;
        await checkLocalBrowser(currentUserId);
        reconcileAfterFailure = false;
        if (!isCurrentRun()) {
          return;
        }
        if (!supportedApplicationPage(started.page_url)) {
          throw new Error('application page unavailable');
        }
        reconcileAfterFailure = true;
        const result = await runApplicationInExtension(
          started.attempt.id,
          started.page_url,
        );
        if (['assist_ready', 'busy'].includes(result.status)) {
          if (isCurrentRun()) {
            setTitle(titleForRunStatus(result.status));
          }
          return;
        }
        const refreshed = await getAnansiApplicationAttempt(
          accessToken,
          started.attempt.id,
        );
        if (!isCurrentRun()) {
          return;
        }
        if (
          refreshed.id !== started.attempt.id ||
          refreshed.runtime !== 'extension'
        ) {
          throw new Error('application state changed');
        }
        setAttempt(refreshed);
        await syncApplicationReview(refreshed, accessToken, isCurrentRun);
        if (!isCurrentRun()) {
          return;
        }
        const coreStillRunnable = ['prepared', 'queued', 'filling'].includes(
          refreshed.state,
        );
        setTitle(
          coreStillRunnable
            ? result.status === 'failed'
              ? 'Application unavailable'
              : 'Check application'
            : titleForAttempt(refreshed),
        );
        return;
      }

      const attemptTitle = titleForAttempt(started.attempt);
      if (!RUNNABLE_STATES.has(started.attempt.state)) {
        await syncApplicationReview(started.attempt, accessToken, isCurrentRun);
        const acceptedHandoff = await syncManualApplicationHandoff(
          started.attempt,
          accessToken,
          isCurrentRun,
        );
        if (isCurrentRun() && !acceptedHandoff) {
          setTitle(attemptTitle);
        }
        return;
      }
      reconcileAfterFailure = true;
      const remote = await startAnansiRemoteBrowserSession(
        accessToken,
        started.attempt.id,
        started.attempt.state_version,
        createCallerRequestKey(),
      );
      if (!isCurrentRun()) {
        return;
      }
      if (!isRemoteBrowserSession(remote.session, started.attempt.id)) {
        throw new Error('remote browser session unavailable');
      }
      setRemoteSession(remote.session);
      setTitle(remoteStateLabel(remote.session.state));
    } catch (runError) {
      if (!isCurrentRun()) {
        return;
      }
      if (startedAttempt !== undefined && reconcileAfterFailure) {
        const reconciledAttempt = await reconcileApplicationState(
          startedAttempt,
          accessToken,
          isCurrentRun,
        );
        if (
          isCurrentRun() &&
          runError instanceof BrowserExtensionUnavailable &&
          reconciledAttempt !== undefined &&
          (RUNNABLE_STATES.has(reconciledAttempt.state) ||
            (startedAttempt.state === 'review_ready' &&
              reconciledAttempt.state === 'review_ready'))
        ) {
          setTitle('Pair Chrome in Profile');
        }
      } else if (isCurrentRun()) {
        setTitle(
          runError instanceof BrowserExtensionUnavailable
            ? 'Pair Chrome in Profile'
            : 'Application unavailable',
        );
      }
    } finally {
      if (isCurrentRun()) {
        runningRef.current = false;
        setIsRunning(false);
      }
    }
  }, [
    accessToken,
    anansiId,
    currentUserId,
    ownerKey,
    reconcileApplicationState,
    recordOwnerKey,
    syncApplicationReview,
    syncManualApplicationHandoff,
  ]);

  const refreshRemoteBrowser = useCallback(async () => {
    if (
      attempt?.runtime !== 'remote' ||
      remoteSession === undefined ||
      accessToken === undefined ||
      runningRef.current
    ) {
      return;
    }
    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    setIsRunning(true);
    try {
      const [refreshedAttempt, refreshedSession] = await Promise.all([
        getAnansiApplicationAttempt(accessToken, attempt.id),
        getAnansiRemoteBrowserSession(accessToken, attempt.id),
      ]);
      if (!isCurrentRun()) {
        return;
      }
      if (
        refreshedAttempt.id !== attempt.id ||
        refreshedAttempt.runtime !== 'remote' ||
        !isRemoteBrowserSession(refreshedSession, attempt.id) ||
        refreshedSession.id !== remoteSession.id
      ) {
        throw new Error('remote browser state changed');
      }
      setAttempt(refreshedAttempt);
      setRemoteSession(refreshedSession);
      setConfirmArmed(false);
      await syncApplicationReview(refreshedAttempt, accessToken, isCurrentRun);
      const acceptedHandoff = await syncManualApplicationHandoff(
        refreshedAttempt,
        accessToken,
        isCurrentRun,
      );
      if (!isCurrentRun()) {
        return;
      }
      if (acceptedHandoff) {
        return;
      }
      setTitle(
        refreshedSession.state === 'review_ready'
          ? titleForAttempt(refreshedAttempt)
          : remoteStateLabel(refreshedSession.state),
      );
    } catch {
      if (isCurrentRun()) {
        setTitle('Check application');
      }
    } finally {
      if (isCurrentRun()) {
        runningRef.current = false;
        setIsRunning(false);
      }
    }
  }, [
    accessToken,
    attempt,
    ownerKey,
    recordOwnerKey,
    remoteSession,
    syncApplicationReview,
    syncManualApplicationHandoff,
  ]);

  const stopRemoteBrowser = useCallback(async () => {
    if (
      attempt?.runtime !== 'remote' ||
      remoteSession === undefined ||
      !REMOTE_SESSION_STOPPABLE_STATES.has(remoteSession.state) ||
      accessToken === undefined ||
      runningRef.current
    ) {
      return;
    }
    const targetAttempt = attempt;
    const targetSession = remoteSession;
    const controlWindow = manualControlWindowRef.current;
    manualControlWindowRef.current = undefined;
    if (controlWindow !== undefined && !controlWindow.closed) {
      controlWindow.close();
    }
    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    setIsRunning(true);
    setTitle('Stopping remote browser…');
    try {
      const stopped = await stopAnansiRemoteBrowserSession(
        accessToken,
        targetAttempt.id,
        targetSession.state_version,
      );
      if (!isCurrentRun()) {
        return;
      }
      if (
        !isRemoteBrowserSession(stopped, targetAttempt.id) ||
        stopped.id !== targetSession.id ||
        !['stopping', 'stopped', 'expired'].includes(stopped.state) ||
        ![
          targetSession.state_version + 1,
          targetSession.state_version + 2,
        ].includes(stopped.state_version)
      ) {
        throw new Error('remote browser stop changed');
      }
      setRemoteSession(stopped);
      setManualControl(undefined);
      removeRetainedManualControlAuthorization(targetAttempt.id);
      manualAuthorizationTupleRef.current = undefined;
      manualAuthorizationReceiptRef.current = undefined;
      manualResolutionTupleRef.current = undefined;
      openedAuthorizationKeyRef.current = undefined;
    } catch {
      // Core state is authoritative after a lost or competing stop response.
    }
    if (isCurrentRun()) {
      try {
        await reconcileApplicationState(
          targetAttempt,
          accessToken,
          isCurrentRun,
          targetSession.id,
        );
      } finally {
        if (isCurrentRun()) {
          runningRef.current = false;
          setIsRunning(false);
        }
      }
    }
  }, [
    accessToken,
    attempt,
    ownerKey,
    reconcileApplicationState,
    recordOwnerKey,
    remoteSession,
  ]);

  const openRemoteReview = useCallback(async () => {
    if (
      attempt?.runtime !== 'remote' ||
      attempt.state !== 'review_ready' ||
      remoteSession?.state !== 'review_ready' ||
      accessToken === undefined ||
      runningRef.current
    ) {
      return;
    }
    const reviewWindow = globalThis.open('', '_blank');
    if (reviewWindow === null || reviewWindow.closed) {
      reviewWindow?.close();
      return;
    }
    try {
      reviewWindow.opener = null;
    } catch {
      reviewWindow.close();
      return;
    }
    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    let windowNavigated = false;
    setIsRunning(true);
    try {
      const review = await createAnansiRemoteBrowserReview(
        accessToken,
        attempt.id,
        remoteSession.state_version,
      );
      if (!isCurrentRun()) {
        return;
      }
      if (
        !isRemoteBrowserSession(review.session, attempt.id) ||
        review.session.id !== remoteSession.id ||
        review.session.state !== 'review_ready' ||
        review.session.state_version !== remoteSession.state_version + 1 ||
        review.session.review_generation !==
          remoteSession.review_generation + 1 ||
        !isFutureExpiry(review.expires_at) ||
        !isOneUseReviewUrl(review.review_url, remoteSession.id)
      ) {
        throw new Error('remote review unavailable');
      }
      setRemoteSession(review.session);
      if (!reviewWindow.closed) {
        reviewWindow.location.replace(review.review_url);
        windowNavigated = true;
      }
    } catch {
      if (isCurrentRun()) {
        await reconcileApplicationState(
          attempt,
          accessToken,
          isCurrentRun,
          remoteSession.id,
        );
      }
    } finally {
      if (!windowNavigated && !reviewWindow.closed) {
        reviewWindow.close();
      }
      if (isCurrentRun()) {
        runningRef.current = false;
        setIsRunning(false);
      }
    }
  }, [
    accessToken,
    attempt,
    ownerKey,
    reconcileApplicationState,
    recordOwnerKey,
    remoteSession,
  ]);

  const authorizeManualControl = useCallback(async () => {
    const tuple = manualAuthorizationTupleRef.current;
    if (
      tuple === undefined ||
      tuple.ownerKey !== ownerKey ||
      tuple.recordOwnerKey !== recordOwnerKey ||
      attempt?.id !== tuple.attemptId ||
      attempt.state !== 'handoff_ready' ||
      remoteSession?.id !== tuple.sessionId ||
      remoteSession.state !== 'handoff_ready' ||
      manualControl?.id !== tuple.controlId ||
      manualControl.state !== 'handoff_ready' ||
      manualControl.packet_digest !== tuple.packetDigest ||
      accessToken === undefined ||
      runningRef.current
    ) {
      return;
    }
    const controlWindow = globalThis.open('', '_blank');
    if (controlWindow === null || controlWindow.closed) {
      controlWindow?.close();
      return;
    }
    try {
      controlWindow.opener = null;
    } catch {
      controlWindow.close();
      return;
    }
    retainManualControlAuthorization(Object.freeze({ tuple }));
    manualAuthorizationReceiptRef.current = undefined;
    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    let authorizationAccepted = false;
    let windowNavigated = false;
    setIsRunning(true);
    setTitle('Authorizing manual control…');
    try {
      const response = await authorizeAnansiManualApplicationControl(
        accessToken,
        tuple.attemptId,
        authorizationInput(tuple),
      );
      if (!isCurrentRun()) {
        return;
      }
      if (!isValidManualControlAuthorization(response, tuple)) {
        throw new Error('manual application control changed');
      }
      const receipt = createManualControlAuthorizationReceipt(response);
      manualAuthorizationReceiptRef.current = receipt;
      retainManualControlAuthorization(Object.freeze({ tuple, receipt }));
      manualResolutionTupleRef.current = undefined;
      setAttempt(response.attempt);
      setManualControl(response.control);
      setRemoteSession({
        ...remoteSession,
        state: response.session_state,
        state_version: response.session_state_version,
      });
      setResolutionOutcome(undefined);
      setConfirmArmed(false);
      setTitle('Resolve manual control');
      authorizationAccepted = true;
      if (
        isFutureExpiry(response.expires_at) &&
        openedAuthorizationKeyRef.current !== tuple.authorizationKey &&
        !controlWindow.closed
      ) {
        controlWindow.location.replace(response.control_url);
        openedAuthorizationKeyRef.current = tuple.authorizationKey;
        manualControlWindowRef.current = controlWindow;
        windowNavigated = true;
      }
    } catch (error) {
      if (isCurrentRun()) {
        if (
          !authorizationAccepted &&
          error instanceof AnansiApiError &&
          error.status === 409
        ) {
          removeRetainedManualControlAuthorization(tuple.attemptId);
          manualAuthorizationTupleRef.current = undefined;
          manualAuthorizationReceiptRef.current = undefined;
          manualResolutionTupleRef.current = undefined;
          openedAuthorizationKeyRef.current = undefined;
          setManualControl(undefined);
          setResolutionOutcome(undefined);
          setConfirmArmed(false);
          setTitle('Check application');
          void reconcileApplicationState(
            attempt,
            accessToken,
            isCurrentRun,
            remoteSession.id,
          );
        } else {
          setTitle(
            authorizationAccepted
              ? 'Resolve manual control'
              : 'Manual control required',
          );
        }
      }
    } finally {
      if (!windowNavigated && !controlWindow.closed) {
        controlWindow.close();
      }
      if (isCurrentRun()) {
        runningRef.current = false;
        setIsRunning(false);
      }
    }
  }, [
    accessToken,
    attempt,
    manualControl,
    ownerKey,
    reconcileApplicationState,
    recordOwnerKey,
    remoteSession,
  ]);

  const resolveManualControl = useCallback(
    async (outcome: 'confirmed' | 'not_submitted') => {
      const authorizationTuple = manualAuthorizationTupleRef.current;
      const authorizationReceipt = manualAuthorizationReceiptRef.current;
      if (
        authorizationTuple === undefined ||
        authorizationTuple.ownerKey !== ownerKey ||
        authorizationTuple.recordOwnerKey !== recordOwnerKey ||
        authorizationReceipt === undefined ||
        attempt?.id !== authorizationTuple.attemptId ||
        attempt.state !== 'submitted_unconfirmed' ||
        attempt.outward_observed_at === null ||
        remoteSession?.id !== authorizationTuple.sessionId ||
        remoteSession.state !== 'control_ready' ||
        manualControl?.id !== authorizationTuple.controlId ||
        manualControl.state !== 'control_ready' ||
        accessToken === undefined ||
        runningRef.current
      ) {
        return;
      }
      const existingResolution = manualResolutionTupleRef.current;
      if (
        existingResolution !== undefined &&
        (existingResolution.ownerKey !== ownerKey ||
          existingResolution.recordOwnerKey !== recordOwnerKey ||
          existingResolution.body.outcome !== outcome)
      ) {
        return;
      }
      const resolutionTuple =
        existingResolution ??
        createManualControlResolutionTuple(
          authorizationTuple,
          authorizationReceipt,
          outcome,
        );
      manualResolutionTupleRef.current = resolutionTuple;
      setResolutionOutcome(resolutionTuple.body.outcome);
      runningRef.current = true;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isCurrentRun = () =>
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken &&
        currentOwnerKeyRef.current === ownerKey &&
        currentRecordOwnerKeyRef.current === recordOwnerKey &&
        runIdRef.current === runId;
      setIsRunning(true);
      setTitle('Recording manual control outcome…');
      try {
        const response = await resolveAnansiManualApplicationControl(
          accessToken,
          resolutionTuple.attemptId,
          resolutionTuple.body,
        );
        if (!isCurrentRun()) {
          return;
        }
        if (!isValidManualControlResolution(response, resolutionTuple)) {
          throw new Error('manual application resolution changed');
        }
        removeRetainedManualControlAuthorization(authorizationTuple.attemptId);
        const controlWindow = manualControlWindowRef.current;
        manualControlWindowRef.current = undefined;
        if (controlWindow !== undefined && !controlWindow.closed) {
          controlWindow.close();
        }
        manualAuthorizationTupleRef.current = undefined;
        manualAuthorizationReceiptRef.current = undefined;
        setAttempt(response.attempt);
        setManualControl(response.control);
        setRemoteSession(response.session);
        setConfirmArmed(false);
        setTitle(
          resolutionTuple.body.outcome === 'confirmed'
            ? 'Application submitted'
            : 'Application not submitted',
        );
      } catch {
        if (!isCurrentRun()) {
          return;
        }
        const reconciliation = Promise.allSettled([
          getAnansiApplicationAttemptOutput(
            accessToken,
            resolutionTuple.attemptId,
          ),
          getAnansiRemoteBrowserSession(accessToken, resolutionTuple.attemptId),
          getAnansiManualApplicationControl(
            accessToken,
            resolutionTuple.attemptId,
          ),
        ]);
        void reconciliation.then(
          ([attemptResult, sessionResult, controlResult]) => {
            if (
              !isCurrentRun() ||
              attemptResult.status !== 'fulfilled' ||
              sessionResult.status !== 'fulfilled' ||
              controlResult.status !== 'fulfilled'
            ) {
              return;
            }
            const reconciled = {
              attempt: attemptResult.value,
              session: sessionResult.value,
              control: controlResult.value,
            };
            if (!isValidManualControlResolution(reconciled, resolutionTuple)) {
              return;
            }
            removeRetainedManualControlAuthorization(
              authorizationTuple.attemptId,
            );
            const controlWindow = manualControlWindowRef.current;
            manualControlWindowRef.current = undefined;
            if (controlWindow !== undefined && !controlWindow.closed) {
              controlWindow.close();
            }
            manualAuthorizationTupleRef.current = undefined;
            manualAuthorizationReceiptRef.current = undefined;
            setAttempt(reconciled.attempt);
            setRemoteSession(reconciled.session);
            setManualControl(reconciled.control);
            setConfirmArmed(false);
            setTitle(
              resolutionTuple.body.outcome === 'confirmed'
                ? 'Application submitted'
                : 'Application not submitted',
            );
          },
        );
        setTitle('Resolve manual control');
      } finally {
        if (isCurrentRun()) {
          runningRef.current = false;
          setIsRunning(false);
        }
      }
    },
    [
      accessToken,
      attempt,
      manualControl,
      ownerKey,
      recordOwnerKey,
      remoteSession,
    ],
  );

  const decideApplicationReview = useCallback(
    async (action: 'approve' | 'reject') => {
      if (
        attempt === undefined ||
        review?.state !== 'pending' ||
        review.attempt_id !== attempt.id ||
        accessToken === undefined ||
        runningRef.current
      ) {
        return;
      }
      runningRef.current = true;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isCurrentRun = () =>
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken &&
        runIdRef.current === runId;
      setIsRunning(true);
      setTitle(
        action === 'approve'
          ? 'Approving application…'
          : 'Rejecting application…',
      );
      try {
        const updated = await (action === 'approve'
          ? approveAnansiApplicationReview(
              accessToken,
              attempt.id,
              review.version,
              review.packet_digest,
            )
          : rejectAnansiApplicationReview(
              accessToken,
              attempt.id,
              review.version,
              review.packet_digest,
            ));
        if (!isCurrentRun()) {
          return;
        }
        if (
          updated.attempt_id !== attempt.id ||
          updated.packet_digest !== review.packet_digest ||
          updated.version !== review.version + 1 ||
          updated.state !== (action === 'approve' ? 'approved' : 'rejected')
        ) {
          throw new Error('application review decision changed');
        }
        setReview(updated);
        const refreshedAttempt = await getAnansiApplicationAttempt(
          accessToken,
          attempt.id,
        );
        if (!isCurrentRun()) {
          return;
        }
        if (refreshedAttempt.id !== attempt.id) {
          throw new Error('application review attempt changed');
        }
        setAttempt(refreshedAttempt);
        setConfirmArmed(false);
        setTitle(
          action === 'approve' && refreshedAttempt.state === 'review_ready'
            ? refreshedAttempt.runtime === 'extension'
              ? 'Resume approved application'
              : 'Application approved'
            : titleForAttempt(refreshedAttempt),
        );
      } catch {
        if (!isCurrentRun()) {
          return;
        }
        const [attemptResult, reviewResult] = await Promise.allSettled([
          getAnansiApplicationAttempt(accessToken, attempt.id),
          getAnansiApplicationReview(accessToken, attempt.id),
        ]);
        if (!isCurrentRun()) {
          return;
        }
        const refreshedAttempt =
          attemptResult.status === 'fulfilled' &&
          attemptResult.value.id === attempt.id
            ? attemptResult.value
            : undefined;
        if (refreshedAttempt !== undefined) {
          setAttempt(refreshedAttempt);
          setTitle(titleForAttempt(refreshedAttempt));
        } else {
          setTitle('Check application');
        }
        if (
          reviewResult.status === 'fulfilled' &&
          reviewResult.value.attempt_id === attempt.id
        ) {
          setReview(reviewResult.value);
        } else {
          setReview(undefined);
        }
        setConfirmArmed(false);
      } finally {
        if (isCurrentRun()) {
          runningRef.current = false;
          setIsRunning(false);
        }
      }
    },
    [accessToken, attempt, review],
  );

  const confirmManualSubmission = useCallback(async () => {
    if (
      attempt === undefined ||
      attempt.state !== 'submitted_unconfirmed' ||
      manualAuthorizationTupleRef.current !== undefined ||
      accessToken === undefined ||
      runningRef.current
    ) {
      return;
    }
    if (!confirmArmed) {
      setConfirmArmed(true);
      setTitle('Confirm application submitted');
      return;
    }

    runningRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrentRun = () =>
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      currentOwnerKeyRef.current === ownerKey &&
      currentRecordOwnerKeyRef.current === recordOwnerKey &&
      runIdRef.current === runId;
    setIsRunning(true);
    setTitle('Confirming application…');
    try {
      const confirmed = await confirmAnansiApplicationAttempt(
        accessToken,
        attempt.id,
        attempt.state_version,
      );
      if (!isCurrentRun()) {
        return;
      }
      if (!validAttemptMutation(confirmed, attempt, 'confirmed')) {
        throw new Error('application confirmation changed');
      }
      setAttempt(confirmed);
      setConfirmArmed(false);
      setTitle(titleForAttempt(confirmed));
    } catch {
      if (isCurrentRun()) {
        try {
          const refreshed = await getAnansiApplicationAttempt(
            accessToken,
            attempt.id,
          );
          if (
            isCurrentRun() &&
            sameApplicationAttempt(refreshed, attempt) &&
            refreshed.state_version >= attempt.state_version
          ) {
            setAttempt(refreshed);
            setConfirmArmed(false);
            setTitle(titleForAttempt(refreshed));
          } else if (isCurrentRun()) {
            setConfirmArmed(false);
            setTitle('Check application');
          }
        } catch {
          if (isCurrentRun()) {
            setConfirmArmed(false);
            setTitle('Check application');
          }
        }
      }
    } finally {
      if (isCurrentRun()) {
        runningRef.current = false;
        setIsRunning(false);
      }
    }
  }, [accessToken, attempt, confirmArmed, ownerKey, recordOwnerKey]);

  const changeNeedsUserAttempt = useCallback(
    async (action: 'retry' | 'cancel') => {
      if (
        attempt?.state !== 'needs_user' ||
        accessToken === undefined ||
        runningRef.current
      ) {
        return;
      }
      runningRef.current = true;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isCurrentRun = () =>
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken &&
        runIdRef.current === runId;
      setIsRunning(true);
      setTitle(
        action === 'retry'
          ? 'Retrying application…'
          : 'Cancelling application…',
      );
      try {
        const updated = await (action === 'retry'
          ? retryAnansiApplicationAttempt(
              accessToken,
              attempt.id,
              attempt.state_version,
            )
          : cancelAnansiApplicationAttempt(
              accessToken,
              attempt.id,
              attempt.state_version,
            ));
        if (!isCurrentRun()) {
          return;
        }
        const expectedState = action === 'retry' ? 'queued' : 'cancelled';
        if (!validAttemptMutation(updated, attempt, expectedState)) {
          throw new Error('application mutation changed');
        }
        setAttempt(updated);
        setConfirmArmed(false);
        setTitle(titleForAttempt(updated));
      } catch {
        if (isCurrentRun()) {
          try {
            const refreshed = await getAnansiApplicationAttempt(
              accessToken,
              attempt.id,
            );
            if (
              isCurrentRun() &&
              sameApplicationAttempt(refreshed, attempt) &&
              refreshed.state_version >= attempt.state_version
            ) {
              setAttempt(refreshed);
              setConfirmArmed(false);
              setTitle(titleForAttempt(refreshed));
            } else if (isCurrentRun()) {
              setTitle('Check application');
            }
          } catch {
            if (isCurrentRun()) {
              setTitle('Check application');
            }
          }
        }
      } finally {
        if (isCurrentRun()) {
          runningRef.current = false;
          setIsRunning(false);
        }
      }
    },
    [accessToken, attempt],
  );

  if (
    objectNameSingular !== 'jobPosting' ||
    accessToken === undefined ||
    ownerKey === undefined ||
    anansiId === null ||
    !UUID_PATTERN.test(anansiId)
  ) {
    return null;
  }

  const statusPanel =
    attempt === undefined || !isStatusOpen ? null : (
      <StyledApplicationStatus role="status" aria-label="Application status">
        <StyledStatusHeader>
          <StyledStatusTitle>Application status</StyledStatusTitle>
          <Button
            size="small"
            variant="tertiary"
            title="Close application status"
            ariaLabel="Close application status"
            onClick={() => setIsStatusOpen(false)}
          />
        </StyledStatusHeader>
        <StyledStatusList>
          <dt>Runtime</dt>
          <dd>
            {attempt.runtime === 'extension'
              ? 'Chrome extension'
              : 'Remote browser'}
          </dd>
          <dt>Field values</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : (
              <StyledReviewItems>
                {review.packet.answers.items.map((item) => (
                  <StyledReviewItem key={item.key}>
                    <strong>{item.key}</strong>
                    <span>{reviewAnswerLabel(item.value)}</span>
                    <StyledReviewMetadata>
                      {item.provenance.kind} · {item.provenance.ref}
                    </StyledReviewMetadata>
                  </StyledReviewItem>
                ))}
              </StyledReviewItems>
            )}
          </dd>
          <dt>Field status</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : (
              <StyledReviewItems>
                {review.packet.bindings.map((binding) => (
                  <StyledReviewItem key={binding.key}>
                    <strong>{binding.key}</strong>
                    <StyledReviewMetadata>
                      {binding.status}
                    </StyledReviewMetadata>
                  </StyledReviewItem>
                ))}
              </StyledReviewItems>
            )}
          </dd>
          <dt>Documents</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : review.packet.documents.items.length === 0 ? (
              'None'
            ) : (
              <StyledReviewItems>
                {review.packet.documents.items.map((document) => (
                  <StyledReviewItem key={document.key}>
                    <strong>{document.key}</strong>
                    <span>{document.file_name}</span>
                    <StyledReviewMetadata>
                      {document.media_type}
                    </StyledReviewMetadata>
                    <StyledReviewMetadata>{document.id}</StyledReviewMetadata>
                    <StyledPacketDigest>{document.sha256}</StyledPacketDigest>
                  </StyledReviewItem>
                ))}
              </StyledReviewItems>
            )}
          </dd>
          <dt>Unresolved questions</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : review.packet.unresolved.length === 0 ? (
              'None'
            ) : (
              <StyledReviewItems>
                {review.packet.unresolved.map((item) => (
                  <StyledReviewItem key={item.key}>
                    <strong>{item.key}</strong>
                    <StyledReviewMetadata>{item.reason}</StyledReviewMetadata>
                  </StyledReviewItem>
                ))}
              </StyledReviewItems>
            )}
          </dd>
          <dt>Review packet</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : (
              <>
                <span>{reviewStateLabel(review.state)}</span>
                <StyledPacketDigest>{review.packet_digest}</StyledPacketDigest>
              </>
            )}
          </dd>
          <dt>Recipe</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : (
              <>
                <span>
                  {review.packet.recipe.id} · {review.packet.recipe.version}
                </span>
                <StyledPacketDigest>
                  {review.packet.recipe.digest}
                </StyledPacketDigest>
              </>
            )}
          </dd>
          <dt>Policy</dt>
          <dd>
            {review === undefined ? (
              'Unavailable'
            ) : (
              <>
                <span>
                  {review.packet.policy.mode} · version{' '}
                  {review.packet.policy.version}
                </span>
                <StyledPacketDigest>
                  {review.packet.policy.digest}
                </StyledPacketDigest>
              </>
            )}
          </dd>
          <dt>Approval expiry</dt>
          <dd>
            {review === undefined ? 'Unavailable' : reviewExpiryLabel(review)}
          </dd>
          <dt>Reservation</dt>
          <dd>
            {attempt.submit_reserved_at === null ? 'Not reserved' : 'Reserved'}
          </dd>
          <dt>Confirmation</dt>
          <dd>{confirmationLabel(attempt)}</dd>
          {remoteSession === undefined ? null : (
            <>
              <dt>Remote status</dt>
              <dd>{remoteStateLabel(remoteSession.state)}</dd>
            </>
          )}
        </StyledStatusList>
        {review?.state === 'pending' &&
        review.packet.unresolved.length === 0 ? (
          <StyledStatusActions>
            <Button
              size="small"
              variant="primary"
              accent="blue"
              title="Approve exact application"
              ariaLabel="Approve exact application"
              disabled={isRunning}
              onClick={() => void decideApplicationReview('approve')}
            />
            <Button
              size="small"
              variant="secondary"
              title="Reject application review"
              ariaLabel="Reject application review"
              disabled={isRunning}
              onClick={() => void decideApplicationReview('reject')}
            />
          </StyledStatusActions>
        ) : null}
        {manualControl?.state === 'handoff_ready' ? (
          <>
            <StyledManualControlWarning>
              Manual control permits unrestricted keyboard and pointer input.
              Core records the application as possibly submitted before control
              opens. Anansi cannot determine which page controls you use.
            </StyledManualControlWarning>
            <StyledStatusActions>
              <Button
                size="small"
                variant="secondary"
                title="Authorize one-use manual control"
                ariaLabel="Authorize one-use manual control"
                disabled={isRunning}
                onClick={() => void authorizeManualControl()}
              />
            </StyledStatusActions>
          </>
        ) : null}
        {manualControl?.state === 'control_ready' ? (
          <>
            <StyledManualControlWarning>
              Manual control permits unrestricted keyboard and pointer input.
              Core recorded the application as possibly submitted before control
              opened. Anansi cannot determine which page controls you use.
              Record the durable outcome after the control window closes.
            </StyledManualControlWarning>
            <StyledStatusActions>
              {resolutionOutcome !== 'not_submitted' ? (
                <Button
                  size="small"
                  variant="secondary"
                  title="Resolve as confirmed"
                  ariaLabel="Resolve as confirmed"
                  disabled={isRunning}
                  onClick={() => void resolveManualControl('confirmed')}
                />
              ) : null}
              {resolutionOutcome !== 'confirmed' ? (
                <Button
                  size="small"
                  variant="secondary"
                  title="Resolve as not submitted"
                  ariaLabel="Resolve as not submitted"
                  disabled={isRunning}
                  onClick={() => void resolveManualControl('not_submitted')}
                />
              ) : null}
            </StyledStatusActions>
          </>
        ) : null}
        {remoteSession !== undefined &&
        REMOTE_SESSION_STOPPABLE_STATES.has(remoteSession.state) ? (
          <StyledStatusActions>
            <Button
              size="small"
              variant="secondary"
              title="Stop remote browser"
              ariaLabel="Stop remote browser"
              disabled={isRunning}
              onClick={() => void stopRemoteBrowser()}
            />
          </StyledStatusActions>
        ) : null}
        {remoteSession !== undefined &&
        ['pending', 'starting', 'running', 'review_ready'].includes(
          remoteSession.state,
        ) ? (
          <StyledStatusActions>
            <Button
              size="small"
              variant="secondary"
              title="Refresh remote browser"
              ariaLabel="Refresh remote browser"
              disabled={isRunning}
              onClick={() => void refreshRemoteBrowser()}
            />
            {remoteSession.state === 'review_ready' ? (
              <Button
                size="small"
                variant="secondary"
                title="Open one-use remote review"
                ariaLabel="Open one-use remote review"
                disabled={isRunning}
                onClick={() => void openRemoteReview()}
              />
            ) : null}
          </StyledStatusActions>
        ) : null}
      </StyledApplicationStatus>
    );

  const canConfirmManualSubmission =
    attempt?.state === 'submitted_unconfirmed' &&
    manualAuthorizationTupleRef.current === undefined;
  const canShowStatus = attempt !== undefined && !isStatusOpen;
  const primaryTitle = canShowStatus
    ? 'Show application status'
    : remoteSession !== undefined &&
        REMOTE_SESSION_RUNNING_STATES.has(remoteSession.state) &&
        !canConfirmManualSubmission &&
        !terminalTitle(title)
      ? 'Application running remotely'
      : title;

  if (attempt?.state === 'needs_user') {
    return (
      <StyledApplicationAction>
        {statusPanel}
        <StyledStatusActions>
          {canShowStatus ? (
            <Button
              size="small"
              variant="secondary"
              title="Show application status"
              ariaLabel="Show application status"
              disabled={isRunning}
              onClick={() => setIsStatusOpen(true)}
            />
          ) : null}
          <Button
            size="small"
            variant="secondary"
            title="Retry application"
            disabled={isRunning}
            onClick={() => void changeNeedsUserAttempt('retry')}
          />
          <Button
            size="small"
            variant="secondary"
            title="Cancel application"
            disabled={isRunning}
            onClick={() => void changeNeedsUserAttempt('cancel')}
          />
        </StyledStatusActions>
      </StyledApplicationAction>
    );
  }

  return (
    <StyledApplicationAction>
      {statusPanel}
      <Button
        size="small"
        variant="secondary"
        title={primaryTitle}
        ariaLabel={primaryTitle}
        disabled={
          isRunning ||
          (!canShowStatus &&
            ((remoteSession !== undefined && !canConfirmManualSubmission) ||
              terminalTitle(title) ||
              (title === 'Application unavailable' && attempt === undefined)))
        }
        onClick={() => {
          if (canShowStatus) {
            setIsStatusOpen(true);
            return;
          }
          void (attempt?.state === 'submitted_unconfirmed'
            ? confirmManualSubmission()
            : run());
        }}
      />
    </StyledApplicationAction>
  );
};
