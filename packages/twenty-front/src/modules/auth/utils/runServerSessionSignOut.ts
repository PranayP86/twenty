let serverSessionSignOutPromise: Promise<void> | undefined;

export const runServerSessionSignOut = (
  signOut: () => Promise<unknown>,
): Promise<void> => {
  if (serverSessionSignOutPromise !== undefined) {
    return serverSessionSignOutPromise;
  }

  const pending = Promise.resolve()
    .then(signOut)
    .then(() => undefined);
  const tracked = pending.finally(() => {
    if (serverSessionSignOutPromise === tracked) {
      serverSessionSignOutPromise = undefined;
    }
  });
  serverSessionSignOutPromise = tracked;

  return tracked;
};
