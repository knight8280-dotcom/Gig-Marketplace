import { StyleSheet, View } from 'react-native';

import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { MarketingPage } from '@/components/marketing/chrome';
import { Card, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import { Callout, Grid, IconCard } from '@/components/marketing/blocks';
import { Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Contact page.
 *
 * SUPPORT_EMAIL is null until a real support address exists. The page renders
 * honestly either way: with an address it lists it, without one it says so and
 * routes people to the in-app report and dispute flows, which are real. Set the
 * constant and every mention on this page updates.
 *
 * There is deliberately no contact form. A form whose Send button does nothing
 * is the kind of thing the About page says we don't ship.
 */
const SUPPORT_EMAIL: string | null = null;

const FAQ = [
  {
    question: '“Can I sign up where I live?”',
    answer:
      'Only in the pilot city for now. Write anyway and say where you are — that’s how we decide what opens next.',
  },
  {
    question: '“Was I actually charged?”',
    answer:
      'During the pilot, no. Payments run in test mode, so nothing reaches a real card — even where the app shows an amount.',
  },
  {
    question: '“How do I delete my account?”',
    answer:
      'Not from the app yet, and there’s no support address to write to yet either — both are being finished before real payments switch on. Nothing about your account is charged or shared in the meantime.',
  },
  {
    question: '“Where are your terms?”',
    answer:
      'Being written with counsel, and published before real payments switch on. We’d rather post nothing than post something we haven’t had checked.',
  },
];

export function Contact() {
  const { isMedium } = useBreakpoint();
  const emailLine = SUPPORT_EMAIL ?? 'no public support address yet — see below';

  return (
    <MarketingPage>
      <SiteHead
        title="Contact"
        description="How to reach us during the pilot: report an unsafe job from inside the job itself, raise a dispute for anything about money, and read what we can and can't help with yet."
      />

      <Section>
        <Eyebrow>Contact</Eyebrow>
        <View style={styles.hero}>
          <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>
            A small team, and a real inbox.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.heroSub}>
            We’re running a pilot in one city, so the person who reads your message is the person
            who can do something about it. Pick the route that fits and we’ll get back to you.
          </ThemedText>
        </View>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="Where to start"
          subtitle="Three routes, because they go to different places and move at different speeds."
        />
        <Grid columns={3}>
          <IconCard
            icon="shield-outline"
            tone="danger"
            title="Something unsafe"
            body={`Use Report inside the job itself — it arrives linked to the job, so we can pull up its timeline instead of asking you to reconstruct it. In immediate danger, call your local emergency number first.`}
          />
          <IconCard
            icon="card-outline"
            tone="money"
            title="Money and payments"
            body={`A charge you don’t recognise, a payout that hasn’t arrived, a job that didn’t go as agreed. If the job is still open, raising a dispute in the app keeps the money held while we look.`}
          />
          <IconCard
            icon="chatbubbles-outline"
            title="Everything else"
            body={`Joining the pilot, bringing a crew across, press, partnerships, or telling us something is broken — ${emailLine}.`}
          />
        </Grid>
      </Section>

      <Section>
        <SectionHeading title="How we reach you, and how we don’t" />
        <View style={isMedium ? styles.splitWide : styles.split}>
          <Card style={[styles.splitCard, isMedium && styles.splitCardWide]}>
            <ThemedText style={styles.cardTitle}>Email support isn’t open yet</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.cardBody}>
              {SUPPORT_EMAIL
                ? `Write to ${SUPPORT_EMAIL} and we’ll reply from the same address.`
                : 'We haven’t published a support address for the pilot yet. Until we do, the report and dispute flows inside a job are the routes that actually reach us — they carry the job’s record with them, which email wouldn’t. An address will be listed here before real payments switch on.'}
            </ThemedText>
          </Card>
          <Card style={[styles.splitCard, isMedium && styles.splitCardWide]}>
            <ThemedText style={styles.cardTitle}>There is no phone line</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.cardBody}>
              No support number and no live chat. Anyone who calls or texts you claiming to be from
              this platform isn’t — we only ever contact you through the app, or by email about your
              own account: a verification code or a password reset, never a request for anything.
            </ThemedText>
          </Card>
        </View>

        <Callout style={styles.spaced}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            We will never ask you for a password, a card number, or a verification code — not by
            email, not by text, and not in a job message. Nobody legitimate needs any of them.
          </ThemedText>
        </Callout>
      </Section>

      <Section tone="sunken">
        <SectionHeading
          title="Things we get asked a lot"
          subtitle="Answered here so you don’t have to wait on a reply."
        />
        <Grid columns={2}>
          {FAQ.map((item) => (
            <Card key={item.question} style={styles.faqCard}>
              <ThemedText type="smallBold">{item.question}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {item.answer}
              </ThemedText>
            </Card>
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
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 660 },

  split: { gap: Spacing.three },
  splitWide: { flexDirection: 'row', gap: Spacing.three, alignItems: 'stretch' },
  splitCard: { gap: Spacing.two },
  // Zero basis only in the row: in the stacked column it collapses the card to
  // its padding and the content spills over whatever follows.
  splitCardWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cardTitle: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  cardBody: { fontSize: 16, lineHeight: 24 },
  faqCard: { height: '100%' },
  note: { lineHeight: 22 },
  spaced: { marginTop: Spacing.three },
});
