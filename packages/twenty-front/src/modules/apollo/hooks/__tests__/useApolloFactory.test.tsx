import { gql } from '@apollo/client';
import { act, renderHook } from '@testing-library/react';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';

enableFetchMocks();

jest.mock('@/auth/constants/AnansiHomeUrl', () => ({
  ANANSI_HOME_URL: '#anansi-home',
}));

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn().mockReturnValue({
    accessOrWorkspaceAgnosticToken: { token: 'testAccessToken', expiresAt: '' },
    refreshToken: { token: 'testRefreshToken', expiresAt: '' },
  }),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    initialEntries={['/welcome', '/verify', '/opportunities']}
    initialIndex={2}
  >
    <SnackBarComponentInstanceContext.Provider
      value={{ instanceId: 'test-instance-id' }}
    >
      {children}
    </SnackBarComponentInstanceContext.Provider>
  </MemoryRouter>
);

describe('useApolloFactory', () => {
  it('should work as expected', () => {
    const { result } = renderHook(() => useApolloFactory(), {
      wrapper: Wrapper,
    });

    const res = result.current;

    expect(res).toBeDefined();
    expect(res).toHaveProperty('link');
    expect(res).toHaveProperty('cache');
    expect(res).toHaveProperty('query');
  });

  it('should redirect to Anansi home on unauthenticated error', async () => {
    const errors = [
      {
        extensions: {
          code: 'UNAUTHENTICATED',
        },
      },
    ];
    fetchMock.mockResponse(() =>
      Promise.resolve({
        body: JSON.stringify({
          data: {},
          errors,
        }),
      }),
    );

    const { result } = renderHook(
      () => {
        const location = useLocation();
        return { factory: useApolloFactory(), location };
      },
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.location.pathname).toBe('/opportunities');

    await act(async () => {
      await expect(
        result.current.factory.mutate({
          mutation: gql`
            mutation Track($type: String!, $sessionId: String!, $data: JSON!) {
              track(type: $type, sessionId: $sessionId, data: $data) {
                success
              }
            }
          `,
        }),
      ).rejects.toBeDefined();
    });

    expect(window.location.hash).toBe('#anansi-home');
  });
});
