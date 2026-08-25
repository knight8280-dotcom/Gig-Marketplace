import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Switch, View } from 'react-native';

import { api } from '@/api/client';
import { useEarnings, useNearbyJobs, useWorkerProfile } from '@/api/hooks';
import { formatMoney } from '@/api/types';
import { EmptyState, JobCardView } from '@/components/job-card';
import { Callout, HomeHeader, Panel, SectionLabel, StatRow, StatTile } from '@/components/home-kit';
import { Screen } from '@/components/screen';
import { SiteHead } from '@/components/site-head';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';

export default function WorkerHome() {
  const qc = useQueryClient();
  const { coords, isFallback, ready } = useDeviceLocation();

  const profile = useWorkerProfile(true);
  const earnings = useEarnings(true);
  const nearby = useNearbyJobs(coords);

  const toggleAvailability = useMutation({
    mutationFn: (availableNow: boolean) =>
      api('/me/availability', { method: 'PUT', body: { available_now: availableNow, windows: [] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-profile'] }),
  });

  const availableNow = profile.data?.available_now ?? false;
  const jobs = nearby.data?.items ?? [];

  return (
    <Screen refreshing={nearby.isLoading} onRefresh={nearby.refetch}>
      <SiteHead title="Home" />

      <HomeHeader
        eyebrow="Worker"
        title={availableNow ? 'You’re open for work' : 'You’re offline'}
      />

      <Panel style={styles.availabilityPanel}>
        <View style={styles.availabilityText}>
          <ThemedText type="smallBold">Available for work</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {availableNow
              ? 'You can receive job matches near you.'
              : 'You are not receiving matches right now.'}
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel="Available for work"
          value={availableNow}
          disabled={profile.isLoading || toggleAvailability.isPending}
          onValueChange={(value) => toggleAvailability.mutate(value)}
          trackColor={{ true: Brand.primary, false: undefined }}
        />
      </Panel>

      <View style={styles.stats}>
        <StatRow>
          <StatTile
            label="Earned today"
            value={earnings.data ? formatMoney(earnings.data.today_cents) : '—'}
            tone="money"
          />
          <StatTile
            label="This week"
            value={earnings.data ? formatMoney(earnings.data.week_cents) : '—'}
            tone="money"
          />
          <StatTile
            label="Jobs nearby"
            value={ready ? String(jobs.length) : '—'}
            hint={availableNow ? undefined : 'Go available to get matched'}
          />
        </StatRow>
      </View>

      {isFallback ? (
        <View style={styles.calloutWrap}>
          <Callout icon="location-outline">
            Location unavailable — showing jobs near the pilot city. Enable location for real
            nearby results.
          </Callout>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionLabel title="Nearby jobs" count={ready ? jobs.length : undefined} />
        {nearby.isLoading || !ready ? null : jobs.length === 0 ? (
          <EmptyState
            title="No jobs nearby right now"
            hint="Check back soon, or expand your service radius in your profile."
          />
        ) : (
          jobs.map((job) => (
            <JobCardView key={job.id} job={job as typeof job & { state: string }} />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  availabilityPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  availabilityText: { flexShrink: 1, gap: 2 },
  stats: { marginTop: Spacing.three },
  calloutWrap: { marginTop: Spacing.three },
  section: { marginTop: Spacing.four },
});
