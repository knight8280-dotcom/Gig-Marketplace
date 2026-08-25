'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, money, when } from '@/lib/api';

interface DisputeRow {
  id: string;
  job_id: string;
  job_title: string;
  category: string;
  status: string;
  description: string;
  resolution: string | null;
  created_at: string;
}

interface DisputeDetail extends DisputeRow {
  evidence: Array<{ id: string; kind: string; note: string | null; created_by: string; created_at: string }>;
  timeline: Array<{ id: string; event_type: string; created_at: string }>;
  payments: Array<{ id: string; kind: string; status: string; amount_cents: string; refunded_cents: string }>;
  messages: Array<{ id: string; sender_user_id: string; body: string; created_at: string }>;
}

export default function DisputesPage() {
  const [items, setItems] = useState<DisputeRow[]>([]);
  const [selected, setSelected] = useState<DisputeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: DisputeRow[] }>('/admin/disputes');
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      setSelected(await api<DisputeDetail>(`/admin/disputes/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const resolve = async (resolution: 'RELEASE' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'OTHER') => {
    if (!selected) return;
    const reason = window.prompt('Resolution reason (required, audited):');
    if (!reason || reason.length < 5) return;
    let amount_cents: number | undefined;
    if (resolution === 'REFUND_PARTIAL') {
      const dollars = window.prompt('Partial refund amount in dollars:');
      if (!dollars) return;
      amount_cents = Math.round(Number(dollars) * 100);
    }
    try {
      await api(`/admin/disputes/${selected.id}/resolve`, {
        method: 'POST',
        body: { resolution, reason, amount_cents },
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Disputes</h2>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr><th>Job</th><th>Category</th><th>Status</th><th>Resolution</th><th>Opened</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td>{d.job_title}</td>
              <td>{d.category.replaceAll('_', ' ')}</td>
              <td><StateBadge value={d.status} /></td>
              <td>{d.resolution ?? '—'}</td>
              <td>{when(d.created_at)}</td>
              <td>
                <button className="btn secondary" onClick={() => openDetail(d.id)}>
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <h3>
            Dispute on “{selected.job_title}” <StateBadge value={selected.status} />
          </h3>
          <p>{selected.description}</p>

          <h4>Evidence</h4>
          {selected.evidence.map((e) => (
            <div key={e.id} className="row">
              <span className="badge">{e.kind}</span>
              <span>{e.note}</span>
              <span className="muted">{when(e.created_at)}</span>
            </div>
          ))}

          <h4>Messages</h4>
          {selected.messages.length === 0 ? <div className="muted">No messages on this job.</div> : null}
          {selected.messages.map((m) => (
            <div key={m.id} className="row">
              <span className="muted">{m.sender_user_id.slice(0, 8)}…</span>
              <span>{m.body}</span>
            </div>
          ))}

          <h4>Payments</h4>
          {selected.payments.map((p) => (
            <div key={p.id} className="row">
              <span>{p.kind}</span>
              <StateBadge value={p.status} />
              <span>{money(p.amount_cents)}</span>
              {Number(p.refunded_cents) > 0 ? <span className="muted">refunded {money(p.refunded_cents)}</span> : null}
            </div>
          ))}

          {selected.status === 'OPEN' || selected.status === 'UNDER_REVIEW' ? (
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => resolve('RELEASE')}>
                Release payouts
              </button>
              <button className="btn danger" onClick={() => resolve('REFUND_FULL')}>
                Full refund
              </button>
              <button className="btn danger" onClick={() => resolve('REFUND_PARTIAL')}>
                Partial refund
              </button>
              <button className="btn secondary" onClick={() => resolve('OTHER')}>
                Other
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}
