import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/primary-button';
import { FormError } from '@/components/form';
import {
  useAcceptJob,
  useAssignmentAction,
  useConfirmCompletion,
  useJob,
  useJobInvalidation,
} from '@/api/hooks';
import { useAuth } from '@/state/auth';
import { api, ApiError } from '@/api/client';
import { formatMoney } from '@/api/types';
import { AuthedImage } from '@/components/authed-image';
import { useQuery } from '@tanstack/react-query';

/** Role-aware job detail: workers accept/execute; customers monitor/confirm. */
export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, mode } = useAuth();
  const job = useJob(id);
  const accept = useAcceptJob();
  const act = useAssignmentAction();
  const confirm = useConfirmCompletion();
  const invalidate = useJobInvalidation();
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  const [tipped, setTipped] = useState(false);

  const isOwnerView = job.data?.assignments !== undefined;
  const payments = useQuery({
    queryKey: ['job-payments', id],
    queryFn: () => api<{ items: Array<{ kind: string; status: string }> }>(`/me/payments?job_id=${id}`),
    enabled: isOwnerView,
  });
  const latestCharge = payments.data?.items.find((p) => p.kind === 'JOB_PAYMENT');

  if (job.isLoading) return <ThemedView style={styles.center} />;
  if (!job.data) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>This job is no longer available.</ThemedText>
      </ThemedView>
    );
  }

  const j = job.data as typeof job.data & { photo_file_ids?: string[] };
  const isOwner = j.assignments !== undefined; // owner view includes assignments
  const assignment = j.my_assignment;
  const start = j.scheduled_start_at ? new Date(j.scheduled_start_at).toLocaleString() : 'ASAP';

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const workerAction = (): { label: string; action: 'en-route' | 'arrived' | 'start' | 'complete' } | null => {
    switch (assignment?.state) {
      case 'ACCEPTED':
      case 'CONFIRMED':
        return { label: "I'm on my way", action: 'en-route' };
      case 'EN_ROUTE':
        return { label: "I'm here", action: 'arrived' };
      case 'ARRIVED':
        return { label: 'Start job', action: 'start' };
      case 'STARTED':
        return { label: 'Complete job', action: 'complete' };
      default:
        return null;
    }
  };

  const submitRating = async (assignmentId: string, overall: number) =>
    run(async () => {
      await api(`/assignments/${assignmentId}/rating`, { method: 'POST', body: { overall } });
      setRated(true);
    });

  const next = workerAction();
  const canAccept =
    mode === 'WORKER' && !assignment && !isOwner &&
    ['POSTED', 'MATCHING', 'PARTIALLY_FILLED'].includes(j.state);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{j.title}</ThemedText>
        <ThemedText type="smallBold" style={styles.pay}>
          {formatMoney(j.pay_cents, j.pay_type)} · {j.workers_filled}/{j.workers_needed} workers · {start}
        </ThemedText>
        <ThemedText style={styles.description}>{j.description}</ThemedText>

        {(j.photo_file_ids?.length ?? 0) > 0 ? (
          <View style={styles.photoRow}>
            {j.photo_file_ids!.map((fileId) => (
              <AuthedImage key={fileId} fileId={fileId} style={styles.photo} />
            ))}
          </View>
        ) : null}

        {j.address_line1 ? (
          <Section title="Location">
            <ThemedText type="small">{j.address_line1}, {j.city}, {j.region}</ThemedText>
            {j.access_instructions ? (
              <ThemedText type="small" style={styles.dim}>Access: {j.access_instructions}</ThemedText>
            ) : null}
          </Section>
        ) : (
          <Section title="Location">
            <ThemedText type="small" style={styles.dim}>
              {j.city}, {j.region} — exact address is shared after you accept.
            </ThemedText>
          </Section>
        )}

        {j.special_instructions ? (
          <Section title="Instructions">
            <ThemedText type="small">{j.special_instructions}</ThemedText>
          </Section>
        ) : null}

        <FormError message={error} />

        {/* Worker actions */}
        {canAccept ? (
          <PrimaryButton
            label="Accept job"
            loading={accept.isPending}
            onPress={() => run(async () => accept.mutateAsync(j.id))}
          />
        ) : null}
        {assignment && next ? (
          <PrimaryButton
            label={next.label}
            loading={act.isPending}
            onPress={() =>
              run(async () => act.mutateAsync({ assignmentId: assignment.id, action: next.action, jobId: j.id }))
            }
          />
        ) : null}
        {assignment ? (
          <PrimaryButton
            label="Message customer"
            variant="secondary"
            onPress={() =>
              run(async () => {
                const conversation = await api<{ id: string }>('/conversations', {
                  method: 'POST',
                  body: { job_id: j.id },
                });
                router.push(`/conversation/${conversation.id}`);
              })
            }
          />
        ) : null}
        {assignment?.state === 'COMPLETED' && !rated ? (
          <RatingRow onRate={(stars) => submitRating(assignment.id, stars)} label="Rate this customer" />
        ) : null}

        {/* Customer actions */}
        {isOwner && j.state === 'COMPLETION_PENDING' ? (
          <PrimaryButton
            label="Confirm completion & release payment"
            loading={confirm.isPending}
            onPress={() => run(async () => confirm.mutateAsync(j.id))}
          />
        ) : null}
        {isOwner && j.state === 'COMPLETION_PENDING' ? (
          <PrimaryButton
            label="Report a problem"
            variant="danger"
            onPress={() =>
              run(async () => {
                await api('/disputes', {
                  method: 'POST',
                  body: {
                    job_id: j.id,
                    category: 'INCOMPLETE_WORK',
                    description: 'Reported from the app — details to follow in dispute messages.',
                  },
                });
                invalidate(j.id);
              })
            }
          />
        ) : null}
        {isOwner && (j.assignments?.length ?? 0) > 0 ? (
          <PrimaryButton
            label="Message worker"
            variant="secondary"
            onPress={() =>
              run(async () => {
                const conversation = await api<{ id: string }>('/conversations', {
                  method: 'POST',
                  body: { job_id: j.id, worker_user_id: j.assignments![0]!.worker_user_id },
                });
                router.push(`/conversation/${conversation.id}`);
              })
            }
          />
        ) : null}
        {isOwner && ['COMPLETED', 'PAYMENT_PENDING', 'PAID'].includes(j.state) && !rated
          ? j.assignments
              ?.filter((a) => a.state === 'COMPLETED')
              .slice(0, 1)
              .map((a) => (
                <RatingRow key={a.id} label="Rate your worker" onRate={(stars) => submitRating(a.id, stars)} />
              ))
          : null}

        {/* Payment retry when the charge failed (customer fixes card first). */}
        {isOwner && latestCharge?.status === 'FAILED' ? (
          <View style={styles.section}>
            <ThemedText type="small" style={styles.paymentWarning}>
              Your payment could not be processed. Add or update your card, then retry.
            </ThemedText>
            <PrimaryButton
              label="Update payment method"
              variant="secondary"
              onPress={() => router.push('/payment-methods')}
            />
            <PrimaryButton
              label="Retry payment"
              onPress={() =>
                run(async () => {
                  await api(`/jobs/${j.id}/retry-payment`, { method: 'POST', body: {} });
                  await payments.refetch();
                })
              }
            />
          </View>
        ) : null}

        {/* Tips after completion (never mandatory). */}
        {isOwner && ['COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'].includes(j.state) && !tipped
          ? j.assignments
              ?.filter((a) => a.state === 'COMPLETED')
              .slice(0, 1)
              .map((a) => (
                <View key={a.id} style={styles.section}>
                  <ThemedText type="smallBold">Add a tip? (optional)</ThemedText>
                  <View style={styles.stars}>
                    {[500, 1000, 2000].map((cents) => (
                      <PrimaryButton
                        key={cents}
                        label={`$${cents / 100}`}
                        variant="secondary"
                        onPress={() =>
                          run(async () => {
                            await api(`/jobs/${j.id}/tip`, {
                              method: 'POST',
                              body: { assignment_id: a.id, amount_cents: cents },
                            });
                            setTipped(true);
                          })
                        }
                      />
                    ))}
                  </View>
                </View>
              ))
          : null}
        {tipped ? (
          <ThemedText type="small" style={styles.dim}>
            Tip sent — the full amount goes to your worker.
          </ThemedText>
        ) : null}
        {isOwner && ['POSTED', 'MATCHING', 'PARTIALLY_FILLED', 'FILLED'].includes(j.state) ? (
          <PrimaryButton
            label="Cancel job"
            variant="danger"
            onPress={() =>
              run(async () => {
                await api(`/jobs/${j.id}/cancel`, {
                  method: 'POST',
                  body: { reason: 'Cancelled from the app', acknowledged_consequences: true },
                });
                invalidate(j.id);
                router.back();
              })
            }
          />
        ) : null}
        {rated ? <ThemedText type="small" style={styles.dim}>Thanks — rating submitted.</ThemedText> : null}
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

function RatingRow({ label, onRate }: { label: string; onRate: (stars: number) => void }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <PrimaryButton
            key={stars}
            label={`${stars}★`}
            variant="secondary"
            onPress={() => onRate(stars)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14 },
  pay: { color: '#2e9e5b' },
  description: { opacity: 0.85 },
  section: { gap: 6, marginTop: 4 },
  dim: { opacity: 0.6 },
  stars: { flexDirection: 'row', gap: 8 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 10 },
  paymentWarning: { color: '#d97706' },
});
