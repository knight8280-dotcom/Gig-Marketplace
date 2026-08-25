import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from './themed-text';
import { formatDistance, formatMoney, type JobCard as JobCardType } from '@/api/types';

const STATE_LABELS: Record<string, string> = {
  MATCHING: 'Open',
  PARTIALLY_FILLED: 'Filling',
  FILLED: 'Filled',
  IN_PROGRESS: 'In progress',
  COMPLETION_PENDING: 'Awaiting confirmation',
  COMPLETED: 'Completed',
  PAYMENT_PENDING: 'Processing payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  DISPUTED: 'In dispute',
  DRAFT: 'Draft',
  PENDING_REVIEW: 'In review',
  CLOSED: 'Closed',
};

export function JobCardView({ job }: { job: JobCardType & { state: string } }) {
  const start = job.scheduled_start_at
    ? new Date(job.scheduled_start_at).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'ASAP';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Job: ${job.title}`}
      onPress={() => router.push(`/job/${job.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
          {job.title}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.pay}>
          {formatMoney(job.pay_cents, job.pay_type)}
        </ThemedText>
      </View>
      <ThemedText type="small" style={styles.meta}>
        {start} · ~{Math.round(job.estimated_duration_minutes / 60 * 10) / 10}h
        {job.distance_m !== undefined ? ` · ${formatDistance(job.distance_m)}` : ''}
        {` · ${job.city}, ${job.region}`}
      </ThemedText>
      <View style={styles.footerRow}>
        <ThemedText type="small" style={styles.meta}>
          {job.workers_filled}/{job.workers_needed} workers
        </ThemedText>
        <ThemedText type="small" style={styles.state}>
          {STATE_LABELS[job.state] ?? job.state}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" style={styles.meta}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#8883',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1 },
  pay: { color: '#2e9e5b' },
  meta: { opacity: 0.65 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  state: { color: '#3c87f7' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 48, paddingHorizontal: 24 },
});
