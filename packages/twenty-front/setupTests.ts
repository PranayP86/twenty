import '@testing-library/jest-dom';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web';

import { i18n } from '@lingui/core';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages as enMessages } from '~/locales/generated/en';

i18n.load({ [SOURCE_LOCALE]: enMessages });
i18n.activate(SOURCE_LOCALE);

const globalWithWebStreams = globalThis as Record<string, unknown>;

if (globalWithWebStreams.TransformStream === undefined) {
  globalWithWebStreams.TransformStream = NodeTransformStream;
}

if (globalWithWebStreams.ReadableStream === undefined) {
  globalWithWebStreams.ReadableStream = NodeReadableStream;
}

if (globalWithWebStreams.WritableStream === undefined) {
  globalWithWebStreams.WritableStream = NodeWritableStream;
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    value: () => {},
    writable: true,
  });
}

// jsdom does not implement ResizeObserver; @dnd-kit/dom expects it at import
// time.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

// jsdom does not implement PointerEvent (https://github.com/jsdom/jsdom/issues/2527);
// @base-ui/react's Switch (used by twenty-ui's Toggle) constructs one from its
// onClick handler, so any test that fires a click on a Toggle/switch throws
// "PointerEvent is not a constructor" without this. Same workaround Base UI's
// own test suite uses (window.PointerEvent = window.MouseEvent).
if (typeof window !== 'undefined' && window.PointerEvent === undefined) {
  (window as unknown as Record<string, unknown>).PointerEvent =
    window.MouseEvent;
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toThrowError(error?: string | RegExp | Error): R;
      toMatchSnapshot(propertyMatchers?: any): R;
    }
  }

  namespace Vi {
    interface Assertion {
      toMatchSnapshot(propertyMatchers?: any): void;
    }
  }
}

/**
 * The structuredClone global function is not available in jsdom, it needs to be mocked for now.
 *
 * The most naive way to mock structuredClone is to use JSON.stringify and JSON.parse. This works
 * for arguments with simple types like primitives, arrays and objects, but doesn't work with functions,
 * Map, Set, etc.
 */
global.structuredClone = (val) => {
  return JSON.parse(JSON.stringify(val));
};
