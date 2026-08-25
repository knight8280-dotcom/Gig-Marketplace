import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Bounded } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Brand, MaxMarketingWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * A full-bleed horizontal band with centered, width-capped content.
 *
 * The band paints edge-to-edge so alternating backgrounds reach the window
 * edges on a wide monitor, while the content inside stays readable.
 */
export function Section({
  children,
  tone = 'default',
  style,
}: PropsWithChildren<{ tone?: 'default' | 'sunken'; style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  const { isMedium } = useBreakpoint();
  return (
    <View
      style={[
        // Sections are flex items in a column; without flexShrink: 0 a tall
        // section gets squashed to fit instead of extending the scroll length.
        styles.band,
        { backgroundColor: tone === 'sunken' ? theme.surfaceSunken : theme.background },
        { paddingVertical: isMedium ? 72 : 48 },
        style,
      ]}
    >
      <Bounded maxWidth={MaxMarketingWidth}>{children}</Bounded>
    </View>
  );
}

/** Small uppercase kicker above a section heading. */
export function Eyebrow({ children }: PropsWithChildren) {
  return (
    <ThemedText type="small" style={styles.eyebrow}>
      {children}
    </ThemedText>
  );
}

export function SectionHeading({
  title,
  subtitle,
  align = 'left',
}: {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  const { isMedium } = useBreakpoint();
  const centered = align === 'center';
  return (
    <View style={[styles.heading, centered && styles.headingCentered]}>
      <ThemedText
        style={[
          isMedium ? styles.h2 : styles.h2Small,
          centered && styles.textCenter,
        ]}
      >
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          themeColor="textSecondary"
          style={[styles.subtitle, centered && styles.textCenter]}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Bordered surface used for every card on the marketing page. */
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Responsive column set: stacked on phones, evenly split from `md` up.
 * `flexBasis: 0` + `flexGrow: 1` keeps columns equal regardless of content.
 */
export function Columns({
  children,
  minWidth = 280,
}: PropsWithChildren<{ minWidth?: number }>) {
  const { isMedium } = useBreakpoint();
  return (
    <View style={[styles.columns, !isMedium && styles.columnsStacked]}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <View key={i} style={isMedium ? [styles.column, { minWidth }] : undefined}>
              {child}
            </View>
          ))
        : children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { flexShrink: 0 },
  eyebrow: {
    color: Brand.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 12,
  },
  heading: { gap: Spacing.two, marginBottom: Spacing.four, maxWidth: 720 },
  headingCentered: { alignSelf: 'center', alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  h2: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -0.8 },
  h2Small: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 17, lineHeight: 26 },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  columns: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' },
  columnsStacked: { flexDirection: 'column' },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
});
