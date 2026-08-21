import { isNonEmptyString } from '@sniptt/guards';
import { RETRYABLE_LOGIC_FUNCTION_ERROR_NAME } from 'twenty-shared/logic-function';
import { isDefined } from 'twenty-shared/utils';

import { POSTGRESQL_ERROR_CODES } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-codes.constants';
import { QUERY_READ_TIMEOUT_MESSAGE } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-messages.constants';

// Only errors that already spaced themselves out, by burning a timeout, or
// that another transaction has resolved by the time they surface. Saturation
// codes are left out on purpose: replaying into them adds load.
const TRANSIENT_POSTGRES_ERROR_CODES: string[] = [
  POSTGRESQL_ERROR_CODES.CONNECTION_EXCEPTION,
  POSTGRESQL_ERROR_CODES.CONNECTION_DOES_NOT_EXIST,
  POSTGRESQL_ERROR_CODES.CONNECTION_FAILURE,
  POSTGRESQL_ERROR_CODES.PROTOCOL_VIOLATION,
  POSTGRESQL_ERROR_CODES.SERIALIZATION_FAILURE,
  POSTGRESQL_ERROR_CODES.DEADLOCK_DETECTED,
  POSTGRESQL_ERROR_CODES.LOCK_NOT_AVAILABLE,
  POSTGRESQL_ERROR_CODES.QUERY_CANCELED,
  POSTGRESQL_ERROR_CODES.IDLE_SESSION_TIMEOUT,
  POSTGRESQL_ERROR_CODES.IDLE_IN_TRANSACTION_SESSION_TIMEOUT,
  POSTGRESQL_ERROR_CODES.TRANSACTION_TIMEOUT,
];

const TRANSIENT_NETWORK_ERROR_CODES = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'];

export const isTransientStepExecutionError = (error: unknown): boolean => {
  if (!isDefined(error) || typeof error !== 'object') {
    return false;
  }

  const { name, code, message } = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  if (name === RETRYABLE_LOGIC_FUNCTION_ERROR_NAME) {
    return true;
  }

  // node-postgres raises the client-side read timeout as a plain message, with
  // no error code to match on.
  if (
    isNonEmptyString(message) &&
    message.includes(QUERY_READ_TIMEOUT_MESSAGE)
  ) {
    return true;
  }

  if (!isNonEmptyString(code)) {
    return false;
  }

  return (
    TRANSIENT_POSTGRES_ERROR_CODES.includes(code) ||
    TRANSIENT_NETWORK_ERROR_CODES.includes(code)
  );
};
