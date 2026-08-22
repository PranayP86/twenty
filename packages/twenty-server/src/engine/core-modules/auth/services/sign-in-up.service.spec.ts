import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { type AnansiAllowlistService } from 'src/engine/core-modules/auth/services/anansi-allowlist.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { type ExistingUserOrPartialUserWithPicture } from 'src/engine/core-modules/auth/types/signInUp.type';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

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

  it('denies when the allowlist does not approve (e.g. Core timed out or denied)', async () => {
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
