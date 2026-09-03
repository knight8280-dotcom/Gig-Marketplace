import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Card, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import { BulletList, Callout, NumberedCard } from '@/components/marketing/blocks';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Terms of service — a placeholder, and honest about being one.
 *
 * LEGAL_COMPLIANCE.md L-2 lists terms of service as a pilot blocker. Rather
 * than publish a template nobody reviewed, this page states that nothing is in
 * force, sets out the agreed outline, and describes how the pilot is actually
 * run in the meantime. Replace it with counsel's wording, don't extend it.
 */

const OUTLINE = [
  {
    title: 'Who the agreement is between',
    body: 'The job itself is an agreement between the customer and the worker. The platform’s role is to introduce them, hold the money and keep the record — it is not a party to the work.',
  },
  {
    title: 'Who can use it',
    body: 'A minimum age, one account per person, a verified email and phone, and the right to close an account that’s used to deceive people.',
  },
  {
    title: 'Money: charging, holding, releasing, refunding',
    body: 'When the card is charged, how long the money is held, what releases it, what happens on a cancellation or a partly-filled job, and how refunds are decided.',
  },
  {
    title: 'Fees',
    body: 'What the platform takes, shown before anyone commits, and how much notice you get before it changes. Tips are excluded from the fee.',
  },
  {
    title: 'Conduct, and what gets an account removed',
    body: 'Harassment, threats, discrimination, taking work off-platform to dodge the record, and posting jobs in categories that aren’t open.',
  },
  {
    title: 'Disputes',
    body: 'How to raise one, what happens to the money while it’s open, what we look at, and how long a decision takes.',
  },
  {
    title: 'Limits on what we’re responsible for',
    body: 'Stated in plain words rather than buried: we don’t screen people, we don’t insure the work, and we aren’t on site while it happens.',
  },
  {
    title: 'Ending it, and which law applies',
    body: 'Closing your account, how we’d close one, and the law the agreement is governed by.',
  },
];

const INTERIM = [
  'Payments run in test mode. No card is charged, no payout is real, and no fee is collected.',
  'You can close your account and ask for your data to be removed at any time.',
  'We can suspend an account that’s being used to harass, threaten or defraud someone, and we’ll say why when we do.',
  'Categories that need a licence or special handling stay switched off — they aren’t available to post into.',
  'Nothing here creates an employment relationship. Everyone taking work does so on their own account.',
];

export function Terms() {
  const { isMedium } = useBreakpoint();
  return (
    <MarketingPage>
      <SiteHead
        title="Terms of service"
        description="The terms are being drafted with counsel and are not yet in force. This page sets out the agreed outline and how the pilot is actually run in the meantime."
      />

      <Section>
        <View style={styles.doc}>
          <Eyebrow>Legal</Eyebrow>
          <View style={styles.hero}>
            <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>Terms of service</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.heroSub}>
              This page is a placeholder. The terms are being drafted with a lawyer and will be
              published here before real payments are switched on.
            </ThemedText>
          </View>
          <Callout tone="warning" icon="warning-outline" style={styles.spaced}>
            <ThemedText type="smallBold">There is no agreement in force yet.</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>
              We’d rather show an empty page than paste a template we haven’t had reviewed. Until
              this is published, the platform runs as a limited pilot with payments in test mode —
              no card is charged and no payout is real.
            </ThemedText>
          </Callout>
        </View>
      </Section>

      <Section tone="sunken">
        <View style={styles.doc}>
          <SectionHeading
            title="What it will cover"
            subtitle="The outline below is settled; the wording is what’s with counsel. Publishing it early means you can tell now whether anything here would be a problem for you."
          />
          <View style={styles.stack}>
            {OUTLINE.map((item, i) => (
              <NumberedCard key={item.title} index={i + 1} title={item.title} body={item.body} />
            ))}
          </View>
        </View>
      </Section>

      <Section>
        <View style={styles.doc}>
          <SectionHeading
            title="What applies in the meantime"
            subtitle="Not a contract — just how the pilot is actually run, so nobody has to guess."
          />
          <Card>
            <BulletList items={INTERIM} />
          </Card>
          <Callout tone="neutral" style={styles.spaced}>
            <ThemedText themeColor="textSecondary" style={styles.body}>
              When the terms are published we’ll email everyone with an account before they take
              effect, and this page will show the date it happened.
            </ThemedText>
          </Callout>
        </View>
      </Section>
    </MarketingPage>
  );
}

const styles = StyleSheet.create({
  doc: { maxWidth: MaxContentWidth },
  hero: { gap: Spacing.three },
  h1: { fontSize: 56, lineHeight: 62, fontWeight: '800', letterSpacing: -1.6 },
  h1Small: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: 18, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  stack: { gap: Spacing.three },
  spaced: { marginTop: Spacing.three },
});
