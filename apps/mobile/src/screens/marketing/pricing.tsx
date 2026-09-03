import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Card, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import {
  Badge,
  Callout,
  Grid,
  IconCard,
  LineItem,
  NumberedItem,
} from '@/components/marketing/blocks';
import { Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Pricing page.
 *
 * The fee below mirrors the seeded platform-fee config (1500 bps, see
 * bootstrap-cli.ts). PAYMENT_MODEL.md records P-3 — the launch fee level — as
 * an open decision, so the page says so rather than presenting the pilot
 * setting as a commitment. Change PILOT_FEE_PCT here and in the API config
 * together; this page is a public statement of price.
 */

const PILOT_FEE_PCT = 15;
const EXAMPLE_TOTAL = 95;
const exampleFee = (EXAMPLE_TOTAL * PILOT_FEE_PCT) / 100;
const exampleNet = EXAMPLE_TOTAL - exampleFee;
const money = (n: number) => `$${n.toFixed(2)}`;

const FACTS = [
  {
    icon: 'search-outline' as const,
    title: 'Free to browse and post',
    body: 'Creating an account, posting a job, and looking at work near you cost nothing. If nobody accepts your job, you pay nothing at all.',
  },
  {
    icon: 'gift-outline' as const,
    title: 'Tips go to the worker in full',
    body: 'We take nothing from a tip. Every cent reaches the person who did the work, which is the only arrangement that makes sense.',
    tone: 'money' as const,
  },
  {
    icon: 'card-outline' as const,
    title: 'Card fees are ours, not yours',
    body: 'Processing charges come out of our fee. They aren’t added on top of what you were quoted.',
  },
];

const TIMELINE = [
  {
    title: 'While the job is open',
    body: 'Nothing is charged. Nothing is held.',
  },
  {
    title: 'A worker accepts',
    body: 'Your card is charged now, so the worker knows the job is funded before they set off.',
  },
  {
    title: 'The work happens',
    body: 'The payout doesn’t move. If a dispute is opened it stays put until it’s resolved.',
  },
  {
    title: 'You confirm it’s done',
    body: 'The payout is released. Go quiet and confirmation happens automatically after a set window, so nobody works for free.',
  },
];

const EDGE_CASES = [
  {
    icon: 'people-outline' as const,
    title: 'Only some of the workers turned up',
    body: 'A job asking for three people fills slot by slot. You’re charged for the workers who actually committed, not the number you hoped for.',
  },
  {
    icon: 'close-circle-outline' as const,
    title: 'You need to cancel',
    body: 'What a cancellation costs depends on how close to the start you are. The consequence is shown to you before you confirm the cancellation, never discovered afterwards.',
  },
  {
    icon: 'document-text-outline' as const,
    title: 'The work wasn’t done properly',
    body: 'Don’t confirm it. Opening a dispute freezes the payout while an administrator reviews the job’s timeline, the messages, and any photos.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Where the money sits meanwhile',
    body: 'With Stripe, our payment processor — not in an account of ours. We never hold your funds, and there are no stored balances or platform wallets.',
  },
];

export function Pricing() {
  const { isMedium } = useBreakpoint();
  return (
    <MarketingPage>
      <SiteHead
        title="Pricing"
        description="One platform fee, shown to both sides before anyone commits. Free to browse and post, tips go to the worker in full, and card processing comes out of our fee."
      />

      <Section>
        <Eyebrow>Pricing</Eyebrow>
        <View style={styles.hero}>
          <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>
            One fee. Shown before anyone commits.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.heroSub}>
            No subscription, no listing fee, nothing to pay to look around. A single platform fee
            comes out of the job when it’s paid — and both sides see the exact figure before either
            of them agrees to anything.
          </ThemedText>
        </View>
      </Section>

      <Section tone="sunken">
        <Grid columns={3}>
          {FACTS.map((item) => (
            <IconCard key={item.title} {...item} />
          ))}
        </Grid>
      </Section>

      <Section>
        <SectionHeading
          title="A $95 job, in full"
          subtitle="This is the same breakdown both sides see on the job itself — not an estimate, and not a summary that hides a line."
        />
        <View style={isMedium ? styles.exampleWide : styles.example}>
          <Card style={styles.exampleCard}>
            <View style={styles.exampleHeader}>
              <ThemedText type="smallBold">Unload a 26-foot moving truck</ThemedText>
              <Badge label={money(EXAMPLE_TOTAL)} tone="money" />
            </View>
            <LineItem label="Job price" value={money(EXAMPLE_TOTAL)} />
            <LineItem
              label={`Platform fee (${PILOT_FEE_PCT}%)`}
              value={`− ${money(exampleFee)}`}
              muted
            />
            <LineItem label="Worker receives" value={money(exampleNet)} emphasis />
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              The customer is charged {money(EXAMPLE_TOTAL)} — the quoted price, nothing added. A tip
              is on top and goes to the worker whole.
            </ThemedText>
          </Card>

          <Card style={styles.exampleCard}>
            <ThemedText type="smallBold">When the card is charged</ThemedText>
            <View style={styles.timeline}>
              {TIMELINE.map((step, i) => (
                <NumberedItem
                  key={step.title}
                  index={i + 1}
                  body={`${step.title} — ${step.body}`}
                  compact
                />
              ))}
            </View>
          </Card>
        </View>

        <Callout tone="warning" icon="warning-outline" style={styles.spaced}>
          <ThemedText type="smallBold">The fee level isn’t final.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {PILOT_FEE_PCT}% is the pilot setting, and payments are in test mode, so nothing has
            been charged at it yet. If it changes before real payments switch on, this page changes
            with it and anyone with an account is told first.
          </ThemedText>
        </Callout>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="The awkward cases"
          subtitle="The situations a pricing page usually leaves out, because they’re the ones that actually cost someone money."
        />
        <Grid columns={2}>
          {EDGE_CASES.map((item) => (
            <IconCard key={item.title} {...item} />
          ))}
        </Grid>
      </Section>
    </MarketingPage>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.three },
  h1: { fontSize: 56, lineHeight: 62, fontWeight: '800', letterSpacing: -1.6, maxWidth: 900 },
  h1Small: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 640 },

  example: { gap: Spacing.three },
  exampleWide: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  exampleCard: { flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: Spacing.two },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  timeline: { gap: Spacing.three, marginTop: Spacing.one },
  note: { lineHeight: 22, marginTop: Spacing.one },
  spaced: { marginTop: Spacing.three },
});

