// ANANSI PATCH (WS-C): Profile passes the persisted restart revision and its
// access token through shared Jotai state so the root-mounted overlay can bind
// the new tour instance to the user and Core state that created it.
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

type AnansiTourRequest = {
  accessToken: string;
  tourStateRevision: number;
};

export const anansiTourRequestedState =
  createAtomState<AnansiTourRequest | null>({
    key: 'anansiTourRequestedState',
    defaultValue: null,
  });
