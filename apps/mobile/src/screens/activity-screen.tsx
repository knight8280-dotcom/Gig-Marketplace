import { FlatList, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/job-card';
import { useNotifications } from '@/api/hooks';
import { api } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function ActivityScreen() {
  const { data, isLoading, refetch } = useNotifications();
  const qc = useQueryClient();

  // Opening the tab marks activity as read.
  useEffect(() => {
    if (data && data.unread_count > 0) {
      api('/notifications/read', { method: 'POST', body: {} })
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => undefined);
    }
  }, [data, qc]);

  return (
    <Screen scroll={false}>
      <ThemedText type="subtitle" style={styles.heading}>
        Activity
      </ThemedText>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(n) => n.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? null : <EmptyState title="Nothing yet" hint="Your job activity will show up here." />
        }
        renderItem={({ item }) => (
          <View style={[styles.row, !item.read_at && styles.unread]}>
            <ThemedText type="smallBold">{item.title}</ThemedText>
            <ThemedText type="small" style={styles.body}>
              {item.body}
            </ThemedText>
            <ThemedText type="small" style={styles.time}>
              {new Date(item.created_at).toLocaleString()}
            </ThemedText>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 12 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#8882', gap: 2 },
  unread: { backgroundColor: '#3c87f70d' },
  body: { opacity: 0.75 },
  time: { opacity: 0.5 },
});
