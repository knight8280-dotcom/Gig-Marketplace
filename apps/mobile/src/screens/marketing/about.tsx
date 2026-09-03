import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import {
  BadgedList,
  Callout,
  Grid,
  IconCard,
  NumberedCard,
} from '@/components/marketing/blocks';
import { Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * About page.
 *
 * Same constraint as the landing page: no insurance claim (L-3), no background
 * checks (L-4), no worker-classification language (L-1). The "Not yet" column
 * exists to state those absences rather than let a reader assume otherwise.
 */

const PROBLEMS = [
  {
    icon: 'cash-outline' as const,
    title: 'Somebody has to chase the money',
    body: 'The worker finishes and then waits, or the customer pays up front and hopes. One side always carries the risk.',
  },
  {
    icon: 'warning-outline' as const,
    title: 'Nobody agreed what “done” means',
    body: 'Scope drifts mid-job. Without a record of what was agreed, the argument comes down to who remembers it better.',
  },
  {
    icon: 'person-outline' as const,
    title: 'You’re meeting a stranger',
    body: 'Someone is coming to your door, or going to someone else’s. That deserves more care than a listing site gives it.',
  },
];

const PRINCIPLES = [
  {
    title: 'The money is held, not promised',
    body: 'The card is charged once the job is staffed — or when work starts on a partly-filled one — before anyone lifts anything. The payout is released when the customer confirms. Neither side is asked to trust the other with the timing.',
  },
  {
    title: 'Every step is written down',
    body: 'Accepted, en route, arrived, started, completed, confirmed — each one is a timestamped record that can’t be edited afterwards. When something is disputed there’s a timeline to look at instead of two conflicting stories.',
  },
  {
    title: 'We don’t ship things that don’t work',
    body: 'No decorative badges, no verification that isn’t real, no feature that looks finished and quietly isn’t. If something can’t be done yet, the product says so in plain words rather than failing in a way you have to decode.',
  },
  {
    title: 'Categories open one at a time',
    body: 'Work that needs a licence, special handling, or that we can’t responsibly stand behind stays switched off. Adding a category is a deliberate decision, not a box anyone can type into.',
  },
];

const WORKING = [
  'Posting a job, matching to nearby workers, and the full accept-to-confirm lifecycle',
  'Job-scoped messaging, two-way ratings, tips, and dispute handling',
  'Email verification before anyone can post a job; email and phone verification before anyone can accept one',
];

const NOT_YET = [
  'Real payments — we’re running in test mode, so nothing is charged',
  'Background checks and insurance cover — neither exists, and we don’t imply otherwise',
  'Terms of service and a privacy policy, both being prepared with counsel',
];

export function About() {
  const { isMedium } = useBreakpoint();
  return (
    <MarketingPage>
      <SiteHead
        title="About"
        description="Why this exists: the money is held rather than promised, every step of a job is written down, and what the platform cannot yet do is stated plainly."
      />

      <Section>
        <Eyebrow>About</Eyebrow>
        <View style={styles.hero}>
          <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>
            We built the boring parts first.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.heroSub}>
            Most local work runs on a handshake and a text message. That holds up right until it
            doesn’t — the job turns out bigger than described, someone runs late, the cash never
            quite arrives. We put structure around exactly those moments.
          </ThemedText>
        </View>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="Three things go wrong, over and over"
          subtitle="None of them are about finding someone. They’re about what happens after you do."
        />
        <Grid columns={3}>
          {PROBLEMS.map((item) => (
            <IconCard key={item.title} {...item} />
          ))}
        </Grid>
      </Section>

      <Section>
        <Eyebrow>How we build</Eyebrow>
        <SectionHeading title="Four rules we don’t bend" />
        <View style={styles.stack}>
          {PRINCIPLES.map((item, i) => (
            <NumberedCard key={item.title} index={i + 1} title={item.title} body={item.body} />
          ))}
        </View>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="Where we actually are"
          subtitle="Written plainly, because a marketplace that overstates itself is the whole problem we’re trying to avoid."
        />
        <Grid columns={2}>
          <BadgedList badge="Working today" tone="money" items={WORKING} />
          <BadgedList
            badge="Not yet"
            tone="warning"
            items={NOT_YET}
            icon="ellipse-outline"
            iconColor="#B26B00"
          />
        </Grid>
        <Callout>
          <ThemedText type="small" themeColor="textSecondary" style={styles.calloutText}>
            We’re operating in one city during the pilot. “Local Gig Marketplace” is a working name
            — the final brand hasn’t been chosen yet.
          </ThemedText>
        </Callout>
      </Section>
    </MarketingPage>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.three },
  h1: { fontSize: 56, lineHeight: 62, fontWeight: '800', letterSpacing: -1.6, maxWidth: 900 },
  h1Small: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 640 },
  stack: { gap: Spacing.three },
  calloutText: { lineHeight: 22 },
});
