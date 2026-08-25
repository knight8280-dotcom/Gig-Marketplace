import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Bounded } from '@/components/screen';
import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { Card, Columns, Eyebrow, Section, SectionHeading } from '@/components/marketing/section';
import { Brand, MaxMarketingWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

/**
 * Public landing page (web).
 *
 * Everything claimed here is backed by shipped behaviour. Three things are
 * deliberately absent because the platform cannot yet honour them (see
 * docs/business/LEGAL_COMPLIANCE.md): insurance coverage (L-3), background
 * checks (L-4, adapter not wired), and any worker-classification language
 * (L-1). Do not add them to this page without a dispositioned register entry.
 */
export function Landing() {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <SiteHead />
      <PilotNotice />
      <TopNav />
      <Hero />
      <LoopSection />
      <AudienceSection />
      <MoneySection />
      <SafetySection />
      <ExamplesSection />
      <FaqSection />
      <ClosingCta />
      <Footer />
    </ScrollView>
  );
}

/* ── Pilot disclosure ────────────────────────────────────────────────────── */

function PilotNotice() {
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

function TopNav() {
  const theme = useTheme();
  const { isMedium } = useBreakpoint();
  return (
    <View style={[styles.navWrap, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
      <Bounded maxWidth={MaxMarketingWidth}>
        <View style={styles.nav}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Ionicons name="hammer" size={16} color="#fff" />
            </View>
            <ThemedText type="smallBold" style={styles.brandName}>
              Local Gig Marketplace
            </ThemedText>
          </View>

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

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  const { isMedium, isLarge } = useBreakpoint();
  return (
    <Section>
      <View style={[styles.hero, isLarge && styles.heroWide]}>
        {/* The flex basis only applies in the wide two-column layout; in the
            stacked layout a zero basis would collapse the column to nothing. */}
        <View style={isLarge ? styles.heroCopyWide : styles.heroCopy}>
          <Eyebrow>Local work, settled properly</Eyebrow>
          <ThemedText style={isMedium ? styles.h1 : styles.h1Small}>
            Get the job done today.{'\n'}Get paid when it&rsquo;s done right.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.heroSub}>
            Post what you need in a couple of minutes. Nearby workers see it right away. The money
            is held the moment someone commits and released when you confirm the work is finished —
            so neither side has to chase the other.
          </ThemedText>

          <View style={[styles.heroCtas, !isMedium && styles.heroCtasStacked]}>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" style={styles.ctaPrimary}>
                <ThemedText type="smallBold" style={styles.onPrimary}>
                  Post a job
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" style={styles.ctaGhost}>
                <ThemedText type="smallBold" style={{ color: Brand.primary }}>
                  Find work nearby
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.heroFinePrint}>
            Free to browse. No subscription. A platform fee is shown before you confirm anything.
          </ThemedText>
        </View>

        {isLarge ? <HeroPreview /> : null}
      </View>
    </Section>
  );
}

/**
 * Stylised preview of a real job card and its lifecycle. Built from the same
 * vocabulary the app uses (states, pay, distance) rather than a stock image.
 */
function HeroPreview() {
  const theme = useTheme();
  const steps = [
    { label: 'Accepted', done: true },
    { label: 'En route', done: true },
    { label: 'Arrived', done: true },
    { label: 'In progress', done: false },
    { label: 'Confirmed', done: false },
  ];
  return (
    <View style={styles.heroPreview}>
      <Card style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={styles.previewTitleCol}>
            <ThemedText type="smallBold">Unload a 26-foot moving truck</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Today, 4:00 PM · ~2h · 1.4 mi away
            </ThemedText>
          </View>
          <View style={[styles.payPill, { backgroundColor: theme.moneySoft }]}>
            <ThemedText type="smallBold" style={{ color: Brand.money }}>
              $95
            </ThemedText>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.timeline}>
          {steps.map((step) => (
            <View key={step.label} style={styles.timelineRow}>
              <View
                style={[
                  styles.dot,
                  step.done
                    ? { backgroundColor: Brand.primary, borderColor: Brand.primary }
                    : { backgroundColor: 'transparent', borderColor: theme.borderStrong },
                ]}
              >
                {step.done ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
              </View>
              <ThemedText
                type="small"
                themeColor={step.done ? 'text' : 'textSecondary'}
                style={styles.timelineLabel}
              >
                {step.label}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={[styles.escrowNote, { backgroundColor: theme.moneySoft }]}>
          <Ionicons name="lock-closed" size={12} color={Brand.money} />
          <ThemedText type="small" style={{ color: Brand.money, flex: 1 }}>
            $95 held — released to the worker when you confirm
          </ThemedText>
        </View>
      </Card>
    </View>
  );
}

/* ── The core loop ───────────────────────────────────────────────────────── */

const LOOP_STEPS = [
  {
    icon: 'create-outline' as const,
    title: 'Post the job',
    body: 'Describe the work, when you need it, where, and what it pays — hourly or a fixed price. Add photos so nobody arrives surprised.',
  },
  {
    icon: 'navigate-outline' as const,
    title: 'Nearby workers are notified',
    body: 'The job goes out to workers who match your category and are close enough to actually show up, ranked by fit rather than by who paid to be first.',
  },
  {
    icon: 'hand-left-outline' as const,
    title: 'Someone commits',
    body: 'Workers accept the slots you posted. Need three people? The job fills three times, and your exact address is revealed only once someone has committed.',
  },
  {
    icon: 'card-outline' as const,
    title: 'Payment is secured',
    body: 'Your card is charged when the job is staffed. The money sits with our payment processor — not with the worker, and not with us.',
  },
  {
    icon: 'construct-outline' as const,
    title: 'The work happens',
    body: 'Follow along as workers mark en route, arrived, and started. Message them in the job thread if anything changes.',
  },
  {
    icon: 'checkmark-done-outline' as const,
    title: 'You confirm, they get paid',
    body: 'Confirm the work is done and the payout is released. If you go quiet, confirmation happens automatically after a set window so nobody works for free.',
  },
  {
    icon: 'star-outline' as const,
    title: 'You rate each other',
    body: 'Both sides rate, and neither rating is visible until both are in — so nobody is rating defensively.',
  },
];

function LoopSection() {
  const { isMedium } = useBreakpoint();
  return (
    <Section tone="sunken">
      <Eyebrow>How it works</Eyebrow>
      <SectionHeading
        title="Seven steps, and the platform holds the middle"
        subtitle="Every job follows the same path. Each step is recorded, so there is always an answer to “what actually happened?”"
      />
      <View style={styles.loopGrid}>
        {LOOP_STEPS.map((step, i) => (
          <View key={step.title} style={isMedium ? styles.loopItemWide : styles.loopItem}>
            <Card style={styles.loopCard}>
              <View style={styles.loopTop}>
                <View style={styles.loopIcon}>
                  <Ionicons name={step.icon} size={18} color={Brand.primary} />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.loopNumber}>
                  {String(i + 1).padStart(2, '0')}
                </ThemedText>
              </View>
              <ThemedText type="smallBold">{step.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.loopBody}>
                {step.body}
              </ThemedText>
            </Card>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ── Two audiences ───────────────────────────────────────────────────────── */

function AudienceSection() {
  const theme = useTheme();
  return (
    <Section>
      <SectionHeading
        title="Two sides, one honest transaction"
        subtitle="The same job looks different depending on which side of it you're on. Both views are built here."
      />
      <Columns>
        <Card style={styles.audienceCard}>
          <View style={[styles.audienceTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: Brand.primary }}>
              I need something done
            </ThemedText>
          </View>
          <ThemedText style={styles.audienceHeadline}>
            Describe it once. Stop making phone calls.
          </ThemedText>
          <Bullets
            items={[
              'Post in minutes with photos, timing, and the pay you have in mind.',
              'Hire more than one person for the same job when one pair of hands is not enough.',
              'Watch progress live — en route, arrived, started, finished.',
              'Cancellation terms are shown before you cancel, not after.',
              'Your address stays hidden until someone has actually committed to the job.',
            ]}
          />
        </Card>

        <Card style={styles.audienceCard}>
          <View style={[styles.audienceTag, { backgroundColor: theme.moneySoft }]}>
            <ThemedText type="smallBold" style={{ color: Brand.money }}>
              I want flexible work
            </ThemedText>
          </View>
          <ThemedText style={styles.audienceHeadline}>
            See what it pays before you say yes.
          </ThemedText>
          <Bullets
            items={[
              'Browse real jobs near you with the pay, the distance, and the time up front.',
              'Set your own travel radius, categories, and availability — go offline whenever.',
              'The customer is charged before you start, so the money already exists.',
              'Earnings show gross, platform fee, and what actually lands in your account.',
              'Tips go to you in full, with no platform cut.',
            ]}
          />
        </Card>
      </Columns>
    </Section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Ionicons name="checkmark-circle" size={16} color={Brand.primary} style={styles.bulletIcon} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
            {item}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/* ── Money ───────────────────────────────────────────────────────────────── */

function MoneySection() {
  const theme = useTheme();
  return (
    <Section tone="sunken">
      <Eyebrow>The money</Eyebrow>
      <SectionHeading
        title="Nobody fronts the cost, and nobody chases an invoice"
        subtitle="Payments are handled by Stripe. We never hold your funds in an account of our own."
      />
      <Columns>
        <MoneyStep
          index="1"
          title="Charged at commitment"
          body="When your job is staffed, the card on file is charged for the agreed amount. Workers can see the job is funded before they travel."
        />
        <MoneyStep
          index="2"
          title="Held until you confirm"
          body="The payout does not move while work is in progress. If a dispute is opened, it stays put until the dispute is resolved."
        />
        <MoneyStep
          index="3"
          title="Released on completion"
          body="Confirm the work and the worker is paid out on the standard schedule, minus a platform fee that is shown to both sides before anyone commits."
        />
      </Columns>

      <Card style={[styles.ledgerNote, { borderColor: theme.border }]}>
        <Ionicons name="receipt-outline" size={18} color={Brand.primary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.ledgerText}>
          Every charge, fee, payout, refund, and tip is written to an immutable ledger in whole
          cents. Both sides see the same breakdown — job pay, platform fee, and net — on the same
          job.
        </ThemedText>
      </Card>
    </Section>
  );
}

function MoneyStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <Card style={styles.moneyCard}>
      <View style={styles.moneyIndex}>
        <ThemedText type="smallBold" style={styles.onPrimary}>
          {index}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.loopBody}>
        {body}
      </ThemedText>
    </Card>
  );
}

/* ── Safety ──────────────────────────────────────────────────────────────── */

const SAFETY = [
  {
    icon: 'mail-unread-outline' as const,
    title: 'Verified contact details',
    body: 'Email and phone are verified before an account can transact. Verification state is a real record, never a decorative badge.',
  },
  {
    icon: 'eye-off-outline' as const,
    title: 'Location privacy by default',
    body: 'Before acceptance, workers see an approximate area — not your street address. The precise location unlocks only for someone who has committed.',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'Messaging scoped to the job',
    body: 'Conversations exist inside the job they belong to, with reporting and blocking built in. No open inbox for strangers.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Restricted work is screened',
    body: 'Categories that need licences or special handling are disabled until they are reviewed, and flagged postings go to a human review queue.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    title: 'Two-way ratings, revealed together',
    body: 'Customers rate workers and workers rate customers. Neither side sees the other’s rating until both have submitted.',
  },
  {
    icon: 'document-text-outline' as const,
    title: 'Disputes pause the money',
    body: 'Opening a dispute freezes the payout while an administrator reviews the evidence and the job’s recorded timeline.',
  },
];

function SafetySection() {
  const { isMedium } = useBreakpoint();
  return (
    <Section>
      <Eyebrow>Trust &amp; safety</Eyebrow>
      <SectionHeading
        title="Designed for strangers meeting at a front door"
        subtitle="These are the protections that exist today. We would rather list six real ones than a dozen we cannot back."
      />
      <View style={styles.safetyGrid}>
        {SAFETY.map((item) => (
          <View key={item.title} style={isMedium ? styles.safetyItemWide : styles.safetyItem}>
            <Card style={styles.safetyCard}>
              <Ionicons name={item.icon} size={20} color={Brand.primary} />
              <ThemedText type="smallBold">{item.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.loopBody}>
                {item.body}
              </ThemedText>
            </Card>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ── Example jobs ────────────────────────────────────────────────────────── */

const EXAMPLES = [
  { icon: 'cube-outline' as const, label: 'Moving & loading' },
  { icon: 'hammer-outline' as const, label: 'Furniture assembly' },
  { icon: 'leaf-outline' as const, label: 'Yard & garden work' },
  { icon: 'sparkles-outline' as const, label: 'Cleaning & clear-outs' },
  { icon: 'car-outline' as const, label: 'Pickups & deliveries' },
  { icon: 'basket-outline' as const, label: 'Errands & queuing' },
  { icon: 'brush-outline' as const, label: 'Painting & touch-ups' },
  { icon: 'people-outline' as const, label: 'Event set-up & pack-down' },
];

function ExamplesSection() {
  const theme = useTheme();
  return (
    <Section tone="sunken">
      <SectionHeading
        title="The kind of work that fills a Saturday"
        subtitle="Everyday jobs that need a person nearby and a couple of hours. Categories open one at a time, after review."
      />
      <View style={styles.chipWrap}>
        {EXAMPLES.map((item) => (
          <View
            key={item.label}
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Ionicons name={item.icon} size={16} color={Brand.primary} />
            <ThemedText type="small">{item.label}</ThemedText>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────────── */

const FAQ = [
  {
    q: 'What does it cost?',
    a: 'Browsing and posting are free. A platform fee is taken from the job total when it is paid, and both the customer and the worker see the exact figure — job pay, fee, and net — before anyone commits. Tips are passed to the worker in full with no fee.',
  },
  {
    q: 'When exactly does my card get charged?',
    a: 'When the job is staffed, not when you post it. If nobody accepts, you are not charged. If only some of the slots fill and the work goes ahead, you are charged for the workers who actually committed.',
  },
  {
    q: 'What if the work is not done properly?',
    a: 'Do not confirm it. Open a dispute instead — that freezes the payout while an administrator reviews the job timeline, the messages, and any photos before deciding.',
  },
  {
    q: 'What if the customer never confirms?',
    a: 'Confirmation happens automatically after a set window once work is marked complete, so a customer going quiet cannot leave a worker unpaid indefinitely.',
  },
  {
    q: 'Can I hire more than one person?',
    a: 'Yes. A job can ask for several workers, and it fills slot by slot. Payment covers the number of people who actually commit.',
  },
  {
    q: 'Do you run background checks or provide insurance?',
    a: 'No — not today, and we do not pretend otherwise. We verify email and phone, screen restricted categories, and keep a reviewable record of every job. Any category that would require background checks or insurance cover stays switched off until that is genuinely in place.',
  },
];

function FaqSection() {
  const theme = useTheme();
  const { isMedium } = useBreakpoint();
  return (
    <Section>
      <SectionHeading title="Straight answers" />
      <View style={styles.faqGrid}>
        {FAQ.map((item) => (
          <View key={item.q} style={isMedium ? styles.faqItemWide : styles.faqItem}>
            <View style={[styles.faqCard, { borderTopColor: theme.border }]}>
              <ThemedText type="smallBold" style={styles.faqQ}>
                {item.q}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.loopBody}>
                {item.a}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ── Closing CTA ─────────────────────────────────────────────────────────── */

function ClosingCta() {
  const { isMedium } = useBreakpoint();
  return (
    <View style={styles.ctaBand}>
      <Bounded maxWidth={MaxMarketingWidth}>
        <View style={styles.ctaBandInner}>
          <ThemedText style={[isMedium ? styles.ctaTitle : styles.ctaTitleSmall, styles.onPrimary]}>
            Something on your list that needs doing?
          </ThemedText>
          <ThemedText style={[styles.ctaSub, styles.onPrimary]}>
            Post it now, or sign up to start picking up work near you.
          </ThemedText>
          <View style={[styles.heroCtas, !isMedium && styles.heroCtasStacked]}>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" style={styles.ctaOnBand}>
                <ThemedText type="smallBold" style={{ color: Brand.primary }}>
                  Create an account
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/(auth)/login" asChild>
              <Pressable accessibilityRole="link" style={styles.ctaBandGhost}>
                <ThemedText type="smallBold" style={styles.onPrimary}>
                  Sign in
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

function Footer() {
  const theme = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surfaceSunken }]}>
      <Bounded maxWidth={MaxMarketingWidth}>
        <View style={styles.footerInner}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Ionicons name="hammer" size={14} color="#fff" />
            </View>
            <ThemedText type="smallBold">Local Gig Marketplace</ThemedText>
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

/* ── Styles ──────────────────────────────────────────────────────────────── */

const CTA_BASE = {
  minHeight: 52,
  paddingHorizontal: Spacing.four,
  borderRadius: Radius.md,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

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

  hero: { gap: Spacing.five },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: 64 },
  heroCopy: { gap: Spacing.three, maxWidth: 640 },
  heroCopyWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: Spacing.three, maxWidth: 640 },
  h1: { fontSize: 56, lineHeight: 62, fontWeight: '800', letterSpacing: -1.6 },
  h1Small: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: 18, lineHeight: 28, maxWidth: 560 },
  heroCtas: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  heroCtasStacked: { flexDirection: 'column', alignItems: 'stretch' },
  // These four are the children of <Link asChild>. On web the link forwards the
  // child's `style` straight to a DOM anchor, which rejects an array — so each
  // one has to be a single flat object rather than [cta, variant].
  ctaPrimary: { ...CTA_BASE, backgroundColor: Brand.primary },
  ctaGhost: { ...CTA_BASE, borderWidth: 1.5, borderColor: Brand.primary },
  heroFinePrint: { marginTop: Spacing.one },

  heroPreview: { flexGrow: 1, flexShrink: 1, flexBasis: 0, maxWidth: 420 },
  previewCard: { gap: Spacing.three },
  previewHeader: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  previewTitleCol: { flex: 1, gap: 2 },
  payPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  divider: { height: 1 },
  timeline: { gap: Spacing.two },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: {
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLabel: { flex: 1 },
  escrowNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },

  loopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  loopItem: { width: '100%' },
  loopItemWide: { flexGrow: 1, flexBasis: 280, maxWidth: '100%' },
  loopCard: { height: '100%' },
  loopTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  loopIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F6FED18',
  },
  loopNumber: { letterSpacing: 1 },
  loopBody: { lineHeight: 22 },

  audienceCard: { gap: Spacing.three, height: '100%' },
  audienceTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  audienceHeadline: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  bullets: { gap: Spacing.two },
  bulletRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  bulletIcon: { marginTop: 3 },
  bulletText: { flex: 1, lineHeight: 22 },

  moneyCard: { gap: Spacing.two, height: '100%' },
  moneyIndex: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerNote: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
    marginTop: Spacing.four,
  },
  ledgerText: { flex: 1, lineHeight: 22 },

  safetyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  safetyItem: { width: '100%' },
  safetyItemWide: { flexGrow: 1, flexBasis: 300, maxWidth: '100%' },
  safetyCard: { height: '100%', gap: Spacing.two },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
  },

  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  faqItem: { width: '100%' },
  faqItemWide: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
  faqCard: { borderTopWidth: 1, paddingTop: Spacing.three, gap: Spacing.two },
  faqQ: { fontSize: 16 },

  ctaBand: { flexShrink: 0, backgroundColor: Brand.primary, paddingVertical: 64 },
  ctaBandInner: { alignItems: 'center', gap: Spacing.three },
  ctaTitle: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  ctaTitleSmall: { fontSize: 26, lineHeight: 34, fontWeight: '800', textAlign: 'center' },
  ctaSub: { fontSize: 17, lineHeight: 26, textAlign: 'center', opacity: 0.9 },
  ctaOnBand: { ...CTA_BASE, backgroundColor: '#ffffff' },
  ctaBandGhost: { ...CTA_BASE, borderWidth: 1.5, borderColor: '#ffffff88' },

  footer: { flexShrink: 0, borderTopWidth: 1, paddingVertical: Spacing.five },
  footerInner: { gap: Spacing.three },
  footerNote: { maxWidth: 720, lineHeight: 22 },
});
