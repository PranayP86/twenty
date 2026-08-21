import { QUERY_READ_TIMEOUT_MESSAGE } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-messages.constants';
import { executeWithTransientRetry } from 'src/modules/workflow/workflow-executor/utils/execute-with-transient-retry.util';

describe('executeWithTransientRetry', () => {
  it('executes once when the step succeeds', async () => {
    const execute = jest.fn().mockResolvedValue({ result: { ok: true } });

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 3 }),
    ).resolves.toEqual({
      result: { ok: true },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays the step after a transient failure', async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error(QUERY_READ_TIMEOUT_MESSAGE))
      .mockResolvedValue({ result: { ok: true } });

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 3 }),
    ).resolves.toEqual({
      result: { ok: true },
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('replays the step when the action reports a retryable failure', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        error: 'Dependency down',
        shouldRetryStep: true,
      })
      .mockResolvedValue({ result: { ok: true } });

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 3 }),
    ).resolves.toEqual({
      result: { ok: true },
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('surfaces the last failure once the attempts are spent', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new Error(QUERY_READ_TIMEOUT_MESSAGE));

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 3 }),
    ).rejects.toThrow(QUERY_READ_TIMEOUT_MESSAGE);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('surfaces the last retryable output once the attempts are spent', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ error: 'Dependency down', shouldRetryStep: true });

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 2 }),
    ).resolves.toEqual({
      error: 'Dependency down',
      shouldRetryStep: true,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not replay the step on an ordinary failure', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('Invalid input'));

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 3 }),
    ).rejects.toThrow('Invalid input');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('executes once when the step opts out of retries', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new Error(QUERY_READ_TIMEOUT_MESSAGE));

    await expect(
      executeWithTransientRetry({ execute, maxAttempts: 1 }),
    ).rejects.toThrow(QUERY_READ_TIMEOUT_MESSAGE);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
