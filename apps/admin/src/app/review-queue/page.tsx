'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { api, when } from '@/lib/api';

interface ReviewItem {
  id: string;
  title: string;
  description: string;
  review_reasons: string[] | null;
  created_at: string;
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: ReviewItem[] }>('/admin/review-queue');
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, approve: boolean) => {
    const reason = approve ? undefined : (window.prompt('Rejection reason (sent to the customer):') ?? undefined);
    if (!approve && !reason) return;
    try {
      await api(`/admin/jobs/${id}/review`, { method: 'POST', body: { approve, reason } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Restricted-work review queue</h2>
      {error ? <div className="error">{error}</div> : null}
      {items.length === 0 ? <div className="muted">No jobs waiting for review.</div> : null}
      {items.map((job) => (
        <div className="panel" key={job.id}>
          <h3>{job.title}</h3>
          <p>{job.description}</p>
          <div className="row">
            {(job.review_reasons ?? []).map((reason) => (
              <span className="badge warn" key={reason}>
                {reason}
              </span>
            ))}
          </div>
          <div className="muted">Submitted {when(job.created_at)}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => decide(job.id, true)}>
              Approve & post
            </button>
            <button className="btn danger" onClick={() => decide(job.id, false)}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
