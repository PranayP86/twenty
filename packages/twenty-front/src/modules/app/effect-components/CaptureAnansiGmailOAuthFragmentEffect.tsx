import { useEffect } from 'react';

export const ANANSI_GMAIL_OAUTH_COMPLETION_KEY =
  'anansi:gmail-oauth-completion';

const ANANSI_GMAIL_OAUTH_FRAGMENT =
  /^#anansi-gmail-oauth=(cancelled|[A-Za-z0-9_-]{43,512})$/;

export const captureAnansiGmailOAuthFragment = (): boolean => {
  const match = window.location.hash.match(ANANSI_GMAIL_OAUTH_FRAGMENT);
  if (match === null) {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      match[1],
    );
  } catch {
    // URL cleanup still removes the nonce when storage is unavailable.
  } finally {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }
  return true;
};

export const CaptureAnansiGmailOAuthFragmentEffect = () => {
  useEffect(() => {
    captureAnansiGmailOAuthFragment();
  }, []);

  return null;
};
