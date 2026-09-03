import type { PropsWithChildren } from 'react';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Bounded } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Brand, MaxMarketingWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Chrome shared by every public marketing page.
 *
 * The landing page and the six standalone pages (about, pricing, safety,
 * contact, terms, privacy) all render the same pilot notice, top nav and
 * footer. They live here rather than in `screens/landing.tsx` so a change to
 * the disclosure wording — which is a compliance surface, see
 * docs/business/LEGAL_COMPLIANCE.md — happens in exactly one place.
 */

/** The routes listed in the footer, in order. */
export const MARKETING_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/safety', label: 'Safety' },
  { href: '/contact', label: 'Contact' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
] as const;

/**
 * Scroll frame for a marketing page, with the notice and nav already placed.
 *
 * `flexGrow: 1` on the content container rather than `flex: 1`: the latter
 * caps the content at the viewport height and the page stops scrolling.
 */
export function MarketingPage({ children }: PropsWithChildren) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <PilotNotice />
      <TopNav />
      {children}
      <SiteFooter />
    </ScrollView>
  );
}

/* ── Pilot disclosure ────────────────────────────────────────────────────── */

export function PilotNotice() {
  const theme = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
      <Bounded maxWidth={MaxMarketingWidth}>
        <ThemedText type="small" style={styles.noticeText}>
          <ThemedText type="smallBold" style={{ color: Brand.primary }}>
            Limited pilot.{' '}
          </ThemedText>
          We&rsquo;re onboarding a small number of customers and workers in one city while payments
          run in test mode. Nothing is charged for real yet.
        </ThemedText>
      </Bounded>
    </View>
  );
}

/* ── Navigation ──────────────────────────────────────────────────────────── */

export function TopNav() {
  const theme = useTheme();
  const { isMedium } = useBreakpoint();
  return (
    <View
      style={[styles.navWrap, { borderBottomColor: theme.border, backgroundColor: theme.background }]}
    >
      <Bounded maxWidth={MaxMarketingWidth}>
        <View style={styles.nav}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link" style={styles.brandRow}>
              <View style={styles.mark}>
                <Ionicons name="hammer" size={16} color="#fff" />
              </View>
              <ThemedText type="smallBold" style={styles.brandName}>
                Local Gig Marketplace
              </ThemedText>
            </Pressable>
          </Link>

          <View style={styles.navActions}>
            {isMedium ? (
              <Link href="/(auth)/login" asChild>
                <Pressable accessibilityRole="link" style={styles.navLink}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Sign in
                  </ThemedText>
                </Pressable>
              </Link>
            ) : null}
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" style={styles.navCta}>
                <ThemedText type="smallBold" style={styles.onPrimary}>
                  Get started
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        </View>
      </Bounded>
    </View>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

export function SiteFooter() {
  const theme = useTheme();
  return (
    <View
      style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surfaceSunken }]}
    >
      <Bounded maxWidth={MaxMarketingWidth}>
        <View style={styles.footerInner}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Ionicons name="hammer" size={14} color="#fff" />
            </View>
            <ThemedText type="smallBold">Local Gig Marketplace</ThemedText>
          </View>

          <View style={styles.footerNav}>
            {MARKETING_LINKS.map((link) => (
              <Link key={link.href} href={link.href} asChild>
                <Pressable accessibilityRole="link" style={styles.footerLink}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {link.label}
                  </ThemedText>
                </Pressable>
              </Link>
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerNote}>
            Working name — final brand not selected. Currently operating as a limited pilot in a
            single city with payments in test mode. Terms of service and privacy policy are being
            prepared with counsel and will be published before real payments are enabled.
          </ThemedText>
        </View>
      </Bounded>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { flexGrow: 1 },

  notice: { flexShrink: 0, paddingVertical: Spacing.two },
  noticeText: { textAlign: 'center' },

  navWrap: { flexShrink: 0, borderBottomWidth: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  // A child of <Link asChild>, so this has to stay a single flat object: on web
  // the link forwards `style` straight to a DOM anchor, which rejects an array.
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mark: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 15 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  navLink: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
  navCta: {
    backgroundColor: Brand.primary,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  onPrimary: { color: '#ffffff' },

  footer: { flexShrink: 0, borderTopWidth: 1, paddingVertical: Spacing.five },
  footerInner: { gap: Spacing.three },
  footerNav: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  footerLink: { paddingVertical: Spacing.half },
  footerNote: { maxWidth: 720 },
});
