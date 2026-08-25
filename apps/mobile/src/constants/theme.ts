/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Brand colors are scheme-independent: they read correctly on both the light
 * and dark surfaces below, so components can use them without a theme lookup.
 */
export const Brand = {
  /** Primary action / active state. */
  primary: '#2F6FED',
  primaryPressed: '#2259C9',
  /** Money and positive outcomes. */
  money: '#1F8A4C',
  /** Warnings that need action but are not failures. */
  warning: '#B26B00',
  danger: '#D64545',
} as const;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    /** Raised surface (cards, tiles) against `background`. */
    surface: '#FFFFFF',
    /** Recessed surface for full-width bands on the landing page. */
    surfaceSunken: '#F6F8FB',
    border: '#E3E6EB',
    borderStrong: '#CBD1DA',
    /** Tinted fill behind brand-colored badges and callouts. */
    primarySoft: '#EAF1FE',
    moneySoft: '#E7F5EC',
    warningSoft: '#FDF3E2',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    surface: '#141518',
    surfaceSunken: '#0B0C0E',
    border: '#2A2D33',
    borderStrong: '#3A3E45',
    primarySoft: '#152340',
    moneySoft: '#0F2A1B',
    warningSoft: '#2E2313',
  },
} as const;

/** Corner radii, in ascending order of prominence. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
/** Marketing pages read wider than app screens. */
export const MaxMarketingWidth = 1120;

/**
 * Layout breakpoints, in dp. `md` is the phone/tablet split; `lg` is where a
 * desktop pointer is likely and multi-column layouts start to make sense.
 */
export const Breakpoints = { md: 768, lg: 1024 } as const;
