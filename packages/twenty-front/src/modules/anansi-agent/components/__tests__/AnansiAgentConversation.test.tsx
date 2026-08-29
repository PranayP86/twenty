import { type AnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';
import { AnansiAgentConversation } from '@/anansi-agent/components/AnansiAgentConversation';
import {
  AnansiAgentApiError,
  getAnansiAgentThreadByContext,
  pollAnansiAgentThread,
  postAnansiAgentMessage,
  type AnansiAgentThread,
} from '@/anansi-agent/api/anansiAgentApi';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

jest.mock('@/ai/components/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ text }: { text: string }) => <div>{text}</div>,
}));

jest.mock('@/anansi-agent/api/anansiAgentApi', () => ({
  ...jest.requireActual('@/anansi-agent/api/anansiAgentApi'),
  getAnansiAgentThreadByContext: jest.fn(),
  pollAnansiAgentThread: jest.fn(),
  postAnansiAgentMessage: jest.fn(),
}));

const CONTEXT: AnansiAgentContext = {
  key: 'engagement:11111111-1111-4111-8111-111111111111',
  contextType: 'engagement',
  contextId: '11111111-1111-4111-8111-111111111111',
  objectNameSingular: 'engagement',
  recordId: '22222222-2222-4222-8222-222222222222',
  title: 'Acme SRE',
};

const THREAD: AnansiAgentThread = {
  id: '33333333-3333-4333-8333-333333333333',
  context_type: 'engagement',
  context_id: CONTEXT.contextId,
  state: 'active',
  messages: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'user',
      content: 'Use my main application email.',
      state: 'completed',
      failure_code: null,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      role: 'assistant',
      content: 'Main application email selected.',
      state: 'completed',
      failure_code: null,
    },
  ],
  commands: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      message_id: '55555555-5555-4555-8555-555555555555',
      tool_name: 'choose_mailbox',
      arguments: {},
      target_version: null,
      state: 'completed',
      reservation_ref: 'mailbox:primary',
      result: { address: 'jobs@example.com' },
      safe_error: null,
    },
  ],
  active_instructions: [
    { scope: 'item', value: 'Prefer concise recruiter replies.' },
  ],
};

const mockedOpen = jest.mocked(getAnansiAgentThreadByContext);
const mockedPoll = jest.mocked(pollAnansiAgentThread);
const mockedPost = jest.mocked(postAnansiAgentMessage);

describe('AnansiAgentConversation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('renders durable messages, commands, and active instructions', async () => {
    mockedOpen.mockResolvedValue({ thread: THREAD, poll_token: 'poll-token' });

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
    expect(screen.getByText('choose_mailbox')).toBeVisible();
    expect(screen.getByText('mailbox:primary')).toBeVisible();
    expect(screen.getByText('Prefer concise recruiter replies.')).toBeVisible();
  });

  it('creates the first durable turn and polls with the returned token', async () => {
    mockedOpen.mockRejectedValue(
      new AnansiAgentApiError(404, 'agent thread unavailable'),
    );
    mockedPost.mockResolvedValue({
      thread_id: THREAD.id,
      message_id: THREAD.messages[0].id,
      created: true,
      poll_token: 'new-poll-token',
    });
    mockedPoll.mockResolvedValue(THREAD);

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        'access-token',
        'engagement',
        CONTEXT.contextId,
        expect.any(String),
        'Explain this item.',
      ),
    );
    expect(mockedPoll).toHaveBeenCalledWith(THREAD.id, 'new-poll-token');
  });

  it('reopens context access once when a polling token expires', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    mockedOpen
      .mockResolvedValueOnce({ thread: pendingThread, poll_token: 'expired' })
      .mockResolvedValueOnce({ thread: THREAD, poll_token: 'refreshed' });
    mockedPoll.mockRejectedValueOnce(
      new AnansiAgentApiError(401, 'unauthenticated'),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
    expect(mockedOpen).toHaveBeenCalledTimes(2);
  });

  it('recovers when poll-token expiry is followed by a transient bearer reopen failure', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    mockedOpen
      .mockResolvedValueOnce({ thread: pendingThread, poll_token: 'expired' })
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockResolvedValueOnce({ thread: THREAD, poll_token: 'refreshed' });
    mockedPoll.mockRejectedValueOnce(
      new AnansiAgentApiError(401, 'unauthenticated'),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    await waitFor(() => expect(mockedOpen).toHaveBeenCalledTimes(3), {
      timeout: 5_000,
    });
    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
  });

  it('retries a pending turn after a transient polling failure', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    mockedOpen.mockResolvedValue({
      thread: pendingThread,
      poll_token: 'poll-token',
    });
    mockedPoll
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockResolvedValueOnce(THREAD);

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    await waitFor(() => expect(mockedPoll).toHaveBeenCalledTimes(3), {
      timeout: 5_000,
    });
    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
  });

  it('retries an accepted turn when its first receipt polls fail transiently', async () => {
    const acceptedMessageId = '77777777-7777-4777-8777-777777777777';
    const completedAfterPost = {
      ...THREAD,
      messages: [
        ...THREAD.messages,
        {
          id: acceptedMessageId,
          role: 'user' as const,
          content: 'Explain this item.',
          state: 'completed',
          failure_code: null,
        },
      ],
    };
    mockedOpen.mockResolvedValue({ thread: THREAD, poll_token: 'poll-token' });
    mockedPost.mockResolvedValue({
      thread_id: THREAD.id,
      message_id: acceptedMessageId,
      created: true,
      poll_token: 'posted-poll-token',
    });
    mockedPoll
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockResolvedValueOnce(completedAfterPost);

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockedPoll).toHaveBeenCalledTimes(3), {
      timeout: 5_000,
    });
    expect(await screen.findByText('Explain this item.')).toBeVisible();
  });

  it('offers manual recovery when an accepted turn has a permanent poll failure', async () => {
    const acceptedMessageId = '77777777-7777-4777-8777-777777777777';
    const completedAfterPost = {
      ...THREAD,
      messages: [
        ...THREAD.messages,
        {
          id: acceptedMessageId,
          role: 'user' as const,
          content: 'Explain this item.',
          state: 'completed',
          failure_code: null,
        },
      ],
    };
    mockedOpen
      .mockResolvedValueOnce({ thread: THREAD, poll_token: 'poll-token' })
      .mockResolvedValueOnce({
        thread: completedAfterPost,
        poll_token: 'reopened-poll-token',
      });
    mockedPost.mockResolvedValue({
      thread_id: THREAD.id,
      message_id: acceptedMessageId,
      created: true,
      poll_token: 'posted-poll-token',
    });
    mockedPoll.mockRejectedValueOnce(
      new AnansiAgentApiError(400, 'invalid poll capability'),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(retry);

    await waitFor(() => expect(mockedOpen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Explain this item.')).toBeVisible();
    expect(screen.getByLabelText('Message Ask Anansi')).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });

  it('offers manual recovery after permanent bearer reopen failure', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    mockedOpen
      .mockResolvedValueOnce({ thread: pendingThread, poll_token: 'expired' })
      .mockRejectedValueOnce(new AnansiAgentApiError(403, 'forbidden'))
      .mockResolvedValueOnce({ thread: THREAD, poll_token: 'reopened' });
    mockedPoll.mockRejectedValueOnce(
      new AnansiAgentApiError(401, 'unauthenticated'),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);

    await waitFor(() => expect(mockedOpen).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
  });

  it('stops automatic polling after bounded backoff failures', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    mockedOpen.mockResolvedValue({
      thread: pendingThread,
      poll_token: 'poll-token',
    });
    mockedPoll.mockRejectedValue(
      new AnansiAgentApiError(503, 'temporarily unavailable'),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    await waitFor(() => expect(mockedPoll).toHaveBeenCalledTimes(3), {
      timeout: 7_000,
    });
    await act(
      async () =>
        new Promise((resolve) => globalThis.setTimeout(resolve, 2_000)),
    );

    expect(mockedPoll).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  }, 10_000);

  it('blocks submission until context loading finishes', async () => {
    let resolveOpen: (access: {
      thread: AnansiAgentThread;
      poll_token: string;
    }) => void = () => undefined;
    mockedOpen.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    expect(screen.getByLabelText('Message Ask Anansi')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(mockedPost).not.toHaveBeenCalled();

    await act(async () =>
      resolveOpen({ thread: THREAD, poll_token: 'poll-token' }),
    );
  });

  it('reuses the client key when an accepted response may have been lost', async () => {
    mockedOpen.mockRejectedValue(
      new AnansiAgentApiError(404, 'agent thread unavailable'),
    );
    mockedPost
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockResolvedValueOnce({
        thread_id: THREAD.id,
        message_id: THREAD.messages[0].id,
        created: false,
        poll_token: 'poll-token',
      });
    mockedPoll.mockResolvedValue(THREAD);

    render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2));

    expect(mockedPost.mock.calls[1][3]).toBe(mockedPost.mock.calls[0][3]);
  });

  it('preserves the draft and uncertain client key across an access-token refresh', async () => {
    mockedOpen.mockRejectedValue(
      new AnansiAgentApiError(404, 'agent thread unavailable'),
    );
    mockedPost
      .mockRejectedValueOnce(
        new AnansiAgentApiError(503, 'temporarily unavailable'),
      )
      .mockResolvedValueOnce({
        thread_id: THREAD.id,
        message_id: THREAD.messages[0].id,
        created: false,
        poll_token: 'poll-token',
      });
    mockedPoll.mockResolvedValue(THREAD);

    const { rerender } = render(
      <AnansiAgentConversation
        accessToken="old-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );

    rerender(
      <AnansiAgentConversation
        accessToken="new-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );

    expect(screen.getByLabelText('Message Ask Anansi')).toHaveValue(
      'Explain this item.',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2));
    expect(mockedPost.mock.calls[1][0]).toBe('new-token');
    expect(mockedPost.mock.calls[1][3]).toBe(mockedPost.mock.calls[0][3]);
  });

  it('ignores a stale poll completion after access-token refresh', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    const staleThread = {
      ...THREAD,
      messages: [
        {
          ...THREAD.messages[1],
          content: 'Stale token result.',
        },
      ],
      commands: [],
    };
    let resolvePoll: (thread: AnansiAgentThread) => void = () => undefined;
    mockedOpen
      .mockResolvedValueOnce({ thread: pendingThread, poll_token: 'old-poll' })
      .mockResolvedValueOnce({ thread: THREAD, poll_token: 'fresh-poll' });
    mockedPoll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    const { rerender } = render(
      <AnansiAgentConversation
        accessToken="old-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );
    await waitFor(() => expect(mockedPoll).toHaveBeenCalledTimes(1));

    rerender(
      <AnansiAgentConversation
        accessToken="new-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );
    expect(
      await screen.findByText('Main application email selected.'),
    ).toBeVisible();
    await act(async () => resolvePoll(staleThread));

    expect(screen.queryByText('Stale token result.')).not.toBeInTheDocument();
    expect(screen.getByText('Main application email selected.')).toBeVisible();
  });

  it('keeps an uncertain draft when an old-token post completes late', async () => {
    mockedOpen.mockRejectedValue(
      new AnansiAgentApiError(404, 'agent thread unavailable'),
    );
    let resolvePost: (
      receipt: Awaited<ReturnType<typeof postAnansiAgentMessage>>,
    ) => void = () => undefined;
    mockedPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    mockedPoll.mockResolvedValue(THREAD);

    const { rerender } = render(
      <AnansiAgentConversation
        accessToken="old-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );
    const input = await screen.findByLabelText('Message Ask Anansi');
    fireEvent.change(input, { target: { value: 'Explain this item.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));

    rerender(
      <AnansiAgentConversation
        accessToken="new-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledTimes(2));
    await act(async () =>
      resolvePost({
        thread_id: THREAD.id,
        message_id: THREAD.messages[0].id,
        created: true,
        poll_token: 'old-post-poll',
      }),
    );

    expect(screen.getByLabelText('Message Ask Anansi')).toHaveValue(
      'Explain this item.',
    );
    expect(mockedPoll).not.toHaveBeenCalled();
  });

  it('ignores a stale poll response after the stable session changes', async () => {
    const pendingThread = {
      ...THREAD,
      messages: [{ ...THREAD.messages[0], state: 'pending' }],
      commands: [],
    };
    let resolvePoll: (thread: AnansiAgentThread) => void = () => undefined;
    mockedOpen
      .mockResolvedValueOnce({ thread: pendingThread, poll_token: 'old-poll' })
      .mockRejectedValueOnce(
        new AnansiAgentApiError(404, 'agent thread unavailable'),
      );
    mockedPoll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    const { rerender } = render(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-1:workspace-1"
      />,
    );
    await waitFor(() => expect(mockedPoll).toHaveBeenCalledTimes(1));

    rerender(
      <AnansiAgentConversation
        accessToken="access-token"
        context={CONTEXT}
        sessionKey="user-2:workspace-1"
      />,
    );
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledTimes(2));
    await act(async () => resolvePoll(THREAD));

    expect(
      screen.queryByText('Main application email selected.'),
    ).not.toBeInTheDocument();
  });
});
