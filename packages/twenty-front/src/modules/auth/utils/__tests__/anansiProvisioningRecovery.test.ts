import {
  clearPendingAnansiProvisioningWorkspace,
  getPendingAnansiProvisioningWorkspace,
  setPendingAnansiProvisioningWorkspace,
} from '@/auth/utils/anansiProvisioningRecovery';

const FIRST_USER_ID = '11111111-1111-4111-8111-111111111111';
const getMarkerKey = (userId: string) =>
  `anansiPendingProvisioningWorkspaceState:${userId}`;

describe('anansiProvisioningRecovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('treats unavailable local storage as no pending marker', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'SecurityError');
    });

    expect(getPendingAnansiProvisioningWorkspace(FIRST_USER_ID)).toBeNull();
  });

  it('reads a server-issued creation identity without requiring a workspace', () => {
    localStorage.setItem(
      getMarkerKey(FIRST_USER_ID),
      JSON.stringify({
        email: 'friend@example.com',
        anansiWorkspaceCreationIdentity: FIRST_USER_ID,
      }),
    );

    expect(getPendingAnansiProvisioningWorkspace(FIRST_USER_ID)).toEqual({
      email: 'friend@example.com',
      anansiWorkspaceCreationIdentity: FIRST_USER_ID,
    });
  });

  it('keeps different users recovery markers isolated', () => {
    const firstMarker = {
      anansiWorkspaceCreationIdentity: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'first-workspace-id',
      email: 'first@example.com',
    };
    const secondMarker = {
      anansiWorkspaceCreationIdentity: '22222222-2222-4222-8222-222222222222',
      workspaceId: 'second-workspace-id',
      email: 'second@example.com',
    };

    setPendingAnansiProvisioningWorkspace(firstMarker);
    setPendingAnansiProvisioningWorkspace(secondMarker);

    expect(
      getPendingAnansiProvisioningWorkspace(
        firstMarker.anansiWorkspaceCreationIdentity,
      ),
    ).toEqual(firstMarker);
    expect(
      getPendingAnansiProvisioningWorkspace(
        secondMarker.anansiWorkspaceCreationIdentity,
      ),
    ).toEqual(secondMarker);
  });

  it('persists only non-secret recovery fields', () => {
    setPendingAnansiProvisioningWorkspace({
      anansiWorkspaceCreationIdentity: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'workspace-id',
      email: 'friend@example.com',
      loginToken: 'must-not-be-stored',
      accessToken: 'must-not-be-stored',
      refreshToken: 'must-not-be-stored',
    } as Parameters<typeof setPendingAnansiProvisioningWorkspace>[0] & {
      accessToken: string;
      loginToken: string;
      refreshToken: string;
    });

    expect(
      JSON.parse(localStorage.getItem(getMarkerKey(FIRST_USER_ID))!),
    ).toEqual({
      anansiWorkspaceCreationIdentity: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'workspace-id',
      email: 'friend@example.com',
    });
  });

  it('reports a failed marker write without throwing', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'QuotaExceededError');
    });

    expect(
      setPendingAnansiProvisioningWorkspace({
        anansiWorkspaceCreationIdentity: '11111111-1111-4111-8111-111111111111',
        workspaceId: 'workspace-id',
        email: 'friend@example.com',
      }),
    ).toBe(false);
  });

  it('reports a failed marker clear without throwing', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'SecurityError');
    });

    expect(clearPendingAnansiProvisioningWorkspace(FIRST_USER_ID)).toBe(false);
  });
});
