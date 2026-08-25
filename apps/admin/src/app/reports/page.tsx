'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, when } from '@/lib/api';

interface Report {
  id: string;
  category: string;
  description: string;
  status: string;
  reporter_user_id: string;
  reported_user_id: string | null;
  job_id: string | null;
  created_at: string;
}

export default function ReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Report[] }>('/admin/reports');
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, status: 'REVIEWED' | 'ACTIONED' | 'DISMISSED') => {
    const note = window.prompt('Review note (required, audited):');
    if (!note) return;
    try {
      await api(`/admin/reports/${id}/review`, { method: 'POST', body: { status, note } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Safety & fraud reports</h2>
      {error ? <div className="error">{error}</div> : null}
      {items.length === 0 ? <div className="muted">No reports.</div> : null}
      {items.map((r) => (
        <div className="panel" key={r.id}>
          <div className="row">
            <span className="badge danger">{r.category.replaceAll('_', ' ')}</span>
            <StateBadge value={r.status} />
            <span className="muted">{when(r.created_at)}</span>
          </div>
          <p>{r.description}</p>
          {r.status === 'OPEN' ? (
            <div className="row">
              <button className="btn" onClick={() => review(r.id, 'ACTIONED')}>
                Mark actioned
              </button>
              <button className="btn secondary" onClick={() => review(r.id, 'REVIEWED')}>
                Mark reviewed
              </button>
              <button className="btn secondary" onClick={() => review(r.id, 'DISMISSED')}>
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </Shell>
  );
}
