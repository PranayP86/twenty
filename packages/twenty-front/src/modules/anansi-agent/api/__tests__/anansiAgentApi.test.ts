import {
  getAnansiAgentThreadByContext,
  pollAnansiAgentThread,
  postAnansiAgentMessage,
  type AnansiAgentContextType,
} from '@/anansi-agent/api/anansiAgentApi';

const acceptContextType = (_contextType: AnansiAgentContextType) => undefined;

acceptContextType('approval');
// @ts-expect-error Core does not expose application-attempt contexts yet.
acceptContextType('application_attempt');
// @ts-expect-error Core does not expose status contexts yet.
acceptContextType('anansi_status');

const CONTEXT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';

const THREAD = {
  id: THREAD_ID,
  context_type: 'engagement',
  context_id: CONTEXT_ID,
  state: 'active',
  messages: [],
  commands: [],
  active_instructions: [],
};

global.fetch = jest.fn();

describe('anansiAgentApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens a context with bearer auth', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ thread: THREAD, poll_token: 'poll-token' }),
    });

    await expect(
      getAnansiAgentThreadByContext('access-token', 'engagement', CONTEXT_ID),
    ).resolves.toEqual({ thread: THREAD, poll_token: 'poll-token' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v1/agent/threads/by-context/engagement/${CONTEXT_ID}`,
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('posts a user turn with bearer auth and a caller key', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        thread_id: THREAD_ID,
        message_id: CONTEXT_ID,
        created: true,
        poll_token: 'next-poll-token',
      }),
    });

    await postAnansiAgentMessage(
      'access-token',
      'engagement',
      CONTEXT_ID,
      'browser-key',
      'Explain this item.',
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v1/agent/threads/engagement/${CONTEXT_ID}/messages`,
      ),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_key: 'browser-key',
          content: 'Explain this item.',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('polls only with its thread-bound polling token', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => THREAD,
    });

    await expect(
      pollAnansiAgentThread(THREAD_ID, 'poll-token'),
    ).resolves.toEqual(THREAD);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/agent/threads/${THREAD_ID}`),
      {
        headers: { 'X-Anansi-Agent-Poll': 'poll-token' },
      },
    );
  });
});
