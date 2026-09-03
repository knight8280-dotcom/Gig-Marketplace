import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Card, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import { BadgedList, BulletList, Callout, Grid } from '@/components/marketing/blocks';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Privacy policy — a placeholder, but an accurate description.
 *
 * LEGAL_COMPLIANCE.md L-2 lists the privacy policy as a pilot blocker. The
 * formal document is with counsel; what this page describes is what the schema
 * actually stores and what the API actually sends to a third party. Keep it
 * true to the code: if a new field or processor is added, this page changes.
 */

const COLLECTED = [
  {
    title: 'Your account',
    body: 'Name, email address and phone number. The last two are verified with a code, which is how we know an account belongs to someone reachable.',
  },
  {
    title: 'Where the work is',
    body: 'The address you enter for a job, plus a coordinate derived from it so nearby workers can be matched. Open listings show only an approximate point and the city — the exact address is released to the assigned worker.',
  },
  {
    title: 'The job record',
    body: 'What was posted, any photos attached, the messages between the two people on it, the timestamps of each step, and the ratings left afterwards. This is the record a dispute is decided from, so it is kept after the job ends.',
  },
  {
    title: 'Payment details — not by us',
    body: 'Card numbers are entered into our payment processor and never touch our servers. What we hold is the amount, the currency, the state of the payment and a reference we can look it up by.',
  },
  {
    title: 'An audit trail',
    body: 'Sensitive actions — a report reviewed, a dispute decided, an account suspended — are logged with who did it and why. It exists so administrative decisions can be checked, including ours.',
  },
];

const PROCESSORS = [
  {
    title: 'The payment processor',
    body: 'Takes the card details directly and moves the money. Handles its own identity checks on anyone receiving a payout.',
  },
  {
    title: 'The SMS provider',
    body: 'Receives your phone number to deliver a verification code and job alerts. Nothing else is sent to it.',
  },
  {
    title: 'The email provider',
    body: 'Receives your address to deliver verification, password resets and job notifications.',
  },
  {
    title: 'The hosting provider',
    body: 'Runs the servers and the database everything above sits in.',
  },
];

const VISIBLE = [
  'Your name and photo, and your rating history',
  'What you wrote in the job and in the message thread',
  'The address — but only once they’re assigned to the job',
];

const NOT_VISIBLE = [
  'Your email address or your phone number',
  'Anything about your card or your payouts',
  'Your other jobs, or message you outside a shared one',
];

const RIGHTS = [
  'A copy of your data. Ask from the address on the account and we’ll send what we hold.',
  'A correction. Most of it you can edit yourself; anything you can’t, ask.',
  'Deletion. Your account and profile go. Records attached to a completed job — the timeline, the payment record, the audit trail — are kept where we’re required to keep them, because they belong to the other person’s history too.',
  'Fewer notifications. Email and SMS alerts can be turned down without closing the account.',
];

export function Privacy() {
  const { isMedium } = useBreakpoint();
  return (
    <MarketingPage>
      <SiteHead
        title="Privacy policy"
        description="A plain-English account of what the product collects, who else sees it, and what the other person on a job can and cannot see. The formal policy is being drafted with counsel."
      />

      <Section>
        <View style={styles.doc}>
          <Eyebrow>Legal</Eyebrow>
          <View style={styles.hero}>
            <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>Privacy policy</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.heroSub}>
              The formal policy is being drafted with a lawyer. Rather than leave the page blank,
              here is a plain-English account of what the product collects today and where it goes.
            </ThemedText>
          </View>
          <Callout tone="warning" icon="warning-outline" style={styles.spaced}>
            <ThemedText type="smallBold">
              This description is accurate; it just isn’t the legal document yet.
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>
              The published policy will say the same things in the form the law expects, and will
              name your rights and how to exercise them. It goes up before real payments are
              switched on.
            </ThemedText>
          </Callout>
        </View>
      </Section>

      <Section tone="sunken">
        <View style={styles.doc}>
          <SectionHeading
            title="What the product collects"
            subtitle="Everything below exists because a specific feature needs it. Nothing is gathered for advertising, and none of it is sold."
          />
          <View style={styles.stack}>
            {COLLECTED.map((item) => (
              <Card key={item.title}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  {item.body}
                </ThemedText>
              </Card>
            ))}
          </View>
        </View>
      </Section>

      <Section>
        <View style={styles.doc}>
          <SectionHeading
            title="Who else sees it"
            subtitle="Four companies, each doing one job. The full policy will name them and link their own terms."
          />
          <Grid columns={2}>
            {PROCESSORS.map((item) => (
              <Card key={item.title} style={styles.fullHeight}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  {item.body}
                </ThemedText>
              </Card>
            ))}
          </Grid>
          <Callout tone="neutral">
            <ThemedText themeColor="textSecondary" style={styles.body}>
              We don’t sell personal data, we don’t share it with advertisers, and the site carries
              no third-party tracking. Beyond the four above, information leaves only where the law
              requires it or where you ask us to send it.
            </ThemedText>
          </Callout>
        </View>
      </Section>

      <Section tone="sunken">
        <View style={styles.doc}>
          <SectionHeading
            title="What the other person can see"
            subtitle="Usually the more practical question."
          />
          <Grid columns={2}>
            <BadgedList badge="They can see" tone="money" items={VISIBLE} iconColor={Brand.money} />
            <BadgedList
              badge="They can’t"
              tone="warning"
              items={NOT_VISIBLE}
              icon="close-circle-outline"
              iconColor={Brand.warning}
            />
          </Grid>
        </View>
      </Section>

      <Section>
        <View style={styles.doc}>
          <SectionHeading
            title="What you can ask for"
            subtitle="These work today while the formal process is being written."
          />
          <Card>
            <BulletList items={RIGHTS} />
          </Card>
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
  note: { lineHeight: 22 },
  stack: { gap: Spacing.three },
  fullHeight: { height: '100%' },
  spaced: { marginTop: Spacing.three },
});
