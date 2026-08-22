import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { OnboardingStatus } from 'src/engine/core-modules/onboarding/enums/onboarding-status.enum';
import {
  OnboardingService,
  OnboardingStepKeys,
} from 'src/engine/core-modules/onboarding/onboarding.service';

// ANANSI PATCH (WS-C): pin the Anansi wizard's priority and completion
// semantics without widening the fork CI gate to the full upstream suite.
describe('OnboardingService - Anansi wizard', () => {
  const userId = 'user-1';
  const workspaceId = 'workspace-1';

  const buildService = (pendingKeys: OnboardingStepKeys[] = []) => {
    const userVars = new Map<OnboardingStepKeys, unknown>(
      pendingKeys.map((key): [OnboardingStepKeys, unknown] => [key, true]),
    );
    const userVarsService = {
      getAll: jest.fn().mockImplementation(async () => new Map(userVars)),
      set: jest
        .fn()
        .mockImplementation(
          async ({
            key,
            value,
          }: {
            key: OnboardingStepKeys;
            value: boolean;
          }) => {
            userVars.set(key, value);
          },
        ),
      delete: jest
        .fn()
        .mockImplementation(async ({ key }: { key: OnboardingStepKeys }) =>
          userVars.delete(key) ? 1 : 0,
        ),
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: workspaceId,
        activationStatus: WorkspaceActivationStatus.ACTIVE,
      }),
    };
    const billingService = {
      isSubscriptionIncompleteOnboardingStatus: jest
        .fn()
        .mockResolvedValue(false),
    };
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const transactionQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (entityManager: {
              queryRunner: typeof transactionQueryRunner;
            }) => Promise<unknown>,
          ) => callback({ queryRunner: transactionQueryRunner }),
        ),
    };
    const noop = {} as never;
    const service = new OnboardingService(
      billingService as never,
      noop,
      userVarsService as never,
      twentyConfigService as never,
      workspaceRepository as never,
      noop,
      noop,
      dataSource as never,
    );

    return {
      dataSource,
      service,
      transactionQueryRunner,
      userVars,
      userVarsService,
    };
  };

  it('returns ANANSI_WIZARD when its flag is pending after profile creation', async () => {
    const { service } = buildService([
      OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING,
    ]);

    await expect(
      service.getOnboardingStatus({ userId, workspaceId }),
    ).resolves.toBe(OnboardingStatus.ANANSI_WIZARD);
  });

  it('keeps profile creation ahead of the Anansi wizard', async () => {
    const { service } = buildService([
      OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING,
      OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING,
    ]);

    await expect(
      service.getOnboardingStatus({ userId, workspaceId }),
    ).resolves.toBe(OnboardingStatus.PROFILE_CREATION);
  });

  it('clears the wizard flag under the transition lock and completes onboarding', async () => {
    const {
      dataSource,
      service,
      transactionQueryRunner,
      userVars,
      userVarsService,
    } = buildService([OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING]);

    await service.completeOnboardingAnansiWizardStep({ userId, workspaceId });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionQueryRunner.query).toHaveBeenCalledTimes(1);
    expect(userVarsService.delete).toHaveBeenCalledWith(
      {
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING,
      },
      transactionQueryRunner,
    );
    expect(userVarsService.set).toHaveBeenCalledWith(
      {
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_REVERSIBLE_STEP_HISTORY,
        value: [],
      },
      transactionQueryRunner,
    );
    expect(
      userVars.has(OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING),
    ).toBe(false);
    await expect(
      service.getOnboardingStatus({ userId, workspaceId }),
    ).resolves.toBe(OnboardingStatus.COMPLETED);
  });

  it('leaves reversible history untouched when the wizard flag is absent', async () => {
    const { service, userVarsService } = buildService();

    await service.completeOnboardingAnansiWizardStep({ userId, workspaceId });

    expect(userVarsService.delete).toHaveBeenCalledWith(
      {
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_ANANSI_WIZARD_PENDING,
      },
      expect.anything(),
    );
    expect(userVarsService.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        key: OnboardingStepKeys.ONBOARDING_REVERSIBLE_STEP_HISTORY,
      }),
      expect.anything(),
    );
  });
});
