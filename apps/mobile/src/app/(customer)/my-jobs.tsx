import { FlatList, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, JobCardView } from '@/components/job-card';
import { useMyJobs } from '@/api/hooks';
import type { JobCard } from '@/api/types';

export default function CustomerMyJobs() {
  const jobs = useMyJobs();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.heading}>
        My jobs
      </ThemedText>
      <FlatList
        data={(jobs.data?.items ?? []) as unknown as (JobCard & { state: string })[]}
        keyExtractor={(j) => j.id}
        refreshing={jobs.isLoading}
        onRefresh={jobs.refetch}
        ListEmptyComponent={
          jobs.isLoading ? null : (
            <EmptyState title="No jobs yet" hint="Everything you post will show up here." />
          )
        }
        renderItem={({ item }) => <JobCardView job={item} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { marginBottom: 12 },
});
