import type { PropsWithChildren } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from '@/components/marketing/section';
import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Layout primitives shared by the standalone marketing pages.
 *
 * `section.tsx` holds the page-level frame (bands, headings, cards); these are
 * the smaller repeated shapes inside one — grids, numbered steps, callouts.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Wrapping grid of equal-width cells.
 *
 * React Native Web has no `grid`, so this is flex-wrap plus `gap`. The basis is
 * deliberately under 1/n — the cells carry `flexGrow` and expand to fill the
 * row once the gaps are taken out. A basis of exactly 1/n plus a gap overflows
 * the row, which on a phone makes the whole document wider than the viewport.
 */
export function Grid({
  children,
  columns = 3,
}: PropsWithChildren<{ columns?: 2 | 3 }>) {
  const { isMedium } = useBreakpoint();
  const items = Array.isArray(children) ? children.flat() : [children];
  const perRow = isMedium ? columns : 1;
  const basis = perRow === 1 ? '100%' : perRow === 2 ? '45%' : '30%';
  return (
    <View style={styles.grid}>
      {items.map((child, i) => (
        <View key={i} style={[styles.gridCell, { flexBasis: basis }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Card with a tinted icon tile, a heading and a paragraph. */
export function IconCard({
  icon,
  title,
  body,
  tone = 'primary',
}: {
  icon: IconName;
  title: string;
  body: string;
  tone?: 'primary' | 'money' | 'danger';
}) {
  const color = tone === 'money' ? Brand.money : tone === 'danger' ? Brand.danger : Brand.primary;
  return (
    <Card style={styles.fullHeight}>
      <View style={[styles.iconTile, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {body}
      </ThemedText>
    </Card>
  );
}

/** Numbered row: a filled circle, then a heading and body. */
export function NumberedItem({
  index,
  title,
  body,
  compact = false,
}: {
  index: number;
  title?: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.numberedRowCompact : styles.numberedRow}>
      <View style={styles.numberCircle}>
        <ThemedText type="smallBold" style={styles.onPrimary}>
          {index}
        </ThemedText>
      </View>
      <View style={styles.numberedCopy}>
        {title ? <ThemedText style={styles.itemTitle}>{title}</ThemedText> : null}
        <ThemedText themeColor="textSecondary" style={compact ? styles.body : styles.itemBody}>
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

/** The same row, wrapped in a bordered card — used for standalone lists. */
export function NumberedCard(props: Parameters<typeof NumberedItem>[0]) {
  return (
    <Card>
      <NumberedItem {...props} />
    </Card>
  );
}

/** Tinted full-width note. `tone` picks the soft background and icon color. */
export function Callout({
  children,
  tone = 'info',
  icon,
  style,
}: PropsWithChildren<{
  tone?: 'info' | 'warning' | 'neutral';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}>) {
  const theme = useTheme();
  const background =
    tone === 'warning' ? theme.warningSoft : tone === 'neutral' ? theme.surfaceSunken : theme.surface;
  const color = tone === 'warning' ? Brand.warning : Brand.primary;
  const bordered = tone !== 'warning';
  return (
    <View
      style={[
        styles.callout,
        { backgroundColor: background },
        bordered && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
    >
      <Ionicons
        name={icon ?? 'information-circle-outline'}
        size={20}
        color={color}
        style={styles.calloutIcon}
      />
      <View style={styles.calloutCopy}>{children}</View>
    </View>
  );
}

/** Small rounded label. */
export function Badge({
  label,
  tone = 'primary',
}: {
  label: string;
  tone?: 'primary' | 'money' | 'warning' | 'neutral';
}) {
  const theme = useTheme();
  const background =
    tone === 'money'
      ? theme.moneySoft
      : tone === 'warning'
        ? theme.warningSoft
        : tone === 'neutral'
          ? theme.backgroundElement
          : theme.primarySoft;
  const color =
    tone === 'money'
      ? Brand.money
      : tone === 'warning'
        ? Brand.warningText
        : tone === 'neutral'
          ? theme.text
          : Brand.primary;
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Row of neutral pills — a set of short values rather than prose. */
export function Pills({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.pills}>
      {items.map((item) => (
        <Badge key={item} label={item} tone="neutral" />
      ))}
    </View>
  );
}

/** Bulleted list. `icon` false renders a plain dot instead of a checkmark. */
export function BulletList({
  items,
  icon = 'checkmark-circle',
  color = Brand.primary,
}: {
  items: readonly string[];
  icon?: IconName;
  color?: string;
}) {
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Ionicons name={icon} size={16} color={color} style={styles.bulletIcon} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
            {item}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Card headed by a badge, holding a bulleted list. Used for do/don't splits. */
export function BadgedList({
  badge,
  tone,
  items,
  icon,
  iconColor,
}: {
  badge: string;
  tone?: 'primary' | 'money' | 'warning' | 'neutral';
  items: readonly string[];
  icon?: IconName;
  iconColor?: string;
}) {
  return (
    <Card style={styles.fullHeight}>
      <View style={styles.badgeRow}>
        <Badge label={badge} tone={tone} />
      </View>
      <BulletList items={items} icon={icon} color={iconColor} />
    </Card>
  );
}

/** A term and its value on one line, ruled off from the next. */
export function LineItem({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.lineItem, { borderTopColor: theme.border }]}>
      <ThemedText
        type={emphasis ? 'smallBold' : 'small'}
        themeColor={muted ? 'textSecondary' : 'text'}
        style={styles.lineLabel}
      >
        {label}
      </ThemedText>
      <ThemedText
        type={emphasis ? 'smallBold' : 'small'}
        themeColor={muted ? 'textSecondary' : 'text'}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  gridCell: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  fullHeight: { height: '100%' },

  iconTile: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  body: { lineHeight: 22 },
  itemTitle: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  itemBody: { fontSize: 16, lineHeight: 24 },

  numberedRow: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  numberedRowCompact: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  numberedCopy: { flex: 1, gap: Spacing.one },
  numberCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  onPrimary: { color: '#ffffff' },

  callout: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing.four,
  },
  calloutIcon: { marginTop: 2, flexShrink: 0 },
  calloutCopy: { flex: 1, gap: Spacing.two },

  badge: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: Radius.pill },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },

  bullets: { gap: Spacing.two },
  bulletRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  bulletIcon: { marginTop: 3 },
  bulletText: { flex: 1, lineHeight: 22 },

  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderTopWidth: 1,
    paddingVertical: Spacing.two,
  },
  lineLabel: { flex: 1 },
});
