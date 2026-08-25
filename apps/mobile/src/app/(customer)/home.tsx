import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/primary-button';
import { EmptyState, JobCardView } from '@/components/job-card';
import { useMyJobs } from '@/api/hooks';
import { api } from '@/api/client';
import type { JobCard } from '@/api/types';

const ACTIVE_STATES = 'POSTED,MATCHING,PARTIALLY_FILLED,FILLED,IN_PROGRESS,COMPLETION_PENDING';

export default function CustomerHome() {
  const active = useMyJobs(ACTIVE_STATES);
  const paymentProfile = useQuery({
    queryKey: ['payment-profile'],
    queryFn: () => api<{ has_payment_method: boolean }>('/me/payment-profile'),
  });

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Need something done?</ThemedText>
        <PrimaryButton label="Post a job" onPress={() => router.push('/post-job')} />
        {paymentProfile.data && !paymentProfile.data.has_payment_method ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/payment-methods')}>
            <ThemedText type="small" style={styles.paymentBanner}>
              No payment method on file — add a card so your jobs can be charged when workers
              commit. Tap to set up.
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Active jobs
      </ThemedText>
      <FlatList
        data={(active.data?.items ?? []) as unknown as (JobCard & { state: string })[]}
        keyExtractor={(j) => j.id}
        refreshing={active.isLoading}
        onRefresh={active.refetch}
        ListEmptyComponent={
          active.isLoading ? null : (
            <EmptyState
              title="You don't have any active jobs"
              hint="Post your first job — nearby workers will see it right away."
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
  header: { gap: 12, marginBottom: 20 },
  sectionTitle: { marginBottom: 8 },
  paymentBanner: {
    opacity: 0.85,
    backgroundColor: '#f7b73c22',
    borderRadius: 8,
    padding: 10,
  },
});
