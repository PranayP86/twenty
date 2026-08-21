import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// ANANSI PATCH: no sign-in flash during OAuth resume
// Computed once at module load from the URL hash so a page load that arrives
// with a pending ssoExchangeToken starts this atom `true` before the first
// render — closing the gap between the initial paint and the effect that
// strips the hash and kicks off the redemption mutation. useRedeemSSOExchangeToken
// flips it back to false once redemption settles (success or failure).
const hasPendingSSOExchangeTokenOnLoad = () =>
  new URLSearchParams(window.location.hash.substring(1)).has(
    'ssoExchangeToken',
  );

export const isRedeemingSSOExchangeTokenState = createAtomState<boolean>({
  key: 'isRedeemingSSOExchangeTokenState',
  defaultValue: hasPendingSSOExchangeTokenOnLoad(),
});
