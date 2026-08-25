import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/job-card';
import { useConversations } from '@/api/hooks';

export function MessagesScreen() {
  const { data, isLoading, refetch } = useConversations();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.heading}>
        Messages
      </ThemedText>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(c) => c.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="No conversations yet"
              hint="Messages appear when you're on a job together."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/conversation/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.rowText}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {item.job_title}
              </ThemedText>
              <ThemedText type="small" numberOfLines={1} style={styles.preview}>
                {item.last_message ?? 'No messages yet'}
              </ThemedText>
            </View>
            {Number(item.unread_count) > 0 ? (
              <View style={styles.badge}>
                <ThemedText type="small" style={styles.badgeText}>
                  {String(item.unread_count)}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#8882',
  },
  rowText: { flex: 1, gap: 2 },
  preview: { opacity: 0.6 },
  badge: {
    backgroundColor: '#3c87f7',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff' },
});
