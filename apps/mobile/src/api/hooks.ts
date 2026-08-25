import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  AppNotification,
  Assignment,
  Category,
  Conversation,
  Earnings,
  JobCard,
  JobDetail,
  Message,
  WorkerProfile,
} from './types';

/** Server-state hooks. The backend decides everything; these only fetch/mutate. */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ items: Category[] }>('/categories', { auth: false }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useMyJobs(states?: string) {
  return useQuery({
    queryKey: ['my-jobs', states ?? 'all'],
    queryFn: () => api<{ items: JobDetail[] }>(`/jobs/mine${states ? `?state=${states}` : ''}`),
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api<JobDetail>(`/jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useNearbyJobs(coords: { lat: number; lng: number } | null, radiusM?: number) {
  return useQuery({
    queryKey: ['nearby-jobs', coords?.lat, coords?.lng, radiusM],
    queryFn: () =>
      api<{ items: JobCard[] }>(
        `/discovery/jobs?lat=${coords!.lat}&lng=${coords!.lng}${radiusM ? `&radius_m=${radiusM}` : ''}`,
      ),
    enabled: coords !== null,
    refetchInterval: 60_000,
  });
}

export function useMyAssignments(states?: string) {
  return useQuery({
    queryKey: ['assignments', states ?? 'all'],
    queryFn: () => api<{ items: Assignment[] }>(`/assignments/mine${states ? `?state=${states}` : ''}`),
  });
}

export function useWorkerProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['worker-profile'],
    queryFn: () => api<WorkerProfile>('/me/worker-profile'),
    enabled,
    retry: false,
  });
}

export function useEarnings(enabled: boolean) {
  return useQuery({
    queryKey: ['earnings'],
    queryFn: () => api<Earnings>('/me/earnings'),
    enabled,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<{ items: Conversation[] }>('/conversations'),
    refetchInterval: 20_000,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api<{ items: Message[] }>(`/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
    refetchInterval: 5_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: AppNotification[]; unread_count: number }>('/notifications'),
    refetchInterval: 30_000,
  });
}

/** Invalidate the query keys a job mutation can affect. */
export function useJobInvalidation() {
  const qc = useQueryClient();
  return (jobId?: string) => {
    void qc.invalidateQueries({ queryKey: ['my-jobs'] });
    void qc.invalidateQueries({ queryKey: ['assignments'] });
    void qc.invalidateQueries({ queryKey: ['nearby-jobs'] });
    void qc.invalidateQueries({ queryKey: ['earnings'] });
    if (jobId) void qc.invalidateQueries({ queryKey: ['job', jobId] });
  };
}

export function useAcceptJob() {
  const invalidate = useJobInvalidation();
  return useMutation({
    mutationFn: (jobId: string) => api<Assignment>(`/jobs/${jobId}/accept`, { method: 'POST' }),
    onSuccess: (_data, jobId) => invalidate(jobId),
  });
}

export function useAssignmentAction() {
  const invalidate = useJobInvalidation();
  return useMutation({
    mutationFn: (input: { assignmentId: string; action: 'en-route' | 'arrived' | 'start' | 'complete'; jobId: string }) =>
      api<Assignment>(`/assignments/${input.assignmentId}/${input.action}`, { method: 'POST', body: {} }),
    onSuccess: (_data, input) => invalidate(input.jobId),
  });
}

export function useConfirmCompletion() {
  const invalidate = useJobInvalidation();
  return useMutation({
    mutationFn: (jobId: string) => api<JobDetail>(`/jobs/${jobId}/confirm-completion`, { method: 'POST' }),
    onSuccess: (_data, jobId) => invalidate(jobId),
  });
}
