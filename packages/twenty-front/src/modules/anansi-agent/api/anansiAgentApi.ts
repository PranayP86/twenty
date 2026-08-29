import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';

export type AnansiAgentContextType =
  | 'approval'
  | 'engagement'
  | 'job'
  | 'touchpoint'
  | 'resume'
  | 'calendar_event';

export type AnansiAgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  state: string;
  failure_code: string | null;
};

export type AnansiAgentCommand = {
  id: string;
  message_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  target_version: number | null;
  state: string;
  reservation_ref: string | null;
  result: Record<string, unknown> | null;
  safe_error: string | null;
};

export type AnansiAgentThread = {
  id: string;
  context_type: AnansiAgentContextType;
  context_id: string;
  state: string;
  messages: AnansiAgentMessage[];
  commands: AnansiAgentCommand[];
  active_instructions: Record<string, unknown>[];
};

export type AnansiAgentThreadAccess = {
  thread: AnansiAgentThread;
  poll_token: string;
};

export type AnansiAgentTurnReceipt = {
  thread_id: string;
  message_id: string;
  created: boolean;
  poll_token: string;
};

export class AnansiAgentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
  }
}

const parseErrorDetail = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail;
    }
  } catch {
    // Use the stable fallback below for non-JSON errors.
  }

  return 'Ask Anansi request failed';
};

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`${ANANSI_API_URL}${path}`, init);
  if (!response.ok) {
    throw new AnansiAgentApiError(
      response.status,
      await parseErrorDetail(response),
    );
  }
  return response.json() as Promise<T>;
};

const bearerHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
});

export const getAnansiAgentThreadByContext = (
  accessToken: string,
  contextType: AnansiAgentContextType,
  contextId: string,
): Promise<AnansiAgentThreadAccess> =>
  request<AnansiAgentThreadAccess>(
    `/v1/agent/threads/by-context/${contextType}/${contextId}`,
    { headers: bearerHeaders(accessToken) },
  );

export const postAnansiAgentMessage = (
  accessToken: string,
  contextType: AnansiAgentContextType,
  contextId: string,
  clientKey: string,
  content: string,
): Promise<AnansiAgentTurnReceipt> =>
  request<AnansiAgentTurnReceipt>(
    `/v1/agent/threads/${contextType}/${contextId}/messages`,
    {
      method: 'POST',
      headers: {
        ...bearerHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_key: clientKey, content }),
    },
  );

export const pollAnansiAgentThread = (
  threadId: string,
  pollToken: string,
): Promise<AnansiAgentThread> =>
  request<AnansiAgentThread>(`/v1/agent/threads/${threadId}`, {
    headers: { 'X-Anansi-Agent-Poll': pollToken },
  });
