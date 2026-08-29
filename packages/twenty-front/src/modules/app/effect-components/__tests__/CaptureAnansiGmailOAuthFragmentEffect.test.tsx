import { render } from '@testing-library/react';
import { StrictMode } from 'react';

import {
  ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
  CaptureAnansiGmailOAuthFragmentEffect,
} from '@/app/effect-components/CaptureAnansiGmailOAuthFragmentEffect';

const renderEffect = (url: string) => {
  window.history.replaceState({ test: true }, '', url);

  render(
    <StrictMode>
      <CaptureAnansiGmailOAuthFragmentEffect />
    </StrictMode>,
  );
};

describe('CaptureAnansiGmailOAuthFragmentEffect', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('captures one exact completion fragment and removes it from the URL', () => {
    const nonce = 'a'.repeat(43);

    renderEffect(`/welcome?source=google#anansi-gmail-oauth=${nonce}`);

    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBe(nonce);
    expect(window.location.pathname).toBe('/welcome');
    expect(window.location.search).toBe('?source=google');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual({ test: true });
  });

  it('captures the provider-cancelled result and removes it from the URL', () => {
    renderEffect('/profile#anansi-gmail-oauth=cancelled');

    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBe('cancelled');
    expect(window.location.hash).toBe('');
  });

  it('removes the completion fragment without crashing when storage is blocked', () => {
    const setItemSpy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Access denied', 'SecurityError');
      });

    expect(() =>
      renderEffect(`/profile#anansi-gmail-oauth=${'a'.repeat(43)}`),
    ).not.toThrow();
    expect(window.location.hash).toBe('');

    setItemSpy.mockRestore();
  });

  it.each([
    '#other=value',
    '#foo=bar&anansi-gmail-oauth=' + 'a'.repeat(43),
    '#anansi-gmail-oauth=',
    '#anansi-gmail-oauth=short',
    '#anansi-gmail-oauth=' + 'a'.repeat(43) + '&other=value',
    '#anansi-gmail-oauth=' + 'a'.repeat(42) + '%2F',
  ])('ignores a fragment outside the exact Anansi contract: %s', (fragment) => {
    renderEffect(`/welcome${fragment}`);

    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
    expect(window.location.hash).toBe(fragment);
  });
});
