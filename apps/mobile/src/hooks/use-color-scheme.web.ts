import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** No-op subscription: hydration happens once and never changes afterwards. */
const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 *
 * `useSyncExternalStore` gives the static render and the first client render
 * the same answer, then reports the real scheme once hydrated — without the
 * cascading re-render that a setState-in-effect would cause.
 */
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return hydrated ? colorScheme : 'light';
}
