import { AnansiApplicationRecordButton } from '@/anansi-applications/components/AnansiApplicationRecordButton';
import { ANANSI_BROWSER_EXTENSION_ID } from '@/auth/constants/AnansiBrowserExtensionId';
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getAnansiApplicationReview } from '~/pages/anansi/anansiProfileApi';
import { Suspense, startTransition } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');

const mockedSelector = jest.mocked(useAtomFamilySelectorValue);
const mockedStateValue = jest.mocked(useAtomStateValue);

const ACCESS_TOKEN = 'fake-access-token';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const CONTROL_ID = '88888888-8888-4888-8888-888888888888';
const PAGE_URL = 'https://job-boards.greenhouse.io/acme/jobs/123';

const queuedAttempt = {
  id: ATTEMPT_ID,
  job_id: JOB_ID,
  state: 'queued',
  state_version: 2,
  runtime: 'extension',
  risk_class: 'low',
  portal: 'greenhouse',
  automation_mode: 'review_first',
  submit_reserved_at: null,
  outward_observed_at: null,
  submitted_at: null,
  confirmed_at: null,
  failure_code: null,
};

const REVIEW_ID = '66666666-6666-4666-8666-666666666666';
const DOCUMENT_ID = '77777777-7777-4777-8777-777777777777';
const PACKET_DIGEST = 'a'.repeat(64);
const DOCUMENT_DIGEST = 'f'.repeat(64);
const pendingReview = {
  id: REVIEW_ID,
  attempt_id: ATTEMPT_ID,
  packet_digest: PACKET_DIGEST,
  packet: {
    schema: 'anansi.application-review.v1',
    attempt: {
      canonical_key: 'b'.repeat(64),
      page_url: PAGE_URL,
    },
    recipe: {
      id: 'greenhouse-v1',
      version: '2026-08-27.2',
      digest: 'c'.repeat(64),
    },
    policy: {
      version: 7,
      digest: 'd'.repeat(64),
      mode: 'review_first',
    },
    answers: {
      bundle_ref: 'vault://answer-bundle-must-stay-hidden',
      items: [
        {
          key: 'identity.full_name',
          value: { type: 'string', value: 'José Alvarez' },
          provenance: { kind: 'profile_fact', ref: 'profile:4:name' },
        },
        {
          key: 'work.authorized',
          value: { type: 'boolean', value: true },
          provenance: { kind: 'user_confirmed', ref: 'answer:9' },
        },
        {
          key: 'skills.selected',
          value: { type: 'strings', value: ['Python', 'Kubernetes'] },
          provenance: {
            kind: 'application_answer',
            ref: 'application-answer:12',
          },
        },
        {
          key: 'supplemental.note',
          value: {
            type: 'string',
            value: '<img src=x onerror=steal()>',
          },
          provenance: { kind: 'policy', ref: 'policy:7:note' },
        },
      ],
    },
    documents: {
      bundle_ref: 'vault://document-bundle-must-stay-hidden',
      items: [
        {
          key: 'document.resume',
          id: DOCUMENT_ID,
          file_name: 'résumé.pdf',
          media_type: 'application/pdf',
          sha256: DOCUMENT_DIGEST,
        },
      ],
    },
    bindings: [
      { key: 'identity.full_name', status: 'verified' },
      { key: 'work.authorized', status: 'verified' },
      { key: 'skills.selected', status: 'verified' },
      { key: 'supplemental.note', status: 'verified' },
      { key: 'document.resume', status: 'verified' },
    ],
    unresolved: [],
  },
  state: 'pending',
  version: 1,
  approval_id: null,
  approval_expires_at: null,
  decided_at: null,
  consumed_at: null,
  invalidated_at: null,
  created_at: '2026-08-27T12:00:00Z',
  updated_at: '2026-08-27T12:00:00Z',
};

const applicationAttemptOutput = (overrides: Record<string, unknown> = {}) => ({
  id: ATTEMPT_ID,
  job_id: JOB_ID,
  engagement_id: null,
  resume_id: null,
  connection_id: '99999999-9999-4999-8999-999999999999',
  canonical_key: '1'.repeat(64),
  portal: 'greenhouse',
  company_key: 'acme',
  requisition_key: '123',
  risk_class: 'low',
  runtime: 'remote',
  runtime_session_id: SESSION_ID,
  automation_mode: 'review_first',
  recipe_id: 'greenhouse-v1',
  recipe_version: '2026-08-27.2',
  recipe_digest: 'c'.repeat(64),
  policy_version: 7,
  contact_email: 'applicant@example.test',
  resume_sha256: 'e'.repeat(64),
  state: 'handoff_ready',
  state_version: 7,
  lease_owner: `remote:${SESSION_ID}`,
  lease_expires_at: '2026-08-27T12:29:00Z',
  submit_idempotency_key: null,
  submit_grant_expires_at: null,
  submit_reserved_at: null,
  outward_observed_at: null,
  submitted_at: null,
  confirmed_at: null,
  evidence_ref: null,
  failure_code: 'manual_handoff_ready',
  created_at: '2026-08-27T12:00:00Z',
  updated_at: '2026-08-27T12:04:00Z',
  ...overrides,
});

const handoffAttempt = applicationAttemptOutput();
const handoffSession = {
  id: SESSION_ID,
  attempt_id: ATTEMPT_ID,
  state: 'handoff_ready',
  state_version: 4,
  recipe_id: 'greenhouse-v1',
  recipe_version: '2026-08-27.2',
  recipe_digest: 'c'.repeat(64),
  review_generation: 2,
  expires_at: '2026-08-27T12:30:00Z',
  started_at: '2026-08-27T12:01:00Z',
  last_heartbeat_at: '2026-08-27T12:03:00Z',
  terminal_at: null,
  failure_code: null,
  created_at: '2026-08-27T12:00:00Z',
  updated_at: '2026-08-27T12:04:00Z',
};
const HANDOFF_PACKET_DIGEST = '9'.repeat(64);
const handoffControl = {
  id: CONTROL_ID,
  attempt_id: ATTEMPT_ID,
  session_id: SESSION_ID,
  state: 'handoff_ready',
  version: 3,
  handoff_reason: 'login',
  packet_digest: HANDOFF_PACKET_DIGEST,
  control_action: null,
  control_expires_at: null,
  authorized_at: null,
  resolved_at: null,
  resolution: null,
  created_at: '2026-08-27T12:04:00Z',
  updated_at: '2026-08-27T12:04:00Z',
};
const CONTROL_EXPIRES_AT = '2026-08-27T12:09:00Z';
const CONTROL_TOKEN = 'u'.repeat(43);
const CONTROL_URL = `https://browser.anansi.work/review/${SESSION_ID}#anansi_review_token=${CONTROL_TOKEN}`;
const authorizedAttempt = applicationAttemptOutput({
  state: 'submitted_unconfirmed',
  state_version: 8,
  lease_owner: null,
  lease_expires_at: null,
  outward_observed_at: '2026-08-27T12:04:30Z',
  submitted_at: '2026-08-27T12:04:30Z',
  failure_code: 'submission_outcome_unknown',
  updated_at: '2026-08-27T12:04:30Z',
});
const authorizedControl = {
  ...handoffControl,
  state: 'control_ready',
  version: 4,
  control_action: 'manual_application_submit',
  control_expires_at: CONTROL_EXPIRES_AT,
  authorized_at: '2026-08-27T12:04:30Z',
  updated_at: '2026-08-27T12:04:30Z',
};
const controlReadySession = {
  ...handoffSession,
  state: 'control_ready',
  state_version: 5,
  review_generation: 3,
  updated_at: '2026-08-27T12:04:30Z',
};
const authorizationResponse = {
  attempt: authorizedAttempt,
  control: authorizedControl,
  session_id: SESSION_ID,
  session_state: 'control_ready',
  session_state_version: 5,
  control_generation: 1,
  control_url: CONTROL_URL,
  expires_at: CONTROL_EXPIRES_AT,
};

const resolvedControl = (outcome: 'confirmed' | 'not_submitted') => ({
  ...authorizedControl,
  state: outcome,
  version: 5,
  control_action: null,
  control_expires_at: null,
  resolved_at: '2026-08-27T12:05:00Z',
  resolution: outcome,
  updated_at: '2026-08-27T12:05:00Z',
});

const resolutionResponse = (outcome: 'confirmed' | 'not_submitted') => ({
  attempt: applicationAttemptOutput({
    state: outcome === 'confirmed' ? 'confirmed' : 'failed',
    state_version: 9,
    lease_owner: null,
    lease_expires_at: null,
    outward_observed_at: '2026-08-27T12:04:30Z',
    submitted_at: '2026-08-27T12:04:30Z',
    confirmed_at: outcome === 'confirmed' ? '2026-08-27T12:05:00Z' : null,
    evidence_ref:
      outcome === 'confirmed' ? `manual-control:${CONTROL_ID}` : null,
    failure_code: outcome === 'confirmed' ? null : 'manual_not_submitted',
    updated_at: '2026-08-27T12:05:00Z',
  }),
  control: resolvedControl(outcome),
  session: {
    ...controlReadySession,
    state: 'stopped',
    state_version: 7,
    review_generation: 4,
    terminal_at: '2026-08-27T12:05:00Z',
    updated_at: '2026-08-27T12:05:00Z',
  },
});

const jsonOk = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Headers(),
  json: () => Promise.resolve(body),
});

const createPopupWindow = () => {
  const replace = jest.fn();
  const close = jest.fn();
  return {
    window: {
      closed: false,
      close,
      location: { replace },
      opener: {},
    } as unknown as Window,
    close,
    replace,
  };
};

const installHandoffFetch = ({
  authorize = () => Promise.resolve(jsonOk(authorizationResponse)),
  resolve,
  stop,
  readAttempt = () => handoffAttempt,
  readSession = () => handoffSession,
  readControl = () => handoffControl,
}: {
  authorize?: () => Promise<ReturnType<typeof jsonOk>>;
  resolve?: () => Promise<ReturnType<typeof jsonOk>>;
  stop?: () => Promise<ReturnType<typeof jsonOk>>;
  readAttempt?: () => unknown;
  readSession?: () => unknown;
  readControl?: () => unknown;
} = {}) => {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input).replace(ANANSI_API_URL, '');
    if (method === 'POST' && path === `/v1/applications/jobs/${JOB_ID}/start`) {
      return Promise.resolve(
        jsonOk({ attempt: handoffAttempt, created: false, page_url: PAGE_URL }),
      );
    }
    if (
      method === 'GET' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}`
    ) {
      return Promise.resolve(jsonOk(readAttempt()));
    }
    if (
      method === 'GET' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
    ) {
      return Promise.resolve(jsonOk(readSession()));
    }
    if (
      method === 'GET' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}/manual-control`
    ) {
      return Promise.resolve(jsonOk(readControl()));
    }
    if (
      method === 'GET' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}/review`
    ) {
      return Promise.reject(new Error('application review unavailable'));
    }
    if (
      method === 'POST' &&
      path ===
        `/v1/applications/attempts/${ATTEMPT_ID}/manual-control/authorize`
    ) {
      return authorize();
    }
    if (
      method === 'POST' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session/stop`
    ) {
      if (stop === undefined) {
        throw new Error('Unexpected remote-session stop');
      }
      return stop();
    }
    if (
      method === 'POST' &&
      path === `/v1/applications/attempts/${ATTEMPT_ID}/manual-control/resolve`
    ) {
      if (resolve === undefined) {
        throw new Error('Unexpected manual-control resolution');
      }
      return resolve();
    }
    throw new Error(`Unmocked fetch: ${method} ${path}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const setRecord = ({
  anansiId = JOB_ID,
  canonicalUrl = PAGE_URL,
}: {
  anansiId?: string | null;
  canonicalUrl?: string | null;
} = {}) => {
  mockedSelector.mockImplementation((selector, parameters) => {
    if (selector !== recordStoreFamilySelector) {
      return null;
    }
    const fieldName = (parameters as { fieldName?: string }).fieldName;
    if (fieldName === 'anansiId') {
      return anansiId;
    }
    if (fieldName === 'canonicalUrl') {
      return canonicalUrl;
    }
    return null;
  });
};

const setChromeRuntime = (sendMessage: jest.Mock) => {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { runtime: { sendMessage } },
  });
};

const clearChromeRuntime = () => {
  Reflect.deleteProperty(globalThis, 'chrome');
};

const pairedStatus = {
  ok: true,
  paired: true,
  deviceId: '33333333-3333-4333-8333-333333333333',
  userId: USER_ID,
  workspaceOrigin: 'http://localhost',
};

const setPairedChromeRuntime = () => {
  const sendMessage = jest.fn(
    (
      _extensionId: string,
      message: { type?: string },
      callback: (response: unknown) => void,
    ) => {
      if (message.type === 'anansi.browser.status.v1') {
        callback(pairedStatus);
      }
    },
  );
  setChromeRuntime(sendMessage);
  return sendMessage;
};

describe('AnansiApplicationRecordButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-27T12:00:00Z'));
    clearChromeRuntime();
    mockedStateValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: {
            token: ACCESS_TOKEN,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          refreshToken: {
            token: 'refresh-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        };
      }
      if (state === currentUserState) {
        return { id: USER_ID };
      }
      if (state === currentWorkspaceState) {
        return { id: WORKSPACE_ID };
      }
      return null;
    });
    setRecord();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    clearChromeRuntime();
    jest.restoreAllMocks();
  });

  it('dismisses and reopens the application status without another Core request', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, state: 'confirmed', state_version: 8 },
          created: false,
          page_url: PAGE_URL,
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    await screen.findByRole('status', { name: 'Application status' });
    const requestsBeforeDismiss = fetchMock.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Close application status' }),
    );

    expect(
      screen.queryByRole('status', { name: 'Application status' }),
    ).not.toBeInTheDocument();
    const showStatus = screen.getByRole('button', {
      name: 'Show application status',
    });
    expect(showStatus).toBeEnabled();
    fireEvent.click(showStatus);

    expect(
      screen.getByRole('status', { name: 'Application status' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeDismiss);
  });

  it('shows exact tenant review values, provenance, documents, unresolved status, and expiry', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(
          jsonOk({ ...queuedAttempt, state: 'review_ready', state_version: 4 }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(pendingReview));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    }) as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const status = await screen.findByRole('status', {
      name: 'Application status',
    });
    expect(status).toHaveTextContent('RuntimeChrome extension');
    expect(status).toHaveTextContent(
      'identity.full_nameJosé Alvarezprofile_fact · profile:4:name',
    );
    expect(status).toHaveTextContent(
      'work.authorizedYesuser_confirmed · answer:9',
    );
    expect(status).toHaveTextContent(
      'skills.selectedPython, Kubernetesapplication_answer · application-answer:12',
    );
    expect(status).toHaveTextContent(
      'supplemental.note<img src=x onerror=steal()>policy · policy:7:note',
    );
    expect(status).toHaveTextContent(
      'Field statusidentity.full_nameverifiedwork.authorizedverified',
    );
    expect(status.querySelector('img')).toBeNull();
    expect(status).toHaveTextContent(
      `document.resumerésumé.pdfapplication/pdf${DOCUMENT_ID}${DOCUMENT_DIGEST}`,
    );
    expect(status).toHaveTextContent('Unresolved questionsNone');
    expect(status).toHaveTextContent(`Review packetPending${PACKET_DIGEST}`);
    expect(status).toHaveTextContent('Approval expiryAfter approval');
    expect(status).not.toHaveTextContent(
      'vault://answer-bundle-must-stay-hidden',
    );
    expect(status).not.toHaveTextContent(
      'vault://document-bundle-must-stay-hidden',
    );
    expect(
      screen.getByRole('button', { name: /Review application/u }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Confirm after submitting/u }),
    ).not.toBeInTheDocument();
  });

  it('shows the exact unresolved review on Needs You without offering a decision', async () => {
    const unresolvedReview = {
      ...pendingReview,
      state: 'needs_user',
      packet: {
        ...pendingReview.packet,
        bindings: pendingReview.packet.bindings.map((binding) =>
          binding.key === 'identity.full_name'
            ? { ...binding, status: 'unresolved' }
            : binding,
        ),
        unresolved: [{ key: 'identity.full_name', reason: 'answer_missing' }],
      },
    };
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk({
            attempt: {
              ...queuedAttempt,
              state: 'needs_user',
              state_version: 4,
            },
            created: false,
            page_url: PAGE_URL,
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(unresolvedReview));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    }) as unknown as typeof fetch;
    const sendMessage = setPairedChromeRuntime();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const status = await screen.findByRole('status', {
      name: 'Application status',
    });
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Unresolved questionsidentity.full_nameanswer_missing',
      ),
    );
    expect(status).toHaveTextContent('Approval expiryNot active');
    expect(
      screen.queryByRole('button', { name: 'Approve exact application' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject application review' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Retry application/u }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Cancel application/u }),
    ).toBeEnabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects review payloads containing browser credentials, document bytes, or secret refs', async () => {
    const unsafeReview = {
      ...pendingReview,
      packet: {
        ...pendingReview.packet,
        runtime_credentials: 'browser-runtime-secret',
        documents: {
          ...pendingReview.packet.documents,
          items: [
            {
              ...pendingReview.packet.documents.items[0],
              bytes: 'raw-document-bytes',
              secret_ref: 'vault://raw-document',
            },
          ],
        },
      },
    };
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(
          jsonOk({ ...queuedAttempt, state: 'review_ready', state_version: 4 }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(unsafeReview));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setChromeRuntime(
      jest.fn(
        (
          _extensionId: string,
          message: { type?: string },
          callback: (response: unknown) => void,
        ) =>
          callback(
            message.type === 'anansi.browser.status.v1'
              ? pairedStatus
              : {
                  ok: true,
                  status: 'review_ready',
                  attemptStateVersion: 4,
                },
          ),
      ),
    );

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const status = await screen.findByRole('status', {
      name: 'Application status',
    });
    await waitFor(() =>
      expect(status).toHaveTextContent('Review packetUnavailable'),
    );
    expect(status).not.toHaveTextContent('browser-runtime-secret');
    expect(status).not.toHaveTextContent('raw-document-bytes');
    expect(status).not.toHaveTextContent('vault://raw-document');
    expect(
      screen.queryByRole('button', { name: 'Approve exact application' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/review`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );
  });

  it('rejects internally inconsistent review approval state', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          ...pendingReview,
          approval_id: REVIEW_ID,
          approval_expires_at: '2026-08-27T12:05:00Z',
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getAnansiApplicationReview(ACCESS_TOKEN, ATTEMPT_ID),
    ).rejects.toThrow('ANANSI: invalid application review response');
  });

  it.each([
    'vault://provider-secret',
    'vault:provider-secret',
    'secret:provider-secret',
  ])('rejects secret provenance reference %s', async (secretReference) => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          ...pendingReview,
          packet: {
            ...pendingReview.packet,
            answers: {
              ...pendingReview.packet.answers,
              items: pendingReview.packet.answers.items.map((item, index) =>
                index === 0
                  ? {
                      ...item,
                      provenance: {
                        ...item.provenance,
                        ref: secretReference,
                      },
                    }
                  : item,
              ),
            },
          },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getAnansiApplicationReview(ACCESS_TOKEN, ATTEMPT_ID),
    ).rejects.toThrow('ANANSI: invalid application review response');
  });

  it.each([
    {
      defect: 'verified binding without a packet item',
      bindings: pendingReview.packet.bindings.map((binding, index) =>
        index === 0 ? { ...binding, key: 'identity.missing' } : binding,
      ),
      unresolved: pendingReview.packet.unresolved,
    },
    {
      defect: 'unmatched unresolved binding',
      bindings: pendingReview.packet.bindings.map((binding, index) =>
        index === 0 ? { ...binding, status: 'unresolved' } : binding,
      ),
      unresolved: pendingReview.packet.unresolved,
    },
  ])('rejects review packet with $defect', async ({ bindings, unresolved }) => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          ...pendingReview,
          packet: { ...pendingReview.packet, bindings, unresolved },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getAnansiApplicationReview(ACCESS_TOKEN, ATTEMPT_ID),
    ).rejects.toThrow('ANANSI: invalid application review response');
  });

  it('accepts safe bundle answers that are not fields in the portal recipe', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          ...pendingReview,
          packet: {
            ...pendingReview.packet,
            bindings: pendingReview.packet.bindings.slice(1),
          },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getAnansiApplicationReview(ACCESS_TOKEN, ATTEMPT_ID),
    ).resolves.toMatchObject({ packet_digest: PACKET_DIGEST });
  });

  it.each([
    {
      action: 'approve',
      button: 'Approve exact application',
      state: 'approved',
      stateLabel: 'Approved',
    },
    {
      action: 'reject',
      button: 'Reject application review',
      state: 'rejected',
      stateLabel: 'Rejected',
    },
  ])(
    '$action sends the exact review version and digest through Core',
    async ({ action, button, state, stateLabel }) => {
      const decidedReview = {
        ...pendingReview,
        state,
        version: 2,
        approval_id: action === 'approve' ? REVIEW_ID : null,
        approval_expires_at:
          action === 'approve' ? '2026-08-27T12:05:00Z' : null,
        decided_at: '2026-08-27T12:00:00Z',
        updated_at: '2026-08-27T12:00:00Z',
      };
      let decisionReturned = false;
      let attemptReads = 0;
      const fetchMock = jest.fn(
        (input: RequestInfo | URL, init?: RequestInit) => {
          const method = (init?.method ?? 'GET').toUpperCase();
          const path = String(input).replace(ANANSI_API_URL, '');
          if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
            return Promise.resolve(
              jsonOk(
                { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
                201,
              ),
            );
          }
          if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
            attemptReads += 1;
            return Promise.resolve(
              jsonOk({
                ...queuedAttempt,
                state:
                  decisionReturned && action === 'reject'
                    ? 'needs_user'
                    : 'review_ready',
                state_version: decisionReturned ? 5 : 4,
              }),
            );
          }
          if (
            method === 'GET' &&
            path === `/v1/applications/attempts/${ATTEMPT_ID}/review`
          ) {
            return Promise.resolve(jsonOk(pendingReview));
          }
          if (
            method === 'POST' &&
            path === `/v1/applications/attempts/${ATTEMPT_ID}/review/${action}`
          ) {
            decisionReturned = true;
            return Promise.resolve(jsonOk(decidedReview));
          }
          throw new Error(`Unmocked fetch: ${method} ${path}`);
        },
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      setChromeRuntime(
        jest.fn(
          (
            _extensionId: string,
            message: { type?: string },
            callback: (response: unknown) => void,
          ) =>
            callback(
              message.type === 'anansi.browser.status.v1'
                ? pairedStatus
                : {
                    ok: true,
                    status: 'review_ready',
                    attemptStateVersion: 4,
                  },
            ),
        ),
      );

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      fireEvent.click(await screen.findByRole('button', { name: button }));

      const status = await screen.findByRole('status', {
        name: 'Application status',
      });
      await waitFor(() => expect(status).toHaveTextContent(stateLabel));
      expect(fetchMock).toHaveBeenCalledWith(
        `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/review/${action}`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${ACCESS_TOKEN}`,
          }),
          body: JSON.stringify({
            expected_version: 1,
            packet_digest: PACKET_DIGEST,
          }),
        }),
      );
      expect(
        screen.queryByRole('button', { name: button }),
      ).not.toBeInTheDocument();
      expect(attemptReads).toBe(2);
      if (action === 'reject') {
        expect(
          screen.getByRole('button', { name: /Retry application/u }),
        ).toBeEnabled();
      }
      expect(status).toHaveTextContent(
        action === 'approve' ? 'Approval expiry' : 'Approval expiryNot active',
      );
    },
  );

  it.each([
    { failure: 'conflict', status: 409, reconciledState: 'approved' },
    { failure: 'expired', status: 422, reconciledState: 'expired' },
    { failure: 'ambiguous', status: 0, reconciledState: 'approved' },
    { failure: 'malformed', status: 200, reconciledState: 'approved' },
  ])(
    're-fetches attempt and review status after a $failure decision response',
    async ({ failure, status, reconciledState }) => {
      const reconciledReview = {
        ...pendingReview,
        state: reconciledState,
        version: 2,
        approval_id: REVIEW_ID,
        approval_expires_at: '2026-08-27T12:05:00Z',
        decided_at: '2026-08-27T12:00:00Z',
        updated_at: '2026-08-27T12:00:00Z',
      };
      let attemptReads = 0;
      let reviewReads = 0;
      const fetchMock = jest.fn(
        (input: RequestInfo | URL, init?: RequestInit) => {
          const method = (init?.method ?? 'GET').toUpperCase();
          const path = String(input).replace(ANANSI_API_URL, '');
          if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
            return Promise.resolve(
              jsonOk(
                { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
                201,
              ),
            );
          }
          if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
            attemptReads += 1;
            return Promise.resolve(
              jsonOk({
                ...queuedAttempt,
                state:
                  attemptReads > 1 && reconciledState === 'expired'
                    ? 'needs_user'
                    : 'review_ready',
                state_version: attemptReads > 1 ? 5 : 4,
              }),
            );
          }
          if (
            method === 'GET' &&
            path === `/v1/applications/attempts/${ATTEMPT_ID}/review`
          ) {
            reviewReads += 1;
            return Promise.resolve(
              jsonOk(reviewReads === 1 ? pendingReview : reconciledReview),
            );
          }
          if (
            method === 'POST' &&
            path === `/v1/applications/attempts/${ATTEMPT_ID}/review/approve`
          ) {
            if (failure === 'ambiguous') {
              return Promise.reject(new Error('decision response lost'));
            }
            if (failure === 'malformed') {
              return Promise.resolve(jsonOk({ result: 'unknown' }));
            }
            return Promise.resolve({
              ok: false,
              status,
              headers: new Headers(),
              json: () =>
                Promise.resolve({
                  detail:
                    failure === 'expired'
                      ? 'application review approval expired'
                      : 'application review version conflict',
                }),
            });
          }
          throw new Error(`Unmocked fetch: ${method} ${path}`);
        },
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      setChromeRuntime(
        jest.fn(
          (
            _extensionId: string,
            message: { type?: string },
            callback: (response: unknown) => void,
          ) =>
            callback(
              message.type === 'anansi.browser.status.v1'
                ? pairedStatus
                : {
                    ok: true,
                    status: 'review_ready',
                    attemptStateVersion: 4,
                  },
            ),
        ),
      );

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Approve exact application',
        }),
      );

      const statusPanel = await screen.findByRole('status', {
        name: 'Application status',
      });
      await waitFor(() =>
        expect(statusPanel).toHaveTextContent(
          reconciledState === 'expired' ? 'Expired' : 'Approved',
        ),
      );
      expect(attemptReads).toBe(2);
      expect(reviewReads).toBe(2);
      expect(
        screen.queryByRole('button', { name: 'Approve exact application' }),
      ).not.toBeInTheDocument();
    },
  );

  it('resumes an approved extension review before offering manual confirmation', async () => {
    const approvedReview = {
      ...pendingReview,
      state: 'approved',
      version: 2,
      approval_id: REVIEW_ID,
      approval_expires_at: '2026-08-27T12:05:00Z',
      decided_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const reviewReadyAttempt = {
      ...queuedAttempt,
      state: 'review_ready',
      state_version: 4,
    };
    const submittedAttempt = {
      ...queuedAttempt,
      state: 'submitted_unconfirmed',
      state_version: 5,
      outward_observed_at: '2026-08-27T12:03:00Z',
    };
    let starts = 0;
    let attemptReads = 0;
    let reviewReads = 0;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
          starts += 1;
          return Promise.resolve(
            jsonOk(
              {
                attempt: starts === 1 ? queuedAttempt : reviewReadyAttempt,
                created: starts === 1,
                page_url: PAGE_URL,
              },
              starts === 1 ? 201 : 200,
            ),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
          attemptReads += 1;
          return Promise.resolve(
            jsonOk(attemptReads < 3 ? reviewReadyAttempt : submittedAttempt),
          );
        }
        if (
          method === 'GET' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/review`
        ) {
          reviewReads += 1;
          return Promise.resolve(
            jsonOk(reviewReads === 1 ? pendingReview : approvedReview),
          );
        }
        if (
          method === 'POST' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/review/approve`
        ) {
          return Promise.resolve(jsonOk(approvedReview));
        }
        throw new Error(`Unmocked fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    let extensionRuns = 0;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) => {
        if (message.type === 'anansi.browser.status.v1') {
          callback(pairedStatus);
          return;
        }
        extensionRuns += 1;
        callback({
          ok: true,
          status:
            extensionRuns === 1 ? 'review_ready' : 'submitted_unconfirmed',
          attemptStateVersion: extensionRuns === 1 ? 4 : 5,
        });
      },
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Approve exact application',
      }),
    );

    const resumeButton = await screen.findByRole('button', {
      name: /Resume approved application/u,
    });
    expect(resumeButton).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Confirm after submitting/u }),
    ).not.toBeInTheDocument();
    fireEvent.click(resumeButton);

    expect(
      await screen.findByRole('button', { name: /Confirm after submitting/u }),
    ).toBeEnabled();
    expect(extensionRuns).toBe(2);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(
          `/v1/applications/attempts/${ATTEMPT_ID}/manual-confirm`,
        ),
      ),
    ).toBe(false);
  });

  it('shows pairing recovery when an approved extension review cannot resume', async () => {
    const reviewReadyAttempt = {
      ...queuedAttempt,
      state: 'review_ready',
      state_version: 4,
    };
    const approvedReview = {
      ...pendingReview,
      state: 'approved',
      version: 2,
      approval_id: REVIEW_ID,
      approval_expires_at: '2026-08-27T12:05:00Z',
      decided_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk({
            attempt: reviewReadyAttempt,
            created: false,
            page_url: PAGE_URL,
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(reviewReadyAttempt));
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(approvedReview));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    }) as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Pair Chrome in Profile/u }),
    ).toBeEnabled();
  });

  it('runs an explicit remote fallback and opens only a fresh one-use review URL', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state: 'queued',
      state_version: 3,
    };
    const remoteSessionId = '55555555-5555-4555-8555-555555555555';
    const launchingSession = {
      id: remoteSessionId,
      attempt_id: ATTEMPT_ID,
      state: 'starting',
      state_version: 1,
      recipe_id: 'greenhouse',
      recipe_version: '1',
      recipe_digest: 'a'.repeat(64),
      review_generation: 0,
      expires_at: '2026-08-27T12:30:00Z',
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
      created_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const reviewSession = {
      ...launchingSession,
      state: 'review_ready',
      state_version: 2,
      started_at: '2026-08-27T12:01:00Z',
      last_heartbeat_at: '2026-08-27T12:02:00Z',
      review_generation: 1,
    };
    const issuedReviewSession = {
      ...reviewSession,
      state_version: 3,
      review_generation: 2,
    };
    const reviewToken = 'r'.repeat(43);
    const reviewUrl = `https://browser.anansi.work/review/${remoteSessionId}#anansi_review_token=${reviewToken}`;
    const responses: Record<string, ReturnType<typeof jsonOk>[]> = {
      [`POST /v1/applications/jobs/${JOB_ID}/start`]: [
        jsonOk(
          { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
          201,
        ),
      ],
      [`POST /v1/applications/attempts/${ATTEMPT_ID}/remote/session`]: [
        jsonOk({ session: launchingSession, created: true }, 201),
      ],
      [`GET /v1/applications/attempts/${ATTEMPT_ID}`]: [
        jsonOk({ ...remoteAttempt, state: 'review_ready', state_version: 4 }),
      ],
      [`GET /v1/applications/attempts/${ATTEMPT_ID}/remote/session`]: [
        jsonOk(reviewSession),
      ],
      [`POST /v1/applications/attempts/${ATTEMPT_ID}/remote/session/review`]: [
        jsonOk({
          session: issuedReviewSession,
          review_url: reviewUrl,
          expires_at: '2026-08-27T12:07:00Z',
        }),
      ],
    };
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const queue = responses[`${method} ${path}`];
        if (queue === undefined || queue.length === 0) {
          throw new Error(`Unmocked fetch: ${method} ${path}`);
        }
        return Promise.resolve(queue.shift());
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const popup = createPopupWindow();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByText('Remote browser starting'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh remote browser' }),
    );
    expect(
      await screen.findByRole('button', {
        name: /Application running remotely/u,
      }),
    ).toBeDisabled();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open one-use remote review',
      }),
    );

    await waitFor(() => expect(popup.replace).toHaveBeenCalledWith(reviewUrl));
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(popup.window.opener).toBeNull();
    expect(document.body.textContent).not.toContain(reviewToken);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(reviewToken);
    openMock.mockRestore();
  });

  it('does not label a terminal remote session as running', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state: 'queued',
      state_version: 3,
    };
    const startingSession = {
      ...handoffSession,
      state: 'starting',
      state_version: 1,
      review_generation: 0,
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
    };
    const failedSession = {
      ...startingSession,
      state: 'failed',
      state_version: 2,
      terminal_at: '2026-08-27T12:02:00Z',
      failure_code: 'browser_failed',
    };
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (
        method === 'POST' &&
        path === `/v1/applications/jobs/${JOB_ID}/start`
      ) {
        return Promise.resolve(
          jsonOk(
            { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (
        method === 'POST' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
      ) {
        return Promise.resolve(
          jsonOk({ session: startingSession, created: true }, 201),
        );
      }
      if (
        method === 'GET' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}`
      ) {
        return Promise.resolve(
          jsonOk({
            ...remoteAttempt,
            state: 'failed',
            state_version: 4,
            failure_code: 'browser_failed',
          }),
        );
      }
      if (
        method === 'GET' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
      ) {
        return Promise.resolve(jsonOk(failedSession));
      }
      throw new Error(`Unmocked fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh remote browser' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Remote browser unavailable' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /Application running remotely/u }),
    ).not.toBeInTheDocument();
  });

  it('rejects a remote review URL that expired before it could open', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state: 'queued',
      state_version: 3,
    };
    const startingSession = {
      id: SESSION_ID,
      attempt_id: ATTEMPT_ID,
      state: 'starting',
      state_version: 1,
      recipe_id: 'greenhouse',
      recipe_version: '1',
      recipe_digest: 'a'.repeat(64),
      review_generation: 0,
      expires_at: '2026-08-27T12:30:00Z',
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
      created_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const readySession = {
      ...startingSession,
      state: 'review_ready',
      state_version: 2,
      started_at: '2026-08-27T12:01:00Z',
      review_generation: 1,
    };
    const issuedSession = {
      ...readySession,
      state_version: 3,
      review_generation: 2,
    };
    const reviewUrl = `https://browser.anansi.work/review/${SESSION_ID}#anansi_review_token=${'r'.repeat(43)}`;
    let sessionReads = 0;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (
        method === 'POST' &&
        path === `/v1/applications/jobs/${JOB_ID}/start`
      ) {
        return Promise.resolve(
          jsonOk(
            { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (
        method === 'POST' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
      ) {
        return Promise.resolve(
          jsonOk({ session: startingSession, created: true }, 201),
        );
      }
      if (
        method === 'GET' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}`
      ) {
        return Promise.resolve(
          jsonOk({ ...remoteAttempt, state: 'review_ready', state_version: 4 }),
        );
      }
      if (
        method === 'GET' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
      ) {
        sessionReads += 1;
        return Promise.resolve(
          jsonOk(sessionReads === 1 ? readySession : issuedSession),
        );
      }
      if (
        method === 'POST' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session/review`
      ) {
        return Promise.resolve(
          jsonOk({
            session: issuedSession,
            review_url: reviewUrl,
            expires_at: '2026-08-27T11:59:59Z',
          }),
        );
      }
      if (
        method === 'GET' &&
        path === `/v1/applications/attempts/${ATTEMPT_ID}/review`
      ) {
        return Promise.reject(new Error('application review unavailable'));
      }
      throw new Error(`Unmocked fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;
    const popup = createPopupWindow();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh remote browser' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open one-use remote review' }),
    );

    await waitFor(() => expect(sessionReads).toBe(2));
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(popup.replace).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Open one-use remote review' }),
    ).toBeEnabled();
  });

  it('reconciles a lost remote session start response with Core', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state_version: 3,
    };
    const committedSession = {
      id: '55555555-5555-4555-8555-555555555555',
      attempt_id: ATTEMPT_ID,
      state: 'starting',
      state_version: 1,
      recipe_id: 'greenhouse',
      recipe_version: '1',
      recipe_digest: 'a'.repeat(64),
      review_generation: 0,
      expires_at: '2026-08-27T12:30:00Z',
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
      created_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
          return Promise.resolve(
            jsonOk(
              { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
              201,
            ),
          );
        }
        if (
          method === 'POST' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
        ) {
          return Promise.reject(new Error('session response lost'));
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
          return Promise.resolve(jsonOk(remoteAttempt));
        }
        if (
          method === 'GET' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
        ) {
          return Promise.resolve(jsonOk(committedSession));
        }
        throw new Error(`Unmocked fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByText('Remote browser starting'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh remote browser' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/remote/session`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );
  });

  it('rejects a stale remote review generation without opening its URL', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state_version: 3,
    };
    const sessionId = '55555555-5555-4555-8555-555555555555';
    const startingSession = {
      id: sessionId,
      attempt_id: ATTEMPT_ID,
      state: 'starting',
      state_version: 1,
      recipe_id: 'greenhouse',
      recipe_version: '1',
      recipe_digest: 'a'.repeat(64),
      review_generation: 0,
      expires_at: '2026-08-27T12:30:00Z',
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
      created_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const readySession = {
      ...startingSession,
      state: 'review_ready',
      state_version: 2,
      review_generation: 1,
      started_at: '2026-08-27T12:01:00Z',
    };
    const responses: Record<string, ReturnType<typeof jsonOk>[]> = {
      [`POST /v1/applications/jobs/${JOB_ID}/start`]: [
        jsonOk(
          { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
          201,
        ),
      ],
      [`POST /v1/applications/attempts/${ATTEMPT_ID}/remote/session`]: [
        jsonOk({ session: startingSession, created: true }, 201),
      ],
      [`GET /v1/applications/attempts/${ATTEMPT_ID}`]: [
        jsonOk({ ...remoteAttempt, state: 'review_ready', state_version: 4 }),
      ],
      [`GET /v1/applications/attempts/${ATTEMPT_ID}/remote/session`]: [
        jsonOk(readySession),
      ],
      [`POST /v1/applications/attempts/${ATTEMPT_ID}/remote/session/review`]: [
        jsonOk({
          session: readySession,
          review_url: `https://review.anansi.work/review/${sessionId}#anansi_review_token=${'s'.repeat(43)}`,
          expires_at: '2026-08-27T12:07:00Z',
        }),
      ],
    };
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      const queue = responses[`${method} ${path}`];
      if (queue === undefined || queue.length === 0) {
        throw new Error(`Unmocked fetch: ${method} ${path}`);
      }
      return Promise.resolve(queue.shift());
    }) as unknown as typeof fetch;
    const popup = createPopupWindow();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh remote browser' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open one-use remote review',
      }),
    );

    await waitFor(() => expect(popup.close).toHaveBeenCalledTimes(1));
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(popup.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Check application' }),
    ).toBeDisabled();
  });

  it('reconciles a lost remote review response before issuing a new generation', async () => {
    const remoteAttempt = {
      ...queuedAttempt,
      runtime: 'remote',
      state_version: 3,
    };
    const sessionId = '55555555-5555-4555-8555-555555555555';
    const startingSession = {
      id: sessionId,
      attempt_id: ATTEMPT_ID,
      state: 'starting',
      state_version: 1,
      recipe_id: 'greenhouse',
      recipe_version: '1',
      recipe_digest: 'a'.repeat(64),
      review_generation: 0,
      expires_at: '2026-08-27T12:30:00Z',
      started_at: null,
      last_heartbeat_at: null,
      terminal_at: null,
      failure_code: null,
      created_at: '2026-08-27T12:00:00Z',
      updated_at: '2026-08-27T12:00:00Z',
    };
    const readySession = {
      ...startingSession,
      state: 'review_ready',
      state_version: 2,
      review_generation: 1,
      started_at: '2026-08-27T12:01:00Z',
    };
    const committedSession = {
      ...readySession,
      state_version: 3,
      review_generation: 2,
    };
    const issuedSession = {
      ...readySession,
      state_version: 4,
      review_generation: 3,
    };
    const reviewUrl = `https://browser.anansi.work/review/${sessionId}#anansi_review_token=${'t'.repeat(43)}`;
    let sessionReads = 0;
    let reviewPosts = 0;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
          return Promise.resolve(
            jsonOk(
              { attempt: remoteAttempt, created: true, page_url: PAGE_URL },
              201,
            ),
          );
        }
        if (
          method === 'POST' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
        ) {
          return Promise.resolve(
            jsonOk({ session: startingSession, created: true }, 201),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
          return Promise.resolve(
            jsonOk({
              ...remoteAttempt,
              state: 'review_ready',
              state_version: 4,
            }),
          );
        }
        if (
          method === 'GET' &&
          path === `/v1/applications/attempts/${ATTEMPT_ID}/remote/session`
        ) {
          sessionReads += 1;
          return Promise.resolve(
            jsonOk(sessionReads === 1 ? readySession : committedSession),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
          return Promise.resolve(jsonOk(pendingReview));
        }
        if (
          method === 'POST' &&
          path ===
            `/v1/applications/attempts/${ATTEMPT_ID}/remote/session/review`
        ) {
          reviewPosts += 1;
          if (reviewPosts === 1) {
            return Promise.reject(new Error('review response lost'));
          }
          return Promise.resolve(
            jsonOk({
              session: issuedSession,
              review_url: reviewUrl,
              expires_at: '2026-08-27T12:07:00Z',
            }),
          );
        }
        throw new Error(`Unmocked fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const firstPopup = createPopupWindow();
    const secondPopup = createPopupWindow();
    const openMock = jest
      .spyOn(window, 'open')
      .mockReturnValueOnce(firstPopup.window)
      .mockReturnValueOnce(secondPopup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh remote browser' }),
    );
    const reviewButton = await screen.findByRole('button', {
      name: 'Open one-use remote review',
    });
    fireEvent.click(reviewButton);

    await waitFor(() => expect(sessionReads).toBe(2));
    expect(firstPopup.close).toHaveBeenCalledTimes(1);
    expect(firstPopup.replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open one-use remote review' }),
    );
    await waitFor(() =>
      expect(secondPopup.replace).toHaveBeenCalledWith(reviewUrl),
    );
    expect(openMock).toHaveBeenCalledTimes(2);
    expect(openMock).toHaveBeenNthCalledWith(1, '', '_blank');
    expect(openMock).toHaveBeenNthCalledWith(2, '', '_blank');
    const reviewBodies = fetchMock.mock.calls
      .filter(([input, init]) => {
        const method = (
          (init as RequestInit | undefined)?.method ?? 'GET'
        ).toUpperCase();
        return (
          method === 'POST' &&
          String(input).endsWith(
            `/v1/applications/attempts/${ATTEMPT_ID}/remote/session/review`,
          )
        );
      })
      .map(([, init]) => (init as RequestInit).body);
    expect(reviewBodies).toEqual([
      JSON.stringify({ expected_version: 2 }),
      JSON.stringify({ expected_version: 3 }),
    ]);
    openMock.mockRestore();
  });

  it('does not authorize manual control when the popup is blocked', async () => {
    const fetchMock = installHandoffFetch();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(null);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    const authorizeButton = await screen.findByRole('button', {
      name: 'Authorize one-use manual control',
    });
    fireEvent.click(authorizeButton);

    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/manual-control/authorize'),
      ),
    ).toHaveLength(0);
    expect(authorizeButton).toBeEnabled();
  });

  it('preopens manual control synchronously before authorization and navigates the same popup', async () => {
    let resolveAuthorization:
      | ((value: ReturnType<typeof jsonOk>) => void)
      | undefined;
    installHandoffFetch({
      authorize: () =>
        new Promise((resolve) => {
          resolveAuthorization = resolve;
        }),
    });
    const popup = createPopupWindow();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(popup.window.opener).toBeNull();
    expect(popup.replace).not.toHaveBeenCalled();

    resolveAuthorization?.(jsonOk(authorizationResponse));

    await waitFor(() =>
      expect(popup.replace).toHaveBeenCalledWith(CONTROL_URL),
    );
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it('retains an exact expired authorization receipt for not-submitted resolution without opening control', async () => {
    const expiredAt = '2026-08-27T11:59:59Z';
    installHandoffFetch({
      authorize: () =>
        Promise.resolve(
          jsonOk({
            ...authorizationResponse,
            expires_at: expiredAt,
            control: {
              ...authorizationResponse.control,
              control_expires_at: expiredAt,
            },
          }),
        ),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    await waitFor(() => expect(popup.close).toHaveBeenCalledTimes(1));
    expect(popup.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Resolve as not submitted' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Resolve as confirmed' }),
    ).toBeEnabled();
  });

  it('restores same-record manual resolution after the record action remounts', async () => {
    let authorized = false;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      resolve: () =>
        Promise.resolve(jsonOk(resolutionResponse('not_submitted'))),
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    const first = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    await screen.findByRole('button', { name: 'Resolve as not submitted' });
    const authorizationBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/authorize'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    first.unmount();
    expect(popup.close).toHaveBeenCalledTimes(1);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve as not submitted' }),
    );

    expect(
      await screen.findByRole('button', { name: /Application not submitted/u }),
    ).toBeDisabled();
    const resolutionBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/resolve'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    expect(resolutionBody.authorization_key).toBe(
      authorizationBody.authorization_key,
    );
  });

  it('recovers authorization committed after unmount before its response is handled', async () => {
    let authorized = false;
    let authorizationCalls = 0;
    let resolveAuthorization:
      | ((value: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorizationCalls += 1;
        if (authorizationCalls > 1) {
          return Promise.resolve(jsonOk(authorizationResponse));
        }
        return new Promise((resolve) => {
          resolveAuthorization = (value) => {
            authorized = true;
            resolve(value);
          };
        });
      },
      resolve: () =>
        Promise.resolve(jsonOk(resolutionResponse('not_submitted'))),
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    const first = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    const authorizationBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/authorize'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    first.unmount();
    resolveAuthorization?.(jsonOk(authorizationResponse));

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    const resolveButton = await screen.findByRole('button', {
      name: 'Resolve as not submitted',
    });
    expect(authorizationCalls).toBe(2);
    fireEvent.click(resolveButton);

    expect(
      await screen.findByRole('button', { name: /Application not submitted/u }),
    ).toBeDisabled();
    const resolutionBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/resolve'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    expect(resolutionBody.authorization_key).toBe(
      authorizationBody.authorization_key,
    );
  });

  it('rejects a pending key after Core reports a competing committed authorization', async () => {
    let authorizationCalls = 0;
    let competingAuthorization = false;
    installHandoffFetch({
      authorize: () => {
        authorizationCalls += 1;
        if (authorizationCalls === 1) {
          return new Promise(() => undefined);
        }
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers(),
          json: () => Promise.resolve({ detail: 'manual control changed' }),
        });
      },
      readAttempt: () =>
        competingAuthorization ? authorizedAttempt : handoffAttempt,
      readSession: () =>
        competingAuthorization ? controlReadySession : handoffSession,
      readControl: () =>
        competingAuthorization ? authorizedControl : handoffControl,
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    const first = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    first.unmount();
    competingAuthorization = true;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Confirm after submitting/u }),
    ).toBeEnabled();
    expect(authorizationCalls).toBe(2);
    expect(
      screen.queryByRole('button', { name: 'Resolve as confirmed' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resolve as not submitted' }),
    ).not.toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('removes a pending authorization entry with an unknown stored field', async () => {
    installHandoffFetch({
      authorize: () => new Promise(() => undefined),
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    const first = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    const storageKey = window.sessionStorage.key(0) ?? '';
    const pending = JSON.parse(
      window.sessionStorage.getItem(storageKey) ?? '{}',
    );
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ ...pending, unexpected: true }),
    );
    first.unmount();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    ).toBeEnabled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps each authorized manual resolution across record navigation', async () => {
    let authorized = false;
    installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="first-record"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    await screen.findByRole('button', { name: 'Resolve as not submitted' });

    setRecord({
      anansiId: '33333333-3333-4333-8333-333333333333',
      canonicalUrl: 'https://jobs.lever.co/acme/second',
    });
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="second-record"
      />,
    );
    await screen.findByRole('button', { name: /^Fill application/u });

    setRecord();
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="first-record"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Fill application/u }));

    expect(
      await screen.findByRole('button', { name: 'Resolve as not submitted' }),
    ).toBeEnabled();
  });

  it('recovers a transient handoff read failure through the main action', async () => {
    let controlReads = 0;
    installHandoffFetch({
      readControl: () => {
        controlReads += 1;
        if (controlReads === 1) {
          throw new Error('control read unavailable');
        }
        return handoffControl;
      },
    });

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const retryButton = await screen.findByRole('button', {
      name: 'Manual control required',
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    expect(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    ).toBeEnabled();
    expect(controlReads).toBe(2);
  });

  it('stops the retained remote session by exact version and reconciles a lost response', async () => {
    let stopCommitted = false;
    const stoppedAttempt = applicationAttemptOutput({
      state: 'needs_user',
      state_version: 8,
      lease_owner: null,
      lease_expires_at: null,
      failure_code: 'remote_session_stopped',
    });
    const stoppedSession = {
      ...handoffSession,
      state: 'stopped',
      state_version: 6,
      review_generation: 3,
      terminal_at: '2026-08-27T12:05:00Z',
      failure_code: null,
    };
    const fetchMock = installHandoffFetch({
      stop: () => {
        stopCommitted = true;
        return Promise.reject(new Error('stop response lost'));
      },
      readAttempt: () => (stopCommitted ? stoppedAttempt : handoffAttempt),
      readSession: () => (stopCommitted ? stoppedSession : handoffSession),
    });

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop remote browser' }),
    );

    expect(
      await screen.findByRole('button', { name: /Retry application/u }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/remote/session/stop`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 4 }),
      }),
    );
  });

  it('stops an authorized manual-control session by its exact version', async () => {
    let authorized = false;
    let stopped = false;
    const stoppedAttempt = applicationAttemptOutput({
      state: 'needs_user',
      state_version: 9,
      lease_owner: null,
      lease_expires_at: null,
      outward_observed_at: '2026-08-27T12:04:30Z',
      submitted_at: '2026-08-27T12:04:30Z',
      failure_code: 'remote_session_stopped',
    });
    const stoppedSession = {
      ...controlReadySession,
      state: 'stopped',
      state_version: 7,
      review_generation: 4,
      terminal_at: '2026-08-27T12:05:00Z',
      failure_code: null,
    };
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      stop: () => {
        stopped = true;
        return Promise.resolve(jsonOk(stoppedSession));
      },
      readAttempt: () =>
        stopped
          ? stoppedAttempt
          : authorized
            ? authorizedAttempt
            : handoffAttempt,
      readSession: () =>
        stopped
          ? stoppedSession
          : authorized
            ? controlReadySession
            : handoffSession,
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    const stopButton = await screen.findByRole('button', {
      name: 'Stop remote browser',
    });
    await waitFor(() => expect(stopButton).toBeEnabled());
    fireEvent.click(stopButton);

    expect(
      await screen.findByRole('button', { name: /Retry application/u }),
    ).toBeEnabled();
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/remote/session/stop`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 5 }),
      }),
    );
  });

  it('keeps Stop and outcome recovery when Stop fails before Core commits', async () => {
    let authorized = false;
    let stopCalls = 0;
    installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      stop: () => {
        stopCalls += 1;
        return Promise.reject(new Error('stop unavailable'));
      },
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    const stopButton = await screen.findByRole('button', {
      name: 'Stop remote browser',
    });
    await waitFor(() => expect(stopButton).toBeEnabled());
    fireEvent.click(stopButton);

    await waitFor(() => expect(stopCalls).toBe(1));
    expect(popup.close).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(stopButton).toBeEnabled());
    expect(
      screen.getByRole('button', { name: 'Resolve as confirmed' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Resolve as not submitted' }),
    ).toBeEnabled();
  });

  it('replaces a stale handoff tuple with the exact refreshed snapshot', async () => {
    let drifted = false;
    const displayedSession = { ...handoffSession };
    const refreshedAttempt = { ...handoffAttempt, state_version: 8 };
    const refreshedSession = { ...handoffSession, state_version: 5 };
    const refreshedControl = {
      ...handoffControl,
      version: 4,
      packet_digest: '8'.repeat(64),
    };
    installHandoffFetch({
      readAttempt: () => (drifted ? refreshedAttempt : handoffAttempt),
      readSession: () => (drifted ? refreshedSession : displayedSession),
      readControl: () => (drifted ? refreshedControl : handoffControl),
    });

    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    await screen.findByRole('button', {
      name: 'Authorize one-use manual control',
    });

    drifted = true;
    displayedSession.state = 'review_ready';
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh remote browser' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Authorize one-use manual control',
        }),
      ).toBeEnabled(),
    );
  });

  it('shows the exact handoff warning, sends the exact authorization CAS, and opens one validated control URL', async () => {
    const fetchMock = installHandoffFetch();
    const popup = createPopupWindow();
    const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const warning = await screen.findByText(
      /Manual control permits unrestricted keyboard and pointer input/u,
    );
    expect(warning).toHaveTextContent(
      'Core records the application as possibly submitted before control opens.',
    );
    expect(warning).toHaveTextContent(
      'Anansi cannot determine which page controls you use.',
    );
    expect(document.body).not.toHaveTextContent(
      /captcha|stealth|fingerprint|bypass|evasion/iu,
    );
    expect(
      screen.queryByRole('button', { name: /retry|reconnect/iu }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    await waitFor(() =>
      expect(popup.replace).toHaveBeenCalledWith(CONTROL_URL),
    );
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    const authorizationCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() ===
          'POST' &&
        String(input).endsWith(
          `/v1/applications/attempts/${ATTEMPT_ID}/manual-control/authorize`,
        ),
    );
    expect(authorizationCalls).toHaveLength(1);
    const authorizationBody = JSON.parse(
      String((authorizationCalls[0]?.[1] as RequestInit).body),
    );
    expect(authorizationBody).toEqual({
      expected_attempt_version: 7,
      expected_session_version: 4,
      expected_control_version: 3,
      packet_digest: HANDOFF_PACKET_DIGEST,
      authorization_key: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(Object.keys(authorizationBody)).toHaveLength(5);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(1);
    expect(
      window.sessionStorage.getItem(window.sessionStorage.key(0) ?? ''),
    ).not.toContain(CONTROL_TOKEN);
    expect(document.body.textContent).not.toContain(CONTROL_TOKEN);
    expect(
      screen.getByRole('button', { name: 'Resolve as confirmed' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Resolve as not submitted' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Confirm after submitting/u }),
    ).not.toBeInTheDocument();
  });

  it('replays a lost authorization response with the original versions and authorization key', async () => {
    let authorizationCalls = 0;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorizationCalls += 1;
        return authorizationCalls === 1
          ? Promise.reject(new Error('authorization response lost'))
          : Promise.resolve(jsonOk(authorizationResponse));
      },
    });
    const firstPopup = createPopupWindow();
    const secondPopup = createPopupWindow();
    const openMock = jest
      .spyOn(window, 'open')
      .mockReturnValueOnce(firstPopup.window)
      .mockReturnValueOnce(secondPopup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    const authorizeButton = await screen.findByRole('button', {
      name: 'Authorize one-use manual control',
    });
    fireEvent.click(authorizeButton);

    await waitFor(() => expect(authorizationCalls).toBe(1));
    expect(openMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(firstPopup.close).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Authorize one-use manual control',
        }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole('button', { name: /retry|reconnect/iu }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    await waitFor(() =>
      expect(secondPopup.replace).toHaveBeenCalledWith(CONTROL_URL),
    );
    expect(openMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls
      .filter(([input]) =>
        String(input).endsWith(
          `/v1/applications/attempts/${ATTEMPT_ID}/manual-control/authorize`,
        ),
      )
      .map(([, init]) => (init as RequestInit).body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it('abandons a stale authorization tuple after Core reports a competing authorization', async () => {
    let authorizationCalls = 0;
    let competingAuthorization = false;
    installHandoffFetch({
      authorize: () => {
        authorizationCalls += 1;
        competingAuthorization = true;
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers(),
          json: () => Promise.resolve({ detail: 'manual control changed' }),
        });
      },
      readAttempt: () =>
        competingAuthorization ? authorizedAttempt : handoffAttempt,
      readSession: () =>
        competingAuthorization ? controlReadySession : handoffSession,
      readControl: () =>
        competingAuthorization ? authorizedControl : handoffControl,
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    await waitFor(() => expect(authorizationCalls).toBe(1));
    expect(
      await screen.findByRole('button', { name: /Confirm after submitting/u }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    ).not.toBeInTheDocument();
  });

  it('preserves a pending authorization tuple across a bearer refresh but ignores the old bearer response', async () => {
    let currentAccessToken = ACCESS_TOKEN;
    mockedStateValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: {
            token: currentAccessToken,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          refreshToken: {
            token: 'refresh-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        };
      }
      if (state === currentUserState) {
        return { id: USER_ID };
      }
      if (state === currentWorkspaceState) {
        return { id: WORKSPACE_ID };
      }
      return null;
    });
    let resolveFirstAuthorization:
      | ((value: ReturnType<typeof jsonOk>) => void)
      | undefined;
    let authorizationCalls = 0;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorizationCalls += 1;
        if (authorizationCalls === 1) {
          return new Promise((resolve) => {
            resolveFirstAuthorization = resolve;
          });
        }
        return Promise.resolve(jsonOk(authorizationResponse));
      },
    });
    const firstPopup = createPopupWindow();
    const secondPopup = createPopupWindow();
    const openMock = jest
      .spyOn(window, 'open')
      .mockReturnValueOnce(firstPopup.window)
      .mockReturnValueOnce(secondPopup.window);
    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    currentAccessToken = 'refreshed-access-token';
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    resolveFirstAuthorization?.(jsonOk(authorizationResponse));
    await act(async () => Promise.resolve());
    expect(openMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(firstPopup.close).toHaveBeenCalledTimes(1));
    expect(firstPopup.replace).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );

    await waitFor(() =>
      expect(secondPopup.replace).toHaveBeenCalledWith(CONTROL_URL),
    );
    expect(openMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith(
        `/v1/applications/attempts/${ATTEMPT_ID}/manual-control/authorize`,
      ),
    );
    expect(calls).toHaveLength(2);
    expect((calls[0]?.[1] as RequestInit).body).toBe(
      (calls[1]?.[1] as RequestInit).body,
    );
    expect((calls[0]?.[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
    );
    expect((calls[1]?.[1] as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer refreshed-access-token',
      }),
    );
  });

  it.each(['owner', 'record'])(
    'invalidates a pending manual-control response after the %s changes',
    async (changedIdentity) => {
      let currentUserId = USER_ID;
      mockedStateValue.mockImplementation((state) => {
        if (state === tokenPairState) {
          return {
            accessOrWorkspaceAgnosticToken: {
              token: ACCESS_TOKEN,
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
            refreshToken: {
              token: 'refresh-token',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
          };
        }
        if (state === currentUserState) {
          return { id: currentUserId };
        }
        if (state === currentWorkspaceState) {
          return { id: WORKSPACE_ID };
        }
        return null;
      });
      let resolveAuthorization:
        | ((value: ReturnType<typeof jsonOk>) => void)
        | undefined;
      installHandoffFetch({
        authorize: () =>
          new Promise((resolve) => {
            resolveAuthorization = resolve;
          }),
      });
      const popup = createPopupWindow();
      const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);
      const { rerender } = render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="first-record"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Authorize one-use manual control',
        }),
      );

      if (changedIdentity === 'owner') {
        currentUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      } else {
        setRecord({
          anansiId: '33333333-3333-4333-8333-333333333333',
          canonicalUrl: 'https://jobs.lever.co/acme/second',
        });
      }
      rerender(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId={
            changedIdentity === 'record' ? 'second-record' : 'first-record'
          }
        />,
      );
      resolveAuthorization?.(jsonOk(authorizationResponse));
      await act(async () => Promise.resolve());

      expect(openMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(popup.close).toHaveBeenCalledTimes(1));
      expect(popup.replace).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', {
          name: 'Authorize one-use manual control',
        }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps committed request identity when an uncommitted render suspends', async () => {
    let currentAccessToken = ACCESS_TOKEN;
    mockedStateValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: {
            token: currentAccessToken,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          refreshToken: {
            token: 'refresh-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        };
      }
      if (state === currentUserState) {
        return { id: USER_ID };
      }
      if (state === currentWorkspaceState) {
        return { id: WORKSPACE_ID };
      }
      return null;
    });
    let resolveStart: ((value: ReturnType<typeof jsonOk>) => void) | undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    ) as unknown as typeof fetch;
    const suspended = new Promise<never>(() => undefined);
    let shouldSuspend = false;
    const SuspenderEffect = () => {
      if (shouldSuspend) {
        throw suspended;
      }
      return null;
    };
    const content = () => (
      <Suspense fallback={null}>
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />
        <SuspenderEffect />
      </Suspense>
    );
    const { rerender } = render(content());
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    currentAccessToken = 'uncommitted-access-token';
    shouldSuspend = true;
    startTransition(() => rerender(content()));
    resolveStart?.(
      jsonOk({
        attempt: { ...queuedAttempt, state: 'confirmed', state_version: 8 },
        created: false,
        page_url: PAGE_URL,
      }),
    );

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
  });

  it.each([
    ['extra field', { ...authorizationResponse, unexpected: true }],
    [
      'attempt identity',
      {
        ...authorizationResponse,
        attempt: {
          ...authorizationResponse.attempt,
          id: '33333333-3333-4333-8333-333333333333',
        },
      },
    ],
    [
      'packet digest',
      {
        ...authorizationResponse,
        control: {
          ...authorizationResponse.control,
          packet_digest: '8'.repeat(64),
        },
      },
    ],
    [
      'attempt version',
      {
        ...authorizationResponse,
        attempt: { ...authorizationResponse.attempt, state_version: 9 },
      },
    ],
    [
      'session state',
      { ...authorizationResponse, session_state: 'review_ready' },
    ],
  ])(
    'does not open a control URL after a malformed %s response',
    async (_case, response) => {
      installHandoffFetch({
        authorize: () => Promise.resolve(jsonOk(response)),
      });
      const popup = createPopupWindow();
      const openMock = jest.spyOn(window, 'open').mockReturnValue(popup.window);

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Authorize one-use manual control',
        }),
      );

      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'Authorize one-use manual control',
          }),
        ).toBeEnabled(),
      );
      expect(openMock).toHaveBeenCalledTimes(1);
      expect(popup.replace).not.toHaveBeenCalled();
      expect(popup.close).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('button', { name: 'Resolve as confirmed' }),
      ).not.toBeInTheDocument();
    },
  );

  it('locks a chosen resolution outcome and replays the same body after a lost response', async () => {
    let authorized = false;
    let resolutionCalls = 0;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      resolve: () => {
        resolutionCalls += 1;
        return resolutionCalls === 1
          ? Promise.reject(new Error('resolution response lost'))
          : Promise.resolve(jsonOk(resolutionResponse('confirmed')));
      },
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve as confirmed' }),
    );

    await waitFor(() => expect(resolutionCalls).toBe(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Resolve as confirmed' }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole('button', { name: 'Resolve as not submitted' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /retry|reconnect/iu }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Resolve as confirmed' }),
    );

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    const authorizationBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/authorize'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    const resolutionBodies = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith('/manual-control/resolve'))
      .map(([, init]) => (init as RequestInit).body);
    expect(resolutionBodies).toEqual([
      JSON.stringify({
        expected_attempt_version: 8,
        expected_session_version: 5,
        expected_control_version: 4,
        packet_digest: HANDOFF_PACKET_DIGEST,
        authorization_key: authorizationBody.authorization_key,
        outcome: 'confirmed',
      }),
      JSON.stringify({
        expected_attempt_version: 8,
        expected_session_version: 5,
        expected_control_version: 4,
        packet_digest: HANDOFF_PACKET_DIGEST,
        authorization_key: authorizationBody.authorization_key,
        outcome: 'confirmed',
      }),
    ]);
  });

  it('preserves the chosen resolution after one reconciliation read fails', async () => {
    let authorized = false;
    let resolutionCalls = 0;
    let failSessionRead = false;
    const fetchMock = installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      resolve: () => {
        resolutionCalls += 1;
        failSessionRead = true;
        return resolutionCalls === 1
          ? Promise.reject(new Error('resolution response lost'))
          : Promise.resolve(jsonOk(resolutionResponse('confirmed')));
      },
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => {
        if (failSessionRead) {
          failSessionRead = false;
          throw new Error('session read unavailable');
        }
        return authorized ? controlReadySession : handoffSession;
      },
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve as confirmed' }),
    );

    await waitFor(() => expect(resolutionCalls).toBe(1));
    const retryButton = await screen.findByRole('button', {
      name: 'Resolve as confirmed',
    });
    expect(retryButton).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Resolve as not submitted' }),
    ).not.toBeInTheDocument();
    fireEvent.click(retryButton);

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    const resolutionBodies = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith('/manual-control/resolve'))
      .map(([, init]) => (init as RequestInit).body);
    expect(resolutionBodies).toHaveLength(2);
    expect(resolutionBodies[1]).toBe(resolutionBodies[0]);
  });

  it('restores exact resolution retry without waiting for stalled status reads', async () => {
    let authorized = false;
    let resolutionCalls = 0;
    installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      resolve: () => {
        resolutionCalls += 1;
        return Promise.reject(new Error('resolution response lost'));
      },
      readAttempt: () =>
        authorized ? new Promise<never>(() => undefined) : handoffAttempt,
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve as confirmed' }),
    );

    await waitFor(() => expect(resolutionCalls).toBe(1));
    expect(
      await screen.findByRole('button', { name: 'Resolve as confirmed' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Resolve as not submitted' }),
    ).not.toBeInTheDocument();
  });

  it('resolves manual control as not submitted and leaves the attempt permanently stopped', async () => {
    const fetchMock = installHandoffFetch({
      resolve: () =>
        Promise.resolve(jsonOk(resolutionResponse('not_submitted'))),
    });
    const popup = createPopupWindow();
    jest.spyOn(window, 'open').mockReturnValue(popup.window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    const notSubmittedButton = await screen.findByRole('button', {
      name: 'Resolve as not submitted',
    });
    await waitFor(() => expect(notSubmittedButton).toBeEnabled());
    fireEvent.click(notSubmittedButton);

    expect(
      await screen.findByRole('button', { name: /Application not submitted/u }),
    ).toBeDisabled();
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /retry|reconnect|resolve/iu }),
    ).not.toBeInTheDocument();
    const resolutionBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith('/manual-control/resolve'),
          )?.[1] as RequestInit
        ).body,
      ),
    );
    expect(resolutionBody.outcome).toBe('not_submitted');
    expect(Object.keys(resolutionBody)).toHaveLength(6);
  });

  it('rejects a malformed terminal resolution without changing or broadening the chosen outcome', async () => {
    let authorized = false;
    installHandoffFetch({
      authorize: () => {
        authorized = true;
        return Promise.resolve(jsonOk(authorizationResponse));
      },
      resolve: () =>
        Promise.resolve(
          jsonOk({ ...resolutionResponse('confirmed'), unexpected: true }),
        ),
      readAttempt: () => (authorized ? authorizedAttempt : handoffAttempt),
      readSession: () => (authorized ? controlReadySession : handoffSession),
      readControl: () => (authorized ? authorizedControl : handoffControl),
    });
    jest.spyOn(window, 'open').mockReturnValue(createPopupWindow().window);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Authorize one-use manual control',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve as confirmed' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Resolve as confirmed' }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole('button', { name: 'Resolve as not submitted' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Application submitted/u }),
    ).not.toBeInTheDocument();
  });

  it('rejects an application start response bound to another Job', async () => {
    const otherJobId = '33333333-3333-4333-8333-333333333333';
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            {
              attempt: { ...queuedAttempt, job_id: otherJobId },
              created: true,
              page_url: PAGE_URL,
            },
            201,
          ),
        );
      }
      throw new Error(`Unmocked fetch: ${path}`);
    }) as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application unavailable/u }),
    ).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('fails closed on an ambiguous Core runtime mapping', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, runtime: 'unknown' },
          created: true,
          page_url: PAGE_URL,
        }),
      ),
    ) as unknown as typeof fetch;
    const sendMessage = setPairedChromeRuntime();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: 'Application unavailable' }),
    ).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      expect.objectContaining({ type: 'anansi.browser.run.v1' }),
      expect.any(Function),
    );
  });

  it('fails closed on an unknown Core application state', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, state: 'future_state' },
          created: false,
          page_url: PAGE_URL,
        }),
      ),
    ) as unknown as typeof fetch;
    const sendMessage = setPairedChromeRuntime();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: 'Application unavailable' }),
    ).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      expect.objectContaining({ type: 'anansi.browser.run.v1' }),
      expect.any(Function),
    );
  });

  it('uses the server-owned application URL when the mirror URL is unsupported', async () => {
    setRecord({ canonicalUrl: 'https://example.test/stale-job-copy' });
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(
          jsonOk({ ...queuedAttempt, state: 'review_ready', state_version: 4 }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(pendingReview));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const reviewButton = await screen.findByRole('button', {
      name: /Review application/u,
    });
    expect(reviewButton).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/jobs/${JOB_ID}/start`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      {
        type: 'anansi.browser.run.v1',
        attemptId: ATTEMPT_ID,
        pageUrl: PAGE_URL,
      },
      expect.any(Function),
    );
    expect(JSON.stringify(sendMessage.mock.calls[0])).not.toContain(
      ACCESS_TOKEN,
    );
  });

  it.each([
    'https://www.linkedin.com/jobs/view/1004',
    'https://www.indeed.com/viewjob?jk=1005',
    'https://www.dice.com/job-detail/1006',
    'https://wellfound.com/jobs/1007',
  ])('starts an assist-only application at exact URL %s', async (pageUrl) => {
    setRecord({ canonicalUrl: pageUrl });
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        jsonOk(
          { attempt: queuedAttempt, created: true, page_url: pageUrl },
          201,
        ),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : { ok: true, status: 'assist_ready', attemptStateVersion: 4 },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', {
        name: /Open page, click Anansi, then check here/u,
      }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      {
        type: 'anansi.browser.run.v1',
        attemptId: ATTEMPT_ID,
        pageUrl,
      },
      expect.any(Function),
    );
  });

  it('rechecks Core after an assist-only fill completes in its page', async () => {
    const assistUrl = 'https://www.linkedin.com/jobs/view/1004';
    setRecord({ canonicalUrl: assistUrl });
    let starts = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.resolve(jsonOk(pendingReview));
      }
      if (path !== `/v1/applications/jobs/${JOB_ID}/start`) {
        throw new Error(`Unmocked fetch: ${path}`);
      }
      starts += 1;
      return Promise.resolve(
        jsonOk(
          {
            attempt:
              starts === 1
                ? queuedAttempt
                : { ...queuedAttempt, state: 'review_ready', state_version: 4 },
            created: starts === 1,
            page_url: assistUrl,
          },
          starts === 1 ? 201 : 200,
        ),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : { ok: true, status: 'assist_ready' },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    const checkButton = await screen.findByRole('button', {
      name: /Open page, click Anansi, then check here/u,
    });
    expect(checkButton).toBeEnabled();
    fireEvent.click(checkButton);

    expect(
      await screen.findByRole('button', {
        name: /Review application/u,
      }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    'https://linkedin.com/jobs/view/1004',
    'https://www.linkedin.com/jobs/view/1004/',
    'https://www.linkedin.com/jobs/view/../1004',
    'https://www.linkedin.com/jobs/view/%31%30%30%34',
    'https://www.linkedin.com/jobs/view/1004?trk=jobs',
    'https://www.indeed.com/viewjob?jk=1005&from=alert',
    'https://www.indeed.com/viewjob?JK=1005',
    'https://www.indeed.com/viewjob?jk=%31%30%30%35',
    'https://www.dice.com/job-detail/1006#apply',
    'https://www.dice.com/job-detail/1006/extra',
    'https://wellfound.com/jobs/1007?ref=alert',
    'https://www.wellfound.com/jobs/1007',
    'https://user@www.linkedin.com/jobs/view/1004',
    'https://www.linkedin.com:443/jobs/view/1004',
    'https://www.linkedin.com\\jobs\\view\\1004',
    'https://www.linkedin.com/jobs/view/1004\n',
  ])(
    'does not trust noncanonical mirror URL %s before asking Core',
    (pageUrl) => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      setRecord({ canonicalUrl: pageUrl });

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );

      expect(
        screen.getByRole('button', { name: /Fill application/u }),
      ).toBeEnabled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('manually confirms an observed submission by exact version', async () => {
    const submittedAttempt = {
      ...queuedAttempt,
      state: 'submitted_unconfirmed',
      state_version: 4,
      outward_observed_at: '2026-08-27T12:03:00Z',
    };
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(submittedAttempt));
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.reject(new Error('review unavailable'));
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/manual-confirm`) {
        return Promise.resolve(
          jsonOk({ ...queuedAttempt, state: 'confirmed', state_version: 5 }),
        );
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Confirm after submitting/u,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm application submitted/u }),
    );

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/manual-confirm`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 4 }),
      }),
    );
  });

  it('rejects a manual-confirm response for another application attempt', async () => {
    const submittedAttempt = {
      ...queuedAttempt,
      state: 'submitted_unconfirmed',
      state_version: 4,
      outward_observed_at: '2026-08-27T12:03:00Z',
      submitted_at: '2026-08-27T12:03:00Z',
    };
    const otherAttemptId = '33333333-3333-4333-8333-333333333333';
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk({
            attempt: submittedAttempt,
            created: false,
            page_url: PAGE_URL,
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
        return Promise.reject(new Error('review unavailable'));
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/manual-confirm`) {
        return Promise.resolve(
          jsonOk({
            ...submittedAttempt,
            id: otherAttemptId,
            state: 'confirmed',
            state_version: 5,
            confirmed_at: '2026-08-27T12:04:00Z',
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(submittedAttempt));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    }) as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Confirm after submitting/u }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm application submitted/u }),
    );

    expect(
      await screen.findByRole('button', { name: /Confirm after submitting/u }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Application submitted/u }),
    ).not.toBeInTheDocument();
  });

  it('reconciles a lost manual-confirm response before showing recovery', async () => {
    const submittedAttempt = {
      ...queuedAttempt,
      state: 'submitted_unconfirmed',
      state_version: 4,
      outward_observed_at: '2026-08-27T12:03:00Z',
    };
    const confirmedAttempt = {
      ...queuedAttempt,
      state: 'confirmed',
      state_version: 5,
    };
    let attemptReads = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/manual-confirm`) {
        return Promise.reject(new Error('response lost'));
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        attemptReads += 1;
        return Promise.resolve(
          jsonOk(attemptReads === 1 ? submittedAttempt : confirmedAttempt),
        );
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              },
        ),
    );
    setChromeRuntime(sendMessage);
    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Confirm after submitting/u,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm application submitted/u }),
    );

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    );
  });

  it('does not trust extension confirmation without matching Core state', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(queuedAttempt));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : {
                ok: true,
                status: 'confirmed',
                attemptStateVersion: 8,
              },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Check application/u }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /Application submitted/u }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    );
  });

  it('reconciles a versionless state-changing extension response with Core', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(
          jsonOk({ ...queuedAttempt, state: 'confirmed', state_version: 8 }),
        );
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setChromeRuntime(
      jest.fn(
        (
          _extensionId: string,
          message: { type?: string },
          callback: (response: unknown) => void,
        ) =>
          callback(
            message.type === 'anansi.browser.status.v1'
              ? pairedStatus
              : { ok: true, status: 'review_ready' },
          ),
      ),
    );

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    );
  });

  it('does not rerun an attempt Core already confirms', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, state: 'confirmed', state_version: 8 },
          created: false,
          page_url: PAGE_URL,
        }),
      ),
    ) as unknown as typeof fetch;
    const sendMessage = setPairedChromeRuntime();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a prepared attempt disabled until Core makes it runnable', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, state: 'prepared', state_version: 1 },
          created: false,
          page_url: PAGE_URL,
        }),
      ),
    ) as unknown as typeof fetch;
    const sendMessage = setPairedChromeRuntime();

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Check application/u }),
    ).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows pairing recovery after reconciling an unavailable local browser', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(queuedAttempt));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Pair Chrome in Profile/u }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    );
  });

  it('rejects a local extension paired to another Core user', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(queuedAttempt));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? {
                ...pairedStatus,
                userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              }
            : { ok: true, status: 'failed' },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Pair Chrome in Profile/u }),
    ).toBeEnabled();
    expect(
      sendMessage.mock.calls.filter(
        ([, message]) => message.type === 'anansi.browser.run.v1',
      ),
    ).toHaveLength(0);
  });

  it('shows a confirmed attempt without requiring local Chrome', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonOk({
          attempt: { ...queuedAttempt, state: 'confirmed', state_version: 8 },
          created: false,
          page_url: PAGE_URL,
        }),
      ),
    ) as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application submitted/u }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /Pair Chrome in Profile/u }),
    ).not.toBeInTheDocument();
  });

  it('lets Core select an explicit remote fallback before requiring this Chrome', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        headers: new Headers(),
        json: () => Promise.resolve({ detail: 'browser runtime unavailable' }),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application unavailable/u }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/jobs/${JOB_ID}/start`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('ignores an old application result after the record changes', async () => {
    let resolveStart: ((value: ReturnType<typeof jsonOk>) => void) | undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    ) as unknown as typeof fetch;
    setPairedChromeRuntime();

    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="first-record"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    setRecord({
      anansiId: '33333333-3333-4333-8333-333333333333',
      canonicalUrl: 'https://jobs.lever.co/acme/second',
    });
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="second-record"
      />,
    );

    expect(
      await screen.findByRole('button', { name: /^Fill application/u }),
    ).toBeEnabled();
    resolveStart?.(
      jsonOk(
        { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
        201,
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Fill application/u }),
      ).toBeEnabled(),
    );
  });

  it('unlocks the new bearer identity while an old start request finishes', async () => {
    let currentAccessToken = ACCESS_TOKEN;
    mockedStateValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: {
            token: currentAccessToken,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          refreshToken: {
            token: 'refresh-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        };
      }
      if (state === currentUserState) {
        return { id: USER_ID };
      }
      if (state === currentWorkspaceState) {
        return { id: WORKSPACE_ID };
      }
      return null;
    });
    let resolveStart: ((value: ReturnType<typeof jsonOk>) => void) | undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    ) as unknown as typeof fetch;
    setPairedChromeRuntime();

    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    currentAccessToken = 'refreshed-access-token';
    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );

    expect(
      await screen.findByRole('button', { name: /^Fill application/u }),
    ).toBeEnabled();
    resolveStart?.(
      jsonOk(
        { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
        201,
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Fill application/u }),
      ).toBeEnabled(),
    );
  });

  it('keeps waiting through the extension tab-open window', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn((input: RequestInfo | URL) => {
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
          return Promise.resolve(
            jsonOk(
              { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
              201,
            ),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
          return Promise.resolve(
            jsonOk({
              ...queuedAttempt,
              state: 'review_ready',
              state_version: 4,
            }),
          );
        }
        throw new Error(`Unmocked fetch: ${path}`);
      }) as unknown as typeof fetch;
      const sendMessage = jest.fn(
        (
          _extensionId: string,
          message: { type?: string },
          callback: (response: unknown) => void,
        ) => {
          if (message.type === 'anansi.browser.status.v1') {
            callback(pairedStatus);
            return;
          }
          globalThis.setTimeout(
            () =>
              callback({
                ok: true,
                status: 'review_ready',
                attemptStateVersion: 4,
              }),
            30_000,
          );
        },
      );
      setChromeRuntime(sendMessage);

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith(
          ANANSI_BROWSER_EXTENSION_ID,
          expect.objectContaining({ type: 'anansi.browser.run.v1' }),
          expect.any(Function),
        ),
      );

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      expect(
        await screen.findByRole('button', {
          name: /Review application/u,
        }),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reconciles extension response loss before enabling recovery', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn((input: RequestInfo | URL) => {
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
          return Promise.resolve(
            jsonOk(
              { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
              201,
            ),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
          return Promise.resolve(
            jsonOk({
              ...queuedAttempt,
              state: 'submitted_unconfirmed',
              state_version: 4,
              outward_observed_at: '2026-08-27T12:03:00Z',
            }),
          );
        }
        if (path === `/v1/applications/attempts/${ATTEMPT_ID}/review`) {
          return Promise.reject(new Error('review unavailable'));
        }
        throw new Error(`Unmocked fetch: ${path}`);
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const sendMessage = jest.fn(
        (
          _extensionId: string,
          message: { type?: string },
          callback: (response: unknown) => void,
        ) => {
          if (message.type === 'anansi.browser.status.v1') {
            callback(pairedStatus);
          }
        },
      );
      setChromeRuntime(sendMessage);

      render(
        <AnansiApplicationRecordButton
          objectNameSingular="jobPosting"
          recordId="record-id"
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Fill application/u }),
      );
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith(
          ANANSI_BROWSER_EXTENSION_ID,
          expect.objectContaining({ type: 'anansi.browser.run.v1' }),
          expect.any(Function),
        ),
      );

      await act(async () => {
        jest.advanceTimersByTime(180_000);
      });

      expect(
        await screen.findByRole('button', {
          name: /Confirm after submitting/u,
        }),
      ).toBeEnabled();
      expect(fetchMock).toHaveBeenCalledWith(
        `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
        expect.anything(),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads Core before treating an extension failure as terminal', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk(
            { attempt: queuedAttempt, created: true, page_url: PAGE_URL },
            201,
          ),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}`) {
        return Promise.resolve(jsonOk(queuedAttempt));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? pairedStatus
            : { ok: true, status: 'failed' },
        ),
    );
    setChromeRuntime(sendMessage);

    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));

    expect(
      await screen.findByRole('button', { name: /Application unavailable/u }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );
  });

  it('retries a needs-user attempt by exact version', async () => {
    const needsUserAttempt = {
      ...queuedAttempt,
      state: 'needs_user',
      state_version: 4,
    };
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk({
            attempt: needsUserAttempt,
            created: false,
            page_url: PAGE_URL,
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/retry`) {
        return Promise.resolve(jsonOk({ ...queuedAttempt, state_version: 5 }));
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setPairedChromeRuntime();
    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Retry application/u }),
    );

    expect(
      await screen.findByRole('button', { name: /Fill application/u }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/retry`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 4 }),
      }),
    );
  });

  it('cancels a needs-user attempt by exact version', async () => {
    const needsUserAttempt = {
      ...queuedAttempt,
      state: 'needs_user',
      state_version: 4,
    };
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === `/v1/applications/jobs/${JOB_ID}/start`) {
        return Promise.resolve(
          jsonOk({
            attempt: needsUserAttempt,
            created: false,
            page_url: PAGE_URL,
          }),
        );
      }
      if (path === `/v1/applications/attempts/${ATTEMPT_ID}/cancel`) {
        return Promise.resolve(
          jsonOk({ ...needsUserAttempt, state: 'cancelled', state_version: 5 }),
        );
      }
      throw new Error(`Unmocked fetch: ${path}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setPairedChromeRuntime();
    render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Fill application/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Cancel application/u }),
    );

    expect(
      await screen.findByRole('button', { name: /Application stopped/u }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/applications/attempts/${ATTEMPT_ID}/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 4 }),
      }),
    );
  });

  it('fails closed outside exact supported Job records', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    setRecord({ anansiId: null });

    const { rerender } = render(
      <AnansiApplicationRecordButton
        objectNameSingular="jobPosting"
        recordId="record-id"
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <AnansiApplicationRecordButton
        objectNameSingular="company"
        recordId="record-id"
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
