export type PendingAnansiProvisioningWorkspace = {
  anansiWorkspaceCreationIdentity: string;
  email: string;
  workspaceId?: string;
};

const PENDING_ANANSI_PROVISIONING_WORKSPACE_STATE_KEY =
  'anansiPendingProvisioningWorkspaceState';

const getPendingWorkspaceStateKey = (
  anansiWorkspaceCreationIdentity: string,
): string =>
  `${PENDING_ANANSI_PROVISIONING_WORKSPACE_STATE_KEY}:${anansiWorkspaceCreationIdentity}`;

export const getPendingAnansiProvisioningWorkspace = (
  anansiWorkspaceCreationIdentity: string,
): PendingAnansiProvisioningWorkspace | null => {
  try {
    const storedValue = localStorage.getItem(
      getPendingWorkspaceStateKey(anansiWorkspaceCreationIdentity),
    );

    if (storedValue === null) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(storedValue);

    if (
      typeof parsedValue !== 'object' ||
      parsedValue === null ||
      !('email' in parsedValue) ||
      typeof parsedValue.email !== 'string'
    ) {
      return null;
    }

    const parsedCreationIdentity =
      'anansiWorkspaceCreationIdentity' in parsedValue
        ? parsedValue.anansiWorkspaceCreationIdentity
        : undefined;
    const workspaceId =
      'workspaceId' in parsedValue ? parsedValue.workspaceId : undefined;

    if (
      parsedCreationIdentity !== anansiWorkspaceCreationIdentity ||
      (workspaceId !== undefined && typeof workspaceId !== 'string')
    ) {
      return null;
    }

    return {
      anansiWorkspaceCreationIdentity,
      email: parsedValue.email,
      ...(typeof workspaceId === 'string' && { workspaceId }),
    };
  } catch {
    return null;
  }
};

export const setPendingAnansiProvisioningWorkspace = (
  pendingWorkspace: PendingAnansiProvisioningWorkspace,
): boolean => {
  try {
    localStorage.setItem(
      getPendingWorkspaceStateKey(
        pendingWorkspace.anansiWorkspaceCreationIdentity,
      ),
      JSON.stringify({
        anansiWorkspaceCreationIdentity:
          pendingWorkspace.anansiWorkspaceCreationIdentity,
        email: pendingWorkspace.email,
        ...(pendingWorkspace.workspaceId !== undefined && {
          workspaceId: pendingWorkspace.workspaceId,
        }),
      }),
    );
    return true;
  } catch {
    return false;
  }
};

export const clearPendingAnansiProvisioningWorkspace = (
  anansiWorkspaceCreationIdentity: string,
): boolean => {
  try {
    localStorage.removeItem(
      getPendingWorkspaceStateKey(anansiWorkspaceCreationIdentity),
    );
    return true;
  } catch {
    return false;
  }
};
