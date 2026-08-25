import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/** Greeting block at the top of a home screen. */
export function HomeHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  const { isMedium } = useBreakpoint();
  return (
    <View style={[styles.homeHeader, isMedium && styles.homeHeaderRow]}>
      <View style={styles.homeHeaderText}>
        <ThemedText type="small" themeColor="textSecondary">
          {eyebrow}
        </ThemedText>
        <ThemedText style={isMedium ? styles.pageTitle : styles.pageTitleSmall}>{title}</ThemedText>
      </View>
      {action}
    </View>
  );
}

/**
 * A labelled figure. `tone` tints the value so money reads as money without
 * needing a separate component.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'money';
}) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={[styles.statValue, tone === 'money' && { color: Brand.money }]}>
        {value}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Row of stat tiles that wraps rather than squeezing on narrow screens. */
export function StatRow({ children }: PropsWithChildren) {
  return <View style={styles.statRow}>{children}</View>;
}

/** Section label with an optional trailing count. */
export function SectionLabel({ title, count }: { title: string; count?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionLabel}>
      <ThemedText type="smallBold" style={styles.sectionLabelText}>
        {title}
      </ThemedText>
      {count !== undefined ? (
        <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {count}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Inline callout for something the user should act on. Not an error — these
 * describe a real gap (no card on file, no GPS fix) and say what to do.
 */
export function Callout({
  icon,
  tone = 'warning',
  children,
  onPress,
}: PropsWithChildren<{
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'warning' | 'info';
  onPress?: () => void;
}>) {
  const theme = useTheme();
  const color = tone === 'warning' ? Brand.warning : Brand.primary;
  const body = (
    <View
      style={[
        styles.callout,
        { backgroundColor: tone === 'warning' ? theme.warningSoft : theme.primarySoft },
      ]}
    >
      <Ionicons name={icon} size={18} color={color} style={styles.calloutIcon} />
      <ThemedText type="small" style={styles.calloutText}>
        {children}
      </ThemedText>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={color} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** Bordered surface used for grouped content on app screens. */
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <View
      style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  homeHeader: { gap: Spacing.three, marginBottom: Spacing.four },
  homeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  homeHeaderText: { gap: 2, flexShrink: 1 },
  pageTitle: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  pageTitleSmall: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  stat: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: 2,
  },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '700' },

  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionLabelText: { fontSize: 15 },
  countPill: {
    minWidth: 24,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },

  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  calloutIcon: { marginTop: 1 },
  calloutText: { flex: 1, lineHeight: 20 },

  panel: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three },
});
