import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { type AnansiAllowlistService } from 'src/engine/core-modules/auth/services/anansi-allowlist.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { type ExistingUserOrPartialUserWithPicture } from 'src/engine/core-modules/auth/types/signInUp.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

// ANANSI PATCH: unit coverage for the allowlist gate wired into
// assertWorkspaceCreationAllowed() — the exact check site where
// IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS denies a non-admin sign-up.
// This exercises that private method directly (via a `never` cast) rather
// than the full signUpOnNewWorkspace() flow (workspace bootstrap, billing,
// events, etc.), which is out of scope for this gate and has no existing
// test coverage to build on.
describe('SignInUpService - allowlist-gated workspace creation', () => {
  type BuildServiceOptions = {
    userWorkspaceCount?: number;
    isApproved?: jest.Mock;
  };

  const buildService = ({
    userWorkspaceCount = 0,
    isApproved = jest.fn().mockResolvedValue(false),
  }: BuildServiceOptions = {}) => {
    const workspaceRepository = {
      // A non-zero, within-limit count so the bootstrap short-circuit
      // (workspaceCount === 0 -> always allow) and the enterprise-key
      // workspace-limit check are both bypassed, landing on the
      // admin-restriction branch under test.
      count: jest.fn().mockResolvedValue(1),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'IS_MULTIWORKSPACE_ENABLED') {
          return true;
        }

        if (key === 'IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS') {
          return true;
        }

        return undefined;
      }),
    };
    const userWorkspaceService = {
      countUserWorkspaces: jest.fn().mockResolvedValue(userWorkspaceCount),
    };
    const enterprisePlanService = { isValid: jest.fn().mockReturnValue(false) };
    const anansiAllowlistService = {
      isApproved,
    } as unknown as AnansiAllowlistService;

    const noop = {} as never;

    const service = new SignInUpService(
      noop, // userRepository
      workspaceRepository as never, // workspaceRepository
      noop, // workspaceInvitationService
      userWorkspaceService as never, // userWorkspaceService
      noop, // onboardingService
      noop, // workspaceEventEmitter
      twentyConfigService as never, // twentyConfigService
      noop, // subdomainManagerService
      noop, // userService
      noop, // metricsService
      noop, // workspaceCacheService
      noop, // applicationService
      noop, // fileCorePictureService
      enterprisePlanService as never, // enterprisePlanService
      noop, // eventLogEmitterService
      noop, // billingCreditService
      noop, // billingService
      noop, // dataSource
      anansiAllowlistService,
    );

    return { service, anansiAllowlistService, userWorkspaceService };
  };

  const existingNonAdminUser = (
    overrides: Partial<UserEntity> = {},
  ): ExistingUserOrPartialUserWithPicture['userData'] => ({
    type: 'existingUser',
    existingUser: {
      id: 'user-1',
      email: 'allowlisted@example.com',
      canAccessFullAdminPanel: false,
      ...overrides,
    } as UserEntity,
  });

  const callGate = (
    service: SignInUpService,
    userData: ExistingUserOrPartialUserWithPicture['userData'],
  ): Promise<void> =>
    (
      service as unknown as {
        assertWorkspaceCreationAllowed: (
          userData: ExistingUserOrPartialUserWithPicture['userData'],
        ) => Promise<void>;
      }
    ).assertWorkspaceCreationAllowed(userData);

  it('allows workspace creation when the allowlist approves and the user has 0 workspaces', async () => {
    const isApproved = jest.fn().mockResolvedValue(true);
    const { service } = buildService({ userWorkspaceCount: 0, isApproved });

    await expect(
      callGate(service, existingNonAdminUser()),
    ).resolves.toBeUndefined();

    expect(isApproved).toHaveBeenCalledWith('allowlisted@example.com');
  });

  it('denies a second workspace even though the allowlist approves (one user = one workspace)', async () => {
    const isApproved = jest.fn().mockResolvedValue(true);
    const { service } = buildService({ userWorkspaceCount: 1, isApproved });

    const rejection = callGate(service, existingNonAdminUser());

    await expect(rejection).rejects.toThrow(
      'Workspace creation is restricted to admins',
    );
    // ANANSI PATCH: pin the dedicated subCode so this denial stays
    // distinguishable from the unrelated FORBIDDEN_EXCEPTION thrown by the
    // workspace-count-limit check.
    await expect(rejection).rejects.toMatchObject({
      code: AuthExceptionCode.ANANSI_NOT_ALLOWLISTED,
    });

    // Already has a workspace: the gate must short-circuit before ever
    // calling out to Core with the user's email.
    expect(isApproved).not.toHaveBeenCalled();
  });

  it('denies only an explicit negative allowlist decision', async () => {
    const isApproved = jest.fn().mockResolvedValue(false);
    const { service } = buildService({ userWorkspaceCount: 0, isApproved });

    const rejection = callGate(service, existingNonAdminUser());

    await expect(rejection).rejects.toThrow(
      'Workspace creation is restricted to admins',
    );
    // ANANSI PATCH: pin the dedicated subCode (see comment above).
    await expect(rejection).rejects.toMatchObject({
      code: AuthExceptionCode.ANANSI_NOT_ALLOWLISTED,
    });

    expect(isApproved).toHaveBeenCalledWith('allowlisted@example.com');
  });

  it('propagates allowlist unavailability instead of emitting a denial', async () => {
    const isApproved = jest
      .fn()
      .mockRejectedValue(new Error('Anansi Core allowlist unavailable'));
    const { service } = buildService({ userWorkspaceCount: 0, isApproved });

    await expect(callGate(service, existingNonAdminUser())).rejects.toThrow(
      'Anansi Core allowlist unavailable',
    );
  });

  it('still allows the existing server-admin bypass regardless of the allowlist', async () => {
    const isApproved = jest.fn().mockResolvedValue(false);
    const { service } = buildService({ userWorkspaceCount: 1, isApproved });

    await expect(
      callGate(
        service,
        existingNonAdminUser({ canAccessFullAdminPanel: true }),
      ),
    ).resolves.toBeUndefined();

    expect(isApproved).not.toHaveBeenCalled();
  });
});

// ANANSI PATCH (WS-C): exercise the real new-workspace path so stock-step
// suppression and wizard arming cannot drift apart behind private helpers.
describe('SignInUpService - Anansi new-workspace onboarding', () => {
  it('arms only profile creation and the Anansi wizard', async () => {
    const user = {
      id: 'user-1',
      email: 'friend@gmail.com',
      canAccessFullAdminPanel: false,
    } as UserEntity;
    const userRepository = {
      count: jest.fn().mockResolvedValue(1),
    };
    const workspaceRepository = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((workspace: object) => workspace),
    };
    const userWorkspaceService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const onboardingService = {
      setOnboardingConnectAccountPending: jest.fn(),
      setOnboardingCreateProfilePending: jest.fn().mockResolvedValue(undefined),
      setOnboardingInstallAppsPending: jest.fn(),
      setOnboardingInviteTeamPending: jest.fn(),
      setOnboardingAnansiWizardPending: jest.fn().mockResolvedValue(undefined),
    };
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(false),
    };
    const subdomainManagerService = {
      generateSubdomain: jest.fn().mockResolvedValue('friend'),
    };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn().mockResolvedValue(undefined),
    };
    const applicationService = {
      createWorkspaceCustomApplication: jest.fn().mockResolvedValue({
        universalIdentifier: 'application-1',
      }),
    };
    const eventLogEmitterService = {
      createContext: jest.fn().mockReturnValue({
        insertWorkspaceEvent: jest.fn(),
      }),
    };
    const billingService = {
      isBillingEnabled: jest.fn().mockReturnValue(false),
    };
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
      manager: {
        save: jest
          .fn()
          .mockImplementation(
            async (_entity: unknown, value: unknown) => value,
          ),
      },
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (entityManager: {
              queryRunner: typeof queryRunner;
            }) => Promise<unknown>,
          ) => callback({ queryRunner }),
        ),
    };
    const noop = {} as never;
    const service = new SignInUpService(
      userRepository as never,
      workspaceRepository as never,
      noop,
      userWorkspaceService as never,
      onboardingService as never,
      noop,
      twentyConfigService as never,
      subdomainManagerService as never,
      noop,
      noop,
      workspaceCacheService as never,
      applicationService as never,
      noop,
      noop,
      eventLogEmitterService as never,
      noop,
      billingService as never,
      dataSource as never,
      noop,
    );

    await service.signUpOnNewWorkspace(
      { type: 'existingUser', existingUser: user },
      { displayName: 'Friend Workspace' },
    );

    expect(
      onboardingService.setOnboardingConnectAccountPending,
    ).not.toHaveBeenCalled();
    expect(
      onboardingService.setOnboardingInstallAppsPending,
    ).not.toHaveBeenCalled();
    expect(
      onboardingService.setOnboardingInviteTeamPending,
    ).not.toHaveBeenCalled();
    expect(
      onboardingService.setOnboardingCreateProfilePending,
    ).toHaveBeenCalledWith(
      {
        userId: user.id,
        workspaceId: expect.any(String),
        value: true,
      },
      queryRunner,
    );
    expect(
      onboardingService.setOnboardingAnansiWizardPending,
    ).toHaveBeenCalledWith(
      {
        userId: user.id,
        workspaceId: expect.any(String),
        value: true,
      },
      queryRunner,
    );
  });
});

describe('SignInUpService - Anansi workspace idempotency', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'friend@gmail.com',
    canAccessFullAdminPanel: false,
  } as UserEntity;

  type BuildIdempotencyServiceOptions = {
    billingEnabled?: boolean;
    ensureBillingCustomer?: jest.Mock;
    initialWorkspaceCount?: number;
    isMultiWorkspaceEnabled?: boolean;
    serializeOutsideCountReads?: boolean;
    trackWorkspaceCount?: boolean;
  };

  const buildService = ({
    billingEnabled = false,
    ensureBillingCustomer = jest.fn().mockResolvedValue(undefined),
    initialWorkspaceCount = 0,
    isMultiWorkspaceEnabled = false,
    serializeOutsideCountReads = false,
    trackWorkspaceCount = false,
  }: BuildIdempotencyServiceOptions = {}) => {
    let persistedWorkspace: WorkspaceEntity | undefined;
    let hasMembership = false;
    let transactionTail = Promise.resolve();
    let workspaceCount = initialWorkspaceCount;
    let insideTransaction = false;
    let outsideCountWaiters: Array<(count: number) => void> = [];

    const workspaceRepository = {
      count: jest.fn().mockImplementation(async () => {
        if (!serializeOutsideCountReads || insideTransaction) {
          return workspaceCount;
        }

        return new Promise<number>((resolve) => {
          outsideCountWaiters.push(resolve);
          if (outsideCountWaiters.length === 2) {
            const waiters = outsideCountWaiters;

            outsideCountWaiters = [];
            waiters.forEach((waiter) => waiter(workspaceCount));
          }
        });
      }),
      create: jest.fn((workspace: WorkspaceEntity) => workspace),
    };
    const userWorkspaceService = {
      create: jest.fn().mockImplementation(async () => {
        hasMembership = true;
      }),
    };
    const onboardingService = {
      setOnboardingCreateProfilePending: jest.fn().mockResolvedValue(undefined),
      setOnboardingAnansiWizardPending: jest.fn().mockResolvedValue(undefined),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'IS_MULTIWORKSPACE_ENABLED') {
          return isMultiWorkspaceEnabled;
        }

        return undefined;
      }),
    };
    const subdomainManagerService = {
      generateSubdomain: jest.fn().mockResolvedValue('friend'),
    };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn().mockResolvedValue(undefined),
    };
    const applicationService = {
      createWorkspaceCustomApplication: jest.fn().mockResolvedValue({
        universalIdentifier: 'application-1',
      }),
    };
    const insertWorkspaceEvent = jest.fn();
    const eventLogEmitterService = {
      createContext: jest.fn().mockReturnValue({ insertWorkspaceEvent }),
    };
    const billingService = {
      isBillingEnabled: jest.fn().mockReturnValue(billingEnabled),
      ensureBillingCustomer,
    };
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
      manager: {
        save: jest
          .fn()
          .mockImplementation(
            async (entity: unknown, value: WorkspaceEntity) => {
              if (entity === WorkspaceEntity) {
                persistedWorkspace = value;
                if (trackWorkspaceCount) {
                  workspaceCount += 1;
                }
              }

              return value;
            },
          ),
        findOne: jest.fn().mockImplementation(async (entity: unknown) => {
          if (entity === UserWorkspaceEntity && hasMembership) {
            return {
              userId: user.id,
              workspaceId: persistedWorkspace?.id,
            };
          }

          return null;
        }),
        findOneByOrFail: jest
          .fn()
          .mockImplementation(async (entity: unknown) => {
            if (entity === WorkspaceEntity && persistedWorkspace) {
              return persistedWorkspace;
            }

            throw new Error('workspace not found');
          }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (entityManager: {
              queryRunner: typeof queryRunner;
            }) => Promise<unknown>,
          ) => {
            const previousTransaction = transactionTail;
            let releaseTransaction: () => void = () => undefined;

            transactionTail = new Promise<void>((resolve) => {
              releaseTransaction = resolve;
            });
            await previousTransaction;
            insideTransaction = true;

            try {
              return await callback({ queryRunner });
            } finally {
              insideTransaction = false;
              releaseTransaction();
            }
          },
        ),
    };
    const enterprisePlanService = {
      isValid: jest.fn().mockReturnValue(false),
    };
    const noop = {} as never;
    const service = new SignInUpService(
      { count: jest.fn().mockResolvedValue(1) } as never,
      workspaceRepository as never,
      noop,
      userWorkspaceService as never,
      onboardingService as never,
      noop,
      twentyConfigService as never,
      subdomainManagerService as never,
      noop,
      noop,
      workspaceCacheService as never,
      applicationService as never,
      noop,
      enterprisePlanService as never,
      eventLogEmitterService as never,
      noop,
      billingService as never,
      dataSource as never,
      noop,
    );

    return {
      insertWorkspaceEvent,
      queryRunner,
      service,
      userWorkspaceService,
      workspaceRepository,
    };
  };

  const userData: ExistingUserOrPartialUserWithPicture['userData'] = {
    type: 'existingUser',
    existingUser: user,
  };
  const anansiOptions = {
    displayName: 'Friend Workspace',
    anansiWorkspaceCreationIdentity: user.id,
  };

  it('returns the same workspace when an Anansi creation is replayed', async () => {
    const {
      insertWorkspaceEvent,
      queryRunner,
      service,
      userWorkspaceService,
      workspaceRepository,
    } = buildService();

    const firstResult = await service.signUpOnNewWorkspace(
      userData,
      anansiOptions,
    );
    const replayResult = await service.signUpOnNewWorkspace(
      userData,
      anansiOptions,
    );

    expect(replayResult.workspace.id).toBe(firstResult.workspace.id);
    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(workspaceRepository.create).toHaveBeenCalledTimes(1);
    expect(userWorkspaceService.create).toHaveBeenCalledTimes(1);
    expect(insertWorkspaceEvent).toHaveBeenCalledTimes(1);
  });

  it('repairs billing customer creation when deterministic replay follows a billing failure', async () => {
    const ensureBillingCustomer = jest
      .fn()
      .mockRejectedValueOnce(new Error('billing unavailable'))
      .mockResolvedValueOnce(undefined);
    const { insertWorkspaceEvent, service, workspaceRepository } = buildService(
      {
        billingEnabled: true,
        ensureBillingCustomer,
      },
    );

    await expect(
      service.signUpOnNewWorkspace(userData, anansiOptions),
    ).rejects.toThrow('billing unavailable');
    await expect(
      service.signUpOnNewWorkspace(userData, anansiOptions),
    ).resolves.toMatchObject({
      workspace: { displayName: 'Friend Workspace' },
    });

    expect(ensureBillingCustomer).toHaveBeenCalledTimes(2);
    expect(workspaceRepository.create).toHaveBeenCalledTimes(1);
    expect(insertWorkspaceEvent).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent Anansi creation calls for the same user', async () => {
    const { queryRunner, service, userWorkspaceService, workspaceRepository } =
      buildService();

    const [firstResult, concurrentResult] = await Promise.all([
      service.signUpOnNewWorkspace(userData, anansiOptions),
      service.signUpOnNewWorkspace(userData, anansiOptions),
    ]);

    expect(concurrentResult.workspace.id).toBe(firstResult.workspace.id);
    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(workspaceRepository.create).toHaveBeenCalledTimes(1);
    expect(userWorkspaceService.create).toHaveBeenCalledTimes(1);
  });

  it('serializes the global community workspace cap across different users', async () => {
    const { service, workspaceRepository } = buildService({
      initialWorkspaceCount: 4,
      isMultiWorkspaceEnabled: true,
      serializeOutsideCountReads: true,
      trackWorkspaceCount: true,
    });
    const secondUserData: ExistingUserOrPartialUserWithPicture['userData'] = {
      type: 'existingUser',
      existingUser: {
        ...user,
        id: '22222222-2222-4222-8222-222222222222',
        email: 'second-friend@gmail.com',
      },
    };

    const [firstResult, secondResult] = await Promise.allSettled([
      service.signUpOnNewWorkspace(userData, {
        displayName: 'First Friend Workspace',
      }),
      service.signUpOnNewWorkspace(secondUserData, {
        displayName: 'Second Friend Workspace',
      }),
    ]);

    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult).toMatchObject({
      status: 'rejected',
      reason: { code: AuthExceptionCode.FORBIDDEN_EXCEPTION },
    });
    expect(workspaceRepository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an Anansi identity that does not match the authenticated user', async () => {
    const { service } = buildService();
    const mismatchedOptions = {
      displayName: 'Friend Workspace',
      anansiWorkspaceCreationIdentity: '22222222-2222-4222-8222-222222222222',
    };

    await expect(
      service.signUpOnNewWorkspace(userData, mismatchedOptions),
    ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });
  });

  it('keeps stock workspace creation non-idempotent when the identity is absent', async () => {
    const { service, workspaceRepository } = buildService();

    const firstResult = await service.signUpOnNewWorkspace(userData, {
      displayName: 'First Workspace',
    });
    const secondResult = await service.signUpOnNewWorkspace(userData, {
      displayName: 'Second Workspace',
    });

    expect(secondResult.workspace.id).not.toBe(firstResult.workspace.id);
    expect(workspaceRepository.create).toHaveBeenCalledTimes(2);
  });
});
