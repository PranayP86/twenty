import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { isTransientStepExecutionError } from 'src/modules/workflow/workflow-executor/utils/is-transient-step-execution-error.util';

export const executeWithTransientRetry = async ({
  execute,
  maxAttempts,
}: {
  execute: () => Promise<WorkflowActionOutput>;
  maxAttempts: number;
}): Promise<WorkflowActionOutput> => {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= maxAttempts;

    try {
      const actionOutput = await execute();

      if (isLastAttempt || !actionOutput.shouldRetryStep) {
        return actionOutput;
      }
    } catch (error) {
      if (isLastAttempt || !isTransientStepExecutionError(error)) {
        throw error;
      }
    }
  }
};
