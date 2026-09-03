import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Card, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import {
  BadgedList,
  Callout,
  Grid,
  IconCard,
  NumberedItem,
  Pills,
} from '@/components/marketing/blocks';
import { Brand, Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Safety page.
 *
 * Every protection listed under BUILT_IN is shipped behaviour, and the
 * NOT_CLAIMED section is load-bearing: LEGAL_COMPLIANCE.md L-3 (no insurance)
 * and L-4 (no background checks) require that those absences are stated, not
 * merely omitted. Do not soften them without a dispositioned register entry.
 */

const BUILT_IN = [
  {
    icon: 'checkmark-done-outline' as const,
    title: 'A real email and a real phone',
    body: 'Email is verified with a code before anyone can post a job; email and phone both before anyone can accept one. It doesn’t prove who someone is, but it does mean a throwaway account takes real effort.',
  },
  {
    icon: 'location-outline' as const,
    title: 'Your address stays hidden',
    body: 'An open job shows an approximate location and the city. The street address, unit number and access notes appear only to the worker who has been assigned — and only from the moment they accept.',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'Messaging stays on the job',
    body: 'Conversations are scoped to a specific job between the two people on it. Nobody can message you out of the blue, and the thread stays available if something needs reviewing later.',
  },
  {
    icon: 'time-outline' as const,
    title: 'A timeline nobody can edit',
    body: 'Accepted, on the way, arrived, started, completed, confirmed — each is written down with a timestamp when it happens. Neither side can quietly change it afterwards.',
  },
  {
    icon: 'shield-outline' as const,
    title: 'Leaving is always allowed',
    body: 'A worker who arrives and doesn’t feel safe can cancel for that reason. Doing so files a report for us to review automatically — they don’t have to write anything to be heard.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Categories open one at a time',
    body: 'Work that needs a licence or special handling stays switched off until we can stand behind it. You can’t post into a category we haven’t deliberately enabled.',
  },
];

const REPORT_CATEGORIES = [
  'An unsafe job',
  'Dangerous conditions',
  'Harassment',
  'A threat',
  'Unsafe behaviour',
  'Fraud',
  'Something else',
];

const REVIEW_STEPS = [
  'It enters the review queue linked to the job and the person, so the job’s timeline can be pulled up alongside it.',
  'Someone reads it and records an outcome — reviewed, acted on, or dismissed — with a written reason.',
  'That decision is itself logged, so there’s a record of who reviewed what and why.',
];

const NOT_CLAIMED = [
  {
    title: 'We do not run background checks',
    body: 'Not on workers, not on customers. Nobody on this platform has been screened for criminal history, and no badge here should be read as if they had been.',
  },
  {
    title: 'There is no insurance cover',
    body: 'No policy covers damage, injury or loss on a job booked here. If that matters for the work you have in mind, arrange your own cover before it starts.',
  },
  {
    title: 'We don’t verify skills or licences',
    body: 'Ratings come from people who hired someone before — that’s a reputation, not a qualification. Ask to see a licence yourself when the work calls for one.',
  },
  {
    title: 'We don’t supervise the work',
    body: 'Nobody from the platform is on site. What gets done, how, and to what standard is agreed between the two people on the job.',
  },
];

const HIRING_TIPS = [
  'Describe the job honestly, including the parts that are heavy, awkward or unpleasant. Surprises are where disputes come from.',
  'Keep the conversation in the app until the job is done, so there’s a record if you need one.',
  'Have someone else around if you’d rather not be alone in the house.',
  'Only confirm the job once you’re satisfied — confirming is what releases the payout.',
];

const WORKING_TIPS = [
  'Read the description before you accept — the money is committed at that point, and so are you.',
  'Tell someone where you’re going. The address is in the app once you’ve accepted.',
  'If the job on arrival isn’t the job that was posted, stop and say so rather than absorbing it.',
  'You can leave any job for safety reasons. That is a supported action, not a black mark.',
];

export function Safety() {
  const { isMedium } = useBreakpoint();
  return (
    <MarketingPage>
      <SiteHead
        title="Safety"
        description="What the platform actually does about safety — verified contact details, hidden addresses, job-scoped messaging, an uneditable timeline — and what it does not: no background checks and no insurance."
      />

      <Section>
        <Eyebrow>Safety</Eyebrow>
        <View style={styles.hero}>
          <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>
            What we do, and what we don’t.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.heroSub}>
            Someone is coming to your door, or going to someone else’s. Here is exactly what the
            platform does about that — and the things it deliberately does not claim to do.
          </ThemedText>
        </View>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="What’s built in"
          subtitle="Every item below is live in the product today, not planned."
        />
        <Grid columns={3}>
          {BUILT_IN.map((item) => (
            <IconCard key={item.title} {...item} />
          ))}
        </Grid>
      </Section>

      <Section>
        <Eyebrow>If something goes wrong</Eyebrow>
        <SectionHeading
          title="Reporting, and what happens next"
          subtitle="Anyone on a job can file a report about that job or the other person. Every report lands in a review queue that a person reads."
        />
        <View style={isMedium ? styles.splitWide : styles.split}>
          <Card style={[styles.splitCard, isMedium && styles.splitCardWide]}>
            <ThemedText style={styles.cardTitle}>What you can report</ThemedText>
            <Pills items={REPORT_CATEGORIES} />
            <ThemedText themeColor="textSecondary" style={styles.cardBody}>
              A report can point at a job, at a person, or at both. You write what happened in your
              own words — there’s no form to decode and no minimum severity to clear.
            </ThemedText>
          </Card>
          <Card style={[styles.splitCard, isMedium && styles.splitCardWide]}>
            <ThemedText style={styles.cardTitle}>What we do with it</ThemedText>
            <View style={styles.steps}>
              {REVIEW_STEPS.map((step, i) => (
                <NumberedItem key={step} index={i + 1} body={step} compact />
              ))}
            </View>
          </Card>
        </View>

        <Callout tone="warning" icon="warning-outline" style={styles.spaced}>
          <ThemedText type="smallBold">We are not an emergency service.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
            If you are in danger right now, call your local emergency number first. Report it here
            afterwards — the queue is read by people during working hours, not around the clock.
          </ThemedText>
        </Callout>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="What we don’t claim"
          subtitle="Plenty of platforms imply these. We’d rather you know where the line is before you book anything."
        />
        <Grid columns={2}>
          {NOT_CLAIMED.map((item) => (
            <IconCard key={item.title} icon="close-circle-outline" tone="danger" {...item} />
          ))}
        </Grid>
      </Section>

      <Section>
        <SectionHeading title="Sensible habits, either side of the door" />
        <Grid columns={2}>
          <BadgedList badge="If you’re hiring" tone="primary" items={HIRING_TIPS} />
          <BadgedList
            badge="If you’re working"
            tone="money"
            items={WORKING_TIPS}
            iconColor={Brand.money}
          />
        </Grid>
      </Section>
    </MarketingPage>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.three },
  h1: { fontSize: 56, lineHeight: 62, fontWeight: '800', letterSpacing: -1.6, maxWidth: 900 },
  h1Small: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 660 },

  split: { gap: Spacing.three },
  splitWide: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  splitCard: { gap: Spacing.three },
  // Zero basis only in the row: in the stacked column it collapses the card to
  // its padding and the content spills over whatever follows.
  splitCardWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cardTitle: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  cardBody: { fontSize: 16, lineHeight: 24 },
  steps: { gap: Spacing.three },
  spaced: { marginTop: Spacing.three },
});
