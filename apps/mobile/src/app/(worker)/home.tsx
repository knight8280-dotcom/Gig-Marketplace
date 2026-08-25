import { FlatList, StyleSheet, Switch, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, JobCardView } from '@/components/job-card';
import { useEarnings, useNearbyJobs, useWorkerProfile } from '@/api/hooks';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { api } from '@/api/client';
import { formatMoney } from '@/api/types';

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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.availabilityRow}>
          <View>
            <ThemedText type="smallBold">Available for work</ThemedText>
            <ThemedText type="small" style={styles.dim}>
              {availableNow ? 'You can receive job matches' : 'You are not receiving matches'}
            </ThemedText>
          </View>
          <Switch
            accessibilityLabel="Available for work"
            value={availableNow}
            disabled={profile.isLoading || toggleAvailability.isPending}
            onValueChange={(value) => toggleAvailability.mutate(value)}
          />
        </View>
        {earnings.data ? (
          <ThemedText type="small" style={styles.dim}>
            Today: {formatMoney(earnings.data.today_cents)} · This week: {formatMoney(earnings.data.week_cents)}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Nearby jobs
      </ThemedText>
      {isFallback ? (
        <ThemedText type="small" style={styles.fallbackBanner}>
          Location unavailable — showing jobs near the pilot city. Enable location for real
          nearby results.
        </ThemedText>
      ) : null}
      <FlatList
        data={nearby.data?.items ?? []}
        keyExtractor={(j) => j.id}
        refreshing={nearby.isLoading}
        onRefresh={nearby.refetch}
        ListEmptyComponent={
          nearby.isLoading || !ready ? null : (
            <EmptyState
              title="No jobs nearby right now"
              hint="Check back soon, or expand your service radius in your profile."
            />
          )
        }
        renderItem={({ item }) => <JobCardView job={item} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { gap: 8, marginBottom: 16 },
  availabilityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dim: { opacity: 0.6 },
  sectionTitle: { marginBottom: 8 },
  fallbackBanner: {
    opacity: 0.8,
    backgroundColor: '#f7b73c22',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
});
