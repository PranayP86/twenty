import { RetryableLogicFunctionError } from 'twenty-shared/logic-function';
import { QueryFailedError } from 'typeorm';

import { POSTGRESQL_ERROR_CODES } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-codes.constants';
import { QUERY_READ_TIMEOUT_MESSAGE } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-messages.constants';
import { PostgresException } from 'src/engine/api/graphql/workspace-query-runner/utils/postgres-exception';
import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { isTransientStepExecutionError } from 'src/modules/workflow/workflow-executor/utils/is-transient-step-execution-error.util';

describe('isTransientStepExecutionError', () => {
  it('returns true for a query read timeout raised by the ORM', () => {
    expect(
      isTransientStepExecutionError(
        new TwentyORMException(
          QUERY_READ_TIMEOUT_MESSAGE,
          TwentyORMExceptionCode.QUERY_READ_TIMEOUT,
        ),
      ),
    ).toBe(true);
  });

  it('returns true for a query read timeout raised by the postgres client', () => {
    expect(
      isTransientStepExecutionError(
        new QueryFailedError('select 1', [], new Error('Query read timeout')),
      ),
    ).toBe(true);
  });

  it('returns true for a transient postgres error code', () => {
    expect(
      isTransientStepExecutionError(
        new PostgresException(
          'Data validation error.',
          POSTGRESQL_ERROR_CODES.DEADLOCK_DETECTED,
        ),
      ),
    ).toBe(true);
  });

  it('returns true for a dropped connection', () => {
    expect(
      isTransientStepExecutionError(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      ),
    ).toBe(true);
  });

  it('returns true for an error a logic function declared as retryable', () => {
    expect(
      isTransientStepExecutionError(
        new RetryableLogicFunctionError('The remote dependency is down'),
      ),
    ).toBe(true);
  });

  it('returns false when the database is saturated, as replaying adds load', () => {
    expect(
      isTransientStepExecutionError(
        new PostgresException(
          'Data validation error.',
          POSTGRESQL_ERROR_CODES.TOO_MANY_CONNECTIONS,
        ),
      ),
    ).toBe(false);
  });

  it('returns false for a constraint violation', () => {
    expect(
      isTransientStepExecutionError(
        new PostgresException(
          'Data validation error.',
          POSTGRESQL_ERROR_CODES.NOT_NULL_VIOLATION,
        ),
      ),
    ).toBe(false);
  });

  it('returns false for an ordinary error', () => {
    expect(
      isTransientStepExecutionError(
        new Error('Cannot read properties of undefined'),
      ),
    ).toBe(false);
  });

  it('returns false when there is no error', () => {
    expect(isTransientStepExecutionError(undefined)).toBe(false);
  });
});
