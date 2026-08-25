import type { PropsWithChildren } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

interface ScreenProps {
  /** Widest the content is allowed to get before it starts centering. */
  maxWidth?: number;
  /** Set false when the screen owns its own scrolling (e.g. a FlatList). */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh, for screens that replaced a list's own refresh control. */
  refreshing?: boolean;
  onRefresh?: () => void;
}

/**
 * Standard app screen frame.
 *
 * On a phone this is just padding. On a wide viewport it caps the content and
 * centers it — without this, every screen stretches edge-to-edge across a
 * desktop browser and lines of text run the full width of the monitor.
 */
export function Screen({
  children,
  maxWidth = MaxContentWidth,
  scroll = true,
  contentStyle,
  refreshing,
  onRefresh,
}: PropsWithChildren<ScreenProps>) {
  const theme = useTheme();
  const { isMedium } = useBreakpoint();
  const gutter = isMedium ? Spacing.four : Spacing.three;

  const inner = (
    <View style={[styles.centered, { maxWidth, paddingHorizontal: gutter }, contentStyle]}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.fill, styles.staticTop, { backgroundColor: theme.background }]}>
        {inner}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  );
}

/**
 * Horizontal frame only — for content that must sit inside a screen that
 * already owns scrolling, or inside a full-bleed colored band.
 */
export function Bounded({
  children,
  maxWidth = MaxContentWidth,
  style,
}: PropsWithChildren<{ maxWidth?: number; style?: StyleProp<ViewStyle> }>) {
  const { isMedium } = useBreakpoint();
  return (
    <View
      style={[
        styles.centered,
        { maxWidth, paddingHorizontal: isMedium ? Spacing.four : Spacing.three },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  staticTop: { paddingTop: Spacing.four },
  // `width: 100%` with `alignSelf: center` is the RN equivalent of
  // `margin-inline: auto` — it centers once maxWidth starts clamping.
  centered: { width: '100%', alignSelf: 'center', flexGrow: 1, flexShrink: 0 },
  scrollContent: { flexGrow: 1, paddingTop: Spacing.four, paddingBottom: Spacing.six },
});
