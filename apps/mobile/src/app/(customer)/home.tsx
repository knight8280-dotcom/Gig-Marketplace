import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { useMyJobs } from '@/api/hooks';
import type { JobCard, JobDetail } from '@/api/types';
import { EmptyState, JobCardView } from '@/components/job-card';
import { Callout, HomeHeader, SectionLabel, StatRow, StatTile } from '@/components/home-kit';
import { Screen } from '@/components/screen';
import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';

const ACTIVE_STATES = 'POSTED,MATCHING,PARTIALLY_FILLED,FILLED,IN_PROGRESS,COMPLETION_PENDING';
/** States where the customer is the one holding the job up. */
const AWAITING_CUSTOMER = new Set(['COMPLETION_PENDING']);

type ActiveJob = JobDetail & { state: string };

export default function CustomerHome() {
  const active = useMyJobs(ACTIVE_STATES);
  const paymentProfile = useQuery({
    queryKey: ['payment-profile'],
    queryFn: () => api<{ has_payment_method: boolean }>('/me/payment-profile'),
  });

  const jobs = (active.data?.items ?? []) as ActiveJob[];
  const needsConfirmation = jobs.filter((j) => AWAITING_CUSTOMER.has(j.state));
  const inProgress = jobs.filter((j) => j.state === 'IN_PROGRESS');
  const workersCommitted = jobs.reduce((n, j) => n + (j.workers_filled ?? 0), 0);
  const noCard = paymentProfile.data && !paymentProfile.data.has_payment_method;

  return (
    <Screen refreshing={active.isLoading} onRefresh={active.refetch}>
      <SiteHead title="Home" />

      <HomeHeader
        eyebrow="Customer"
        title="Need something done?"
        action={<PostJobButton />}
      />

      <StatRow>
        <StatTile label="Active jobs" value={String(jobs.length)} />
        <StatTile label="In progress" value={String(inProgress.length)} />
        <StatTile
          label="Workers committed"
          value={String(workersCommitted)}
          hint={workersCommitted === 0 ? 'Nobody has accepted yet' : undefined}
        />
      </StatRow>

      {noCard ? (
        <View style={styles.calloutWrap}>
          <Callout icon="card-outline" onPress={() => router.push('/payment-methods')}>
            No payment method on file — add a card so your jobs can be charged when workers commit.
          </Callout>
        </View>
      ) : null}

      {needsConfirmation.length > 0 ? (
        <View style={styles.calloutWrap}>
          <Callout
            icon="checkmark-circle-outline"
            tone="info"
            onPress={() => router.push(`/job/${needsConfirmation[0].id}`)}
          >
            {needsConfirmation.length === 1
              ? 'A worker marked a job complete. Confirm it to release their payment.'
              : `${needsConfirmation.length} jobs are waiting on your confirmation.`}
          </Callout>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionLabel title="Active jobs" count={jobs.length} />
        {active.isLoading ? null : jobs.length === 0 ? (
          <EmptyState
            title="You don't have any active jobs"
            hint="Post your first job — nearby workers will see it right away."
          />
        ) : (
          jobs.map((job) => <JobCardView key={job.id} job={job as unknown as JobCard & { state: string }} />)
        )}
      </View>
    </Screen>
  );
}

function PostJobButton() {
  const { isMedium } = useBreakpoint();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Post a job"
      onPress={() => router.push('/post-job')}
      style={({ pressed }) => [
        styles.postButton,
        !isMedium && styles.postButtonFull,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="add" size={18} color="#fff" />
      <ThemedText type="smallBold" style={styles.postLabel}>
        Post a job
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.primary,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
  postButtonFull: { alignSelf: 'stretch' },
  postLabel: { color: '#ffffff' },
  pressed: { opacity: 0.75 },

  calloutWrap: { marginTop: Spacing.three },
  section: { marginTop: Spacing.four },
});
