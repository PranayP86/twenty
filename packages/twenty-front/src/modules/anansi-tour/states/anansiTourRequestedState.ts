// ANANSI PATCH (WS-C): Profile requests a restart through shared Jotai state so
// the root-mounted overlay can start without a window event or remount.
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const anansiTourRequestedState = createAtomState<boolean>({
  key: 'anansiTourRequestedState',
  defaultValue: false,
});
