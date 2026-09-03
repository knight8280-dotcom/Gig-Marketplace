import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during the static export and during the browser's hydration render,
 * true from the very next render on. React uses the server snapshot for the
 * hydration pass, so anything gated on this renders identically to the
 * exported HTML first and corrects itself immediately after — which is what
 * keeps React from throwing the prerendered DOM away as a mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
