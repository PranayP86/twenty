import { LazyMarkdownRenderer } from '@/ai/components/LazyMarkdownRenderer';
import {
  AnansiAgentApiError,
  getAnansiAgentThreadByContext,
  pollAnansiAgentThread,
  postAnansiAgentMessage,
  type AnansiAgentCommand,
  type AnansiAgentThread,
} from '@/anansi-agent/api/anansiAgentApi';
import { type AnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';
import { styled } from '@linaria/react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const POLL_INTERVAL_MS = 1_500;
const AUTO_POLL_RETRY_DELAYS_MS = [
  POLL_INTERVAL_MS,
  POLL_INTERVAL_MS * 2,
] as const;
const MAX_AUTO_POLL_FAILURES = AUTO_POLL_RETRY_DELAYS_MS.length + 1;

const pollDelayMs = (failureCount: number): number =>
  failureCount === 0
    ? POLL_INTERVAL_MS
    : AUTO_POLL_RETRY_DELAYS_MS[
        Math.min(failureCount - 1, AUTO_POLL_RETRY_DELAYS_MS.length - 1)
      ];

const StyledConversation = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledInstructions = styled.section`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledSectionLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-transform: uppercase;
`;

const StyledInstruction = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledMessages = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 160px;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledMessage = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledMessageRole = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledUserMessage = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  padding: ${themeCssVariables.spacing[2]};
  white-space: pre-wrap;
`;

const StyledCommand = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledCommandHeader = styled.div`
  display: flex;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledCommandDetail = styled.pre`
  color: ${themeCssVariables.font.color.secondary};
  font-family: ${themeCssVariables.font.family};
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledError = styled.div`
  align-items: flex-start;
  color: ${themeCssVariables.color.red};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: 0 ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[2]};
`;

const StyledRetryButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  min-height: 30px;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledForm = styled.form`
  align-items: flex-end;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font: inherit;
  max-height: 120px;
  min-height: 38px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledSendButton = styled.button`
  background: ${themeCssVariables.color.blue};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  min-height: 38px;
  padding: 0 ${themeCssVariables.spacing[3]};

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const hasPendingTurn = (thread: AnansiAgentThread | null): boolean =>
  thread?.messages.some((message) =>
    ['pending', 'processing'].includes(message.state),
  ) ?? false;

const safeErrorMessage = (error: unknown): string =>
  error instanceof AnansiAgentApiError
    ? error.detail
    : 'Ask Anansi is unavailable. Try again.';

const isRetryablePollError = (error: unknown): boolean =>
  !(error instanceof AnansiAgentApiError) ||
  error.status === 408 ||
  error.status === 429 ||
  error.status >= 500;

const instructionText = (instruction: Record<string, unknown>): string => {
  if (typeof instruction.value === 'string') {
    return instruction.value;
  }
  return JSON.stringify(instruction);
};

const AnansiAgentCommandCard = ({
  command,
}: {
  command: AnansiAgentCommand;
}) => (
  <StyledCommand>
    <StyledCommandHeader>
      <span>{command.tool_name}</span>
      <span>{command.state}</span>
    </StyledCommandHeader>
    {command.reservation_ref && <div>{command.reservation_ref}</div>}
    {command.result && (
      <StyledCommandDetail>
        {JSON.stringify(command.result)}
      </StyledCommandDetail>
    )}
    {command.safe_error && <div>{command.safe_error}</div>}
  </StyledCommand>
);

const AnansiAgentConversationSession = ({
  accessToken,
  context,
}: {
  accessToken: string | undefined;
  context: AnansiAgentContext;
}) => {
  const [thread, setThread] = useState<AnansiAgentThread | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollRetryCount, setPollRetryCount] = useState(0);
  const [needsPollAccess, setNeedsPollAccess] = useState(false);
  const [awaitingMessageId, setAwaitingMessageId] = useState<string | null>(
    null,
  );
  const [submissionIdentity, setSubmissionIdentity] = useState<{
    content: string;
    clientKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAccessToken = Boolean(accessToken);
  const requestScope = `${accessToken ?? ''}:${context.contextType}:${context.contextId}`;
  // oxlint-disable-next-line twenty/no-state-useref
  const requestScopeRef = useRef(requestScope);
  // oxlint-disable-next-line twenty/no-state-useref
  const requestGenerationRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const isMountedRef = useRef(true);
  if (requestScopeRef.current !== requestScope) {
    requestScopeRef.current = requestScope;
    requestGenerationRef.current += 1;
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  const isCurrentGeneration = useCallback(
    (generation: number) =>
      isMountedRef.current && requestGenerationRef.current === generation,
    [],
  );

  const applyAccess = useCallback(
    (
      access: { thread: AnansiAgentThread; poll_token: string },
      generation: number,
    ) => {
      if (!isCurrentGeneration(generation)) {
        return;
      }
      setThread(access.thread);
      setThreadId(access.thread.id);
      setPollToken(access.poll_token);
      setAwaitingMessageId((messageId) =>
        messageId !== null &&
        access.thread.messages.some((message) => message.id === messageId)
          ? null
          : messageId,
      );
      setPollRetryCount(0);
      setNeedsPollAccess(false);
      setError(null);
    },
    [isCurrentGeneration],
  );

  const reopenContext = useCallback(async () => {
    if (!accessToken) {
      throw new Error('signed out');
    }
    return getAnansiAgentThreadByContext(
      accessToken,
      context.contextType,
      context.contextId,
    );
  }, [accessToken, context.contextId, context.contextType]);

  const reopenPollAccess = useCallback(
    async (generation = requestGenerationRef.current) => {
      try {
        const access = await reopenContext();
        if (!isCurrentGeneration(generation)) {
          return;
        }
        applyAccess(access, generation);
      } catch (reopenError) {
        if (!isCurrentGeneration(generation)) {
          return;
        }
        setError(safeErrorMessage(reopenError));
        setNeedsPollAccess(true);
        if (isRetryablePollError(reopenError)) {
          setPollRetryCount((count) =>
            Math.min(count + 1, MAX_AUTO_POLL_FAILURES),
          );
        } else {
          setPollRetryCount(MAX_AUTO_POLL_FAILURES);
        }
      }
    },
    [applyAccess, isCurrentGeneration, reopenContext],
  );

  const pollThread = useCallback(
    async (
      nextThreadId: string,
      nextPollToken: string,
      generation = requestGenerationRef.current,
    ) => {
      if (!isCurrentGeneration(generation)) {
        return;
      }
      setIsPolling(true);
      try {
        const nextThread = await pollAnansiAgentThread(
          nextThreadId,
          nextPollToken,
        );
        if (!isCurrentGeneration(generation)) {
          return;
        }
        setThread(nextThread);
        setThreadId(nextThread.id);
        setAwaitingMessageId((messageId) =>
          messageId !== null &&
          nextThread.messages.some((message) => message.id === messageId)
            ? null
            : messageId,
        );
        setPollRetryCount(0);
        setError(null);
      } catch (nextError) {
        if (!isCurrentGeneration(generation)) {
          return;
        }
        if (
          nextError instanceof AnansiAgentApiError &&
          nextError.status === 401
        ) {
          setPollToken(null);
          setNeedsPollAccess(true);
          await reopenPollAccess(generation);
        } else {
          setError(safeErrorMessage(nextError));
          if (isRetryablePollError(nextError)) {
            setPollRetryCount((count) =>
              Math.min(count + 1, MAX_AUTO_POLL_FAILURES),
            );
          } else {
            setPollToken(null);
            setNeedsPollAccess(true);
            setPollRetryCount(MAX_AUTO_POLL_FAILURES);
          }
        }
      } finally {
        if (isCurrentGeneration(generation)) {
          setIsPolling(false);
        }
      }
    },
    [isCurrentGeneration, reopenPollAccess],
  );

  useEffect(() => {
    let cancelled = false;
    const generation = requestGenerationRef.current;
    setThread(null);
    setThreadId(null);
    setPollToken(null);
    setNeedsPollAccess(false);
    setIsSubmitting(false);
    setIsLoading(true);
    setError(null);

    if (!hasAccessToken) {
      setIsLoading(false);
      setError('Sign in again to use Ask Anansi.');
      return;
    }

    void reopenContext()
      .then(async (access) => {
        if (cancelled || !isCurrentGeneration(generation)) {
          return;
        }
        applyAccess(access, generation);
        if (hasPendingTurn(access.thread)) {
          await pollThread(access.thread.id, access.poll_token, generation);
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled || !isCurrentGeneration(generation)) {
          return;
        }
        if (
          loadError instanceof AnansiAgentApiError &&
          loadError.status === 404
        ) {
          setThread(null);
          setThreadId(null);
          setPollToken(null);
          return;
        }
        setError(safeErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled && isCurrentGeneration(generation)) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    applyAccess,
    hasAccessToken,
    isCurrentGeneration,
    pollThread,
    reopenContext,
  ]);

  const pending = hasPendingTurn(thread) || awaitingMessageId !== null;

  useEffect(() => {
    if (
      isPolling ||
      !needsPollAccess ||
      !hasAccessToken ||
      pollRetryCount >= MAX_AUTO_POLL_FAILURES
    ) {
      return;
    }
    const generation = requestGenerationRef.current;
    const timeout = globalThis.setTimeout(() => {
      if (!isCurrentGeneration(generation)) {
        return;
      }
      setIsPolling(true);
      void reopenPollAccess(generation).finally(() => {
        if (isCurrentGeneration(generation)) {
          setIsPolling(false);
        }
      });
    }, pollDelayMs(pollRetryCount));
    return () => globalThis.clearTimeout(timeout);
  }, [
    hasAccessToken,
    isCurrentGeneration,
    isPolling,
    needsPollAccess,
    pollRetryCount,
    reopenPollAccess,
  ]);

  useEffect(() => {
    if (
      isPolling ||
      !threadId ||
      !pollToken ||
      (!pending && thread !== null) ||
      pollRetryCount >= MAX_AUTO_POLL_FAILURES
    ) {
      return;
    }
    const generation = requestGenerationRef.current;
    const timeout = globalThis.setTimeout(() => {
      if (isCurrentGeneration(generation)) {
        void pollThread(threadId, pollToken, generation);
      }
    }, pollDelayMs(pollRetryCount));
    return () => globalThis.clearTimeout(timeout);
  }, [
    isCurrentGeneration,
    isPolling,
    pending,
    pollRetryCount,
    pollThread,
    pollToken,
    thread,
    threadId,
  ]);

  const manualPollingRequired =
    pending && !isPolling && pollRetryCount >= MAX_AUTO_POLL_FAILURES;

  const retryPolling = useCallback(() => {
    const generation = requestGenerationRef.current;
    setPollRetryCount(0);
    setError(null);
    if (threadId && pollToken) {
      void pollThread(threadId, pollToken, generation);
      return;
    }
    setIsPolling(true);
    void reopenPollAccess(generation).finally(() => {
      if (isCurrentGeneration(generation)) {
        setIsPolling(false);
      }
    });
  }, [isCurrentGeneration, pollThread, pollToken, reopenPollAccess, threadId]);

  const commandsByMessage = useMemo(() => {
    const grouped = new Map<string, AnansiAgentCommand[]>();
    for (const command of thread?.commands ?? []) {
      grouped.set(command.message_id, [
        ...(grouped.get(command.message_id) ?? []),
        command,
      ]);
    }
    return grouped;
  }, [thread?.commands]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!accessToken || !content || isLoading || isSubmitting || pending) {
      return;
    }

    const generation = requestGenerationRef.current;
    const identity =
      submissionIdentity?.content === content
        ? submissionIdentity
        : { content, clientKey: globalThis.crypto.randomUUID() };
    setSubmissionIdentity(identity);
    setIsSubmitting(true);
    setError(null);
    try {
      const receipt = await postAnansiAgentMessage(
        accessToken,
        context.contextType,
        context.contextId,
        identity.clientKey,
        content,
      );
      if (!isCurrentGeneration(generation)) {
        return;
      }
      setSubmissionIdentity(null);
      setDraft('');
      setThreadId(receipt.thread_id);
      setPollToken(receipt.poll_token);
      setAwaitingMessageId(receipt.message_id);
      await pollThread(receipt.thread_id, receipt.poll_token, generation);
    } catch (submitError) {
      if (isCurrentGeneration(generation)) {
        setError(safeErrorMessage(submitError));
      }
    } finally {
      if (isCurrentGeneration(generation)) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <StyledConversation>
      {(thread?.active_instructions.length ?? 0) > 0 && (
        <StyledInstructions aria-label="Active instructions">
          <StyledSectionLabel>Active instructions</StyledSectionLabel>
          {thread?.active_instructions.map((instruction, index) => (
            <StyledInstruction key={index}>
              {instructionText(instruction)}
            </StyledInstruction>
          ))}
        </StyledInstructions>
      )}

      <StyledMessages aria-live="polite">
        {isLoading && <StyledStatus>Loading…</StyledStatus>}
        {!isLoading && !thread && !error && (
          <StyledStatus>
            Ask about this item or give it an instruction.
          </StyledStatus>
        )}
        {thread?.messages.map((message) => (
          <StyledMessage key={message.id}>
            <StyledMessageRole>
              {message.role === 'user' ? 'You' : 'Anansi'}
            </StyledMessageRole>
            {message.role === 'assistant' ? (
              <LazyMarkdownRenderer text={message.content} />
            ) : (
              <StyledUserMessage>{message.content}</StyledUserMessage>
            )}
            {message.failure_code && <div>{message.failure_code}</div>}
            {commandsByMessage.get(message.id)?.map((command) => (
              <AnansiAgentCommandCard key={command.id} command={command} />
            ))}
          </StyledMessage>
        ))}
        {(pending || isSubmitting) && <StyledStatus>Thinking…</StyledStatus>}
      </StyledMessages>

      {error && (
        <StyledError role="alert">
          <span>{error}</span>
          {manualPollingRequired && (
            <StyledRetryButton type="button" onClick={retryPolling}>
              Retry
            </StyledRetryButton>
          )}
        </StyledError>
      )}

      <StyledForm onSubmit={(event) => void submit(event)}>
        <StyledTextarea
          aria-label="Message Ask Anansi"
          maxLength={16_000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this item…"
          disabled={!accessToken || isLoading}
        />
        <StyledSendButton
          type="submit"
          disabled={
            !accessToken ||
            isLoading ||
            !draft.trim() ||
            isSubmitting ||
            pending
          }
        >
          Send
        </StyledSendButton>
      </StyledForm>
    </StyledConversation>
  );
};

export const AnansiAgentConversation = ({
  accessToken,
  context,
  sessionKey,
}: {
  accessToken: string | undefined;
  context: AnansiAgentContext;
  sessionKey: string;
}) => (
  <AnansiAgentConversationSession
    key={`${sessionKey}:${context.key}`}
    accessToken={accessToken}
    context={context}
  />
);
