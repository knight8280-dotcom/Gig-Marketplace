import { useWindowDimensions } from 'react-native';

import { Breakpoints } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';

export interface Breakpoint {
  width: number;
  /** ≥768dp — tablets and up; two-column layouts are safe. */
  isMedium: boolean;
  /** ≥1024dp — desktop-sized; wide layouts and a top nav make sense. */
  isLarge: boolean;
}

/**
 * Viewport-width breakpoints.
 *
 * React Native has no media queries, so responsive layout is a render-time
 * decision. `useWindowDimensions` re-renders on resize, which is what makes a
 * browser window drag work.
 */
export function useBreakpoint(): Breakpoint {
  const dimensions = useWindowDimensions();
  // The static export has no window, so it renders every page at width 0 (the
  // phone layout). The hydration pass has to produce that same tree — a
  // desktop viewport that hydrated straight into the wide layout would add a
  // nav link and change every grid, and React would discard the server DOM.
  // Report 0 until hydration is done; the real width lands one render later.
  const width = useHydrated() ? dimensions.width : 0;
  return {
    width,
    isMedium: width >= Breakpoints.md,
    isLarge: width >= Breakpoints.lg,
  };
}
