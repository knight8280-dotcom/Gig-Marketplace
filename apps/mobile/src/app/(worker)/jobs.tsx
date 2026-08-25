import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/job-card';
import { useMyAssignments } from '@/api/hooks';
import { formatMoney } from '@/api/types';

const ASSIGNMENT_LABELS: Record<string, string> = {
  ACCEPTED: 'Accepted',
  EN_ROUTE: 'En route',
  ARRIVED: 'Arrived',
  STARTED: 'Working',
  COMPLETED: 'Completed',
  CANCELLED_BY_WORKER: 'You cancelled',
  CANCELLED_BY_CUSTOMER: 'Customer cancelled',
};

export default function WorkerJobs() {
  const { data, isLoading, refetch } = useMyAssignments();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.heading}>
        My jobs
      </ThemedText>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(a) => a.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState title="No jobs yet" hint="Accept a nearby job from your home tab." />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/job/${item.job_id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.rowText}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {item.job?.title ?? 'Job'}
              </ThemedText>
              <ThemedText type="small" style={styles.dim}>
                {ASSIGNMENT_LABELS[item.state] ?? item.state}
                {item.earnings_cents ? ` · earned ${formatMoney(Number(item.earnings_cents))}` : ''}
              </ThemedText>
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { marginBottom: 12 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#8882' },
  rowText: { gap: 2 },
  dim: { opacity: 0.6 },
});
