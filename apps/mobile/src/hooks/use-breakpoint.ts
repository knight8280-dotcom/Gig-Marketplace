import { useWindowDimensions } from 'react-native';

import { Breakpoints } from '@/constants/theme';

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
  const { width } = useWindowDimensions();
  return {
    width,
    isMedium: width >= Breakpoints.md,
    isLarge: width >= Breakpoints.lg,
  };
}
